require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { sequelize, initDatabase } = require('./config/database');
const schedulerService = require('./services/scheduler.service');

// 导入路由
const apiRoutes = require('./routes/api.routes');
const mainRoutes = require('./routes');

// 初始化Express应用
const app = express();
const server = http.createServer(app);

// 配置Socket.io
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  }
});

// 将Socket.io实例添加到app对象中
app.set('io', io);

// 使用中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

// 使用路由
app.use('/api', apiRoutes);
app.use('/', mainRoutes);

// 初始化基本服务
const logger = require('./utils/logger');
const { initializeWebSocketServer } = require('./socket');
const paymentStatusService = require('./services/payment-status.service');
const blockchainSyncService = require('./services/blockchain-sync.service');

// 获取配置的端口，如果没有配置则使用3000
const PORT = process.env.PORT || 3000;

// 启动服务器
server.listen(PORT, async () => {
  logger.info(`服务器已启动，端口: ${PORT}`);
  // 在初始化区块链同步和监听服务前，先初始化数据库
  try {
    await initDatabase();
    logger.info('数据库初始化成功');
  } catch (error) {
    logger.error('数据库初始化失败，退出应用', error);
    process.exit(1);
  }
  // 初始化WebSocket服务
  initializeWebSocketServer(io);
  
  // 初始化并启动区块链同步服务
  try {
    logger.info('正在初始化区块链同步服务...');
    await blockchainSyncService.initialize();
    
    // 启动同步服务
    logger.info('开始启动区块链同步服务...');
    await blockchainSyncService.startSync();
    logger.info('区块链同步服务已成功启动');
  } catch (error) {
    logger.error(`区块链同步服务初始化失败: ${error.message}`);
  }

  // 新增：初始化并启动合约监听服务
  try {
    const ContractListenerService = require('./services/contract-listener.service');
    const contractListener = new ContractListenerService();
    logger.info('正在初始化合约监听服务...');
    await contractListener.initialize();
    logger.info('开始监听合约事件...');
    contractListener.startListening();
    // 注册全局 contractListener，供控制器更新映射
    global.contractListener = contractListener;
  } catch (error) {
    logger.error(`合约监听服务初始化失败: ${error.message}`);
  }
});

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('收到SIGTERM信号，准备关闭服务...');
  
  // 停止区块链同步服务
  if (blockchainSyncService) {
    try {
      logger.info('正在停止区块链同步服务...');
      blockchainSyncService.stopSync();
      logger.info('区块链同步服务已停止');
    } catch (error) {
      logger.error(`停止区块链同步服务失败: ${error.message}`);
    }
  }
  
  // 关闭服务器
  server.close(() => {
    logger.info('HTTP服务器已关闭');
    process.exit(0);
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : '服务器错误'
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '未找到请求的资源'
  });
});