const express = require('express');
const router = express.Router();

// 导入控制器
const userController = require('../controllers/user.controller');
const lpController = require('../controllers/lp.controller');
const paymentController = require('../controllers/payment.controller');
const paypalController = require('../controllers/paypal.controller');
const settlementController = require('../controllers/settlement.controller');

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
router.get('/payment-intents/:id', paymentController.getPaymentIntent);
router.put('/payment-intent/:id/confirm', paymentController.confirmPaymentIntent);
router.delete('/payment-intent/:id', paymentController.deletePaymentIntent);

// 结算相关路由
router.post('/settlement/start', settlementController.startSettlement);
router.get('/settlement/:id/status', settlementController.getSettlementStatus);
router.get('/settlement-contract-info', (req, res) => {
  res.json({
    success: true,
    data: {
      contractAddress: process.env.CONTRACT_ADDRESS || '0x123...',
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