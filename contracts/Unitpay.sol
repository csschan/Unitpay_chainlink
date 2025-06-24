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

contract UnitpayFull is ReentrancyGuard, FunctionsClient, ConfirmedOwner {
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
    event PaymentLocked(string indexed paymentId, address indexed user, address indexed lp, uint256 amount, uint256 platformFee);
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
    bytes32 private immutable source;
    bytes32 private immutable secrets;
    bytes32 private immutable s_donId;
    uint64 private immutable subscriptionId;
    
    // Chainlink requestId -> 支付 ID
    mapping(bytes32 => string) private requestIdToPaymentId;
    
    // 新增事件
    event OrderSubmitted(string indexed paymentId, string orderIdStr);
    event VerificationRequested(string indexed paymentId, bytes32 requestId);
    event OrderVerified(string indexed paymentId);
    event VerificationFailed(string indexed paymentId, string reason);

    constructor(
        address _defaultToken, 
        address _functionsRouter,
        bytes32 _source,
        bytes32 _secrets,
        uint64 _subscriptionId,
        bytes32 _donId
    ) 
        // Ownable(msg.sender) 
        FunctionsClient(_functionsRouter)
        ConfirmedOwner(msg.sender) 
    {
        require(_defaultToken != address(0), "Zero address not allowed");
        defaultToken = IERC20(_defaultToken);
        source = _source;
        secrets = _secrets;
        subscriptionId = _subscriptionId;
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
        req.initializeRequestForInlineJavaScript(string(abi.encodePacked(source)));
        
        if (secrets != bytes32(0)) {
            req.addDONHostedSecrets(0, 1);  // 使用第一个slot版本
        }
        
        // 设置请求参数
        string[] memory args = new string[](4);
        args[0] = orderIdStr;
        args[1] = merchantEmail;
        args[2] = Strings.toString(rec.amount);
        args[3] = lpEmail;
        req.setArgs(args);
        
        // 发送请求
        bytes32 requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
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
            emit VerificationFailed(paymentId, "External error during verification");
            return;
        }
        
        // 解析响应：[payerEmail, merchantEmail, amount, status]
        (string memory payerEmail, 
         string memory merchantEmail, 
         uint256 respAmount, 
         string memory status) = abi.decode(response, (string,string,uint256,string));
        
        // 验证所有字段
        bool isValid = 
            keccak256(bytes(payerEmail)) == keccak256(bytes(lpPaypalEmail[rec.lp])) &&
            keccak256(bytes(merchantEmail)) == keccak256(bytes(merchantEmails[paymentId])) &&
            respAmount == rec.amount &&
            keccak256(bytes(status)) == keccak256(bytes("COMPLETED"));
        
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
        } else {
            verificationStatus[paymentId] = VerificationStatus.FAILED;
            emit VerificationFailed(paymentId, "Verification data mismatch");
        }
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

    // =========== 以下是 UnitPaySettlementV2 的其余方法 ===========
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

    // 以下复制原有合约的其余方法，保持不变
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
        require(paymentIdToIndex[paymentId] == 0, "Payment ID already used");
        require(networkTokens[network][token].isEnabled, "Token not supported");

        IERC20 payToken = IERC20(token);
        require(payToken.transferFrom(msg.sender, lp, amount), "Transfer failed");

        uint256 index = paymentRecords.length;
        paymentRecords.push(PaymentRecord({
            user: msg.sender,
            lp: lp,
            token: token,
            amount: amount,
            timestamp: block.timestamp,
            lockTime: 0,
            releaseTime: 0,
            platformFee: 0,
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

    function confirmPayment(string calldata paymentId) external nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.LOCKED, "Invalid payment status");
        require(msg.sender == payment.user, "Not payment owner");
        require(!payment.isDisputed, "Payment is disputed");

        uint8 oldStatus = uint8(payment.escrowStatus);
        payment.escrowStatus = EscrowStatus.CONFIRMED;
        payment.releaseTime = block.timestamp;

        emit PaymentConfirmed(paymentId, false);
        emit PaymentStatusChanged(
            paymentId,
            oldStatus,
            uint8(EscrowStatus.CONFIRMED),
            msg.sender,
            block.timestamp
        );

        return true;
    }

    function autoReleasePayment(string calldata paymentId) external nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.LOCKED, "Invalid payment status");
        require(block.timestamp >= payment.lockTime + AUTO_RELEASE_TIME, "Auto release time not reached");
        require(!payment.isDisputed, "Payment is disputed");

        uint8 oldStatus = uint8(payment.escrowStatus);
        payment.escrowStatus = EscrowStatus.CONFIRMED;
        payment.releaseTime = block.timestamp;

        emit PaymentConfirmed(paymentId, true);
        emit PaymentStatusChanged(
            paymentId,
            oldStatus,
            uint8(EscrowStatus.CONFIRMED),
            msg.sender,
            block.timestamp
        );
        
        return true;
    }

    function withdrawPayment(string calldata paymentId) external nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.CONFIRMED, "Payment not confirmed");
        require(msg.sender == payment.lp, "Not LP");
        require(block.timestamp >= payment.releaseTime + T1_LOCK_TIME, "T+1 lock time not reached");
        require(!payment.isDisputed, "Payment is disputed");

        uint8 oldStatus = uint8(payment.escrowStatus);
        payment.escrowStatus = EscrowStatus.RELEASED;
        uint256 withdrawAmount = payment.amount - payment.platformFee;
        platformPendingFees += payment.platformFee;

        IERC20 payToken = IERC20(payment.token);
        require(payToken.transfer(payment.lp, withdrawAmount), "Transfer failed");

        emit PaymentReleased(paymentId, payment.lp, withdrawAmount, payment.platformFee);
        emit PaymentStatusChanged(
            paymentId,
            oldStatus,
            uint8(EscrowStatus.RELEASED),
            msg.sender,
            block.timestamp
        );

        return true;
    }

    function disputePayment(string calldata paymentId) external nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.CONFIRMED, "Invalid payment status");
        require(msg.sender == payment.user, "Not payment owner");
        require(block.timestamp <= payment.releaseTime + 23 hours, "Dispute window expired");
        require(!payment.isDisputed, "Already disputed");

        payment.isDisputed = true;
        emit PaymentDisputed(paymentId);
        return true;
    }

    function refundPayment(string calldata paymentId) external onlyOwner nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.LOCKED, "Invalid payment status");
        require(payment.isDisputed, "Not disputed");

        uint8 oldStatus = uint8(payment.escrowStatus);
        payment.escrowStatus = EscrowStatus.REFUNDED;

        IERC20 payToken = IERC20(payment.token);
        require(payToken.transfer(payment.user, payment.amount), "Transfer failed");

        emit PaymentRefunded(paymentId, payment.user, payment.amount);
        emit PaymentStatusChanged(
            paymentId,
            oldStatus,
            uint8(EscrowStatus.REFUNDED),
            msg.sender,
            block.timestamp
        );

        return true;
    }

    function cancelExpiredPayment(string calldata paymentId) external nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.LOCKED, "Invalid payment status");
        require(msg.sender == payment.user, "Not payment owner");
        require(!payment.isDisputed, "Payment is disputed");
        require(block.timestamp >= payment.lockTime + PAYMENT_EXPIRY_TIME, "Payment not yet expired");

        uint8 oldStatus = uint8(payment.escrowStatus);
        payment.escrowStatus = EscrowStatus.EXPIRED;

        IERC20 payToken = IERC20(payment.token);
        require(payToken.transfer(payment.user, payment.amount), "Transfer failed");

        emit PaymentExpired(paymentId, payment.user, payment.amount);
        emit PaymentStatusChanged(
            paymentId,
            oldStatus,
            uint8(EscrowStatus.EXPIRED),
            msg.sender,
            block.timestamp
        );

        return true;
    }

    function withdrawPlatformFees() external onlyOwner nonReentrant returns (bool) {
        uint256 amount = platformPendingFees;
        require(amount > 0, "No platform fees to withdraw");

        platformPendingFees = 0;
        require(defaultToken.transfer(owner(), amount), "Transfer failed");

        emit PlatformFeesWithdrawn(amount);
        return true;
    }

    function getPaymentRecordsCount() external view returns (uint256) {
        return paymentRecords.length;
    }

    function getUserPaymentCount(address user) external view returns (uint256) {
        return userPaymentIndices[user].length;
    }

    function getLPPaymentCount(address lp) external view returns (uint256) {
        return lpPaymentIndices[lp].length;
    }

    function isPaymentIdUsed(string calldata paymentId) external view returns (bool) {
        return paymentIdToIndex[paymentId] > 0;
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }

    function getPaymentStatus(string calldata paymentId) external view returns (
        uint8 status,
        bool isDisputed,
        address user,
        address lp,
        uint256 amount,
        uint256 timestamp,
        uint256 lockTime,
        uint256 releaseTime
    ) {
        uint256 index = paymentIdToIndex[paymentId];
        if (index == 0) {
            return (0, false, address(0), address(0), 0, 0, 0, 0);
        }
        PaymentRecord storage payment = paymentRecords[index - 1];
        return (
            uint8(payment.escrowStatus),
            payment.isDisputed,
            payment.user,
            payment.lp,
            payment.amount,
            payment.timestamp,
            payment.lockTime,
            payment.releaseTime
        );
    }

    function batchGetPaymentStatus(string[] calldata paymentIds) external view returns (
        uint8[] memory statuses,
        bool[] memory isDisputed
    ) {
        uint256 count = paymentIds.length;
        statuses = new uint8[](count);
        isDisputed = new bool[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = paymentIdToIndex[paymentIds[i]];
            if (idx == 0) {
                statuses[i] = 0;
                isDisputed[i] = false;
            } else {
                PaymentRecord storage p = paymentRecords[idx - 1];
                statuses[i] = uint8(p.escrowStatus);
                isDisputed[i] = p.isDisputed;
            }
        }
        return (statuses, isDisputed);
    }

    function isPaymentIdValid(string calldata paymentId) external pure returns (bool) {
        bytes memory idBytes = bytes(paymentId);
        uint256 length = idBytes.length;
        if (length < 3 || length > 64) {
            return false;
        }
        for (uint256 i = 0; i < length; i++) {
            bytes1 char = idBytes[i];
            bool isAlphaNumeric = (
                (char >= 0x30 && char <= 0x39) ||
                (char >= 0x41 && char <= 0x5A) ||
                (char >= 0x61 && char <= 0x7A) ||
                char == 0x5F
            );
            if (!isAlphaNumeric) {
                return false;
            }
        }
        return true;
    }

    function getPaymentDetails(string calldata paymentId) external view returns (
        address user,
        address lp,
        address token,
        uint256 amount,
        uint256 timestamp,
        uint256 lockTime,
        uint256 releaseTime,
        uint256 platformFee,
        string memory network,
        uint8 paymentType,
        uint8 escrowStatus,
        bool isDisputed
    ) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;
        PaymentRecord storage payment = paymentRecords[index];
        return (
            payment.user,
            payment.lp,
            payment.token,
            payment.amount,
            payment.timestamp,
            payment.lockTime,
            payment.releaseTime,
            payment.platformFee,
            payment.network,
            uint8(payment.paymentType),
            uint8(payment.escrowStatus),
            payment.isDisputed
        );
    }

    function getUserPaymentIds(address user) external view returns (uint256[] memory) {
        return userPaymentIndices[user];
    }

    function getLPPaymentIds(address lp) external view returns (uint256[] memory) {
        return lpPaymentIndices[lp];
    }

    function isPaymentOwner(string calldata paymentId, address user) external view returns (bool) {
        uint256 index2 = paymentIdToIndex[paymentId];
        if (index2 == 0) {
            return false;
        }
        PaymentRecord storage payRec = paymentRecords[index2 - 1];
        return payRec.user == user;
    }

    function isPaymentRecipient(string calldata paymentId, address lp) external view returns (bool) {
        uint256 index3 = paymentIdToIndex[paymentId];
        if (index3 == 0) {
            return false;
        }
        PaymentRecord storage payRec2 = paymentRecords[index3 - 1];
        return payRec2.lp == lp;
    }
} 