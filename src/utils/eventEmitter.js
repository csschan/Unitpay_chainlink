const EventEmitter = require('events');

/**
 * 系统级事件发射器，用于在系统不同模块之间传递事件
 * 支持的事件：
 * - payment.status_changed: 支付状态变更
 * - payment.failed: 支付失败
 * - payment.completed: 支付完成
 * - blockchain.connected: 区块链连接成功
 * - blockchain.disconnected: 区块链连接断开
 */
const eventEmitter = new EventEmitter();

// 设置最大监听器数量，避免内存泄漏警告
eventEmitter.setMaxListeners(20);

module.exports = eventEmitter; 