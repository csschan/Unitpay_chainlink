// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract UnitPayEscrow is Ownable, ReentrancyGuard {
    IERC20 public usdt;
    
    uint256 public constant RELEASE_DELAY = 24 hours;
    uint256 public constant DISPUTE_WINDOW = 72 hours;
    
    struct Payment {
        address merchant;
        address lp;
        uint256 amount;
        uint256 lockTime;
        bool isReleased;
        bool isDisputed;
        bool isRefunded;
        bool exists;
    }
    
    mapping(bytes32 => Payment) public payments;
    mapping(address => uint256) public lpBalances;
    
    event PaymentLocked(bytes32 indexed paymentId, address indexed merchant, address indexed lp, uint256 amount);
    event PaymentReleased(bytes32 indexed paymentId, address indexed merchant, uint256 amount);
    event PaymentDisputed(bytes32 indexed paymentId);
    event PaymentRefunded(bytes32 indexed paymentId, address indexed lp, uint256 amount);
    event LPWithdrawn(address indexed lp, uint256 amount);
    
    constructor(address _usdt) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT address");
        usdt = IERC20(_usdt);
    }
    
    function lockPayment(bytes32 paymentId, address merchant, uint256 amount) external nonReentrant {
        require(!payments[paymentId].exists, "Payment already exists");
        require(merchant != address(0), "Invalid merchant address");
        require(amount > 0, "Amount must be greater than 0");
        
        require(usdt.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        payments[paymentId] = Payment({
            merchant: merchant,
            lp: msg.sender,
            amount: amount,
            lockTime: block.timestamp,
            isReleased: false,
            isDisputed: false,
            isRefunded: false,
            exists: true
        });
        
        emit PaymentLocked(paymentId, merchant, msg.sender, amount);
    }
    
    function releasePayment(bytes32 paymentId) external nonReentrant {
        Payment storage payment = payments[paymentId];
        require(payment.exists, "Payment does not exist");
        require(!payment.isReleased && !payment.isRefunded, "Payment already processed");
        require(block.timestamp >= payment.lockTime + RELEASE_DELAY, "Release delay not met");
        require(!payment.isDisputed || block.timestamp >= payment.lockTime + DISPUTE_WINDOW, "Payment is disputed");
        
        payment.isReleased = true;
        require(usdt.transfer(payment.merchant, payment.amount), "Transfer failed");
        
        emit PaymentReleased(paymentId, payment.merchant, payment.amount);
    }
    
    function disputePayment(bytes32 paymentId) external {
        Payment storage payment = payments[paymentId];
        require(payment.exists, "Payment does not exist");
        require(!payment.isReleased && !payment.isRefunded, "Payment already processed");
        require(msg.sender == payment.merchant || msg.sender == payment.lp, "Not authorized");
        require(block.timestamp < payment.lockTime + DISPUTE_WINDOW, "Dispute window expired");
        
        payment.isDisputed = true;
        emit PaymentDisputed(paymentId);
    }
    
    function refundPayment(bytes32 paymentId) external onlyOwner nonReentrant {
        Payment storage payment = payments[paymentId];
        require(payment.exists, "Payment does not exist");
        require(!payment.isReleased && !payment.isRefunded, "Payment already processed");
        
        payment.isRefunded = true;
        lpBalances[payment.lp] += payment.amount;
        
        emit PaymentRefunded(paymentId, payment.lp, payment.amount);
    }
    
    function withdrawLP() external nonReentrant {
        uint256 amount = lpBalances[msg.sender];
        require(amount > 0, "No balance to withdraw");
        
        lpBalances[msg.sender] = 0;
        require(usdt.transfer(msg.sender, amount), "Transfer failed");
        
        emit LPWithdrawn(msg.sender, amount);
    }
    
    function getPayment(bytes32 paymentId) external view returns (
        address merchant,
        address lp,
        uint256 amount,
        uint256 lockTime,
        bool isReleased,
        bool isDisputed,
        bool isRefunded
    ) {
        Payment memory payment = payments[paymentId];
        require(payment.exists, "Payment does not exist");
        
        return (
            payment.merchant,
            payment.lp,
            payment.amount,
            payment.lockTime,
            payment.isReleased,
            payment.isDisputed,
            payment.isRefunded
        );
    }
} 