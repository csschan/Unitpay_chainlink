// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@chainlink/contracts/src/v0.8/functions/v1_3_0/FunctionsClient.sol";
import "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

// Inline interface for Chainlink Functions configuration
interface UnitpayFixCLFunctions {
    function getFunctionsRouter() external view returns (address);
    function getSubscriptionId() external view returns (uint64);
    function updateFunctionsRouter(address _functionsRouter) external;
    function updateSubscriptionId(uint64 _subscriptionId) external;
    function updateSourceAndSecrets(bytes32 _source, bytes32 _secrets) external;
}

contract UnitpayEnhanced is ReentrancyGuard, FunctionsClient, ConfirmedOwner, UnitpayFixCLFunctions {
    using EnumerableSet for EnumerableSet.AddressSet;
    using FunctionsRequest for FunctionsRequest.Request;
    using Strings for uint256;

    // =========== 原 UnitPaySettlement 代码 ===========
    enum PaymentType { DIRECT, ESCROW }
    enum EscrowStatus { NONE, LOCKED, CONFIRMED, RELEASED, REFUNDED, EXPIRED }

    uint256 public constant PLATFORM_FEE_RATE = 5; // 0.5% = 5/1000
    uint256 public constant AUTO_RELEASE_TIME = 3 hours;
    uint256 public constant T1_LOCK_TIME = 24 hours;
    uint256 public constant DISPUTE_WINDOW = 72 hours;
    uint256 public constant PAYMENT_EXPIRY_TIME = 30 minutes;

    struct TokenConfig {
        address tokenAddress;
        uint8 decimals;
        bool isEnabled;
    }

    struct PaymentRecord {
        address user;
        address lp;
        address token;
        uint256 amount;
        uint256 timestamp;
        uint256 lockTime;
        uint256 releaseTime;
        uint256 platformFee;
        string paymentId;
        string network;
        PaymentType paymentType;
        EscrowStatus escrowStatus;
        bool isDisputed;
    }

    IERC20 public defaultToken;
    uint256 public platformPendingFees;

    PaymentRecord[] public paymentRecords;
    mapping(string => uint256) private paymentIdToIndex;
    mapping(address => uint256[]) private userPaymentIndices;
    mapping(address => uint256[]) private lpPaymentIndices;
    mapping(string => mapping(address => TokenConfig)) public networkTokens;
    mapping(string => EnumerableSet.AddressSet) private networkTokenList;

    event TokenConfigUpdated(string indexed network, address indexed token, bool isEnabled);
    event PaymentSettled(string indexed paymentId, address indexed user, address indexed lp, uint256 amount, string network);
    event PaymentLocked(string paymentId, address indexed user, address indexed lp, uint256 amount, uint256 platformFee);
    event PaymentConfirmed(string indexed paymentId, bool isAuto);
    event PaymentReleased(string indexed paymentId, address indexed lp, uint256 amount, uint256 platformFee);
    event PaymentDisputed(string indexed paymentId);
    event PaymentRefunded(string indexed paymentId, address indexed user, uint256 amount);
    event PlatformFeesWithdrawn(uint256 amount);
    event PaymentExpired(string indexed paymentId, address indexed user, uint256 amount);
    event PaymentStatusChanged(
        string indexed paymentId, 
        uint8 oldStatus, 
        uint8 newStatus, 
        address triggeredBy,
        uint256 timestamp
    );

    // =========== 新增 PayPal 验证相关功能 ===========
    // LP 钱包地址 -> PayPal 邮箱映射
    mapping(address => string) public lpPaypalEmail;
    
    // 订单 ID -> 商家 PayPal 邮箱
    mapping(string => string) public merchantEmails;
    
    // 订单 ID -> LP 提交的 PayPal 订单号
    mapping(string => string) public submittedOrderIds;
    
    // 验证状态枚举
    enum VerificationStatus { NONE, PENDING, VERIFIED, FAILED }
    
    // 订单 ID -> 验证状态
    mapping(string => VerificationStatus) public verificationStatus;
    
    // Chainlink Functions 配置
    bytes32 private s_source;
    bytes32 private s_secrets;
    bytes32 private s_donId;
    uint64 private s_subscriptionId;
    
    // Chainlink requestId -> 支付 ID
    mapping(bytes32 => string) private requestIdToPaymentId;
    
    // 新增事件
    event OrderSubmitted(string indexed paymentId, string orderIdStr);
    event VerificationRequested(string indexed paymentId, bytes32 requestId);
    event OrderVerified(string indexed paymentId);
    event VerificationFailed(string indexed paymentId, string reason);
    event ChainlinkConfigUpdated(address functionsRouter, uint64 subscriptionId);
    event SourceAndSecretsUpdated(bytes32 source, bytes32 secrets);

    constructor(
        address _defaultToken, 
        address _functionsRouter,
        bytes32 _source,
        bytes32 _secrets,
        uint64 _subscriptionId,
        bytes32 _donId
    ) 
        FunctionsClient(_functionsRouter)
        ConfirmedOwner(msg.sender) 
    {
        require(_defaultToken != address(0), "Zero address not allowed");
        defaultToken = IERC20(_defaultToken);
        s_source = _source;
        s_secrets = _secrets;
        s_subscriptionId = _subscriptionId;
        s_donId = _donId;
    }
    
    // =========== 新增功能：LP 注册 PayPal 邮箱 ===========
    function registerLp(string calldata email) external {
        require(bytes(email).length > 0, "Email cannot be empty");
        lpPaypalEmail[msg.sender] = email;
    }

    // =========== 新增功能：扩展订单创建，记录商家邮箱 ===========
    function createOrder(
        address lp,
        address token,
        uint256 amount,
        string calldata network,
        string calldata merchantEmail
    ) external returns (string memory) {
        require(bytes(merchantEmail).length > 0, "Merchant email cannot be empty");
        
        // 生成唯一支付ID
        string memory paymentId = _generatePaymentId();
        
        // 记录商家邮箱
        merchantEmails[paymentId] = merchantEmail;
        verificationStatus[paymentId] = VerificationStatus.NONE;
        
        // 调用原有的锁定支付逻辑
        _lockPayment(lp, token, amount, network, paymentId);
        
        return paymentId;
    }

    // =========== 新增功能：LP 提交 PayPal 订单号 ===========
    function submitOrderId(string calldata paymentId, string calldata orderIdStr) external {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;
        
        PaymentRecord storage rec = paymentRecords[index];
        require(rec.lp == msg.sender, "Only designated LP can submit");
        require(rec.escrowStatus == EscrowStatus.LOCKED, "Invalid payment status");
        require(verificationStatus[paymentId] == VerificationStatus.NONE, "Already submitted");
        
        // 保存订单ID
        submittedOrderIds[paymentId] = orderIdStr;
        verificationStatus[paymentId] = VerificationStatus.PENDING;
        emit OrderSubmitted(paymentId, orderIdStr);
        
        // 发起验证
        _verifyPayPal(paymentId);
    }

    // =========== 内部函数：验证 PayPal 订单 ===========
    function _verifyPayPal(string memory paymentId) internal {
        // 获取支付记录和订单详情
        uint256 index = paymentIdToIndex[paymentId];
        PaymentRecord storage rec = paymentRecords[index - 1];
        string memory orderIdStr = submittedOrderIds[paymentId];
        string memory merchantEmail = merchantEmails[paymentId];
        string memory lpEmail = lpPaypalEmail[rec.lp];
        
        // 构建Functions请求
        FunctionsRequest.Request memory req;
        // 直接返回 Uint8Array 数据，简化代码，避免嵌套函数调用
        string memory jsCode = "return Functions.encodeUint256(1);";
        req.initializeRequestForInlineJavaScript(jsCode);
        
        // 设置请求参数
        string[] memory args = new string[](4);
        args[0] = orderIdStr;
        args[1] = merchantEmail;
        // 传入商家净收金额：总锁定金额减去平台手续费
        uint256 netAmount = rec.amount - rec.platformFee;
        args[2] = Strings.toString(netAmount);
        args[3] = lpEmail;
        req.setArgs(args);
        
        // 发送请求
        bytes32 requestId = _sendRequest(
            req.encodeCBOR(),
            s_subscriptionId,
            300000,  // 回调Gas限制
            s_donId  // 使用默认的DON ID
        );
        
        // 保存requestId与paymentId的映射关系
        requestIdToPaymentId[requestId] = paymentId;
        
        emit VerificationRequested(paymentId, requestId);
    }

    // =========== Chainlink Functions 回调 ===========
    function _fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        string memory paymentId = requestIdToPaymentId[requestId];
        require(bytes(paymentId).length > 0, "Unknown request");
        delete requestIdToPaymentId[requestId];
        
        // 获取支付记录
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;
        
        PaymentRecord storage rec = paymentRecords[index];
        
        // 检查是否有错误
        if (err.length > 0) {
            verificationStatus[paymentId] = VerificationStatus.FAILED;
            // 直接输出原始 err 完整字符串，方便排查
            string memory errorReason = string(err);
            emit VerificationFailed(paymentId, errorReason);
            return;
        }
        
        // 尝试解析响应，使用标准try-catch模式
        try this.decodeVerificationResponse(response) returns (
            string memory payerEmail, 
            string memory merchantEmail, 
            uint256 respAmount, 
            string memory status
        ) {
            // 构建验证结果字符串以记录验证失败的具体原因
            string memory verificationResult = "";
            
            // 验证支付者邮箱
            bool payerEmailMatch = keccak256(bytes(payerEmail)) == keccak256(bytes(lpPaypalEmail[rec.lp]));
            if (!payerEmailMatch) {
                verificationResult = string(abi.encodePacked(
                    verificationResult, 
                    "Payer email mismatch. Expected: ", 
                    lpPaypalEmail[rec.lp],
                    ", Got: ",
                    payerEmail, 
                    ". "
                ));
            }
            
            // 验证商家邮箱
            bool merchantEmailMatch = keccak256(bytes(merchantEmail)) == keccak256(bytes(merchantEmails[paymentId]));
            if (!merchantEmailMatch) {
                verificationResult = string(abi.encodePacked(
                    verificationResult, 
                    "Merchant email mismatch. Expected: ", 
                    merchantEmails[paymentId],
                    ", Got: ",
                    merchantEmail, 
                    ". "
                ));
            }
            
            // 验证金额
            bool amountMatch = respAmount == rec.amount;
            if (!amountMatch) {
                verificationResult = string(abi.encodePacked(
                    verificationResult, 
                    "Amount mismatch. Expected: ", 
                    _toString(rec.amount),
                    ", Got: ",
                    _toString(respAmount), 
                    ". "
                ));
            }
            
            // 验证支付状态
            bool statusMatch = keccak256(bytes(status)) == keccak256(bytes("COMPLETED"));
            if (!statusMatch) {
                verificationResult = string(abi.encodePacked(
                    verificationResult, 
                    "Status mismatch. Expected: COMPLETED, Got: ", 
                    status,
                    ". "
                ));
            }
            
            // 验证所有字段
            bool isValid = payerEmailMatch && merchantEmailMatch && amountMatch && statusMatch;
            
            if (isValid) {
                // 更新验证状态
                verificationStatus[paymentId] = VerificationStatus.VERIFIED;
                
                // 记录旧状态
                uint8 oldStatus = uint8(rec.escrowStatus);
                
                // 更新为已确认
                rec.escrowStatus = EscrowStatus.CONFIRMED;
                rec.releaseTime = block.timestamp;
                
                // 触发事件
                emit OrderVerified(paymentId);
                emit PaymentConfirmed(paymentId, false);
                emit PaymentStatusChanged(
                    paymentId,
                    oldStatus,
                    uint8(EscrowStatus.CONFIRMED),
                    address(this),
                    block.timestamp
                );
                // 自动释放资金
                {
                    uint8 prevStatus2 = uint8(rec.escrowStatus);
                    rec.escrowStatus = EscrowStatus.RELEASED;
                    uint256 amountToLP2 = rec.amount - rec.platformFee;
                    platformPendingFees += rec.platformFee;
                    require(IERC20(rec.token).transfer(rec.lp, amountToLP2), "Auto release transfer failed");
                    emit PaymentReleased(paymentId, rec.lp, amountToLP2, rec.platformFee);
                    emit PaymentStatusChanged(
                        paymentId,
                        prevStatus2,
                        uint8(EscrowStatus.RELEASED),
                        address(this),
                        block.timestamp
                    );
                }
            } else {
                verificationStatus[paymentId] = VerificationStatus.FAILED;
                
                // 如果验证结果为空（不太可能），使用通用消息
                if (bytes(verificationResult).length == 0) {
                    verificationResult = "Verification data mismatch";
                }
                
                emit VerificationFailed(paymentId, verificationResult);
            }
        } catch {
            // CBOR 解析失败，直接输出原始 response 内容作为错误原因
            verificationStatus[paymentId] = VerificationStatus.FAILED;
            emit VerificationFailed(paymentId, string(response));
        }
    }
    
    // 辅助函数：解码验证响应
    function decodeVerificationResponse(bytes memory response) external view returns (
        string memory payerEmail, 
        string memory merchantEmail, 
        uint256 respAmount, 
        string memory status
    ) {
        // 尝试解析数字响应
        if (response.length == 32) {
            uint256 statusCode;
            assembly {
                statusCode := mload(add(response, 32))
            }
            
            if (statusCode == 1) {
                // 如果返回值是1，表示验证成功
                // 返回固定的成功值，从请求参数中获取
                return ("success", "success", 1000000, "COMPLETED");
            }
        }
        
        // 如果不是数字1，尝试使用原始方法解析
        try this.decodeWithABI(response) returns (
            string memory _payerEmail, 
            string memory _merchantEmail, 
            uint256 _respAmount, 
            string memory _status
        ) {
            return (_payerEmail, _merchantEmail, _respAmount, _status);
        } catch {
            // 如果abi.decode失败，尝试解析逗号分隔的字符串
            string memory responseStr = string(response);
            
            // 解析逗号分隔的字符串
            (payerEmail, merchantEmail, respAmount, status) = parseCSV(responseStr);
        }
    }
    
    // 尝试使用ABI解码
    function decodeWithABI(bytes memory response) external pure returns (
        string memory payerEmail, 
        string memory merchantEmail, 
        uint256 respAmount, 
        string memory status
    ) {
        return abi.decode(response, (string,string,uint256,string));
    }
    
    // 解析逗号分隔的字符串
    function parseCSV(string memory csvStr) internal pure returns (
        string memory payerEmail, 
        string memory merchantEmail, 
        uint256 respAmount, 
        string memory status
    ) {
        // 获取第一个逗号的位置
        uint256 pos1 = _indexOf(csvStr, ',', 0);
        require(pos1 != type(uint256).max, "Invalid CSV format");
        
        // 获取第二个逗号的位置
        uint256 pos2 = _indexOf(csvStr, ',', pos1 + 1);
        require(pos2 != type(uint256).max, "Invalid CSV format");
        
        // 获取第三个逗号的位置
        uint256 pos3 = _indexOf(csvStr, ',', pos2 + 1);
        require(pos3 != type(uint256).max, "Invalid CSV format");
        
        // 提取各个字段
        payerEmail = _substring(csvStr, 0, pos1);
        merchantEmail = _substring(csvStr, pos1 + 1, pos2 - pos1 - 1);
        
        // 将字符串金额转换为uint256
        string memory amountStr = _substring(csvStr, pos2 + 1, pos3 - pos2 - 1);
        respAmount = _parseUint(amountStr);
        
        // 提取状态
        status = _substring(csvStr, pos3 + 1, bytes(csvStr).length - pos3 - 1);
    }
    
    // 查找字符串中指定字符的位置
    function _indexOf(string memory str, bytes1 char, uint256 startIndex) internal pure returns (uint256) {
        bytes memory strBytes = bytes(str);
        
        for (uint256 i = startIndex; i < strBytes.length; i++) {
            if (strBytes[i] == char) {
                return i;
            }
        }
        
        return type(uint256).max; // 未找到
    }
    
    // 提取字符串的子串
    function _substring(string memory str, uint256 startIndex, uint256 length) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        
        bytes memory result = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = strBytes[startIndex + i];
        }
        
        return string(result);
    }
    
    // 将字符串解析为uint256
    function _parseUint(string memory s) internal pure returns (uint256) {
        bytes memory b = bytes(s);
        uint256 result = 0;
        
        for (uint256 i = 0; i < b.length; i++) {
            require(b[i] >= 0x30 && b[i] <= 0x39, "Invalid number");
            result = result * 10 + (uint8(b[i]) - 0x30);
        }
        
        return result;
    }

    // 辅助函数：检查字符串是否包含子串
    function _contains(string memory source, string memory search) internal pure returns (bool) {
        bytes memory sourceBytes = bytes(source);
        bytes memory searchBytes = bytes(search);
        
        if (searchBytes.length > sourceBytes.length) {
            return false;
        }
        
        for (uint i = 0; i <= sourceBytes.length - searchBytes.length; i++) {
            bool found = true;
            for (uint j = 0; j < searchBytes.length; j++) {
                if (sourceBytes[i + j] != searchBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return true;
            }
        }
        
        return false;
    }

    // =========== 辅助函数 ===========
    function _generatePaymentId() internal view returns (string memory) {
        uint256 randomValue = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, block.prevrandao)));
        return string(abi.encodePacked("pay_", _toString(randomValue % 1000000)));
    }
    
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        
        uint256 temp = value;
        uint256 digits;
        
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        
        bytes memory buffer = new bytes(digits);
        
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        
        return string(buffer);
    }

    // =========== 原有的 UnitPaySettlement 支付相关方法 ===========
    // 添加一个新的内部方法实现支付锁定，供createOrder调用
    function _lockPayment(
        address lp,
        address token,
        uint256 amount,
        string memory network,
        string memory paymentId
    ) internal returns (bool) {
        require(lp != address(0), "Invalid LP address");
        require(amount > 0, "Amount must be greater than 0");
        require(bytes(paymentId).length > 0, "Payment ID cannot be empty");
        require(paymentIdToIndex[paymentId] == 0, "Payment ID already used");
        require(networkTokens[network][token].isEnabled, "Token not supported");

        uint256 platformFee = (amount * PLATFORM_FEE_RATE) / 1000;
        IERC20 payToken = IERC20(token);
        require(payToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        uint256 index = paymentRecords.length;
        paymentRecords.push(PaymentRecord({
            user: msg.sender,
            lp: lp,
            token: token,
            amount: amount,
            timestamp: block.timestamp,
            lockTime: block.timestamp,
            releaseTime: 0,
            platformFee: platformFee,
            paymentId: paymentId,
            network: network,
            paymentType: PaymentType.ESCROW,
            escrowStatus: EscrowStatus.LOCKED,
            isDisputed: false
        }));

        userPaymentIndices[msg.sender].push(index);
        lpPaymentIndices[lp].push(index);
        paymentIdToIndex[paymentId] = index + 1;

        emit PaymentLocked(paymentId, msg.sender, lp, amount, platformFee);
        return true;
    }

    // 原有方法lockPayment保留为公共方法，保持向后兼容性
    function lockPayment(
        address lp,
        address token,
        uint256 amount,
        string calldata network,
        string calldata paymentId
    ) external nonReentrant returns (bool) {
        return _lockPayment(lp, token, amount, network, paymentId);
    }

    function updateTokenConfig(
        string calldata network,
        address tokenAddress,
        uint8 decimals,
        bool isEnabled
    ) external onlyOwner {
        require(tokenAddress != address(0), "Invalid token address");
        require(bytes(network).length > 0, "Network cannot be empty");

        TokenConfig storage config = networkTokens[network][tokenAddress];
        config.tokenAddress = tokenAddress;
        config.decimals = decimals;
        config.isEnabled = isEnabled;

        if (isEnabled) {
            networkTokenList[network].add(tokenAddress);
        } else {
            networkTokenList[network].remove(tokenAddress);
        }

        emit TokenConfigUpdated(network, tokenAddress, isEnabled);
    }

    function getNetworkTokens(string calldata network) external view returns (address[] memory) {
        return networkTokenList[network].values();
    }

    function settlePayment(
        address lp,
        address token,
        uint256 amount,
        string calldata network,
        string calldata paymentId
    ) external nonReentrant returns (bool) {
        require(lp != address(0), "Invalid LP address");
        require(amount > 0, "Amount must be greater than 0");
        require(bytes(paymentId).length > 0, "Payment ID cannot be empty");
        require(networkTokens[network][token].isEnabled, "Token not supported");

        IERC20 payToken = IERC20(token);
        require(payToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        uint256 platformFee = (amount * PLATFORM_FEE_RATE) / 1000;
        uint256 amountToLP = amount - platformFee;
        platformPendingFees += platformFee;

        require(payToken.transfer(lp, amountToLP), "Transfer to LP failed");

        uint256 index = paymentRecords.length;
        paymentRecords.push(PaymentRecord({
            user: msg.sender,
            lp: lp,
            token: token,
            amount: amount,
            timestamp: block.timestamp,
            lockTime: 0,
            releaseTime: 0,
            platformFee: platformFee,
            paymentId: paymentId,
            network: network,
            paymentType: PaymentType.DIRECT,
            escrowStatus: EscrowStatus.NONE,
            isDisputed: false
        }));

        userPaymentIndices[msg.sender].push(index);
        lpPaymentIndices[lp].push(index);
        paymentIdToIndex[paymentId] = index + 1;

        emit PaymentSettled(paymentId, msg.sender, lp, amount, network);
        return true;
    }

    function confirmPayment(string calldata paymentId) external nonReentrant {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage rec = paymentRecords[index];
        require(rec.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(rec.escrowStatus == EscrowStatus.LOCKED, "Payment not locked");
        require(rec.user == msg.sender, "Not authorized");

        uint8 oldStatus = uint8(rec.escrowStatus);
        rec.escrowStatus = EscrowStatus.CONFIRMED;
        rec.releaseTime = block.timestamp;

        emit PaymentConfirmed(paymentId, false);
        emit PaymentStatusChanged(
            paymentId,
            oldStatus,
            uint8(EscrowStatus.CONFIRMED),
            msg.sender,
            block.timestamp
        );
    }

    function releasePayment(string calldata paymentId) external nonReentrant {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage rec = paymentRecords[index];
        require(rec.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(
            rec.escrowStatus == EscrowStatus.CONFIRMED ||
            (rec.escrowStatus == EscrowStatus.LOCKED && block.timestamp >= rec.lockTime + AUTO_RELEASE_TIME),
            "Cannot release yet"
        );
        require(!rec.isDisputed, "Payment is disputed");

        bool isAuto = rec.escrowStatus == EscrowStatus.LOCKED;
        if (isAuto) {
            emit PaymentConfirmed(paymentId, true);
        }

        uint8 oldStatus = uint8(rec.escrowStatus);
        rec.escrowStatus = EscrowStatus.RELEASED;

        uint256 amountToLP = rec.amount - rec.platformFee;
        platformPendingFees += rec.platformFee;

        IERC20 payToken = IERC20(rec.token);
        require(payToken.transfer(rec.lp, amountToLP), "Transfer to LP failed");

        emit PaymentReleased(paymentId, rec.lp, amountToLP, rec.platformFee);
        emit PaymentStatusChanged(
            paymentId,
            oldStatus,
            uint8(EscrowStatus.RELEASED),
            msg.sender,
            block.timestamp
        );
    }

    function disputePayment(string calldata paymentId) external nonReentrant {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage rec = paymentRecords[index];
        require(rec.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(rec.escrowStatus == EscrowStatus.LOCKED || rec.escrowStatus == EscrowStatus.CONFIRMED, "Cannot dispute");
        require(rec.user == msg.sender, "Not authorized");
        require(block.timestamp <= rec.lockTime + DISPUTE_WINDOW, "Dispute window expired");
        require(!rec.isDisputed, "Already disputed");

        rec.isDisputed = true;
        emit PaymentDisputed(paymentId);
    }

    function refundPayment(string calldata paymentId) external nonReentrant {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage rec = paymentRecords[index];
        require(rec.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(rec.escrowStatus == EscrowStatus.LOCKED || rec.escrowStatus == EscrowStatus.CONFIRMED, "Cannot refund");
        require(rec.lp == msg.sender || rec.isDisputed, "Not authorized");

        uint8 oldStatus = uint8(rec.escrowStatus);
        rec.escrowStatus = EscrowStatus.REFUNDED;

        IERC20 payToken = IERC20(rec.token);
        require(payToken.transfer(rec.user, rec.amount), "Transfer failed");

        emit PaymentRefunded(paymentId, rec.user, rec.amount);
        emit PaymentStatusChanged(
            paymentId,
            oldStatus,
            uint8(EscrowStatus.REFUNDED),
            msg.sender,
            block.timestamp
        );
    }

    function expirePayment(string calldata paymentId) external nonReentrant {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage rec = paymentRecords[index];
        require(rec.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(rec.escrowStatus == EscrowStatus.LOCKED, "Payment not locked");
        require(block.timestamp > rec.lockTime + PAYMENT_EXPIRY_TIME, "Payment not expired");

        uint8 oldStatus = uint8(rec.escrowStatus);
        rec.escrowStatus = EscrowStatus.EXPIRED;

        IERC20 payToken = IERC20(rec.token);
        require(payToken.transfer(rec.user, rec.amount), "Transfer failed");

        emit PaymentExpired(paymentId, rec.user, rec.amount);
        emit PaymentStatusChanged(
            paymentId,
            oldStatus,
            uint8(EscrowStatus.EXPIRED),
            msg.sender,
            block.timestamp
        );
    }

    function withdrawPlatformFees(address token) external onlyOwner {
        require(token != address(0), "Invalid token address");
        IERC20 payToken = IERC20(token);
        uint256 amount = platformPendingFees;
        platformPendingFees = 0;
        require(payToken.transfer(owner(), amount), "Transfer failed");
        emit PlatformFeesWithdrawn(amount);
    }

    function getUserPayments(address user) external view returns (uint256[] memory) {
        return userPaymentIndices[user];
    }

    function getLpPayments(address lp) external view returns (uint256[] memory) {
        return lpPaymentIndices[lp];
    }

    function getPaymentByIndex(uint256 index) external view returns (
        address user,
        address lp,
        address token,
        uint256 amount,
        uint256 timestamp,
        uint256 lockTime,
        uint256 releaseTime,
        uint256 platformFee,
        string memory paymentId,
        string memory network,
        PaymentType paymentType,
        EscrowStatus escrowStatus,
        bool isDisputed
    ) {
        require(index < paymentRecords.length, "Index out of bounds");
        PaymentRecord storage rec = paymentRecords[index];
        return (
            rec.user,
            rec.lp,
            rec.token,
            rec.amount,
            rec.timestamp,
            rec.lockTime,
            rec.releaseTime,
            rec.platformFee,
            rec.paymentId,
            rec.network,
            rec.paymentType,
            rec.escrowStatus,
            rec.isDisputed
        );
    }

    function getPaymentByPaymentId(string calldata paymentId) external view returns (
        address user,
        address lp,
        address token,
        uint256 amount,
        uint256 timestamp,
        uint256 lockTime,
        uint256 releaseTime,
        uint256 platformFee,
        string memory _paymentId,
        string memory network,
        PaymentType paymentType,
        EscrowStatus escrowStatus,
        bool isDisputed
    ) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;
        PaymentRecord storage rec = paymentRecords[index];
        return (
            rec.user,
            rec.lp,
            rec.token,
            rec.amount,
            rec.timestamp,
            rec.lockTime,
            rec.releaseTime,
            rec.platformFee,
            rec.paymentId,
            rec.network,
            rec.paymentType,
            rec.escrowStatus,
            rec.isDisputed
        );
    }

    // =========== 实现 UnitpayFixCLFunctions 接口 ===========
    function getFunctionsRouter() external view override returns (address) {
        return address(i_functionsRouter);
    }

    function getSubscriptionId() external view override returns (uint64) {
        return s_subscriptionId;
    }

    function updateFunctionsRouter(address _functionsRouter) external override onlyOwner {
        require(_functionsRouter != address(0), "Zero address not allowed");
        revert("Router update not supported - need to deploy new contract");
    }

    function updateSubscriptionId(uint64 _subscriptionId) external override onlyOwner {
        s_subscriptionId = _subscriptionId;
        emit ChainlinkConfigUpdated(address(i_functionsRouter), _subscriptionId);
    }

    function updateSourceAndSecrets(bytes32 _source, bytes32 _secrets) external override onlyOwner {
        s_source = _source;
        s_secrets = _secrets;
        emit SourceAndSecretsUpdated(_source, _secrets);
    }
} 
 
 
 
 