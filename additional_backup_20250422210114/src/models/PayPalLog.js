const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * PayPal日志模型
 * 记录PayPal交易、事件和错误日志
 */
const PayPalLogSchema = new Schema({
  // 日志类型: event, error, transaction
  type: {
    type: String,
    required: true,
    enum: ['event', 'error', 'transaction'],
    index: true
  },
  
  // 日志子类型: 具体事件类型或错误类型
  subType: {
    type: String,
    required: true,
    index: true
  },
  
  // 相关ID: 订单ID、支付ID、退款ID等
  relatedId: {
    type: String,
    index: true
  },
  
  // 关联支付意图
  paymentIntent: {
    type: Schema.Types.ObjectId,
    ref: 'PaymentIntent',
    index: true
  },
  
  // 关联LP
  lp: {
    type: Schema.Types.ObjectId,
    ref: 'LP',
    index: true
  },
  
  // 详细信息
  details: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  // 错误堆栈(仅对错误类型)
  errorStack: String,
  
  // 错误消息(仅对错误类型)
  errorMessage: String,
  
  // 是否已解决(仅对错误类型)
  resolved: {
    type: Boolean,
    default: false
  },
  
  // IP地址(对webhook)
  ipAddress: String,
  
  // 请求头(对webhook)
  headers: Schema.Types.Mixed,
  
  // 日志级别: info, warning, error, critical
  level: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info'
  }
}, {
  timestamps: true
});

/**
 * 添加PayPal事件日志
 * @param {string} subType - 事件子类型
 * @param {Object} details - 事件详情
 * @param {Object} options - 其他选项
 * @returns {Promise<Object>} - 创建的日志对象
 */
PayPalLogSchema.statics.logEvent = async function(subType, details = {}, options = {}) {
  try {
    return await this.create({
      type: 'event',
      subType,
      relatedId: options.relatedId,
      paymentIntent: options.paymentIntentId,
      lp: options.lpId,
      details,
      ipAddress: options.ipAddress,
      headers: options.headers,
      level: options.level || 'info'
    });
  } catch (error) {
    console.error(`Failed to log PayPal event: ${subType}`, error);
    // 失败时返回null,但不抛出异常以避免中断主流程
    return null;
  }
};

/**
 * 添加PayPal错误日志
 * @param {string} subType - 错误子类型
 * @param {Error} error - 错误对象
 * @param {Object} details - 错误详情
 * @param {Object} options - 其他选项
 * @returns {Promise<Object>} - 创建的日志对象
 */
PayPalLogSchema.statics.logError = async function(subType, error, details = {}, options = {}) {
  try {
    return await this.create({
      type: 'error',
      subType,
      relatedId: options.relatedId,
      paymentIntent: options.paymentIntentId,
      lp: options.lpId,
      details,
      errorStack: error.stack,
      errorMessage: error.message,
      ipAddress: options.ipAddress,
      headers: options.headers,
      level: options.level || 'error'
    });
  } catch (logError) {
    console.error(`Failed to log PayPal error: ${subType}`, logError);
    // 失败时返回null,但不抛出异常以避免中断主流程
    return null;
  }
};

/**
 * 添加PayPal交易日志
 * @param {string} subType - 交易子类型
 * @param {Object} details - 交易详情
 * @param {Object} options - 其他选项
 * @returns {Promise<Object>} - 创建的日志对象
 */
PayPalLogSchema.statics.logTransaction = async function(subType, details = {}, options = {}) {
  try {
    return await this.create({
      type: 'transaction',
      subType,
      relatedId: options.relatedId,
      paymentIntent: options.paymentIntentId,
      lp: options.lpId,
      details,
      ipAddress: options.ipAddress,
      headers: options.headers,
      level: options.level || 'info'
    });
  } catch (error) {
    console.error(`Failed to log PayPal transaction: ${subType}`, error);
    // 失败时返回null,但不抛出异常以避免中断主流程
    return null;
  }
};

/**
 * 获取未解决的错误日志
 * @returns {Promise<Array>} - 未解决的错误日志列表
 */
PayPalLogSchema.statics.getUnresolvedErrors = async function() {
  return this.find({
    type: 'error',
    resolved: false
  }).sort({ createdAt: -1 });
};

/**
 * 标记错误为已解决
 * @param {string} logId - 日志ID
 * @param {string} note - 解决备注
 * @returns {Promise<Object>} - 更新后的日志对象
 */
PayPalLogSchema.statics.resolveError = async function(logId, note) {
  return this.findByIdAndUpdate(
    logId,
    {
      resolved: true,
      'details.resolution': {
        note,
        resolvedAt: new Date()
      }
    },
    { new: true }
  );
};

module.exports = mongoose.model('PayPalLog', PayPalLogSchema); 