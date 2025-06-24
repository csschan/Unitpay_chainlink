const express = require('express');
const router = express.Router();

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
router.get('/payment-intents/:id', paymentController.getPaymentIntent);
router.put('/payment-intents/:id/cancel', paymentController.cancelPaymentIntent);
router.put('/payment-intents/:id/confirm', paymentController.confirmPaymentIntent);

// LP路由
router.post('/lp/register', lpController.registerLP);
router.put('/lp/quota', lpController.updateQuota);
router.put('/lp/fee-rates', lpController.updateFeeRates);
router.get('/lp/direct/:walletAddress', lpController.getLPDirect);
router.get('/lp/task-pool', lpController.getTaskPool);
router.get('/lp/:walletAddress', lpController.getLP);
router.post('/lp/task/:id/claim', lpController.claimTask);
router.post('/lp/task/:id/mark-paid', lpController.markTaskPaid);
router.get('/lp/task/:id', lpController.getTask);

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

// 合约路由
router.get('/contract-info', contractController.getContractInfo);
router.get('/settlement-contract-info', contractController.getSettlementContractInfo);

// 任务路由
router.post('/tasks', async (req, res) => {
  try {
    const { type, data, timeout } = req.body;
    const task = await taskController.createTask(type, data, timeout);
    res.status(201).json({ success: true, task });
  } catch (error) {
    console.error('创建任务失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/tasks/:id', async (req, res) => {
  try {
    const taskStatus = await taskController.getTaskStatus(req.params.id);
    res.json({ success: true, task: taskStatus });
  } catch (error) {
    console.error('获取任务状态失败:', error);
    res.status(404).json({ success: false, message: error.message });
  }
});

router.put('/tasks/:id/status', async (req, res) => {
  try {
    const { status, result, error } = req.body;
    const task = await taskController.updateTaskStatus(req.params.id, status, result, error);
    res.json({ success: true, task });
  } catch (error) {
    console.error('更新任务状态失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;