const winston = require('winston');
const path = require('path');

// 定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${stack ? '\n' + stack : ''}`;
  })
);

// 创建Winston日志记录器
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // 文件输出 - 所有日志
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // 文件输出 - 错误日志
    new winston.transports.File({
      filename: path.join('logs', 'errors.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // 文件输出 - 区块链同步日志
    new winston.transports.File({
      filename: path.join('logs', 'blockchain-sync.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// 开发环境下额外配置
if (process.env.NODE_ENV !== 'production') {
  logger.level = 'debug';
}

module.exports = logger;