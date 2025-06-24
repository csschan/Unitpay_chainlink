// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract UnitPaySettlement is Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

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
    // 新增：支付状态变更事件
    event PaymentStatusChanged(
        string indexed paymentId, 
        uint8 oldStatus, 
        uint8 newStatus, 
        address triggeredBy,
        uint256 timestamp
    );

    constructor(address _defaultToken, address initialOwner) Ownable(initialOwner) {
        require(_defaultToken != address(0), "Zero address not allowed");
        defaultToken = IERC20(_defaultToken);
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

    function lockPayment(
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

    function confirmPayment(string calldata paymentId) external nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.LOCKED, "Invalid payment status");
        require(msg.sender == payment.user, "Not payment owner");
        require(!payment.isDisputed, "Payment is disputed");

        // 记录旧状态用于事件
        uint8 oldStatus = uint8(payment.escrowStatus);

        payment.escrowStatus = EscrowStatus.CONFIRMED;
        payment.releaseTime = block.timestamp;

        emit PaymentConfirmed(paymentId, false);
        
        // 新增：触发状态变更事件
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

        // 记录旧状态用于事件
        uint8 oldStatus = uint8(payment.escrowStatus);

        payment.escrowStatus = EscrowStatus.CONFIRMED;
        payment.releaseTime = block.timestamp;

        emit PaymentConfirmed(paymentId, true);
        
        // 新增：触发状态变更事件
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

        // 记录旧状态用于事件
        uint8 oldStatus = uint8(payment.escrowStatus);

        payment.escrowStatus = EscrowStatus.RELEASED;
        uint256 withdrawAmount = payment.amount - payment.platformFee;
        platformPendingFees += payment.platformFee;

        IERC20 payToken = IERC20(payment.token);
        require(payToken.transfer(payment.lp, withdrawAmount), "Transfer failed");

        emit PaymentReleased(paymentId, payment.lp, withdrawAmount, payment.platformFee);
        
        // 新增：触发状态变更事件
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

        // 记录旧状态用于事件
        uint8 oldStatus = uint8(payment.escrowStatus);

        payment.escrowStatus = EscrowStatus.REFUNDED;
        IERC20 payToken = IERC20(payment.token);
        require(payToken.transfer(payment.user, payment.amount), "Transfer failed");

        emit PaymentRefunded(paymentId, payment.user, payment.amount);
        
        // 新增：触发状态变更事件
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
        
        // 检查是否已过期（创建后30分钟）
        require(block.timestamp >= payment.lockTime + PAYMENT_EXPIRY_TIME, "Payment not yet expired");

        // 记录旧状态用于事件
        uint8 oldStatus = uint8(payment.escrowStatus);

        payment.escrowStatus = EscrowStatus.EXPIRED;
        IERC20 payToken = IERC20(payment.token);
        require(payToken.transfer(payment.user, payment.amount), "Transfer failed");

        emit PaymentExpired(paymentId, payment.user, payment.amount);
        
        // 触发状态变更事件
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
    
    // 新增：查询支付状态函数
    function getPaymentStatus(string calldata paymentId) external view returns (
        uint8 status,
        bool isDisputed,
        address owner,
        address recipient,
        uint256 amount,
        uint256 timestamp,
        uint256 lockTime,
        uint256 releaseTime
    ) {
        uint256 index = paymentIdToIndex[paymentId];
        
        // 如果支付不存在
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
    
    // 新增：批量查询支付状态
    function batchGetPaymentStatus(string[] calldata paymentIds) external view returns (
        uint8[] memory statuses,
        bool[] memory isDisputed
    ) {
        uint256 count = paymentIds.length;
        statuses = new uint8[](count);
        isDisputed = new bool[](count);
        
        for (uint256 i = 0; i < count; i++) {
            uint256 index = paymentIdToIndex[paymentIds[i]];
            if (index == 0) {
                statuses[i] = 0;
                isDisputed[i] = false;
            } else {
                PaymentRecord storage payment = paymentRecords[index - 1];
                statuses[i] = uint8(payment.escrowStatus);
                isDisputed[i] = payment.isDisputed;
            }
        }
        
        return (statuses, isDisputed);
    }
    
    // 新增：验证支付ID格式
    function isPaymentIdValid(string calldata paymentId) external pure returns (bool) {
        bytes memory idBytes = bytes(paymentId);
        uint256 length = idBytes.length;
        
        // 检查长度
        if (length < 3 || length > 64) {
            return false;
        }
        
        // 检查字符合法性（只允许字母、数字、下划线）
        for (uint256 i = 0; i < length; i++) {
            bytes1 char = idBytes[i];
            bool isAlphaNumeric = (
                (char >= 0x30 && char <= 0x39) || // 0-9
                (char >= 0x41 && char <= 0x5A) || // A-Z
                (char >= 0x61 && char <= 0x7A) || // a-z
                char == 0x5F                      // _
            );
            
            if (!isAlphaNumeric) {
                return false;
            }
        }
        
        return true;
    }
    
    // 新增：获取支付详情函数
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
    
    // 新增：获取用户所有支付ID
    function getUserPaymentIds(address user) external view returns (uint256[] memory) {
        return userPaymentIndices[user];
    }
    
    // 新增：获取LP所有支付ID
    function getLPPaymentIds(address lp) external view returns (uint256[] memory) {
        return lpPaymentIndices[lp];
    }
    
    // 新增：检查用户是否是支付拥有者
    function isPaymentOwner(string calldata paymentId, address user) external view returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        if (index == 0) {
            return false;
        }
        
        PaymentRecord storage payment = paymentRecords[index - 1];
        return payment.user == user;
    }
    
    // 新增：检查用户是否是支付接收者
    function isPaymentRecipient(string calldata paymentId, address lp) external view returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        if (index == 0) {
            return false;
        }
        
        PaymentRecord storage payment = paymentRecords[index - 1];
        return payment.lp == lp;
    }
} 