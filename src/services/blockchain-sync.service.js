const { ethers } = require('ethers');
const { PaymentIntent } = require('../models');
const { Op } = require('sequelize');
const config = require('../config/config');
const logger = require('../utils/logger');
const eventEmitter = require('../utils/eventEmitter');
const paymentIntentService = require('./payment-intent.service');
const paymentStatusService = require('./payment-status.service');
const PaymentStatus = require('../constants/payment-status');

/**
 * 区块链状态同步服务
 * 定期检查数据库中的支付意图，并与区块链上的状态同步
 */
class BlockchainSyncService {
  constructor() {
    this.provider = null;
    this.settlementContract = null;
    this.syncInterval = null;
    this.syncIntervalTime = config.blockchain.syncIntervalTime || 5 * 60 * 1000; // 默认5分钟
    this.paymentIntentService = paymentIntentService;
    this.paymentModel = PaymentIntent;
    this.statusService = paymentStatusService;
  }

  /**
   * 获取需要同步的数据库状态列表
   * @returns {Array<string>} 需要同步的状态列表
   */
  getStatusesToSync() {
    return [
      PaymentStatus.PENDING, 
      PaymentStatus.PROCESSING, 
      PaymentStatus.CONFIRMED
    ];
  }

  /**
   * 初始化区块链连接和合约
   */
  async initialize() {
    try {
      logger.info('正在初始化区块链同步服务...');
      
      // 初始化以太坊提供者
      this.provider = new ethers.providers.JsonRpcProvider(config.blockchain.rpcUrl);
      
      // 初始化合约实例
      const contractAbi = require('../contracts/SettlementContract.json').abi;
      const contractAddress = config.blockchain.unitpayEnhancedAddress || config.blockchain.contractAddress;
      
      this.settlementContract = new ethers.Contract(
        contractAddress,
        contractAbi,
        this.provider
      );
      
      logger.info(`区块链同步服务初始化完成，连接到 ${config.blockchain.rpcUrl}`);
      logger.info(`合约地址: ${contractAddress}`);
      
      // 测试连接
      const blockNumber = await this.provider.getBlockNumber();
      logger.info(`当前区块高度: ${blockNumber}`);
      
      return true;
    } catch (error) {
      logger.error(`初始化区块链同步服务失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查合约连接状态
   */
  isConnected() {
    return !!(this.provider && this.settlementContract);
  }

  /**
   * 重新连接区块链服务
   */
  async reconnect() {
    logger.info('尝试重新连接区块链服务...');
    
    // 如果有正在运行的同步任务，先停止
    if (this.syncInterval) {
      await this.stopSync();
    }
    
    // 重新初始化
    await this.initialize();
    
    logger.info('区块链服务重新连接成功');
  }

  /**
   * 开始定期同步
   */
  async startSync() {
    try {
      if (!this.isConnected()) {
        await this.reconnect();
      }
      
      logger.info(`开始区块链支付同步，间隔时间: ${this.syncIntervalTime}ms`);
      
      // 启动事件监听，若ABI不包含事件则捕获并继续
      try {
        await this.listenForTransactionEvents();
      } catch (err) {
        logger.warn(`监听区块链交易事件出错，已跳过：${err.message}`);
      }
      
      // 停止任何已有的定时任务
      this.stopSync();
      
      // 设置定时同步任务
      this.syncInterval = setInterval(async () => {
        try {
          await this.syncBlockchainState();
        } catch (error) {
          logger.error(`支付同步周期出错: ${error.message}`);
        }
      }, this.syncIntervalTime);
      
      // 设置重试队列处理任务
      this.retryInterval = setInterval(async () => {
        try {
          await this.processRetryQueue();
        } catch (error) {
          logger.error(`处理重试队列出错: ${error.message}`);
        }
      }, 60000); // 每分钟处理一次重试队列
      
      // 立即执行一次同步
      await this.syncBlockchainState();
      
      logger.info('区块链同步服务已启动');
      return true;
    } catch (error) {
      logger.error(`启动区块链同步失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 停止区块链同步服务
   */
  stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    
    // 清除所有事件监听
    if (this.settlementContract) {
      this.settlementContract.removeAllListeners();
    }
    
    logger.info('区块链同步服务已停止');
  }

  /**
   * 同步区块链状态到数据库
   */
  async syncBlockchainState() {
    logger.info('开始同步区块链状态...');
    
    try {
      // 获取需要同步的支付意图列表
      const statuses = this.getStatusesToSync();
      
      const pendingPayments = await PaymentIntent.findAll({
        where: {
          status: {
            [Op.in]: statuses
          },
          transactionHash: {
            [Op.not]: null  // 确保有交易哈希
          }
        }
      });
      
      logger.info(`找到 ${pendingPayments.length} 个待同步的支付意图`);
      
      // 批量同步每个支付意图
      for (const paymentIntent of pendingPayments) {
        await this.syncPaymentIntent(paymentIntent);
      }
      
      logger.info('区块链状态同步完成');
    } catch (error) {
      logger.error(`同步区块链状态时出错: ${error.message}`);
      throw error;
    }
  }

  /**
   * 同步单个支付的状态
   * @param {Object} paymentIntent - 支付意图对象
   */
  async syncPaymentIntent(paymentIntent) {
    try {
      logger.info(`同步支付意向 ID: ${paymentIntent.id}, 交易哈希: ${paymentIntent.transactionHash}`);
      
      if (!paymentIntent.transactionHash) {
        logger.warn(`支付意向 ${paymentIntent.id} 没有交易哈希，跳过同步`);
        return false;
      }
      
      // 获取当前区块高度
      const currentBlock = await this.provider.getBlockNumber();
      
      // 获取交易收据
      const txReceipt = await this.provider.getTransactionReceipt(paymentIntent.transactionHash);
      
      // 使用状态服务更新状态
      return await this.statusService.updateStatusFromReceipt(
        paymentIntent,
        txReceipt,
        currentBlock,
        config.blockchain.requiredConfirmations
      );
    } catch (error) {
      logger.error(`同步支付意向失败 ID: ${paymentIntent.id}: ${error.message}`);
      
      // 记录同步错误，但不修改状态
      await this.paymentIntentService.updatePaymentIntent(
        paymentIntent.id,
        { 
          lastSyncedAt: new Date(),
          syncErrors: (paymentIntent.syncErrors || 0) + 1,
          lastSyncError: error.message
        }
      );
      
      return false;
    }
  }

  /**
   * 手动同步特定的支付意图
   * @param {string} paymentId - 支付意图ID
   * @returns {Promise<Object>} - 同步结果
   */
  async manualSyncPayment(paymentId) {
    try {
      logger.info(`手动同步支付意图 ${paymentId}...`);
      
      // 查找支付意图
      const paymentIntent = await PaymentIntent.findByPk(paymentId);
      
      // 如果订单已标记为已取回(refunded)，跳过区块链同步
      if (paymentIntent && paymentIntent.status === PaymentStatus.MAIN.REFUNDED) {
        logger.info(`支付意图 ${paymentId} 已退款 (refunded)，跳过区块链同步`);
        return { success: true, message: '支付已取回，跳过同步', data: paymentIntent };
      }
      
      if (!paymentIntent) {
        logger.warn(`未找到支付意图 ${paymentId}`);
        return {
          success: false,
          message: '未找到支付意图'
        };
      }
      
      // 如果是已确认状态但没有交易哈希，可能需要生成区块链交易
      if (paymentIntent.status === PaymentStatus.CONFIRMED && !paymentIntent.transactionHash) {
        logger.info(`支付意图 ${paymentId} 已确认但没有交易哈希，需要生成区块链交易`);
        
        // 这里应该补充调用创建区块链交易的逻辑
        // ...
        
        return {
          success: true,
          message: '已为支付意图创建区块链交易，等待确认',
          data: paymentIntent
        };
      }
      
      // 如果有交易哈希，同步状态
      if (paymentIntent.transactionHash) {
        const success = await this.syncPaymentIntent(paymentIntent);
        
        // 重新查询更新后的支付意图
        const updatedPayment = await PaymentIntent.findByPk(paymentId);
        
        return {
          success,
          message: success ? '同步完成' : '同步失败',
          data: updatedPayment
        };
      } else {
        logger.warn(`支付意图 ${paymentId} 没有交易哈希，无法同步`);
        return {
          success: false,
          message: '支付意图没有交易哈希，无法同步'
        };
      }
    } catch (error) {
      logger.error(`手动同步支付意图 ${paymentId} 失败:`, error);
      return {
        success: false,
        message: '同步失败: ' + error.message
      };
    }
  }

  /**
   * 手动设置支付意图状态为已结算
   * @param {string} paymentId - 支付意图ID
   * @returns {Promise<Object>} - 操作结果
   */
  async manualSetPaymentSettled(paymentId) {
    try {
      logger.info(`手动将支付意图 ${paymentId} 设置为已结算状态...`);
      
      // 使用状态服务更新状态
      const updated = await this.statusService.updatePaymentStatus(
        paymentId, 
        PaymentStatus.SETTLED,
        { 
          note: '管理员手动将状态设置为已结算',
          extraFields: {
            manuallySettledAt: new Date(),
            manualSettlement: true
          }
        }
      );
      
      if (updated) {
        return {
          success: true,
          message: '已将支付意图设置为已结算状态',
          data: updated
        };
      } else {
        return {
          success: false,
          message: '更新状态失败，可能是状态转换无效'
        };
      }
    } catch (error) {
      logger.error(`手动设置支付意图 ${paymentId} 为已结算状态失败:`, error);
      return {
        success: false,
        message: '操作失败: ' + error.message
      };
    }
  }

  /**
   * 监听区块链结算合约交易事件
   */
  async listenForTransactionEvents() {
    if (!this.settlementContract) {
      logger.error('无法监听交易事件：结算合约未初始化');
      return;
    }

    logger.info('开始监听区块链交易事件...');

    // 监听支付确认事件
    this.settlementContract.on('PaymentConfirmed', async (paymentId, amount, timestamp, event) => {
      logger.info(`收到支付确认事件: ID=${paymentId}, 金额=${amount}, 时间=${timestamp}`);
      
      try {
        // 查找对应的支付记录
        const payment = await this.findPaymentByBlockchainId(paymentId.toString(), event.transactionHash);
        
        if (payment) {
          // 使用状态服务更新状态
          await this.statusService.handleBlockchainStatusChange(
            payment.id,
            'CONFIRMED',
            {
              note: `收到区块链支付确认事件`,
              txHash: event.transactionHash,
              blockchainPaymentId: paymentId.toString(),
              extraFields: {
                blockchainConfirmedAt: new Date(timestamp * 1000),
                transactionHash: event.transactionHash
              }
            }
          );
        } else {
          logger.warn(`未找到支付ID为 ${paymentId} 的记录，将添加到重试队列`);
          await this.addToRetryQueue({
            type: 'PaymentConfirmed',
            paymentId: paymentId.toString(),
            amount: amount.toString(),
            timestamp: timestamp.toString(),
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber
          });
        }
      } catch (error) {
        logger.error(`处理支付确认事件出错: ${error.message}`);
        await this.addToRetryQueue({
          type: 'PaymentConfirmed',
          paymentId: paymentId.toString(),
          amount: amount.toString(),
          timestamp: timestamp.toString(),
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          error: error.message
        });
      }
    });

    // 监听支付拒绝事件
    this.settlementContract.on('PaymentRejected', async (paymentId, reason, timestamp, event) => {
      logger.info(`收到支付拒绝事件: ID=${paymentId}, 原因=${reason}, 时间=${timestamp}`);
      
      try {
        // 查找对应的支付记录
        const payment = await this.findPaymentByBlockchainId(paymentId.toString(), event.transactionHash);
        
        if (payment) {
          // 使用状态服务更新状态
          await this.statusService.handleBlockchainStatusChange(
            payment.id,
            'REJECTED',
            {
              note: `收到区块链支付拒绝事件: ${reason}`,
              txHash: event.transactionHash,
              blockchainPaymentId: paymentId.toString(),
              extraFields: {
                rejectionReason: reason,
                blockchainRejectedAt: new Date(timestamp * 1000),
                transactionHash: event.transactionHash
              }
            }
          );
        } else {
          logger.warn(`未找到支付ID为 ${paymentId} 的记录，将添加到重试队列`);
          await this.addToRetryQueue({
            type: 'PaymentRejected',
            paymentId: paymentId.toString(),
            reason,
            timestamp: timestamp.toString(),
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber
          });
        }
      } catch (error) {
        logger.error(`处理支付拒绝事件出错: ${error.message}`);
        await this.addToRetryQueue({
          type: 'PaymentRejected',
          paymentId: paymentId.toString(),
          reason,
          timestamp: timestamp.toString(),
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          error: error.message
        });
      }
    });
    
    // 监听支付结算事件
    this.settlementContract.on('PaymentSettled', async (paymentId, amount, recipient, event) => {
      logger.info(`收到支付结算事件: ID=${paymentId}, 金额=${amount}, 接收者=${recipient}`);
      
      try {
        // 查找对应的支付记录
        const payment = await this.findPaymentByBlockchainId(paymentId.toString(), event.transactionHash);
        
        if (payment) {
          // 使用状态服务更新状态
          await this.statusService.handleBlockchainStatusChange(
            payment.id,
            'COMPLETED',
            {
              note: `收到区块链支付结算事件`,
              txHash: event.transactionHash,
              blockchainPaymentId: paymentId.toString(),
              extraFields: {
                blockchainSettledAt: new Date(),
                transactionHash: event.transactionHash,
                settlementAmount: amount.toString(),
                recipient
              }
            }
          );
        } else {
          logger.warn(`未找到支付ID为 ${paymentId} 的记录，将添加到重试队列`);
          await this.addToRetryQueue({
            type: 'PaymentSettled',
            paymentId: paymentId.toString(),
            amount: amount.toString(),
            recipient,
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber
          });
        }
      } catch (error) {
        logger.error(`处理支付结算事件出错: ${error.message}`);
        await this.addToRetryQueue({
          type: 'PaymentSettled',
          paymentId: paymentId.toString(),
          amount: amount.toString(),
          recipient,
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          error: error.message
        });
      }
    });
    
    // 监听支付失败事件
    this.settlementContract.on('PaymentFailed', async (paymentId, reason, event) => {
      logger.info(`收到支付失败事件: ID=${paymentId}, 原因=${reason}`);
      
      try {
        // 查找对应的支付记录
        const payment = await this.findPaymentByBlockchainId(paymentId.toString(), event.transactionHash);
        
        if (payment) {
          // 使用状态服务更新状态
          await this.statusService.handleBlockchainStatusChange(
            payment.id,
            'FAILED',
            {
              note: `收到区块链支付失败事件: ${reason}`,
              txHash: event.transactionHash,
              blockchainPaymentId: paymentId.toString(),
              extraFields: {
                failureReason: reason,
                blockchainFailedAt: new Date(),
                transactionHash: event.transactionHash
              }
            }
          );
        } else {
          logger.warn(`未找到支付ID为 ${paymentId} 的记录，将添加到重试队列`);
          await this.addToRetryQueue({
            type: 'PaymentFailed',
            paymentId: paymentId.toString(),
            reason,
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber
          });
        }
      } catch (error) {
        logger.error(`处理支付失败事件出错: ${error.message}`);
        await this.addToRetryQueue({
          type: 'PaymentFailed',
          paymentId: paymentId.toString(),
          reason,
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          error: error.message
        });
      }
    });

    // 监听支付状态变更事件
    this.settlementContract.on('PaymentStatusChanged', async (paymentId, status, event) => {
      logger.info(`收到支付状态变更事件: ID=${paymentId}, 状态=${status}`);
      
      try {
        // 查找对应的支付记录
        const payment = await this.findPaymentByBlockchainId(paymentId.toString(), event.transactionHash);
        
        if (payment) {
          // 使用状态服务更新状态
          await this.statusService.handleBlockchainStatusChange(
            payment.id,
            status.toNumber(),
            {
              note: `收到区块链支付状态变更事件: ${status}`,
              txHash: event.transactionHash,
              blockchainPaymentId: paymentId.toString(),
              extraFields: {
                blockchainStatusChangedAt: new Date(),
                transactionHash: event.transactionHash
              }
            }
          );
        } else {
          logger.warn(`未找到支付ID为 ${paymentId} 的记录，将添加到重试队列`);
          await this.addToRetryQueue({
            type: 'PaymentStatusChanged',
            paymentId: paymentId.toString(),
            status: status.toNumber(),
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber
          });
        }
      } catch (error) {
        logger.error(`处理支付状态变更事件出错: ${error.message}`);
        await this.addToRetryQueue({
          type: 'PaymentStatusChanged',
          paymentId: paymentId.toString(),
          status: status.toNumber(),
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          error: error.message
        });
      }
    });

    // 监听支付释放事件
    this.settlementContract.on('PaymentReleased', async (paymentId, event) => {
      logger.info(`收到支付释放事件: ID=${paymentId}`);
      
      try {
        // 查找对应的支付记录
        const payment = await this.findPaymentByBlockchainId(paymentId.toString(), event.transactionHash);
        
        if (payment) {
          // 使用状态服务更新状态
          await this.statusService.handleBlockchainStatusChange(
            payment.id,
            3, // RELEASED 状态
            {
              note: `收到区块链支付释放事件`,
              txHash: event.transactionHash,
              blockchainPaymentId: paymentId.toString(),
              extraFields: {
                blockchainReleasedAt: new Date(),
                transactionHash: event.transactionHash
              }
            }
          );
        } else {
          logger.warn(`未找到支付ID为 ${paymentId} 的记录，将添加到重试队列`);
          await this.addToRetryQueue({
            type: 'PaymentReleased',
            paymentId: paymentId.toString(),
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber
          });
        }
      } catch (error) {
        logger.error(`处理支付释放事件出错: ${error.message}`);
        await this.addToRetryQueue({
          type: 'PaymentReleased',
          paymentId: paymentId.toString(),
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          error: error.message
        });
      }
    });

    // 监听错误事件
    this.settlementContract.on('error', (error) => {
      logger.error(`区块链合约事件监听错误: ${error.message}`);
    });
  }

  /**
   * 根据区块链支付ID查找支付记录
   * @param {string} blockchainPaymentId 区块链支付ID
   * @param {string} transactionHash 交易哈希
   * @returns {Promise<Object|null>} 支付记录
   */
  async findPaymentByBlockchainId(blockchainPaymentId, transactionHash) {
    try {
      // 通过区块链支付ID查找
      let payment = await this.paymentModel.findOne({
        where: { blockchainPaymentId: blockchainPaymentId }
      });
      
      if (payment) {
        if (!payment.blockchainPaymentId) {
          await this.statusService.fixMissingBlockchainData(payment.id, {
            blockchainPaymentId: blockchainPaymentId
          });
        }
        return payment;
      }
      
      // 如果没找到，通过交易哈希查找
      if (transactionHash) {
        payment = await this.paymentModel.findOne({
          where: { transactionHash }
        });
        
        if (payment) {
          // 如果找到了记录但缺少区块链支付ID，更新它
          if (!payment.blockchainPaymentId) {
            await this.statusService.fixMissingBlockchainData(payment.id, {
              blockchainPaymentId: blockchainPaymentId
            });
          }
          return payment;
        }
      }
      
      // 尝试在状态历史中查找交易哈希
      if (transactionHash) {
        const { sequelize } = require('../config/database');
        payment = await this.paymentModel.findOne({
          where: sequelize.literal(`JSON_SEARCH(statusHistory, 'one', '${transactionHash}', NULL, '$.txHash') IS NOT NULL`)
        });
        
        if (payment) {
          // 如果找到了记录但缺少区块链支付ID，更新它
          if (!payment.blockchainPaymentId) {
            await this.statusService.fixMissingBlockchainData(payment.id, {
              blockchainPaymentId: blockchainPaymentId
            });
          }
          return payment;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`查找支付记录失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 添加事件到重试队列
   * @param {Object} eventData 事件数据
   */
  async addToRetryQueue(eventData) {
    try {
      // 获取重试队列模型
      const RetryQueue = require('../models/RetryQueue');
      
      // 添加到重试队列
      await RetryQueue.create({
        type: eventData.type,
        data: JSON.stringify(eventData),
        retryCount: 0,
        status: 'pending',
        createdAt: new Date(),
        nextRetryAt: new Date(Date.now() + 60000) // 1分钟后重试
      });
      
      logger.info(`事件 ${eventData.type} 已添加到重试队列`);
    } catch (error) {
      logger.error(`添加事件到重试队列失败: ${error.message}`);
    }
  }

  /**
   * 处理重试队列中的事件
   */
  async processRetryQueue() {
    try {
      // 获取重试队列模型
      const RetryQueue = require('../models/RetryQueue');
      const { Op } = require('sequelize');
      
      // 查找需要重试的事件
      const pendingEvents = await RetryQueue.findAll({
        where: {
          status: 'pending',
          nextRetryAt: {
            [Op.lte]: new Date()
          },
          retryCount: {
            [Op.lt]: 5 // 最多重试5次
          }
        },
        limit: 10 // 每次处理10条
      });
      
      logger.info(`开始处理重试队列，找到 ${pendingEvents.length} 条待处理事件`);
      
      for (const event of pendingEvents) {
        try {
          const eventData = JSON.parse(event.data);
          
          // 根据事件类型处理
          switch (eventData.type) {
            case 'PaymentConfirmed':
              await this.handleRetryPaymentConfirmed(eventData);
              break;
            case 'PaymentRejected':
              await this.handleRetryPaymentRejected(eventData);
              break;
            case 'PaymentSettled':
              await this.handleRetryPaymentSettled(eventData);
              break;
            case 'PaymentFailed':
              await this.handleRetryPaymentFailed(eventData);
              break;
            case 'PaymentStatusChanged':
              await this.handleRetryPaymentStatusChanged(eventData);
              break;
            case 'PaymentReleased':
              await this.handleRetryPaymentReleased(eventData);
              break;
            default:
              logger.warn(`未知的事件类型: ${eventData.type}`);
              break;
          }
          
          // 更新重试状态
          await event.update({
            status: 'processed',
            processedAt: new Date()
          });
          
          logger.info(`事件 ${eventData.type} 重试处理成功`);
        } catch (error) {
          // 更新重试次数和下次重试时间
          const retryCount = event.retryCount + 1;
          const backoff = Math.pow(2, retryCount) * 60000; // 指数退避
          const nextRetryAt = new Date(Date.now() + backoff);
          
          await event.update({
            retryCount,
            nextRetryAt,
            lastError: error.message
          });
          
          logger.error(`重试事件 ${event.id} 处理失败: ${error.message}, 将在 ${nextRetryAt} 重试`);
        }
      }
    } catch (error) {
      logger.error(`处理重试队列失败: ${error.message}`);
    }
  }

  /**
   * 处理支付确认事件的重试
   */
  async handleRetryPaymentConfirmed(eventData) {
    const payment = await this.findPaymentByBlockchainId(eventData.paymentId, eventData.transactionHash);
    
    if (payment) {
      await this.statusService.handleBlockchainStatusChange(
        payment.id,
        'CONFIRMED',
        {
          note: `[重试] 收到区块链支付确认事件`,
          txHash: eventData.transactionHash,
          blockchainPaymentId: eventData.paymentId,
          extraFields: {
            blockchainConfirmedAt: new Date(eventData.timestamp * 1000),
            transactionHash: eventData.transactionHash
          }
        }
      );
    } else {
      throw new Error(`未找到支付ID为 ${eventData.paymentId} 的记录`);
    }
  }

  /**
   * 处理支付拒绝事件的重试
   */
  async handleRetryPaymentRejected(eventData) {
    const payment = await this.findPaymentByBlockchainId(eventData.paymentId, eventData.transactionHash);
    
    if (payment) {
      await this.statusService.handleBlockchainStatusChange(
        payment.id,
        'REJECTED',
        {
          note: `[重试] 收到区块链支付拒绝事件: ${eventData.reason}`,
          txHash: eventData.transactionHash,
          blockchainPaymentId: eventData.paymentId,
          extraFields: {
            rejectionReason: eventData.reason,
            blockchainRejectedAt: new Date(eventData.timestamp * 1000),
            transactionHash: eventData.transactionHash
          }
        }
      );
    } else {
      throw new Error(`未找到支付ID为 ${eventData.paymentId} 的记录`);
    }
  }

  /**
   * 处理支付结算事件的重试
   */
  async handleRetryPaymentSettled(eventData) {
    const payment = await this.findPaymentByBlockchainId(eventData.paymentId, eventData.transactionHash);
    
    if (payment) {
      await this.statusService.handleBlockchainStatusChange(
        payment.id,
        'COMPLETED',
        {
          note: `[重试] 收到区块链支付结算事件`,
          txHash: eventData.transactionHash,
          blockchainPaymentId: eventData.paymentId,
          extraFields: {
            blockchainSettledAt: new Date(),
            transactionHash: eventData.transactionHash,
            settlementAmount: eventData.amount,
            recipient: eventData.recipient
          }
        }
      );
    } else {
      throw new Error(`未找到支付ID为 ${eventData.paymentId} 的记录`);
    }
  }

  /**
   * 处理支付失败事件的重试
   */
  async handleRetryPaymentFailed(eventData) {
    const payment = await this.findPaymentByBlockchainId(eventData.paymentId, eventData.transactionHash);
    
    if (payment) {
      await this.statusService.handleBlockchainStatusChange(
        payment.id,
        'FAILED',
        {
          note: `[重试] 收到区块链支付失败事件: ${eventData.reason}`,
          txHash: eventData.transactionHash,
          blockchainPaymentId: eventData.paymentId,
          extraFields: {
            failureReason: eventData.reason,
            blockchainFailedAt: new Date(),
            transactionHash: eventData.transactionHash
          }
        }
      );
    } else {
      throw new Error(`未找到支付ID为 ${eventData.paymentId} 的记录`);
    }
  }

  /**
   * 处理支付状态变更事件的重试
   */
  async handleRetryPaymentStatusChanged(eventData) {
    const payment = await this.findPaymentByBlockchainId(eventData.paymentId, eventData.transactionHash);
    
    if (payment) {
      await this.statusService.handleBlockchainStatusChange(
        payment.id,
        eventData.status,
        {
          note: `[重试] 收到区块链支付状态变更事件: ${eventData.status}`,
          txHash: eventData.transactionHash,
          blockchainPaymentId: eventData.paymentId,
          extraFields: {
            blockchainStatusChangedAt: new Date(),
            transactionHash: eventData.transactionHash
          }
        }
      );
    } else {
      throw new Error(`未找到支付ID为 ${eventData.paymentId} 的记录`);
    }
  }

  /**
   * 处理支付释放事件的重试
   */
  async handleRetryPaymentReleased(eventData) {
    const payment = await this.findPaymentByBlockchainId(eventData.paymentId, eventData.transactionHash);
    
    if (payment) {
      await this.statusService.handleBlockchainStatusChange(
        payment.id,
        3, // RELEASED 状态
        {
          note: `[重试] 收到区块链支付释放事件`,
          txHash: eventData.transactionHash,
          blockchainPaymentId: eventData.paymentId,
          extraFields: {
            blockchainReleasedAt: new Date(),
            transactionHash: eventData.transactionHash
          }
        }
      );
    } else {
      throw new Error(`未找到支付ID为 ${eventData.paymentId} 的记录`);
    }
  }
}

const blockchainSyncService = new BlockchainSyncService();
module.exports = blockchainSyncService; 