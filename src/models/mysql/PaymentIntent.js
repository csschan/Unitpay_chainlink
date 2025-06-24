const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const User = require('./User');
const LP = require('./LP');
const PaymentStatus = require('../../constants/payment-status');
const logger = require('../../utils/logger');
const crypto = require('crypto');

const PaymentIntent = sequelize.define('PaymentIntent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'CNY'
  },
  description: {
    type: DataTypes.TEXT
  },
  platform: {
    type: DataTypes.ENUM('PayPal', 'GCash', 'Alipay', 'WeChat', 'Other'),
    allowNull: false,
    defaultValue: 'Other'
  },
  merchantInfo: {
    type: DataTypes.JSON
  },
  userWalletAddress: {
    type: DataTypes.STRING(42),
    allowNull: false
  },
  merchantPaypalEmail: {
    type: DataTypes.STRING(255),
    comment: '商家PayPal邮箱，用于PayPal支付',
    field: 'merchant_paypal_email'
  },
  userId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  lpWalletAddress: {
    type: DataTypes.STRING(42)
  },
  lpId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'lps',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'created'
  },
  statusHistory: {
    type: DataTypes.JSON
  },
  paymentProof: {
    type: DataTypes.JSON
  },
  settlementTxHash: {
    type: DataTypes.STRING(255),
    comment: '结算交易哈希（兼容性字段）'
  },
  transactionHash: {
    type: DataTypes.STRING(255),
    comment: '区块链交易哈希',
    field: 'transaction_hash'
  },
  blockchainPaymentId: {
    type: DataTypes.STRING(64),
    comment: '区块链上使用的支付ID，与数据库ID可能不同',
    field: 'blockchain_payment_id'
  },
  errorDetails: {
    type: DataTypes.JSON,
    defaultValue: null,
    comment: '存储详细的错误信息，例如错误代码、消息和时间戳',
    field: 'error_details'
  },
  processingDetails: {
    type: DataTypes.JSON,
    defaultValue: null,
    comment: '存储处理过程中的详细信息，例如处理步骤和时间戳',
    field: 'processing_details'
  },
  lastSyncedAt: {
    type: DataTypes.DATE,
    comment: '最后同步区块链状态的时间',
    field: 'last_synced_at'
  },
  syncErrors: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '同步错误计数',
    field: 'sync_errors'
  },
  lastSyncError: {
    type: DataTypes.TEXT,
    comment: '最后一次同步错误信息',
    field: 'last_sync_error'
  },
  blockConfirmations: {
    type: DataTypes.INTEGER,
    comment: '区块确认数',
    field: 'block_confirmations'
  },
  expiresAt: {
    type: DataTypes.DATE
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  tableName: 'payment_intents',
  timestamps: true,
  underscored: false
});

// 添加关联
PaymentIntent.belongsTo(User, { foreignKey: 'userId' });
PaymentIntent.belongsTo(LP, { foreignKey: 'lpId' });

/**
 * 添加状态历史记录
 * @param {string} status - 新状态
 * @param {string} note - 备注信息
 * @param {Object} metadata - 附加元数据
 * @returns {Object} - 更新后的状态历史记录
 */
PaymentIntent.prototype.addStatusHistory = function(status, note, metadata = {}) {
  // 创建状态历史记录
  const statusHistoryEntry = {
    status,
    timestamp: new Date(),
    note: note || `状态更新为 ${status}`,
    ...metadata
  };
  
  // 获取当前状态历史
  let statusHistory = Array.isArray(this.statusHistory) 
    ? [...this.statusHistory] 
    : [];
  
  // 计算上一个记录的哈希，用于链式校验
  const previousEntry = statusHistory.length > 0 ? statusHistory[statusHistory.length - 1] : null;
  statusHistoryEntry.previousHash = previousEntry ? previousEntry.hash : null;

  // 计算当前记录的哈希
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify(statusHistoryEntry))
    .digest('hex');
  statusHistoryEntry.hash = hash;

  // 添加新状态记录
  statusHistory.push(statusHistoryEntry);
  
  return statusHistory;
};

/**
 * 匹配LP
 * @param {Object} lp - LP对象
 * @returns {Promise<boolean>} - 是否匹配成功
 */
PaymentIntent.prototype.matchLP = async function(lp) {
  try {
    // 检查状态是否为created
    if (this.status !== PaymentStatus.CREATED) {
      logger.warn(`匹配LP失败: 支付状态 ${this.status} 不是 ${PaymentStatus.CREATED}`);
      return false;
    }
    
    // 检查是否有效的状态转换
    if (!PaymentStatus.isValidTransition(this.status, PaymentStatus.CLAIMED)) {
      logger.warn(`匹配LP失败: 无效的状态转换 ${this.status} -> ${PaymentStatus.CLAIMED}`);
      return false;
    }
    
    // 锁定LP额度
    const locked = await lp.lockQuota(this.amount);
    if (!locked) {
      logger.warn(`匹配LP失败: 无法锁定LP ${lp.id} 的额度`);
      return false;
    }
    
    // 更新支付意图状态
    this.status = PaymentStatus.CLAIMED;
    this.lpWalletAddress = lp.walletAddress;
    this.lpId = lp.id;
    
    // 添加状态历史记录
    this.statusHistory = this.addStatusHistory(
      PaymentStatus.CLAIMED,
      `匹配LP: ${lp.walletAddress}`
    );
    
    await this.save();
    logger.info(`支付意图 ${this.id} 成功匹配LP ${lp.id}, 钱包地址: ${lp.walletAddress}`);
    return true;
    
  } catch (error) {
    logger.error(`匹配LP失败: ${error.message}`);
    return false;
  }
};

/**
 * 标记LP已支付
 * @param {string} note - 备注
 * @returns {Promise<boolean>} - 是否标记成功
 */
PaymentIntent.prototype.markLPPaid = async function(note) {
  try {
    // 检查状态是否为claimed
    if (this.status !== PaymentStatus.CLAIMED) {
      logger.warn(`标记LP已支付失败: 支付状态 ${this.status} 不是 ${PaymentStatus.CLAIMED}`);
      return false;
    }
    
    // 检查是否有效的状态转换
    if (!PaymentStatus.isValidTransition(this.status, PaymentStatus.PAID)) {
      logger.warn(`标记LP已支付失败: 无效的状态转换 ${this.status} -> ${PaymentStatus.PAID}`);
      return false;
    }
    
    // 更新支付意图状态
    this.status = PaymentStatus.PAID;
    
    // 添加状态历史记录
    this.statusHistory = this.addStatusHistory(
      PaymentStatus.PAID,
      note || 'LP已完成支付'
    );
    
    await this.save();
    logger.info(`支付意图 ${this.id} 已更新为LP已支付状态`);
    return true;
    
  } catch (error) {
    logger.error(`标记LP已支付失败: ${error.message}`);
    return false;
  }
};

/**
 * 用户确认收款
 * @param {string} note - 备注
 * @param {Object} proofData - 支付证明数据
 * @returns {Promise<boolean>} - 是否确认成功
 */
PaymentIntent.prototype.confirmPayment = async function(note, proofData = null) {
  try {
    // 检查状态是否为paid
    if (this.status !== PaymentStatus.PAID) {
      logger.warn(`用户确认收款失败: 支付状态 ${this.status} 不是 ${PaymentStatus.PAID}`);
      return false;
    }
    
    // 检查是否有效的状态转换
    if (!PaymentStatus.isValidTransition(this.status, PaymentStatus.CONFIRMED)) {
      logger.warn(`用户确认收款失败: 无效的状态转换 ${this.status} -> ${PaymentStatus.CONFIRMED}`);
      return false;
    }
    
    // 更新支付意图状态
    this.status = PaymentStatus.CONFIRMED;
    
    // 添加状态历史记录
    this.statusHistory = this.addStatusHistory(
      PaymentStatus.CONFIRMED,
      note || '用户确认收款'
    );
    
    // 添加支付证明
    if (proofData) {
      this.paymentProof = {
        ...this.paymentProof || {},
        ...proofData,
        confirmedAt: new Date()
      };
    }
    
    await this.save();
    logger.info(`支付意图 ${this.id} 已更新为用户已确认状态`);
    return true;
    
  } catch (error) {
    logger.error(`用户确认收款失败: ${error.message}`);
    return false;
  }
};

module.exports = PaymentIntent;