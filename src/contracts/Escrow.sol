// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title UnitPay Escrow Contract
 * @dev 实现USDT支付托管功能，包括资金锁定、自动释放和T+1提币
 */
contract UnitPayEscrow is Ownable, ReentrancyGuard, Pausable {
    // USDT代币合约
    IERC20 public token;
    
    // 订单状态枚举
    enum OrderStatus {
        None,       // 初始状态
        Locked,     // 资金已锁定
        Released,   // 资金已释放给LP
        Withdrawn,  // LP已提币
        Disputed,   // 存在争议
        Refunded   // 已退款
    }
    
    // 订单结构
    struct Order {
        address user;           // 用户地址
        address lp;            // LP地址
        uint256 amount;        // 金额
        uint256 lockTime;      // 锁定时间
        uint256 releaseTime;   // 释放时间
        uint256 withdrawTime;  // 可提币时间
        OrderStatus status;    // 订单状态
        bool isDisputed;       // 是否存在争议
    }
    
    // 订单映射
    mapping(string => Order) public orders;
    
    // 常量
    uint256 public constant AUTO_RELEASE_DELAY = 3 hours;  // 自动释放延迟
    uint256 public constant WITHDRAWAL_DELAY = 1 days;     // 提币延迟（T+1）
    
    // 事件
    event OrderCreated(string orderId, address user, address lp, uint256 amount);
    event OrderLocked(string orderId, uint256 amount, uint256 lockTime);
    event OrderReleased(string orderId, uint256 releaseTime, bool isAuto);
    event OrderWithdrawn(string orderId, address lp, uint256 amount);
    event OrderDisputed(string orderId, address disputer);
    event OrderRefunded(string orderId, address user, uint256 amount);
    
    // 构造函数
    constructor(address _token) {
        require(_token != address(0), "Invalid token address");
        token = IERC20(_token);
    }
    
    /**
     * @dev 锁定资金
     * @param orderId 订单ID
     * @param amount 金额
     * @param lp LP地址
     */
    function lockFunds(
        string memory orderId,
        uint256 amount,
        address lp
    ) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(lp != address(0), "Invalid LP address");
        require(orders[orderId].status == OrderStatus.None, "Order already exists");
        
        // 转移USDT到合约
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        // 创建订单
        orders[orderId] = Order({
            user: msg.sender,
            lp: lp,
            amount: amount,
            lockTime: block.timestamp,
            releaseTime: 0,
            withdrawTime: 0,
            status: OrderStatus.Locked,
            isDisputed: false
        });
        
        emit OrderLocked(orderId, amount, block.timestamp);
        emit OrderCreated(orderId, msg.sender, lp, amount);
    }
    
    /**
     * @dev 用户确认释放资金
     * @param orderId 订单ID
     */
    function releaseFunds(string memory orderId) external whenNotPaused nonReentrant {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Locked, "Invalid order status");
        require(msg.sender == order.user, "Not order owner");
        require(!order.isDisputed, "Order is disputed");
        
        _releaseFunds(orderId, false);
    }
    
    /**
     * @dev 自动释放资金（由后端调用）
     * @param orderId 订单ID
     */
    function autoReleaseFunds(string memory orderId) external whenNotPaused nonReentrant {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Locked, "Invalid order status");
        require(block.timestamp >= order.lockTime + AUTO_RELEASE_DELAY, "Too early for auto release");
        require(!order.isDisputed, "Order is disputed");
        
        _releaseFunds(orderId, true);
    }
    
    /**
     * @dev LP提币
     * @param orderId 订单ID
     */
    function withdrawFunds(string memory orderId) external whenNotPaused nonReentrant {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Released, "Funds not released");
        require(msg.sender == order.lp, "Not LP");
        require(block.timestamp >= order.releaseTime + WITHDRAWAL_DELAY, "Too early for withdrawal");
        require(!order.isDisputed, "Order is disputed");
        
        order.status = OrderStatus.Withdrawn;
        order.withdrawTime = block.timestamp;
        
        require(token.transfer(order.lp, order.amount), "Transfer failed");
        
        emit OrderWithdrawn(orderId, order.lp, order.amount);
    }
    
    /**
     * @dev 标记订单为争议状态
     * @param orderId 订单ID
     */
    function disputeOrder(string memory orderId) external {
        Order storage order = orders[orderId];
        require(msg.sender == order.user || msg.sender == order.lp, "Not authorized");
        require(order.status != OrderStatus.Withdrawn, "Already withdrawn");
        
        order.isDisputed = true;
        emit OrderDisputed(orderId, msg.sender);
    }
    
    /**
     * @dev 解决争议并退款给用户（仅管理员）
     * @param orderId 订单ID
     */
    function resolveDispute(string memory orderId) external onlyOwner whenNotPaused {
        Order storage order = orders[orderId];
        require(order.isDisputed, "Not disputed");
        require(order.status != OrderStatus.Withdrawn, "Already withdrawn");
        
        order.status = OrderStatus.Refunded;
        require(token.transfer(order.user, order.amount), "Transfer failed");
        
        emit OrderRefunded(orderId, order.user, order.amount);
    }
    
    /**
     * @dev 内部函数：释放资金
     * @param orderId 订单ID
     * @param isAuto 是否自动释放
     */
    function _releaseFunds(string memory orderId, bool isAuto) private {
        Order storage order = orders[orderId];
        order.status = OrderStatus.Released;
        order.releaseTime = block.timestamp;
        
        emit OrderReleased(orderId, block.timestamp, isAuto);
    }
    
    /**
     * @dev 暂停合约（仅管理员）
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev 恢复合约（仅管理员）
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev 紧急提取代币（仅管理员）
     * @param tokenAddress 代币地址
     */
    function emergencyWithdraw(address tokenAddress) external onlyOwner {
        IERC20 tokenToWithdraw = IERC20(tokenAddress);
        uint256 balance = tokenToWithdraw.balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");
        require(tokenToWithdraw.transfer(owner(), balance), "Transfer failed");
    }
} 