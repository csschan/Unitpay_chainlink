require('dotenv').config();
const express = require('express');
// 使用NeDB替代MongoDB
// const mongoose = require('mongoose');
const Datastore = require('nedb');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./config/database');

// 导入路由
const routes = require('./routes');
const apiRoutes = require('./routes/api.routes');

// 导入服务
const SettlementService = require('./services/settlement.service');
const ContractListenerService = require('./services/contract-listener.service');
const taskController = require('./controllers/task.controller');

// 初始化Express应用
const app = express();
const server = http.createServer(app);

// 配置Socket.io以适应Vercel环境
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  // 添加适应Vercel无服务器环境的配置
  pingTimeout: 60000,
  pingInterval: 25000,
  // 添加重连配置
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  // 添加错误处理
  handlePreflightRequest: (req, res) => {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': req.headers.origin,
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': true
    });
    res.end();
  }
});

// 将Socket.io实例添加到app对象中
app.set('io', io);

// 中间件
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// 添加预检请求处理
app.options('*', cors());

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

// 简单的内存队列（实际项目中应使用Redis等消息队列）
class SettlementQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.settlementService = new SettlementService();
  }
  
  add(task) {
    this.queue.push(task);
    if (!this.processing) {
      this.process();
    }
  }
  
  async process() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    
    this.processing = true;
    const task = this.queue.shift();
    
    try {
      const result = await this.settlementService.processSettlement(task);
      
      // 通知结果
      if (io) {
        io.emit('settlement_result', {
          taskId: task.id,
          success: result.success,
          message: result.message
        });
      }
    } catch (error) {
      console.error('处理结算任务失败:', error);
      
      // 通知错误
      if (io) {
        io.emit('settlement_error', {
          taskId: task.id,
          error: error.message
        });
      }
    }
    
    // 处理下一个任务
    this.process();
  }
}

// 初始化结算队列
const settlementQueue = new SettlementQueue();

// 将Socket.io和结算队列添加到请求对象
app.use((req, res, next) => {
  req.io = io;
  req.settlementQueue = settlementQueue;
  next();
});

// 使用路由
app.use('/', routes);
app.use('/api', apiRoutes);

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '请求的资源不存在'
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 初始化NeDB数据库
const dbDir = path.join(__dirname, '../data');
// 确保数据目录存在
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 创建数据库实例
const db = {
  lp: new Datastore({ filename: path.join(dbDir, 'lp.db'), autoload: true }),
  paymentIntent: new Datastore({ filename: path.join(dbDir, 'payment_intent.db'), autoload: true }),
  user: new Datastore({ filename: path.join(dbDir, 'user.db'), autoload: true })
};

// 将数据库实例添加到请求对象
app.use((req, res, next) => {
  req.db = db;
  next();
});

// 初始化合约事件监听器
const contractListener = new ContractListenerService();

// 初始化 PayPal 控制器
const paypalController = require('./controllers/paypal.controller');

// 启动应用
const startApp = async () => {
  try {
    // 初始化数据库
    await initDatabase();
    
    // 初始化并存储Socket.io实例，使其在其他模块中可用
    global.io = io;
    console.log('Socket.io实例已全局化: global.io');
    
    // 启动 PayPal 自动修复功能
    console.log('初始化 PayPal 自动修复功能...');
    const fixInterval = paypalController.resetAutoFixScheduler();
    global.paypalFixInterval = fixInterval; // 全局存储定时器引用
    
    // 立即执行一次卡住订单检查，确保服务器启动后立即处理现有的卡住订单
    try {
      console.log('立即执行一次卡住订单检查...');
      // 直接调用autoFixStuckProcessingOrders函数
      await paypalController.autoFixStuckProcessingOrders();
      console.log('初始卡住订单检查完成');
    } catch (fixError) {
      console.error('初始卡住订单检查失败:', fixError);
    }
    
    // 启动任务超时处理定时器
    console.log('初始化任务超时处理定时器...');
    setInterval(async () => {
      try {
        await taskController.handleTimeoutTasks();
      } catch (error) {
        console.error('处理超时任务失败:', error);
      }
    }, 60000); // 每分钟检查一次
    
    // 启动服务器
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`服务器运行在端口 ${PORT}`);
      
      // 启动合约事件监听器
      contractListener.startListening();
    });
    
    // Socket.io连接处理
    io.on('connection', (socket) => {
      console.log('新的Socket连接:', socket.id);
      
      // 监听钱包连接事件
      socket.on('wallet_connect', (data) => {
        const { walletAddress, userType } = data;
        console.log('钱包连接:', { walletAddress, userType });
        
        // 将socket加入以钱包地址命名的房间
        if (walletAddress) {
          socket.join(walletAddress);
          console.log(`Socket ${socket.id} 加入房间 ${walletAddress}`);
        }
      });
      
      // 监听断开连接事件
      socket.on('disconnect', () => {
        console.log('Socket断开连接:', socket.id);
      });
    });
  } catch (error) {
    console.error('启动应用失败:', error);
    process.exit(1);
  }
};

// 启动应用
startApp();

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，准备关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到 SIGINT 信号，准备关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});