const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');

// 导入控制器
const paymentController = require('../controllers/payment.controller');
const lpController = require('../controllers/lp.controller');
const contractController = require('../controllers/contract.controller');
const paypalController = require('../controllers/paypal.controller');
const taskController = require('../controllers/task.controller');

// 支付意图路由
router.post('/payment-intents', paymentController.createPaymentIntent);
router.get('/payment-intents/user/:walletAddress', paymentController.getUserPaymentIntents);
router.get('/payment-intents/lp/:walletAddress', paymentController.getLPPaymentIntents);
router.get('/payment-intents/:id', paymentController.getPaymentIntentById);
router.get('/payment-intent/:id', paymentController.getPaymentIntentById);
router.post('/payment-intent/:id/generate-blockchain-id', paymentController.generateBlockchainId);
router.put('/payment-intent/:id/withdraw-complete', paymentController.updateWithdrawalStatus);
router.put('/payment-intents/:id/cancel', paymentController.cancelPaymentIntent);
router.put('/payment-intents/:id/confirm', paymentController.confirmPaymentIntent);
router.put('/payment-intents/:id/status', paymentController.updatePaymentIntentStatus);
router.post('/payment-intents/:id/sync', paymentController.syncPaymentIntent);
router.post('/payment-intent/:id/sync', paymentController.syncPaymentIntent);

// LP路由
router.post('/lp/register', lpController.registerLP);
router.put('/lp/quota', lpController.updateQuota);
router.get('/lp/available', lpController.getAvailableLPs);
router.get('/lps/list', lpController.getAvailableLPs);
router.get('/lp/task-pool', lpController.getTaskPool);
router.get('/lp/direct/:walletAddress', lpController.getLPDirect);
router.post('/lp/task/:id/claim', lpController.claimTask);
router.post('/lp/task/:id/mark-paid', lpController.markTaskPaid);
router.get('/lp/task/:id', lpController.getTask);
router.get('/lp/:walletAddress', lpController.getLP);

// PayPal路由
router.get('/payment/paypal/config', paypalController.getConfig);
router.post('/lp/paypal/connect', paypalController.connectLPPayPal);
router.post('/payment/paypal/create-order', paypalController.createPayPalOrder);
router.post('/payment/paypal/capture-order', paypalController.capturePayPalOrder);
router.post('/payment/paypal/cancel-order', paypalController.cancelOrder);
router.post('/payment/paypal/verify-capture', paypalController.verifyCapture);
router.get('/payment/paypal/status/:paymentIntentId', paypalController.getPayPalStatus);
router.get('/payment/paypal/merchant-info/:paymentIntentId', paypalController.getMerchantInfo);
router.post('/payment/paypal/refund', paypalController.refundPayPalPayment);
router.get('/payment/paypal/refund-status/:refundId', paypalController.getPayPalRefundStatus);
router.post('/webhooks/paypal', paypalController.handleWebhook);

// 新增 - 区块链PayPal验证路由
router.post('/payment/paypal/submit-blockchain-order', paypalController.submitPaypalOrderToBlockchain);
router.get('/payment/paypal/blockchain-verification-status/:paymentIntentId', paypalController.getBlockchainVerificationStatus);

// 合约路由
router.get('/contract-info', contractController.getContractInfo);
router.get('/settlement-contract-info', contractController.getSettlementContractInfo);
router.get('/escrow-contract-info', contractController.getEscrowContractInfo);
router.post('/refund-escrow', contractController.refundEscrow);
router.put('/payment-intents/:id/expire', contractController.expireEscrow);

// 任务路由
router.post('/tasks', taskController.createTask);
router.get('/tasks/:id', taskController.getTask);
router.put('/tasks/:id', taskController.updateTask);
router.delete('/tasks/:id', taskController.deleteTask);
router.get('/tasks', taskController.getTasks);

// 添加托管相关的路由
router.post('/check-balance', paymentController.checkBalance);
router.post('/lock-funds', paymentController.lockFunds);
router.post('/confirm-release', paymentController.confirmAndRelease);
router.post('/request-withdrawal', paymentController.requestWithdrawal);

// 获取可用LP列表
router.get('/lps/available', lpController.getAvailableLPs);

// 测试接口 - 直接从MySQL查询LP数据
router.get('/test/lp/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    const [lps] = await sequelize.query(`
      SELECT * FROM lps WHERE walletAddress = ?
    `, {
      replacements: [walletAddress]
    });
    
    if (lps && lps.length > 0) {
      return res.status(200).json({
        success: true,
        data: lps[0],
        // 添加原始数据和特殊字段以便调试
        debug: {
          fee_rate: lps[0].fee_rate,
          fee_rate_type: typeof lps[0].fee_rate,
          raw: JSON.stringify(lps[0])
        }
      });
    } else {
      return res.status(404).json({
        success: false,
        message: '未找到LP'
      });
    }
  } catch (error) {
    console.error('测试接口错误:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
