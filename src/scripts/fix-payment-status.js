/**
 * 支付状态修复脚本
 * 
 * 用于修复以下问题：
 * 1. 缺失的区块链支付ID
 * 2. 缺失的交易哈希
 * 3. 状态和托管状态不一致
 * 4. 状态历史记录不完整
 */

const { sequelize } = require('../config/database');
const { PaymentIntent } = require('../models');
const RetryQueue = require('../models/RetryQueue');
const PaymentStatus = require('../constants/payment-status');
const paymentStatusService = require('../services/payment-status.service');
const blockchainSyncService = require('../services/blockchain-sync.service');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * 修复缺失的区块链支付ID和交易哈希
 */
async function fixMissingBlockchainData() {
  logger.info('开始修复缺失的区块链数据...');
  
  try {
    // 找出有交易哈希但无区块链支付ID的记录
    const paymentsWithTxOnly = await PaymentIntent.findAll({
      where: {
        transactionHash: {
          [Op.not]: null
        },
        blockchain_payment_id: null
      }
    });
    
    logger.info(`找到 ${paymentsWithTxOnly.length} 条有交易哈希但无区块链支付ID的记录`);
    
    // 查找状态历史中有区块链支付ID的记录
    for (const payment of paymentsWithTxOnly) {
      try {
        // 尝试从状态历史中找出区块链支付ID
        const statusHistory = payment.statusHistory || [];
        const blockchainIdEntries = statusHistory.filter(entry => entry.blockchainPaymentId);
        
        if (blockchainIdEntries.length > 0) {
          // 使用找到的第一个区块链支付ID
          const blockchainPaymentId = blockchainIdEntries[0].blockchainPaymentId;
          
          // 更新支付记录
          await paymentStatusService.fixMissingBlockchainData(payment.id, {
            blockchainPaymentId
          });
          
          logger.info(`已修复支付 ${payment.id} 的区块链支付ID: ${blockchainPaymentId}`);
        }
      } catch (error) {
        logger.error(`修复支付 ${payment.id} 区块链支付ID失败: ${error.message}`);
      }
    }
    
    // 找出有区块链支付ID但无交易哈希的记录
    const paymentsWithBlockchainIdOnly = await PaymentIntent.findAll({
      where: {
        blockchain_payment_id: {
          [Op.not]: null
        },
        transactionHash: null
      }
    });
    
    logger.info(`找到 ${paymentsWithBlockchainIdOnly.length} 条有区块链支付ID但无交易哈希的记录`);
    
    // 查找状态历史中有交易哈希的记录
    for (const payment of paymentsWithBlockchainIdOnly) {
      try {
        // 尝试从状态历史中找出交易哈希
        const statusHistory = payment.statusHistory || [];
        const txHashEntries = statusHistory.filter(entry => entry.txHash);
        
        if (txHashEntries.length > 0) {
          // 使用找到的第一个交易哈希
          const txHash = txHashEntries[0].txHash;
          
          // 更新支付记录
          await paymentStatusService.fixMissingBlockchainData(payment.id, {
            txHash
          });
          
          logger.info(`已修复支付 ${payment.id} 的交易哈希: ${txHash}`);
        }
      } catch (error) {
        logger.error(`修复支付 ${payment.id} 交易哈希失败: ${error.message}`);
      }
    }
    
    logger.info('修复缺失的区块链数据完成');
  } catch (error) {
    logger.error(`修复缺失的区块链数据出错: ${error.message}`);
  }
}

/**
 * 修复状态和托管状态不一致的记录
 */
async function fixInconsistentStatus() {
  logger.info('开始修复状态不一致的记录...');
  
  try {
    // 找出所有有状态但无托管状态的记录
    const paymentsWithoutEscrowStatus = await PaymentIntent.findAll({
      where: {
        status: {
          [Op.not]: null
        },
        escrowStatus: null
      }
    });
    
    logger.info(`找到 ${paymentsWithoutEscrowStatus.length} 条有状态但无托管状态的记录`);
    
    // 为每条记录添加托管状态
    for (const payment of paymentsWithoutEscrowStatus) {
      try {
        // 根据主状态获取托管状态
        const escrowStatus = PaymentStatus.getEscrowStatusForMainStatus(payment.status);
        
        // 更新支付记录
        await paymentStatusService.fixMissingBlockchainData(payment.id, {
          escrowStatus
        });
        
        logger.info(`已修复支付 ${payment.id} 的托管状态: ${escrowStatus}`);
      } catch (error) {
        logger.error(`修复支付 ${payment.id} 托管状态失败: ${error.message}`);
      }
    }
    
    // 找出状态和托管状态不一致的记录
    const allPayments = await PaymentIntent.findAll({
      where: {
        status: {
          [Op.not]: null
        },
        escrowStatus: {
          [Op.not]: null
        }
      }
    });
    
    let inconsistentCount = 0;
    
    // 检查每条记录的状态一致性
    for (const payment of allPayments) {
      try {
        // 获取当前主状态对应的托管状态
        const expectedEscrowStatus = PaymentStatus.getEscrowStatusForMainStatus(payment.status);
        
        // 如果不一致，修复托管状态
        if (expectedEscrowStatus !== payment.escrowStatus) {
          inconsistentCount++;
          
          // 更新支付记录
          await paymentStatusService.fixMissingBlockchainData(payment.id, {
            escrowStatus: expectedEscrowStatus
          });
          
          logger.info(`已修复支付 ${payment.id} 的托管状态: ${payment.escrowStatus} -> ${expectedEscrowStatus}`);
        }
      } catch (error) {
        logger.error(`检查支付 ${payment.id} 状态一致性失败: ${error.message}`);
      }
    }
    
    logger.info(`找到并修复了 ${inconsistentCount} 条状态不一致的记录`);
    logger.info('修复状态不一致的记录完成');
  } catch (error) {
    logger.error(`修复状态不一致的记录出错: ${error.message}`);
  }
}

/**
 * 重新处理失败的区块链事件
 */
async function reprocessFailedEvents() {
  logger.info('开始重新处理失败的区块链事件...');
  
  try {
    // 找出所有失败的事件
    const failedEvents = await RetryQueue.findAll({
      where: {
        status: 'failed',
        retryCount: {
          [Op.lt]: 5
        }
      }
    });
    
    logger.info(`找到 ${failedEvents.length} 条失败的事件`);
    
    // 重置事件状态
    for (const event of failedEvents) {
      try {
        await event.update({
          status: 'pending',
          nextRetryAt: new Date(),
          lastError: `手动重置状态: ${event.lastError}`
        });
        
        logger.info(`已重置事件 ${event.id} 的状态`);
      } catch (error) {
        logger.error(`重置事件 ${event.id} 状态失败: ${error.message}`);
      }
    }
    
    logger.info('重新处理失败的区块链事件完成');
  } catch (error) {
    logger.error(`重新处理失败的区块链事件出错: ${error.message}`);
  }
}

/**
 * 修复主函数
 */
async function main() {
  try {
    logger.info('开始修复支付状态数据...');
    
    // 修复缺失的区块链数据
    await fixMissingBlockchainData();
    
    // 修复状态不一致的记录
    await fixInconsistentStatus();
    
    // 重新处理失败的区块链事件
    await reprocessFailedEvents();
    
    logger.info('支付状态数据修复完成');
    process.exit(0);
  } catch (error) {
    logger.error(`修复支付状态数据出错: ${error.message}`);
    process.exit(1);
  }
}

// 检查是否直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  fixMissingBlockchainData,
  fixInconsistentStatus,
  reprocessFailedEvents,
  main
}; 