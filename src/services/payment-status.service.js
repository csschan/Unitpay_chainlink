const { PaymentIntent } = require('../models/mysql');
const { sequelize } = require('../config/database');
const PaymentStatus = require('../constants/payment-status');
const logger = require('../utils/logger');
const eventEmitter = require('../utils/eventEmitter');

/**
 * 支付状态管理服务
 * 负责处理所有支付状态的转换逻辑和验证
 */
class PaymentStatusService {
  /**
   * 更新支付状态
   * @param {number|string} paymentId - 支付ID
   * @param {string} newMainStatus - 新主状态
   * @param {string} newEscrowStatus - 新托管状态（可选）
   * @param {Object} metadata - 元数据信息
   * @returns {Promise<Object|null>} - 更新后的支付对象或null（如果失败）
   */
  async updatePaymentStatus(paymentId, newMainStatus, newEscrowStatus = null, metadata = {}) {
    // Debug log incoming parameters
    logger.info(`updatePaymentStatus args: paymentId=${paymentId}, newMainStatus=${newMainStatus}, newEscrowStatus=${JSON.stringify(newEscrowStatus)}, metadataKeys=${Object.keys(metadata).join(',')}`);
    // Support calling with metadata as third argument (old signature)
    if (newEscrowStatus && typeof newEscrowStatus === 'object' && Object.keys(metadata).length === 0) {
      metadata = newEscrowStatus;
      newEscrowStatus = null;
    }
    const transaction = await sequelize.transaction();
    
    try {
      logger.info(`尝试更新支付 ${paymentId} 状态为 ${newMainStatus}`);
      
      // 查找支付记录
      const payment = await PaymentIntent.findByPk(paymentId, { transaction });
      if (!payment) {
        logger.error(`找不到ID为 ${paymentId} 的支付记录`);
        await transaction.rollback();
        return null;
      }
      
      const currentMainStatus = payment.status;
      // 由主状态映射获取当前托管状态（模型未存储escrowStatus字段）
      const currentEscrowStatus = PaymentStatus.getEscrowStatusForMainStatus(currentMainStatus);
      
      // 如果没有提供托管状态，则根据主状态映射获取
      if (!newEscrowStatus) {
        newEscrowStatus = PaymentStatus.getEscrowStatusForMainStatus(newMainStatus);
        logger.info(`根据主状态 ${newMainStatus} 自动设置托管状态为 ${newEscrowStatus}`);
      }
      
      // 检查是否是有效的状态转换
      if (!PaymentStatus.isValidTransition(currentMainStatus, newMainStatus, currentEscrowStatus, newEscrowStatus)) {
        logger.warn(`无效的状态转换: ${currentMainStatus}/${currentEscrowStatus} -> ${newMainStatus}/${newEscrowStatus}, 支付ID: ${paymentId}`);
        await transaction.rollback();
        return null;
      }
      
      logger.info(`支付 ${paymentId} 状态将从 ${currentMainStatus}/${currentEscrowStatus} 转换为 ${newMainStatus}/${newEscrowStatus}`);
      
      // 准备状态历史条目
      const statusHistoryEntry = {
        // 支持前端使用的字段
        status: newMainStatus,
        // 保留原始字段
        mainStatus: newMainStatus,
        escrowStatus: newEscrowStatus,
        timestamp: new Date(),
        note: metadata.note || `状态从 ${currentMainStatus}/${currentEscrowStatus} 更新为 ${newMainStatus}/${newEscrowStatus}`,
        metadata: metadata.data || {}
      };
      
      // 如果有交易哈希，添加到历史记录中
      if (metadata.txHash) {
        statusHistoryEntry.txHash = metadata.txHash;
      }
      
      // 如果有区块链支付ID，添加到历史记录中
      if (metadata.blockchainPaymentId) {
        statusHistoryEntry.blockchainPaymentId = metadata.blockchainPaymentId;
      }
      
      // 获取当前状态历史
      let statusHistory = Array.isArray(payment.statusHistory) 
        ? [...payment.statusHistory] 
        : [];
      
      // 添加新状态记录
      statusHistory.push(statusHistoryEntry);
      
      // 准备更新字段（去除 escrowStatus，模型无此列）
      const updateFields = {
        status: newMainStatus,
        statusHistory,
        ...(metadata.extraFields || {})
      };
      
      // 如果有交易哈希，更新到支付记录
      if (metadata.txHash) {
        updateFields.transactionHash = metadata.txHash;
      }
      
      // 如果有区块链支付ID，更新到支付记录
      if (metadata.blockchainPaymentId) {
        updateFields.blockchainPaymentId = metadata.blockchainPaymentId;
      }
      
      // 过滤未知字段，只保留模型定义的属性
      const validFields = {};
      const allowed = Object.keys(PaymentIntent.rawAttributes);
      for (const key of Object.keys(updateFields)) {
        if (allowed.includes(key)) {
          validFields[key] = updateFields[key];
        }
      }
      
      // 更新支付记录
      await payment.update(validFields, { transaction });
      
      // 提交事务
      await transaction.commit();
      
      // 发送状态变更事件
      eventEmitter.emit('payment.status_changed', {
        paymentId: payment.id,
        oldMainStatus: currentMainStatus,
        newMainStatus: newMainStatus,
        oldEscrowStatus: currentEscrowStatus,
        newEscrowStatus: newEscrowStatus,
        metadata: metadata
      });
      
      logger.info(`支付 ${paymentId} 状态已成功更新为 ${newMainStatus}/${newEscrowStatus}`);
      return payment;
    } catch (error) {
      // 回滚事务
      await transaction.rollback();
      logger.error(`更新支付状态失败: ${error.message}`, error);
      return null;
    }
  }
  
  /**
   * 处理区块链状态变更
   * @param {number|string} paymentId - 支付ID或区块链支付ID
   * @param {string|number} blockchainStatus - 区块链状态（可以是数字或字符串）
   * @param {Object} metadata - 元数据信息
   * @returns {Promise<boolean>} - 是否处理成功
   */
  async handleBlockchainStatusChange(paymentId, blockchainStatus, metadata = {}) {
    try {
      logger.info(`处理支付 ${paymentId} 的区块链状态变更: ${blockchainStatus}`);
      
      // 查找支付记录 - 先通过数据库ID查找
      let payment = await PaymentIntent.findByPk(paymentId);
      
      // 如果通过数据库ID没找到，尝试通过区块链支付ID查找
      if (!payment) {
        payment = await PaymentIntent.findOne({
          where: { blockchainPaymentId: paymentId.toString() }
        });
      }
      
      // 如果通过区块链支付ID没找到，尝试通过交易哈希查找
      if (!payment && metadata.txHash) {
        payment = await PaymentIntent.findOne({
          where: { transactionHash: metadata.txHash }
        });
      }
      
      // 如果还是没找到，尝试通过状态历史中的交易哈希查找
      if (!payment && metadata.txHash) {
        payment = await PaymentIntent.findOne({
          where: sequelize.literal(`JSON_SEARCH(statusHistory, 'one', '${metadata.txHash}', NULL, '$.txHash') IS NOT NULL`)
        });
      }
      
      if (!payment) {
        logger.error(`找不到ID为 ${paymentId} 的支付记录`);
        return false;
      }
      
      // 获取区块链状态对应的托管状态
      let escrowStatus;
      if (typeof blockchainStatus === 'number') {
        escrowStatus = PaymentStatus.getEscrowStatusFromBlockchainNumber(blockchainStatus);
      } else {
        // 映射区块链状态到系统状态
        const systemBlockchainStatus = PaymentStatus.BLOCKCHAIN_STATUS_MAP[blockchainStatus];
        if (!systemBlockchainStatus) {
          logger.warn(`未知的区块链状态: ${blockchainStatus}`);
          return false;
        }
        
        // 获取对应的托管状态
        escrowStatus = PaymentStatus.getEscrowStatusForMainStatus(
          PaymentStatus.BLOCKCHAIN_TO_ORDER_STATUS[systemBlockchainStatus] || systemBlockchainStatus
        );
      }
      
      logger.info(`区块链状态 ${blockchainStatus} 映射为托管状态 ${escrowStatus}`);
      
      // 基于区块链托管状态和当前订单状态决定最终主状态
      const possibleMainStatuses = PaymentStatus.MAPPINGS.ESCROW_TO_MAIN[escrowStatus] || [];
      let finalMainStatus = payment.status;
      
      // 选择合适的主状态
      if (possibleMainStatuses.length > 0) {
        if (possibleMainStatuses.includes(payment.status)) {
          // 如果当前状态在可能的状态列表中，保持不变
          finalMainStatus = payment.status;
        } else {
          // 否则，选择第一个可能的状态
          finalMainStatus = possibleMainStatuses[0];
        }
      }
      
      // 特殊处理区块链完成状态
      if (blockchainStatus === 2 || blockchainStatus === 'COMPLETED') {
        if (payment.status === PaymentStatus.MAIN.CONFIRMED) {
          // 如果用户已确认收款，并且区块链交易已完成，则订单状态变为已结算
          finalMainStatus = PaymentStatus.MAIN.SETTLED;
        }
      }
      
      // 如果状态没有变化，记录但不更新
      if (finalMainStatus === payment.status && escrowStatus === payment.escrowStatus) {
        logger.info(`支付 ${paymentId} 状态无需更新，保持为 ${finalMainStatus}/${escrowStatus}`);
        
        // 即使状态无变化，也可能需要更新区块链ID和交易哈希
        if ((metadata.blockchainPaymentId && !payment.blockchainPaymentId) || 
            (metadata.txHash && !payment.transactionHash)) {
          const updateFields = {};
          if (metadata.blockchainPaymentId && !payment.blockchainPaymentId) {
            updateFields.blockchainPaymentId = metadata.blockchainPaymentId;
          }
          if (metadata.txHash && !payment.transactionHash) {
            updateFields.transactionHash = metadata.txHash;
          }
          
          await payment.update(updateFields);
          logger.info(`已更新支付 ${paymentId} 的区块链ID和交易哈希`);
        }
        
        return true;
      }
      
      // 更新支付状态
      const note = metadata.note || 
        `区块链状态变更为 ${blockchainStatus}，订单状态从 ${payment.status}/${payment.escrowStatus || 'none'} 更新为 ${finalMainStatus}/${escrowStatus}`;
      
      const updated = await this.updatePaymentStatus(payment.id, finalMainStatus, escrowStatus, {
        note,
        txHash: metadata.txHash || payment.transactionHash,
        blockchainPaymentId: metadata.blockchainPaymentId || payment.blockchainPaymentId,
        data: {
          blockchainStatus: blockchainStatus,
          systemBlockchainStatus: typeof blockchainStatus === 'string' ? 
            PaymentStatus.BLOCKCHAIN_STATUS_MAP[blockchainStatus] : null
        },
        extraFields: {
          lastSyncedAt: new Date(),
          ...metadata.extraFields
        }
      });
      
      return !!updated;
    } catch (error) {
      logger.error(`处理区块链状态变更失败: ${error.message}`, error);
      return false;
    }
  }
  
  /**
   * 根据区块链交易收据更新支付状态
   * @param {Object} paymentIntent - 支付意图对象
   * @param {Object} txReceipt - 交易收据
   * @param {number} currentBlock - 当前区块高度
   * @param {number} requiredConfirmations - 所需确认数
   * @returns {Promise<boolean>} - 是否更新成功
   */
  async updateStatusFromReceipt(paymentIntent, txReceipt, currentBlock, requiredConfirmations) {
    try {
      // 如果没有交易收据，则交易可能尚未被确认
      if (!txReceipt) {
        return this.handleBlockchainStatusChange(
          paymentIntent.id, 
          'PENDING', 
          { 
            note: '交易尚未被区块链确认',
            txHash: paymentIntent.transactionHash,
            blockchainPaymentId: paymentIntent.blockchainPaymentId
          }
        );
      }
      
      // 检查交易是否成功
      if (txReceipt.status === 1) {
        // 计算确认数
        const confirmations = currentBlock - txReceipt.blockNumber + 1;
        
        if (confirmations >= requiredConfirmations) {
          // 确认足够，标记为已完成
          return this.handleBlockchainStatusChange(
            paymentIntent.id, 
            'COMPLETED', 
            { 
              note: `交易已完成，确认数: ${confirmations}`,
              txHash: txReceipt.transactionHash || paymentIntent.transactionHash,
              blockchainPaymentId: paymentIntent.blockchainPaymentId,
              extraFields: {
                blockConfirmations: confirmations,
                finalizedAt: new Date()
              }
            }
          );
        } else {
          // 确认不足，标记为处理中
          return this.handleBlockchainStatusChange(
            paymentIntent.id, 
            'PROCESSING', 
            { 
              note: `交易已上链，当前确认数: ${confirmations}/${requiredConfirmations}`,
              txHash: txReceipt.transactionHash || paymentIntent.transactionHash,
              blockchainPaymentId: paymentIntent.blockchainPaymentId,
              extraFields: {
                blockConfirmations: confirmations
              }
            }
          );
        }
      } else {
        // 交易失败
        return this.handleBlockchainStatusChange(
          paymentIntent.id, 
          'FAILED', 
          { 
            note: '交易执行失败',
            txHash: txReceipt.transactionHash || paymentIntent.transactionHash,
            blockchainPaymentId: paymentIntent.blockchainPaymentId,
            extraFields: {
              failureReason: 'Transaction execution failed'
            }
          }
        );
      }
    } catch (error) {
      logger.error(`根据交易收据更新状态失败: ${error.message}`, error);
      return false;
    }
  }
  
  /**
   * 修复丢失的区块链支付ID或交易哈希
   * @param {number|string} paymentId - 支付ID
   * @param {Object} data - 要更新的数据
   * @returns {Promise<boolean>} - 是否修复成功
   */
  async fixMissingBlockchainData(paymentId, data) {
    try {
      const payment = await PaymentIntent.findByPk(paymentId);
      if (!payment) {
        logger.error(`找不到ID为 ${paymentId} 的支付记录`);
        return false;
      }
      
      const updateFields = {};
      let needsUpdate = false;
      
      // 检查是否需要更新区块链支付ID
      if (data.blockchainPaymentId && !payment.blockchainPaymentId) {
        updateFields.blockchainPaymentId = data.blockchainPaymentId;
        needsUpdate = true;
      }
      
      // 检查是否需要更新交易哈希
      if (data.txHash && !payment.transactionHash) {
        updateFields.transactionHash = data.txHash;
        needsUpdate = true;
      }
      
      // 更新托管状态
      if (data.escrowStatus && data.escrowStatus !== payment.escrowStatus) {
        // 验证状态转换
        if (PaymentStatus.isValidEscrowTransition(payment.escrowStatus || PaymentStatus.ESCROW.NONE, data.escrowStatus)) {
          updateFields.escrowStatus = data.escrowStatus;
          
          // 添加状态历史记录
          let statusHistory = Array.isArray(payment.statusHistory) ? [...payment.statusHistory] : [];
          statusHistory.push({
            mainStatus: payment.status,
            escrowStatus: data.escrowStatus,
            timestamp: new Date(),
            note: `托管状态修复更新为 ${data.escrowStatus}`,
            metadata: { source: 'fix_missing_data' }
          });
          
          updateFields.statusHistory = statusHistory;
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        await payment.update(updateFields);
        logger.info(`成功修复支付 ${paymentId} 的区块链数据`);
        return true;
      }
      
      logger.info(`支付 ${paymentId} 无需修复数据`);
      return false;
    } catch (error) {
      logger.error(`修复区块链数据失败: ${error.message}`, error);
      return false;
    }
  }
}

// 创建单例并导出
const paymentStatusService = new PaymentStatusService();
module.exports = paymentStatusService; 