const winston = require('winston');
const fs = require('fs');
const path = require('path');

// 确保日志目录存在
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 创建Winston日志记录器
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'unitpay' },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          info => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
        )
      )
    }),
    // 错误日志文件
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error' 
    }),
    // 所有日志文件
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log')
    }),
    // PayPal专用日志
    new winston.transports.File({
      filename: path.join(logDir, 'paypal.log'),
      level: 'info'
    })
  ]
});

// PayPal日志助手函数
logger.paypal = {
  // 记录PayPal事件
  logEvent: (subType, details = {}, options = {}) => {
    logger.info(`PayPal Event [${subType}]`, {
      type: 'event',
      subType,
      details,
      ...options
    });
  },

  // 记录PayPal错误
  logError: (subType, error, details = {}, options = {}) => {
    logger.error(`PayPal Error [${subType}]: ${error.message}`, {
      type: 'error',
      subType,
      details,
      errorStack: error.stack,
      ...options
    });
  },

  // 记录PayPal交易
  logTransaction: (subType, details = {}, options = {}) => {
    logger.info(`PayPal Transaction [${subType}]`, {
      type: 'transaction',
      subType,
      details,
      ...options
    });
  }
};

module.exports = logger;