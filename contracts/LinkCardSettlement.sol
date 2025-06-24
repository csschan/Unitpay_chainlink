// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title LinkCardSettlement
 * @dev 用于Link Card支付系统的清算合约，支持多链、托管支付和平台费用
 */
contract LinkCardSettlement is Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

    // 支付类型
    enum PaymentType {
        DIRECT,     // 直接支付
        ESCROW      // 托管支付
    }

    // 托管状态
    enum EscrowStatus {
        NONE,       // 未创建
        LOCKED,     // 已锁定
        CONFIRMED,  // 已确认
        RELEASED,   // 已释放
        REFUNDED    // 已退款
    }

    // 常量
    uint256 public constant PLATFORM_FEE_RATE = 5; // 0.5% = 5/1000
    uint256 public constant AUTO_RELEASE_TIME = 3 hours;
    uint256 public constant T1_LOCK_TIME = 24 hours;
    uint256 public constant DISPUTE_WINDOW = 72 hours;

    // 代币配置结构
    struct TokenConfig {
        address tokenAddress;  // 代币合约地址
        uint8 decimals;       // 代币精度
        bool isEnabled;       // 是否启用
    }

    // 支付记录结构
    struct PaymentRecord {
        address user;         // 用户地址
        address lp;           // LP地址
        address token;        // 支付代币地址
        uint256 amount;       // 支付金额
        uint256 timestamp;    // 创建时间
        uint256 lockTime;     // 锁定时间
        uint256 releaseTime;  // 释放时间
        uint256 platformFee;  // 平台费用
        string paymentId;     // 支付ID
        string network;       // 网络标识
        PaymentType paymentType;  // 支付类型
        EscrowStatus escrowStatus;// 托管状态
        bool isDisputed;      // 是否存在争议
    }

    // 状态变量
    IERC20 public defaultToken;  // 默认代币(USDT)
    uint256 public platformPendingFees;  // 平台待提取费用
    
    // 支付记录存储
    PaymentRecord[] public paymentRecords;
    mapping(string => uint256) private paymentIdToIndex;  // 支付ID到记录索引的映射
    mapping(address => uint256[]) private userPaymentIndices;  // 用户支付记录映射
    mapping(address => uint256[]) private lpPaymentIndices;    // LP支付记录映射
    
    // 代币配置存储
    mapping(string => mapping(address => TokenConfig)) public networkTokens;  // 网络代币配置
    mapping(string => EnumerableSet.AddressSet) private networkTokenList;    // 网络支持的代币列表

    // 事件
    event TokenConfigUpdated(string indexed network, address indexed token, bool isEnabled);
    event PaymentSettled(string indexed paymentId, address indexed user, address indexed lp, uint256 amount, string network);
    event PaymentLocked(string indexed paymentId, address indexed user, address indexed lp, uint256 amount, uint256 platformFee);
    event PaymentConfirmed(string indexed paymentId, bool isAuto);
    event PaymentReleased(string indexed paymentId, address indexed lp, uint256 amount, uint256 platformFee);
    event PaymentDisputed(string indexed paymentId);
    event PaymentRefunded(string indexed paymentId, address indexed user, uint256 amount);
    event PlatformFeesWithdrawn(uint256 amount);

    /**
     * @dev 构造函数
     * @param _defaultToken 默认代币地址(USDT)
     */
    constructor(address _defaultToken) Ownable(msg.sender) {
        require(_defaultToken != address(0), "Zero address not allowed");
        defaultToken = IERC20(_defaultToken);
    }

    /**
     * @dev 更新网络代币配置
     * @param network 网络标识
     * @param tokenAddress 代币地址
     * @param decimals 代币精度
     * @param isEnabled 是否启用
     */
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

    /**
     * @dev 获取网络支持的代币列表
     * @param network 网络标识
     * @return tokens 代币地址列表
     */
    function getNetworkTokens(string calldata network) external view returns (address[] memory) {
        return networkTokenList[network].values();
    }

    /**
     * @dev 直接支付
     * @param lp LP地址
     * @param token 代币地址
     * @param amount 金额
     * @param network 网络标识
     * @param paymentId 支付ID
     */
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

    /**
     * @dev 锁定托管支付
     * @param lp LP地址
     * @param token 代币地址
     * @param amount 金额
     * @param network 网络标识
     * @param paymentId 支付ID
     */
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

    /**
     * @dev 确认托管支付
     * @param paymentId 支付ID
     */
    function confirmPayment(string calldata paymentId) external nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.LOCKED, "Invalid payment status");
        require(msg.sender == payment.user, "Not payment owner");
        require(!payment.isDisputed, "Payment is disputed");

        payment.escrowStatus = EscrowStatus.CONFIRMED;
        payment.releaseTime = block.timestamp;

        emit PaymentConfirmed(paymentId, false);
        return true;
    }

    /**
     * @dev 自动释放托管支付
     * @param paymentId 支付ID
     */
    function autoReleasePayment(string calldata paymentId) external nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.LOCKED, "Invalid payment status");
        require(block.timestamp >= payment.lockTime + AUTO_RELEASE_TIME, "Auto release time not reached");
        require(!payment.isDisputed, "Payment is disputed");

        payment.escrowStatus = EscrowStatus.CONFIRMED;
        payment.releaseTime = block.timestamp;

        emit PaymentConfirmed(paymentId, true);
        return true;
    }

    /**
     * @dev LP提取已确认的托管支付
     * @param paymentId 支付ID
     */
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

        payment.escrowStatus = EscrowStatus.RELEASED;
        uint256 withdrawAmount = payment.amount - payment.platformFee;
        platformPendingFees += payment.platformFee;

        IERC20 payToken = IERC20(payment.token);
        require(payToken.transfer(payment.lp, withdrawAmount), "Transfer failed");

        emit PaymentReleased(paymentId, payment.lp, withdrawAmount, payment.platformFee);
        return true;
    }

    /**
     * @dev 发起支付争议
     * @param paymentId 支付ID
     */
    function disputePayment(string calldata paymentId) external nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.LOCKED, "Invalid payment status");
        require(msg.sender == payment.user || msg.sender == payment.lp, "Not payment participant");
        require(block.timestamp <= payment.lockTime + DISPUTE_WINDOW, "Dispute window expired");
        require(!payment.isDisputed, "Already disputed");

        payment.isDisputed = true;
        emit PaymentDisputed(paymentId);
        return true;
    }

    /**
     * @dev 退款争议支付
     * @param paymentId 支付ID
     */
    function refundPayment(string calldata paymentId) external onlyOwner nonReentrant returns (bool) {
        uint256 index = paymentIdToIndex[paymentId];
        require(index > 0, "Payment not found");
        index -= 1;

        PaymentRecord storage payment = paymentRecords[index];
        require(payment.paymentType == PaymentType.ESCROW, "Not an escrow payment");
        require(payment.escrowStatus == EscrowStatus.LOCKED, "Invalid payment status");
        require(payment.isDisputed, "Not disputed");

        payment.escrowStatus = EscrowStatus.REFUNDED;
        IERC20 payToken = IERC20(payment.token);
        require(payToken.transfer(payment.user, payment.amount), "Transfer failed");

        emit PaymentRefunded(paymentId, payment.user, payment.amount);
        return true;
    }

    /**
     * @dev 提取平台费用
     */
    function withdrawPlatformFees() external onlyOwner nonReentrant returns (bool) {
        uint256 amount = platformPendingFees;
        require(amount > 0, "No platform fees to withdraw");

        platformPendingFees = 0;
        require(defaultToken.transfer(owner(), amount), "Transfer failed");

        emit PlatformFeesWithdrawn(amount);
        return true;
    }

    /**
     * @dev 获取支付记录数量
     */
    function getPaymentRecordsCount() external view returns (uint256) {
        return paymentRecords.length;
    }

    /**
     * @dev 获取用户的支付记录数量
     * @param user 用户地址
     */
    function getUserPaymentCount(address user) external view returns (uint256) {
        return userPaymentIndices[user].length;
    }

    /**
     * @dev 获取LP的支付记录数量
     * @param lp LP地址
     */
    function getLPPaymentCount(address lp) external view returns (uint256) {
        return lpPaymentIndices[lp].length;
    }

    /**
     * @dev 检查支付ID是否存在
     * @param paymentId 支付ID
     */
    function isPaymentIdUsed(string calldata paymentId) external view returns (bool) {
        return paymentIdToIndex[paymentId] > 0;
    }

    /**
     * @dev 紧急提款，用于从合约中提取意外发送的代币
     * @param token 代币合约地址
     * @param amount 提取金额
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
}