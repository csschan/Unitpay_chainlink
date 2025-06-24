// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title LinkCardSettlement
 * @dev 用于Link Card支付系统的清算合约
 */
contract LinkCardSettlement is Ownable, ReentrancyGuard {
    // USDT合约地址
    IERC20 public usdtToken;
    
    // 支付记录结构
    struct PaymentRecord {
        address user;
        address lp;
        uint256 amount;
        uint256 timestamp;
        string paymentId;
    }
    
    // 所有支付记录
    PaymentRecord[] public paymentRecords;
    
    // 用户支付记录映射
    mapping(address => uint256[]) private userPaymentIndices;
    
    // LP支付记录映射
    mapping(address => uint256[]) private lpPaymentIndices;
    
    // 支付ID到记录索引的映射
    mapping(string => uint256) private paymentIdToIndex;
    
    // 事件：支付已结算
    event PaymentSettled(
        address indexed user,
        address indexed lp,
        uint256 amount,
        uint256 timestamp,
        string paymentId
    );
    
    // 事件：批量支付已结算
    event BatchPaymentsSettled(
        address indexed user,
        address[] lps,
        uint256[] amounts,
        uint256 timestamp,
        string[] paymentIds
    );
    
    /**
     * @dev 构造函数
     * @param _usdtAddress USDT合约地址
     */
    constructor(address _usdtAddress) {
        require(_usdtAddress != address(0), "Zero address not allowed");
        usdtToken = IERC20(_usdtAddress);
    }
    
    /**
     * @dev 更新USDT合约地址
     * @param _usdtAddress 新的USDT合约地址
     */
    function setUsdtToken(address _usdtAddress) external onlyOwner {
        require(_usdtAddress != address(0), "Zero address not allowed");
        usdtToken = IERC20(_usdtAddress);
    }
    
    /**
     * @dev 结算单笔支付，将USDT从用户转账给LP
     * @param lp LP的钱包地址
     * @param amount USDT金额（以最小单位计算，6位小数）
     * @param paymentId 支付唯一标识ID
     * @return 是否成功
     */
    function settlePayment(address lp, uint256 amount, string calldata paymentId) external nonReentrant returns (bool) {
        require(lp != address(0), "Invalid LP address");
        require(amount > 0, "Amount must be greater than 0");
        require(bytes(paymentId).length > 0, "Payment ID cannot be empty");
        require(paymentIdToIndex[paymentId] == 0, "Payment ID already used");
        
        // 从用户地址转账USDT到LP地址
        // 注意：用户必须事先授权本合约可以转移其USDT
        bool success = usdtToken.transferFrom(msg.sender, lp, amount);
        require(success, "Transfer failed");
        
        // 记录支付信息
        uint256 index = paymentRecords.length;
        paymentRecords.push(PaymentRecord({
            user: msg.sender,
            lp: lp,
            amount: amount,
            timestamp: block.timestamp,
            paymentId: paymentId
        }));
        
        // 更新映射
        userPaymentIndices[msg.sender].push(index);
        lpPaymentIndices[lp].push(index);
        paymentIdToIndex[paymentId] = index + 1; // 加1避免与默认值0冲突
        
        // 触发支付结算事件
        emit PaymentSettled(msg.sender, lp, amount, block.timestamp, paymentId);
        
        return true;
    }
    
    /**
     * @dev 批量结算支付，将USDT从用户转账给多个LP
     * @param lps LP的钱包地址数组
     * @param amounts 对应的USDT金额数组
     * @param paymentIds 对应的支付ID数组
     * @return 是否成功
     */
    function batchSettlePayments(
        address[] calldata lps,
        uint256[] calldata amounts,
        string[] calldata paymentIds
    ) external nonReentrant returns (bool) {
        require(lps.length > 0, "Empty LP addresses");
        require(lps.length == amounts.length && lps.length == paymentIds.length, "Array length mismatch");
        
        uint256 totalAmount = 0;
        
        // 计算总金额
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Amount must be greater than 0");
            require(lps[i] != address(0), "Invalid LP address");
            require(bytes(paymentIds[i]).length > 0, "Payment ID cannot be empty");
            require(paymentIdToIndex[paymentIds[i]] == 0, "Payment ID already used");
            totalAmount += amounts[i];
        }
        
        // 从用户一次性转账总金额
        bool success = usdtToken.transferFrom(msg.sender, address(this), totalAmount);
        require(success, "Transfer failed");
        
        // 分配给各个LP
        for (uint256 i = 0; i < lps.length; i++) {
            // 从合约转账给LP
            require(usdtToken.transfer(lps[i], amounts[i]), "LP transfer failed");
            
            // 记录支付信息
            uint256 index = paymentRecords.length;
            paymentRecords.push(PaymentRecord({
                user: msg.sender,
                lp: lps[i],
                amount: amounts[i],
                timestamp: block.timestamp,
                paymentId: paymentIds[i]
            }));
            
            // 更新映射
            userPaymentIndices[msg.sender].push(index);
            lpPaymentIndices[lps[i]].push(index);
            paymentIdToIndex[paymentIds[i]] = index + 1;
        }
        
        // 触发批量支付结算事件
        emit BatchPaymentsSettled(msg.sender, lps, amounts, block.timestamp, paymentIds);
        
        return true;
    }
    
    /**
     * @dev 获取支付记录数量
     * @return 记录数量
     */
    function getPaymentRecordsCount() external view returns (uint256) {
        return paymentRecords.length;
    }
    
    /**
     * @dev 获取用户的支付记录数量
     * @param user 用户地址
     * @return 记录数量
     */
    function getUserPaymentCount(address user) external view returns (uint256) {
        return userPaymentIndices[user].length;
    }
    
    /**
     * @dev 获取LP的支付记录数量
     * @param lp LP地址
     * @return 记录数量
     */
    function getLPPaymentCount(address lp) external view returns (uint256) {
        return lpPaymentIndices[lp].length;
    }
    
    /**
     * @dev 检查支付ID是否存在
     * @param paymentId 支付ID
     * @return 是否存在
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