const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contract.controller');
const { authenticate } = require('../middleware/auth');

// 获取USDT授权额度
router.get('/allowance/:address', contractController.getAllowance);

// 处理直接支付
router.post('/direct-payment', authenticate, contractController.handleDirectPayment);

// 处理托管支付
router.post('/escrow-payment', authenticate, contractController.handleEscrowPayment);

// 确认托管支付
router.post('/confirm-escrow', authenticate, contractController.confirmEscrowPayment);

// 处理LP提现
router.post('/withdrawal', authenticate, contractController.handleWithdrawal);

// 获取交易状态
router.get('/transaction-status/:paymentIntentId', authenticate, contractController.getTransactionStatus);

module.exports = router; 