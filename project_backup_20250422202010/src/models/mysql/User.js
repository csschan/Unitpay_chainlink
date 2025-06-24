const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const User = sequelize.define('User', {
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
  username: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  email: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  isWalletVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
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
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'users',
  timestamps: true,
  underscored: false
});

// 添加实例方法
User.prototype.updateTransactionStats = async function(amount, isSuccess = true) {
  this.totalTransactions += 1;
  this.totalAmount += parseFloat(amount) || 0;
  
  if (isSuccess) {
    this.successfulTransactions += 1;
  } else {
    this.failedTransactions += 1;
  }
  
  return this.save();
};

module.exports = User;