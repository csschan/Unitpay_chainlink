const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * 重试队列模型
 * 用于存储需要重试的事件
 */
const RetryQueue = sequelize.define('RetryQueue', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // 事件类型
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '事件类型'
  },
  
  // 事件数据
  data: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
    comment: '事件数据，JSON格式'
  },
  
  // 重试次数
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '已重试次数'
  },
  
  // 状态
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'processed', 'failed'),
    defaultValue: 'pending',
    comment: '事件状态'
  },
  
  // 最后错误信息
  lastError: {
    type: DataTypes.TEXT,
    comment: '最后一次错误信息'
  },
  
  // 下次重试时间
  nextRetryAt: {
    type: DataTypes.DATE,
    comment: '下次重试时间'
  },
  
  // 处理时间
  processedAt: {
    type: DataTypes.DATE,
    comment: '处理完成时间'
  },
  
  // 创建时间
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  // 更新时间
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'retry_queue',
  timestamps: true,
  indexes: [
    {
      name: 'idx_retry_queue_status_next_retry',
      fields: ['status', 'nextRetryAt']
    },
    {
      name: 'idx_retry_queue_type',
      fields: ['type']
    }
  ]
});

/**
 * 启动时自动创建表
 */
RetryQueue.sync().then(() => {
  logger.info('重试队列表已同步');
}).catch(error => {
  logger.error(`重试队列表同步失败: ${error.message}`);
});

module.exports = RetryQueue; 