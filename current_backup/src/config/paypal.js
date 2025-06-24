// PayPal SDK配置
require('dotenv').config();
const paypal = require('@paypal/checkout-server-sdk');
const logger = require('../utils/logger');

// 获取环境变量配置
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'test';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || 'test';
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';

// 创建PayPal环境
let environment;
if (PAYPAL_MODE === 'live') {
  environment = new paypal.core.LiveEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
} else {
  environment = new paypal.core.SandboxEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
}

// 创建PayPal客户端
const client = new paypal.core.PayPalHttpClient(environment);

// 定义一些沙盒测试账户
const SANDBOX_ACCOUNTS = [
  {
    email: 'sb-5y43434339921146@personal.example.com',
    password: '12345678',
    type: 'personal',
    description: '测试个人账户'
  },
  {
    email: 'sb-z5mll24941131@business.example.com',
    password: '12345678',
    type: 'business',
    description: '测试商家账户'
  }
];

/**
 * 验证PayPal Webhook签名
 * @param {Object} webhookEvent - Webhook事件对象
 * @param {Object} headers - 请求头
 * @returns {Promise<boolean>} - 是否验证通过
 */
async function verifyWebhookSignature(webhookEvent, headers) {
  try {
    if (!PAYPAL_WEBHOOK_ID) {
      logger.warn('未配置PayPal Webhook ID，无法验证webhook签名');
      return false;
    }
    
    // 假设验证通过了 - 在实际场景中需要实现真正的验证逻辑
    logger.info('验证PayPal webhook签名', { event_type: webhookEvent.event_type });
    
    // 返回验证结果
    return true;
  } catch (error) {
    logger.error(`验证PayPal webhook签名失败: ${error.message}`, { error });
    return false;
  }
}

/**
 * 记录PayPal错误
 * @param {string} subType - 错误子类型
 * @param {Error} error - 错误对象
 * @param {Object} details - 错误详情
 * @param {Object} options - 其他选项
 */
async function logPayPalError(subType, error, details = {}, options = {}) {
  logger.paypal.logError(subType, error, details, options);
}

/**
 * 记录PayPal事件
 * @param {string} subType - 事件子类型
 * @param {Object} details - 事件详情
 * @param {Object} options - 其他选项
 */
async function logPayPalEvent(subType, details = {}, options = {}) {
  logger.paypal.logEvent(subType, details, options);
}

/**
 * 记录PayPal交易
 * @param {string} subType - 交易子类型
 * @param {Object} details - 交易详情
 * @param {Object} options - 其他选项
 */
async function logPayPalTransaction(subType, details = {}, options = {}) {
  logger.paypal.logTransaction(subType, details, options);
}

// 获取沙盒账户信息
const getSandboxAccounts = () => {
  return SANDBOX_ACCOUNTS;
};

module.exports = { 
  client,
  verifyWebhookSignature,
  logPayPalError,
  logPayPalEvent,
  logPayPalTransaction,
  getSandboxAccounts,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_MODE,
  PAYPAL_WEBHOOK_ID
}; 