CREATE TABLE IF NOT EXISTS lps (
  id INT PRIMARY KEY AUTO_INCREMENT,
  walletAddress VARCHAR(255) NOT NULL UNIQUE,
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
  isVerified BOOLEAN DEFAULT false,
  isActive BOOLEAN DEFAULT true,
  rating FLOAT DEFAULT 5,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  walletAddress VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(255) DEFAULT '',
  email VARCHAR(255) DEFAULT '',
  isWalletVerified BOOLEAN DEFAULT false,
  totalTransactions INT DEFAULT 0,
  totalAmount FLOAT DEFAULT 0,
  successfulTransactions INT DEFAULT 0,
  failedTransactions INT DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_intents (
  id INT PRIMARY KEY AUTO_INCREMENT,
  amount FLOAT NOT NULL,
  currency VARCHAR(10) DEFAULT 'CNY',
  description TEXT,
  platform ENUM('PayPal', 'GCash', 'Alipay', 'WeChat', 'Other') NOT NULL,
  merchantInfo JSON,
  userWalletAddress VARCHAR(255) NOT NULL,
  userId INT,
  lpWalletAddress VARCHAR(255),
  lpId INT,
  status ENUM('created', 'claimed', 'paid', 'confirmed', 'settled', 'cancelled', 'expired', 'failed') DEFAULT 'created',
  statusHistory JSON,
  paymentProof JSON,
  settlementTxHash VARCHAR(255),
  expiresAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (lpId) REFERENCES lps(id)
);