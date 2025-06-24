const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const logger = require('./utils/logger');
const winston = require('winston');
const apiRoutes = require('./routes/api.routes');
const contractRoutes = require('./routes/contract.routes');
const mainRoutes = require('./routes');
const { initDatabase } = require('./config/database');
const ContractListenerService = require('./services/contract-listener.service');
const blockchainSyncService = require('./services/blockchain-sync.service');
const { Server: IOServer } = require('socket.io');
const { initializeWebSocketServer } = require('./socket');

const app = express();

// 初始化数据库
initDatabase().catch(err => {
    console.error('数据库初始化失败:', err);
    process.exit(1);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

// Register routes
app.use('/api', apiRoutes);
app.use('/api/contract', contractRoutes);
app.use('/', mainRoutes);

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

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ noServer: true });

// 存储所有连接的客户端
const clients = new Set();

// WebSocket 连接处理
wss.on('connection', (ws) => {
    clients.add(ws);
    
    ws.on('close', () => {
        clients.delete(ws);
    });
});

// 重写 logger 的 transport，添加 WebSocket 广播
logger.add(new winston.transports.Console({
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(info => {
            const logMessage = JSON.stringify(info);
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(logMessage);
                }
            });
            return logMessage;
        })
    )
}));

// 创建合约监听服务实例
const contractListenerService = new ContractListenerService();

// 在适当的位置初始化合约监听服务和区块链同步服务
async function startServices() {
  try {
    // 初始化合约监听服务
    await contractListenerService.initialize();
    console.log('合约监听服务初始化成功');

    // 初始化区块链同步服务
    await blockchainSyncService.initialize();
    console.log('区块链同步服务初始化成功');

    // 开始监听合约事件
    contractListenerService.startListening();
    console.log('开始监听合约事件');

    // 开始定期同步区块链状态
    blockchainSyncService.startSync();
    console.log('开始同步区块链状态');
  } catch (error) {
    console.error('启动服务失败:', error);
  }
}

// 使用原生 HTTP 服务器与 Express 应用
const http = require('http');
// 创建 HTTP 服务器，使用 Express 应用处理请求
const server = http.createServer(app);

// 添加: Socket.IO 服务器初始化
const io = new IOServer(server, {
  path: '/socket.io',
  cors: {
    origin: '*',
    methods: ['GET','POST'],
    credentials: true
  }
});
initializeWebSocketServer(io);

// 将 WebSocket 服务器附加到 HTTP 服务器
server.on('upgrade', (request, socket, head) => {
  // 若为 socket.io 请求，交给 Socket.IO 处理
  if (request.url.startsWith('/socket.io')) return;
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// 启动 HTTP 服务器
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  startServices();
});

module.exports = app;
