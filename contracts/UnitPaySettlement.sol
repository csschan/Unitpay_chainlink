// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract UnitPaySettlement is Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

    enum PaymentType { DIRECT, ESCROW }
    enum EscrowStatus { NONE, LOCKED, CONFIRMED, RELEASED, REFUNDED }

    uint256 public constant PLATFORM_FEE_RATE = 5; // 0.5% = 5/1000
    uint256 public constant AUTO_RELEASE_TIME = 3 hours;
    uint256 public constant T1_LOCK_TIME = 24 hours;
    uint256 public constant DISPUTE_WINDOW = 72 hours;

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

        payment.escrowStatus = EscrowStatus.CONFIRMED;
        payment.releaseTime = block.timestamp;

        emit PaymentConfirmed(paymentId, false);
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

        payment.escrowStatus = EscrowStatus.CONFIRMED;
        payment.releaseTime = block.timestamp;

        emit PaymentConfirmed(paymentId, true);
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

        payment.escrowStatus = EscrowStatus.RELEASED;
        uint256 withdrawAmount = payment.amount - payment.platformFee;
        platformPendingFees += payment.platformFee;

        IERC20 payToken = IERC20(payment.token);
        require(payToken.transfer(payment.lp, withdrawAmount), "Transfer failed");

        emit PaymentReleased(paymentId, payment.lp, withdrawAmount, payment.platformFee);
        return true;
    }

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
} 