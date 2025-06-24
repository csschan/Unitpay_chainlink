const express = require('express');
const router = express.Router();
const path = require('path');

// 页面路由
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

router.get('/lp', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/lp.html'));
});

router.get('/payment', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/payment.html'));
});

router.get('/payment-detail', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/payment-detail.html'));
});

router.get('/qr-test', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/qr-test.html'));
});

router.get('/payment-tasks', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/payment-tasks.html'));
});

module.exports = router; 