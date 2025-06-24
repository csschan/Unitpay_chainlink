const { PaymentIntent } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const PaymentStatus = require('../constants/payment-status');

/**
 * 支付意图服务，提供支付意图相关的服务方法
 */
class PaymentIntentService {
  /**
   * 查找所有待处理的支付（状态为pending和processing）
   * @returns {Promise<Array>} 待处理的支付意图列表
   */
  async findPendingPayments() {
    try {
      const pendingPayments = await PaymentIntent.findAll({
        where: {
          status: {
            [Op.in]: [PaymentStatus.PENDING, PaymentStatus.PROCESSING]
          },
          transactionHash: {
            [Op.not]: null  // 确保有交易哈希
          }
        }
      });
      
      return pendingPayments;
    } catch (error) {
      logger.error(`查找待处理支付失败: ${error.message}`);
      return [];
    }
  }
  
  /**
   * 查找所有需要区块链处理的支付（状态为confirmed且没有transactionHash）
   * @returns {Promise<Array>} 待处理的支付意图列表
   */
  async findPaymentsNeedingBlockchain() {
    try {
      const payments = await PaymentIntent.findAll({
        where: {
          status: PaymentStatus.CONFIRMED,
          [Op.or]: [
            { transactionHash: null },
            { transactionHash: '' }
          ]
        }
      });
      
      return payments;
    } catch (error) {
      logger.error(`查找需要区块链处理的支付失败: ${error.message}`);
      return [];
    }
  }
  
  /**
   * 根据状态查找支付意图列表
   * @param {string|Array<string>} statuses - 状态或状态数组
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 支付意图列表
   */
  async findPaymentsByStatuses(statuses, options = {}) {
    try {
      const statusArray = Array.isArray(statuses) ? statuses : [statuses];
      
      const queryOptions = {
        where: {
          status: {
            [Op.in]: statusArray
          }
        },
        ...options
      };
      
      const payments = await PaymentIntent.findAll(queryOptions);
      return payments;
    } catch (error) {
      logger.error(`查找状态为 ${JSON.stringify(statuses)} 的支付失败: ${error.message}`);
      return [];
    }
  }
  
  /**
   * 根据外部ID（区块链ID）查找支付意图
   * @param {string} externalId - 区块链支付ID
   * @returns {Promise<Object|null>} 支付意图对象
   */
  async findPaymentIntentByExternalId(externalId) {
    try {
      const paymentIntent = await PaymentIntent.findOne({
        where: { blockchainPaymentId: externalId }
      });
      
      return paymentIntent;
    } catch (error) {
      logger.error(`查找支付意图失败，区块链ID: ${externalId}: ${error.message}`);
      return null;
    }
  }
  
  /**
   * 根据用户钱包地址和LP钱包地址查找支付意图
   * @param {string} userWalletAddress - 用户钱包地址
   * @param {string} lpWalletAddress - LP钱包地址
   * @param {string|Array<string>} statuses - 状态或状态数组，默认为已确认
   * @returns {Promise<Object|null>} 支付意图对象
   */
  async findPaymentByWalletAddresses(userWalletAddress, lpWalletAddress, statuses = PaymentStatus.CONFIRMED) {
    try {
      const statusArray = Array.isArray(statuses) ? statuses : [statuses];
      
      const payment = await PaymentIntent.findOne({
        where: {
          userWalletAddress,
          lpWalletAddress,
          status: {
            [Op.in]: statusArray
          }
        },
        order: [['createdAt', 'DESC']] // 获取最新的匹配记录
      });
      
      return payment;
    } catch (error) {
      logger.error(`查找支付意图失败，用户钱包: ${userWalletAddress}, LP钱包: ${lpWalletAddress}: ${error.message}`);
      return null;
    }
  }
  
  /**
   * 更新支付意图状态
   * @param {number} id - 支付意图ID
   * @param {string} status - 新状态
   * @param {Object} metadata - 元数据，如区块链状态、同步时间等
   * @returns {Promise<Object|null>} 更新后的支付意图对象
   */
  async updatePaymentIntentStatus(id, status, metadata = {}) {
    try {
      const paymentIntent = await PaymentIntent.findByPk(id);
      
      if (!paymentIntent) {
        logger.error(`更新失败: 未找到ID为 ${id} 的支付意图`);
        return null;
      }
      
      const currentStatus = paymentIntent.status;
      
      // 检查状态转换是否有效
      if (!PaymentStatus.isValidTransition(currentStatus, status)) {
        logger.warn(`无效的状态转换: ${currentStatus} -> ${status}`);
        return null;
      }
      
      // 准备状态历史记录
      const statusHistoryEntry = {
        status,
        timestamp: new Date(),
        note: metadata.note || `通过API更新：状态从 ${currentStatus} 变更为 ${status}`
      };
      
      // 处理状态历史
      const statusHistory = Array.isArray(paymentIntent.statusHistory) 
        ? [...paymentIntent.statusHistory, statusHistoryEntry]
        : [statusHistoryEntry];
      
      // 更新支付意图
      const updated = await paymentIntent.update({
        status,
        statusHistory,
        ...metadata
      });
      
      logger.info(`已将支付意图 ${id} 的状态从 ${currentStatus} 更新为 ${status}`);
      return updated;
    } catch (error) {
      logger.error(`更新支付意图状态失败，ID: ${id}: ${error.message}`);
      return null;
    }
  }
  
  /**
   * 更新支付意图
   * @param {number} id - 支付意图ID
   * @param {Object} data - 要更新的数据
   * @returns {Promise<Object|null>} 更新后的支付意图对象
   */
  async updatePaymentIntent(id, data) {
    try {
      const paymentIntent = await PaymentIntent.findByPk(id);
      
      if (!paymentIntent) {
        logger.error(`更新失败: 未找到ID为 ${id} 的支付意图`);
        return null;
      }
      
      // 如果包含状态更新，验证状态转换
      if (data.status && data.status !== paymentIntent.status) {
        if (!PaymentStatus.isValidTransition(paymentIntent.status, data.status)) {
          logger.warn(`无效的状态转换: ${paymentIntent.status} -> ${data.status}`);
          return null;
        }
        
        // 如果是有效的状态转换，添加状态历史
        const statusHistoryEntry = {
          status: data.status,
          timestamp: new Date(),
          note: data.statusNote || `状态从 ${paymentIntent.status} 更新为 ${data.status}`
        };
        
        // 处理状态历史
        data.statusHistory = Array.isArray(paymentIntent.statusHistory) 
          ? [...paymentIntent.statusHistory, statusHistoryEntry]
          : [statusHistoryEntry];
      }
      
      // 更新支付意图
      const updated = await paymentIntent.update(data);
      
      return updated;
    } catch (error) {
      logger.error(`更新支付意图失败，ID: ${id}: ${error.message}`);
      return null;
    }
  }
  
  /**
   * 创建支付意图
   * @param {Object} data - 支付意图数据
   * @returns {Promise<Object|null>} 创建的支付意图对象
   */
  async createPaymentIntent(data) {
    try {
      // 设置初始状态
      const initialData = {
        ...data,
        status: data.status || PaymentStatus.CREATED,
        statusHistory: [{
          status: data.status || PaymentStatus.CREATED,
          timestamp: new Date(),
          note: '支付意图创建'
        }]
      };
      
      const paymentIntent = await PaymentIntent.create(initialData);
      logger.info(`创建支付意图成功，ID: ${paymentIntent.id}`);
      
      return paymentIntent;
    } catch (error) {
      logger.error(`创建支付意图失败: ${error.message}`);
      return null;
    }
  }
}

// 创建单例
const paymentIntentService = new PaymentIntentService();
module.exports = paymentIntentService; 