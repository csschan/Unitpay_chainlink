-- 创建数据库
CREATE DATABASE IF NOT EXISTS unitpay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用数据库
USE unitpay;

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  walletAddress VARCHAR(42) NOT NULL UNIQUE,
  username VARCHAR(255) DEFAULT '',
  email VARCHAR(255) DEFAULT '',
  isWalletVerified BOOLEAN DEFAULT FALSE,
  totalTransactions INT DEFAULT 0,
  totalAmount FLOAT DEFAULT 0,
  successfulTransactions INT DEFAULT 0,
  failedTransactions INT DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 创建LP表
CREATE TABLE IF NOT EXISTS lps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  walletAddress VARCHAR(42) NOT NULL UNIQUE,
  name VARCHAR(255) DEFAULT '',
  email VARCHAR(255) DEFAULT '',
  supportedPlatforms JSON,
  totalQuota FLOAT NOT NULL,
  availableQuota FLOAT NOT NULL,
  lockedQuota FLOAT DEFAULT 0,
  perTransactionQuota FLOAT NOT NULL,
  totalTransactions INT DEFAULT 0,
  totalAmount FLOAT DEFAULT 0,
  successfulTransactions INT DEFAULT 0,
  failedTransactions INT DEFAULT 0,
  averageResponseTime FLOAT DEFAULT 0,
  isVerified BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  rating FLOAT DEFAULT 5,
  fee_rate FLOAT DEFAULT 0.5,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 创建支付意图表
CREATE TABLE IF NOT EXISTS payment_intents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  amount FLOAT NOT NULL,
  currency VARCHAR(10) DEFAULT 'CNY',
  description TEXT DEFAULT '',
  platform ENUM('PayPal', 'GCash', 'Alipay', 'WeChat', 'Other') NOT NULL,
  merchantInfo JSON,
  userWalletAddress VARCHAR(42) NOT NULL,
  userId INT,
  lpWalletAddress VARCHAR(42),
  lpId INT,
  status ENUM('created', 'claimed', 'paid', 'confirmed', 'settled', 'cancelled', 'expired', 'failed') DEFAULT 'created',
  statusHistory JSON,
  paymentProof JSON,
  settlementTxHash VARCHAR(255),
  expiresAt DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (lpId) REFERENCES lps(id)
);