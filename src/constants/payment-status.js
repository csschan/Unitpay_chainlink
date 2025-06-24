/**
 * 支付状态常量
 */
const PaymentStatus = {
  // 主状态
  MAIN: {
    CREATED: 'created',       // 支付意图已创建
    CLAIMED: 'claimed',       // LP已认领
    PAID: 'paid',             // LP已标记支付完成
    CONFIRMED: 'confirmed',   // 用户已确认收到付款
    SETTLED: 'settled',       // 已通过区块链结算
    
    // 异常状态
    CANCELLED: 'cancelled',     // 已取消
    EXPIRED: 'expired',         // 已过期
    FAILED: 'failed',           // 失败
    REFUNDED: 'refunded',       // 已退款
    REVERSED: 'reversed',       // 已撤销
    REJECTED: 'rejected',       // 已拒绝
    DISPUTED: 'disputed',       // 争议中
    PENDING_REVIEW: 'pending_review'  // 待审核
  },
  
  // 托管状态
  ESCROW: {
    NONE: 'none',          // 初始状态
    LOCKED: 'locked',      // 已锁定
    CONFIRMED: 'confirmed', // 已确认
    RELEASED: 'released',   // 已释放
    REFUNDED: 'refunded'    // 已退款
  },
  
  // 区块链技术状态
  BLOCKCHAIN: {
    PENDING: 'pending',         // 等待中（区块链交易已发送未确认）
    PROCESSING: 'processing',   // 处理中（区块链交易已确认但确认数不足）
    COMPLETED: 'completed',     // 完成（区块链交易已完成）
  },
  
  // 状态映射关系
  MAPPINGS: {
    // 主状态 -> 托管状态的映射
    MAIN_TO_ESCROW: {
      'created': 'none',
      'claimed': 'none',
      'paid': 'locked',
      'confirmed': 'confirmed',
      'settled': 'released',
      'cancelled': 'refunded',
      'expired': 'refunded',
      'failed': 'refunded',
      'refunded': 'refunded',
      'reversed': 'refunded',
      'rejected': 'refunded',
      'disputed': 'locked',
      'pending_review': 'locked'
    },
    
    // 托管状态 -> 主状态的映射
    ESCROW_TO_MAIN: {
      'none': ['created', 'claimed'],
      'locked': ['paid', 'disputed', 'pending_review'],
      'confirmed': ['confirmed'],
      'released': ['settled'],
      'refunded': ['cancelled', 'expired', 'failed', 'refunded', 'reversed', 'rejected']
    },
    
    // 区块链状态数字映射
    BLOCKCHAIN_NUMBER: {
      0: 'none',
      1: 'locked',
      2: 'confirmed',
      3: 'released',
      4: 'refunded'
    }
  }
};

/**
 * 定义有效的状态转换规则
 * key: 当前状态, value: 允许转换到的状态数组
 */
PaymentStatus.VALID_TRANSITIONS = {
  // 主状态转换规则
  MAIN: {
    [PaymentStatus.MAIN.CREATED]: [
      PaymentStatus.MAIN.CLAIMED, 
      PaymentStatus.MAIN.CANCELLED, 
      PaymentStatus.MAIN.EXPIRED
    ],
    [PaymentStatus.MAIN.CLAIMED]: [
      PaymentStatus.MAIN.PAID, 
      PaymentStatus.MAIN.CANCELLED, 
      PaymentStatus.MAIN.EXPIRED, 
      PaymentStatus.MAIN.DISPUTED
    ],
    // 支持处理中的状态 'processing' 与 'claimed' 等效，允许后续标记为已支付
    ['processing']: [
      PaymentStatus.MAIN.PAID,
      PaymentStatus.MAIN.CANCELLED,
      PaymentStatus.MAIN.EXPIRED,
      PaymentStatus.MAIN.DISPUTED
    ],
    [PaymentStatus.MAIN.PAID]: [
      PaymentStatus.MAIN.CONFIRMED, 
      PaymentStatus.MAIN.DISPUTED, 
      PaymentStatus.MAIN.CANCELLED, 
      PaymentStatus.MAIN.REFUNDED
    ],
    [PaymentStatus.MAIN.CONFIRMED]: [
      PaymentStatus.MAIN.SETTLED, 
      PaymentStatus.MAIN.DISPUTED, 
      PaymentStatus.BLOCKCHAIN.PENDING, 
      PaymentStatus.BLOCKCHAIN.PROCESSING
    ],
    [PaymentStatus.BLOCKCHAIN.PENDING]: [
      PaymentStatus.BLOCKCHAIN.PROCESSING, 
      PaymentStatus.BLOCKCHAIN.COMPLETED, 
      PaymentStatus.MAIN.FAILED, 
      PaymentStatus.MAIN.REJECTED
    ],
    [PaymentStatus.BLOCKCHAIN.PROCESSING]: [
      PaymentStatus.BLOCKCHAIN.COMPLETED, 
      PaymentStatus.MAIN.FAILED, 
      PaymentStatus.MAIN.REJECTED
    ],
    [PaymentStatus.BLOCKCHAIN.COMPLETED]: [
      PaymentStatus.MAIN.SETTLED
    ],
    [PaymentStatus.MAIN.FAILED]: [
      PaymentStatus.MAIN.CREATED,  // 允许重试
      PaymentStatus.MAIN.REFUNDED
    ],
    [PaymentStatus.MAIN.DISPUTED]: [
      PaymentStatus.MAIN.SETTLED, 
      PaymentStatus.MAIN.REFUNDED, 
      PaymentStatus.MAIN.CONFIRMED
    ],
    [PaymentStatus.MAIN.PENDING_REVIEW]: [
      PaymentStatus.MAIN.CONFIRMED, 
      PaymentStatus.MAIN.REJECTED
    ]
  },
  
  // 托管状态转换规则
  ESCROW: {
    [PaymentStatus.ESCROW.NONE]: [
      PaymentStatus.ESCROW.LOCKED,
      PaymentStatus.ESCROW.REFUNDED
    ],
    [PaymentStatus.ESCROW.LOCKED]: [
      PaymentStatus.ESCROW.CONFIRMED,
      PaymentStatus.ESCROW.REFUNDED
    ],
    [PaymentStatus.ESCROW.CONFIRMED]: [
      PaymentStatus.ESCROW.RELEASED,
      PaymentStatus.ESCROW.REFUNDED
    ],
    [PaymentStatus.ESCROW.RELEASED]: [], // 终态
    [PaymentStatus.ESCROW.REFUNDED]: []  // 终态
  }
};

/**
 * 区块链状态到系统状态的映射
 */
PaymentStatus.BLOCKCHAIN_STATUS_MAP = {
  // 数字状态映射
  0: PaymentStatus.BLOCKCHAIN.PENDING,     // 待处理
  1: PaymentStatus.BLOCKCHAIN.PROCESSING,  // 处理中
  2: PaymentStatus.BLOCKCHAIN.COMPLETED,   // 已完成
  3: PaymentStatus.MAIN.FAILED,           // 失败
  4: PaymentStatus.MAIN.REJECTED,         // 拒绝
  
  // 字符串状态映射
  'PENDING': PaymentStatus.BLOCKCHAIN.PENDING,
  'PROCESSING': PaymentStatus.BLOCKCHAIN.PROCESSING,
  'CONFIRMED': PaymentStatus.BLOCKCHAIN.COMPLETED,
  'COMPLETED': PaymentStatus.BLOCKCHAIN.COMPLETED,
  'FAILED': PaymentStatus.MAIN.FAILED,
  'REJECTED': PaymentStatus.MAIN.REJECTED
};

/**
 * 区块链状态到最终订单状态的映射
 */
PaymentStatus.BLOCKCHAIN_TO_ORDER_STATUS = {
  [PaymentStatus.BLOCKCHAIN.COMPLETED]: PaymentStatus.MAIN.SETTLED,  // 区块链完成时，订单变为已结算
  [PaymentStatus.MAIN.FAILED]: PaymentStatus.MAIN.FAILED,      // 区块链失败时，订单状态为失败
  [PaymentStatus.MAIN.REJECTED]: PaymentStatus.MAIN.REJECTED   // 区块链拒绝时，订单状态为已拒绝
};

/**
 * 检查主状态转换是否有效
 * @param {string} currentStatus - 当前状态
 * @param {string} newStatus - 新状态
 * @returns {boolean} - 转换是否有效
 */
PaymentStatus.isValidMainTransition = (currentStatus, newStatus) => {
  if (currentStatus === newStatus) return true; // 相同状态视为有效
  
  const validNextStates = PaymentStatus.VALID_TRANSITIONS.MAIN[currentStatus] || [];
  return validNextStates.includes(newStatus);
};

/**
 * 检查托管状态转换是否有效
 * @param {string} currentStatus - 当前托管状态
 * @param {string} newStatus - 新托管状态
 * @returns {boolean} - 转换是否有效
 */
PaymentStatus.isValidEscrowTransition = (currentStatus, newStatus) => {
  if (currentStatus === newStatus) return true; // 相同状态视为有效
  
  const validNextStates = PaymentStatus.VALID_TRANSITIONS.ESCROW[currentStatus] || [];
  return validNextStates.includes(newStatus);
};

/**
 * 检查状态组合是否有效
 * @param {string} mainStatus - 主状态
 * @param {string} escrowStatus - 托管状态
 * @returns {boolean} - 组合是否有效
 */
PaymentStatus.isValidStatusCombination = (mainStatus, escrowStatus) => {
  const expectedEscrowStatus = PaymentStatus.MAPPINGS.MAIN_TO_ESCROW[mainStatus];
  if (!expectedEscrowStatus) return false;
  
  return expectedEscrowStatus === escrowStatus;
};

/**
 * 检查完整的状态转换是否有效
 * @param {string} currentMainStatus - 当前主状态
 * @param {string} newMainStatus - 新主状态
 * @param {string} currentEscrowStatus - 当前托管状态
 * @param {string} newEscrowStatus - 新托管状态
 * @returns {boolean} - 转换是否有效
 */
PaymentStatus.isValidTransition = (currentMainStatus, newMainStatus, currentEscrowStatus, newEscrowStatus) => {
  // 如果没有提供托管状态，则检查主状态转换
  if (arguments.length === 2) {
    return PaymentStatus.isValidMainTransition(currentMainStatus, newMainStatus);
  }
  
  // 检查主状态转换
  const isMainValid = PaymentStatus.isValidMainTransition(currentMainStatus, newMainStatus);
  if (!isMainValid) return false;
  
  // 检查托管状态转换
  const isEscrowValid = PaymentStatus.isValidEscrowTransition(currentEscrowStatus, newEscrowStatus);
  if (!isEscrowValid) return false;
  
  // 检查状态组合
  return PaymentStatus.isValidStatusCombination(newMainStatus, newEscrowStatus);
};

/**
 * 根据主状态获取对应的托管状态
 * @param {string} mainStatus - 主状态
 * @returns {string} - 对应的托管状态
 */
PaymentStatus.getEscrowStatusForMainStatus = (mainStatus) => {
  return PaymentStatus.MAPPINGS.MAIN_TO_ESCROW[mainStatus] || PaymentStatus.ESCROW.NONE;
};

/**
 * 根据区块链状态数字获取托管状态
 * @param {number} blockchainStatusNumber - 区块链状态数字
 * @returns {string} - 对应的托管状态
 */
PaymentStatus.getEscrowStatusFromBlockchainNumber = (blockchainStatusNumber) => {
  return PaymentStatus.MAPPINGS.BLOCKCHAIN_NUMBER[blockchainStatusNumber] || PaymentStatus.ESCROW.NONE;
};

// 为了兼容旧代码，将主状态常量赋值给PaymentStatus本身
Object.keys(PaymentStatus.MAIN).forEach(key => {
  PaymentStatus[key] = PaymentStatus.MAIN[key];
});

module.exports = PaymentStatus; 