const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const LP = sequelize.define('LP', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  walletAddress: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  email: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  paypalEmail: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  supportedPlatforms: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  totalQuota: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  availableQuota: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  lockedQuota: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  perTransactionQuota: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  fee_rate: {
    type: DataTypes.FLOAT,
    defaultValue: 0.5
  },
  totalTransactions: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalAmount: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  successfulTransactions: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  failedTransactions: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  averageResponseTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  rating: {
    type: DataTypes.FLOAT,
    defaultValue: 5
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
  tableName: 'lps',
  timestamps: true,
  underscored: false // 使用驼峰命名法以匹配数据库表结构
});

/**
 * 锁定额度
 * @param {number} amount - 锁定金额
 * @returns {Promise<boolean>} - 是否锁定成功
 */
LP.prototype.lockQuota = async function(amount) {
  try {
    // 检查可用额度是否足够
    if (this.availableQuota < amount) {
      return false;
    }
    
    // 检查单笔额度是否足够
    if (this.perTransactionQuota < amount) {
      return false;
    }
    
    // 锁定额度
    this.availableQuota -= amount;
    this.lockedQuota += amount;
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('锁定额度失败:', error);
    return false;
  }
};

/**
 * 释放锁定额度
 * @param {number} amount - 释放金额
 * @returns {Promise<boolean>} - 是否释放成功
 */
LP.prototype.releaseLockedQuota = async function(amount) {
  try {
    // 检查锁定额度是否足够
    if (this.lockedQuota < amount) {
      // 如果锁定额度不足，释放所有锁定额度
      this.availableQuota += this.lockedQuota;
      this.lockedQuota = 0;
    } else {
      // 释放指定金额
      this.availableQuota += amount;
      this.lockedQuota -= amount;
    }
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('释放锁定额度失败:', error);
    return false;
  }
};

/**
 * 增加可用额度
 * @param {number} amount - 增加金额
 * @returns {Promise<boolean>} - 是否增加成功
 */
LP.prototype.increaseAvailableQuota = async function(amount) {
  try {
    // 增加可用额度和总额度
    this.availableQuota += amount;
    this.totalQuota += amount;
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('增加可用额度失败:', error);
    return false;
  }
};

/**
 * 更新交易统计
 * @param {number} amount - 交易金额
 * @param {boolean} isSuccess - 是否成功
 * @param {number} responseTime - 响应时间（分钟）
 * @returns {Promise<boolean>} - 是否更新成功
 */
LP.prototype.updateTransactionStats = async function(amount, isSuccess = true, responseTime = 0) {
  try {
    // 更新总交易次数和金额
    this.totalTransactions += 1;
    this.totalAmount += parseFloat(amount) || 0;
    
    // 更新成功/失败交易次数
    if (isSuccess) {
      this.successfulTransactions += 1;
    } else {
      this.failedTransactions += 1;
    }
    
    // 更新平均响应时间
    if (responseTime > 0) {
      const totalResponseTime = this.averageResponseTime * (this.totalTransactions - 1);
      this.averageResponseTime = (totalResponseTime + responseTime) / this.totalTransactions;
    }
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('更新交易统计失败:', error);
    return false;
  }
};

module.exports = LP;