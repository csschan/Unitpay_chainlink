const { ethers } = require('ethers');
const { PaymentIntent } = require('../models/mysql');
const PaymentStatus = require('../constants/payment-status');
const logger = require('../utils/logger');
const path = require('path');

/**
 * 合约事件监听器服务
 * 监听UnitpayEnhanced合约的事件并更新对应任务的状态
 */
class ContractListenerService {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.paymentIdMap = new Map();
  }

  /**
   * 初始化提供者和合约
   */
  async initialize() {
    // 初始化以太坊 provider
    const rpcUrl = process.env.ALCHEMY_SEPOLIA_RPC_URL || process.env.SEPOLIA_RPC_URL;
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    // 读取合约 ABI
    const artifact = require(path.resolve(__dirname, '../../artifacts/contracts/UnitpayEnhanced.sol/UnitpayEnhanced.json'));
    const abi = artifact.abi;
    const address = process.env.CONTRACT_ADDRESS;
    this.contract = new ethers.Contract(address, abi, this.provider);
    logger.info(`合约监听地址: ${address}`);
    // 构建 paymentIdHash -> PaymentIntent.id 映射
    try {
      const allPis = await PaymentIntent.findAll({ attributes: ['id', 'blockchainPaymentId'] });
      this.paymentIdMap.clear();
      let loadedCount = 0;
      for (const p of allPis) {
        // 跳过没有 blockchainPaymentId 的记录
        if (!p.blockchainPaymentId) continue;
        try {
          const hash = ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes(p.blockchainPaymentId)
          );
          this.paymentIdMap.set(hash, p.id);
          loadedCount++;
        } catch (err) {
          logger.warn(`忽略无效 blockchainPaymentId: ${p.blockchainPaymentId}`, err);
        }
      }
      logger.info(`Loaded ${loadedCount} paymentId hashes`);
    } catch (err) {
      logger.error('构建 paymentIdHash 映射失败', err);
    }
  }
  
  /**
   * 开始监听合约事件
   */
  startListening() {
    if (!this.contract) {
      throw new Error('合约监听服务未初始化');
    }
    // 监听 Chainlink Functions 验证完成事件
    this.contract.on('OrderVerified', async (paymentIdIndexed, event) => {
      // 解析动态索引参数
      let pi;
      if (paymentIdIndexed && paymentIdIndexed._isIndexed && paymentIdIndexed.hash) {
        const hash = paymentIdIndexed.hash;
        logger.info(`捕获 OrderVerified 事件, paymentIdHash=${hash}`);
        const id = this.paymentIdMap.get(hash);
        if (id) pi = await PaymentIntent.findByPk(id);
      } else {
        const paymentId = paymentIdIndexed;
        logger.info(`捕获 OrderVerified 事件, paymentId=${paymentId}`);
        pi = await PaymentIntent.findOne({ where: { blockchainPaymentId: paymentId } });
      }
      if (!pi) {
        logger.warn(`未找到 PaymentIntent, paymentIdHash=${paymentIdIndexed && paymentIdIndexed.hash}`);
        return;
      }
      try {
        const newStatus = PaymentStatus.MAIN.CONFIRMED;
        pi.status = newStatus;
        pi.statusHistory = pi.addStatusHistory(newStatus, 'Chainlink 验证通过', {
          txHash: event.transactionHash,
          blockNumber: event.blockNumber
        });
        pi.lastSyncedAt = new Date();
        await pi.save();
        logger.info(`PaymentIntent ${pi.id} 更新为 CONFIRMED`);
      } catch (error) {
        logger.error(`处理 OrderVerified 事件失败: ${error.message}`);
      }
    });

    // 监听自动释放事件
    this.contract.on('PaymentReleased', async (paymentIdIndexed, event) => {
      let pi;
      if (paymentIdIndexed && paymentIdIndexed._isIndexed && paymentIdIndexed.hash) {
        const hash = paymentIdIndexed.hash;
        logger.info(`捕获 PaymentReleased 事件, paymentIdHash=${hash}`);
        const id = this.paymentIdMap.get(hash);
        if (id) pi = await PaymentIntent.findByPk(id);
      } else {
        const paymentId = paymentIdIndexed;
        logger.info(`捕获 PaymentReleased 事件, paymentId=${paymentId}`);
        pi = await PaymentIntent.findOne({ where: { blockchainPaymentId: paymentId } });
      }
      if (!pi) {
        logger.warn(`未找到 PaymentIntent, paymentIdHash=${paymentIdIndexed && paymentIdIndexed.hash}`);
        return;
      }
      try {
        const newStatus = PaymentStatus.MAIN.SETTLED;
        pi.status = newStatus;
        pi.statusHistory = pi.addStatusHistory(newStatus, 'Chainlink 自动释放资金', {
          txHash: event.transactionHash,
          blockNumber: event.blockNumber
        });
        pi.lastSyncedAt = new Date();
        await pi.save();
        logger.info(`PaymentIntent ${pi.id} 更新为 SETTLED`);
      } catch (error) {
        logger.error(`处理 PaymentReleased 事件失败: ${error.message}`);
      }
    });
  }

  /**
   * 动态添加 paymentIdHash 到映射
   */
  addPaymentId(paymentIntentId, blockchainPaymentId) {
    try {
      const hash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(blockchainPaymentId)
      );
      this.paymentIdMap.set(hash, paymentIntentId);
      logger.info(`Added paymentIdHash mapping for PaymentIntent ${paymentIntentId}`);
    } catch (err) {
      logger.error(`Failed to add paymentIdHash mapping for PaymentIntent ${paymentIntentId}`, err);
    }
  }
}

module.exports = ContractListenerService;