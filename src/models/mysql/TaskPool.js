const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const TaskPool = sequelize.define('TaskPool', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  paymentIntentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'payment_intents',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'USD'
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  userWalletAddress: {
    type: DataTypes.STRING(42),
    allowNull: false
  },
  lpWalletAddress: {
    type: DataTypes.STRING(42),
    allowNull: true
  },
  platform: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'task_pools',
  timestamps: true,
  underscored: false
});

module.exports = TaskPool; 