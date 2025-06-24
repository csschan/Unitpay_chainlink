// UnitpayEnhanced 合约 ABI（前端仅需调用 createOrder 和 submitOrderId 方法）
window.UnitpayEnhancedAbi = [
  "function createOrder(address lpAddress, address tokenAddress, uint256 amount, string network, string merchantEmail) returns (string)",
  "function submitOrderId(string paymentId, string paypalOrderId)",
  // 注册LP的PayPal邮箱
  "function registerLp(string email)",
  // 获取支付记录和验证映射的视图函数
  "function getPaymentByPaymentId(string paymentId) view returns (address user, address lp, address token, uint256 amount, uint256 timestamp, uint256 lockTime, uint256 releaseTime, uint256 platformFee, string paymentIdStr, string network, uint8 paymentType, uint8 escrowStatus, bool isDisputed)",
  "function merchantEmails(string paymentId) view returns (string)",
  "function lpPaypalEmail(address lp) view returns (string)",
  "function verificationStatus(string paymentId) view returns (uint8)",
  // Chainlink Functions configuration getters
  "function getFunctionsRouter() view returns (address)",
  "function getSubscriptionId() view returns (uint64)",
  // Chainlink Functions verification event
  "event OrderVerified(string paymentId)",
  // 支付锁定事件，用于提取真实链上paymentId
  "event PaymentLocked(string paymentId, address indexed user, address indexed lp, uint256 amount, uint256 platformFee)",
  // Chainlink Functions callback events
  "event PaymentConfirmed(string paymentId, bool isAuto)",
  "event PaymentReleased(string paymentId, address lp, uint256 amount, uint256 platformFee)"
]; 