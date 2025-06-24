const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Task = sequelize.define('Task', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  data: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  result: {
    type: DataTypes.JSON,
    defaultValue: null
  },
  error: {
    type: DataTypes.TEXT,
    defaultValue: null
  },
  startTime: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  endTime: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  processingTimeout: {
    type: DataTypes.INTEGER,
    defaultValue: 300000 // 默认5分钟超时
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  maxRetries: {
    type: DataTypes.INTEGER,
    defaultValue: 3
  }
}, {
  tableName: 'tasks',
  timestamps: true,
  underscored: false
});

module.exports = Task; 