const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const User = require('./User');
const LP = require('./LP');

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
    type: DataTypes.ENUM(
      'created', 
      'claimed', 
      'paid', 
      'confirmed', 
      'settled', 
      'cancelled', 
      'expired', 
      'failed',
      'refunded',
      'reversed',
      'processing',
      'pending_review'
    ),
    defaultValue: 'created'
  },
  statusHistory: {
    type: DataTypes.JSON
  },
  paymentProof: {
    type: DataTypes.JSON
  },
  settlementTxHash: {
    type: DataTypes.STRING(255)
  },
  errorDetails: {
    type: DataTypes.JSON,
    defaultValue: null,
    comment: '存储详细的错误信息，例如错误代码、消息和时间戳'
  },
  processingDetails: {
    type: DataTypes.JSON,
    defaultValue: null,
    comment: '存储处理过程中的详细信息，例如处理步骤和时间戳'
  },
  expiresAt: {
    type: DataTypes.DATE
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
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
 * 匹配LP
 * @param {Object} lp - LP对象
 * @returns {Promise<boolean>} - 是否匹配成功
 */
PaymentIntent.prototype.matchLP = async function(lp) {
  try {
    // 检查状态是否为created
    if (this.status !== 'created') {
      return false;
    }
    
    // 锁定LP额度
    const locked = await lp.lockQuota(this.amount);
    if (!locked) {
      return false;
    }
    
    // 更新支付意图状态
    this.status = 'claimed';
    this.lpWalletAddress = lp.walletAddress;
    this.lpId = lp.id;
    
    // 添加状态历史记录
    const statusHistoryEntry = {
      status: 'claimed',
      timestamp: new Date(),
      note: `匹配LP: ${lp.walletAddress}`
    };
    
    if (!Array.isArray(this.statusHistory)) {
      this.statusHistory = [];
    }
    
    this.statusHistory.push(statusHistoryEntry);
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('匹配LP失败:', error);
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
    if (this.status !== 'claimed') {
      return false;
    }
    
    // 更新支付意图状态
    this.status = 'paid';
    
    // 添加状态历史记录
    const statusHistoryEntry = {
      status: 'paid',
      timestamp: new Date(),
      note: note || 'LP已完成支付'
    };
    
    if (!Array.isArray(this.statusHistory)) {
      this.statusHistory = [];
    }
    
    this.statusHistory.push(statusHistoryEntry);
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('标记LP已支付失败:', error);
    return false;
  }
};

/**
 * 用户确认收款
 * @param {string} note - 备注
 * @returns {Promise<boolean>} - 是否确认成功
 */
PaymentIntent.prototype.confirmPayment = async function(note) {
  try {
    // 检查状态是否为paid
    if (this.status !== 'paid') {
      return false;
    }
    
    // 更新支付意图状态
    this.status = 'confirmed';
    
    // 添加状态历史记录
    const statusHistoryEntry = {
      status: 'confirmed',
      timestamp: new Date(),
      note: note || '用户确认收款'
    };
    
    if (!Array.isArray(this.statusHistory)) {
      this.statusHistory = [];
    }
    
    this.statusHistory.push(statusHistoryEntry);
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('用户确认收款失败:', error);
    return false;
  }
};

module.exports = PaymentIntent;