const express = require('express');
const router = express.Router();

// 导入控制器
const userController = require('../controllers/user.controller');
const lpController = require('../controllers/lp.controller');
const paymentController = require('../controllers/payment.controller');
const paypalController = require('../controllers/paypal.controller');
const settlementController = require('../controllers/settlement.controller');
const blockchainSyncService = require('../services/blockchain-sync.service');

// 设置CORS头部
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 用户相关路由
router.post('/user/register', userController.register);
router.post('/user/login', userController.login);
router.get('/user/profile', userController.getProfile);
router.put('/user/profile', userController.updateProfile);
router.get('/user/check-wallet', userController.checkWalletAddress);

// LP 相关路由
router.post('/lp/register', lpController.register);
router.get('/lp/check', lpController.checkRegistration);
router.get('/lp/info', lpController.getLPInfo);
router.get('/lp/task-pool', lpController.getTaskPool);
router.post('/lp/task/:id/claim', lpController.claimTask);
router.post('/lp/task/:id/mark-paid', lpController.markTaskPaid);
router.get('/lp/task/:id', lpController.getTask);

// 支付意图相关路由
router.post('/payment-intent', paymentController.createPaymentIntent);
router.get('/payment-intents', paymentController.getPaymentIntents);
router.put('/payment-intent/:id/confirm', paymentController.confirmPaymentIntent);
router.delete('/payment-intent/:id', paymentController.deletePaymentIntent);

// 添加获取单个支付意图的详情路由
router.get('/payment-intent/:id', paymentController.getPaymentIntentById);

// 添加区块链支付同步路由
router.post('/payment-intent/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`收到手动同步支付请求，ID: ${id}`);
    
    const result = await blockchainSyncService.manualSyncPayment(id);
    
    return res.json(result);
  } catch (error) {
    console.error(`手动同步支付出错: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `同步失败: ${error.message}`
    });
  }
});

// 添加区块链支付ID生成路由
router.post('/payment-intent/:id/generate-blockchain-id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`收到生成区块链ID请求，支付ID: ${id}`);
    
    // 实际实现应该由具体的服务来完成
    // 这里是一个简化版本，实际生产中需要更复杂的逻辑
    const { PaymentIntent } = require('../models');
    const crypto = require('crypto');
    
    // 查找支付记录
    const payment = await PaymentIntent.findByPk(id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: '找不到支付记录'
      });
    }
    
    // 如果已有区块链ID，直接返回
    if (payment.blockchainPaymentId) {
      return res.json({
        success: true,
        message: '已存在区块链ID',
        data: {
          blockchainPaymentId: payment.blockchainPaymentId
        }
      });
    }
    
    // 生成一个唯一的区块链ID（实际应用中这可能来自链上交易）
    const blockchainId = `unit_${payment.id}_${crypto.randomBytes(4).toString('hex')}`;
    
    // 更新支付记录
    await payment.update({
      blockchainPaymentId: blockchainId
    });
    
    return res.json({
      success: true,
      message: '区块链ID已生成',
      data: {
        blockchainPaymentId: blockchainId
      }
    });
  } catch (error) {
    console.error(`生成区块链ID出错: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `生成失败: ${error.message}`
    });
  }
});

// 结算相关路由
router.post('/settlement/start', settlementController.startSettlement);
router.get('/settlement/:id/status', settlementController.getSettlementStatus);
router.get('/settlement-contract-info', (req, res) => {
  res.json({
    success: true,
    data: {
      contractAddress: process.env.CONTRACT_ADDRESS || '0x78fbc0ec12bc3087aae592f7ca31b27b515ae01c',
      network: process.env.NETWORK || 'goerli'
    }
  });
});

// PayPal相关路由
router.post('/paypal/create-order', paypalController.createOrder);
router.post('/paypal/capture-order', paypalController.capturePayPalOrder);
router.post('/paypal/cancel-order', paypalController.cancelOrder);
router.post('/paypal/webhook', paypalController.handleWebhook);

module.exports = router; 