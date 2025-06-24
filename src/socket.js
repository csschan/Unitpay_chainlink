const logger = require('./utils/logger');

/**
 * 初始化WebSocket服务器
 * @param {Object} io - Socket.IO实例
 */
function initializeWebSocketServer(io) {
  logger.info('初始化WebSocket服务器...');
  
  io.on('connection', (socket) => {
    logger.info(`WebSocket客户端已连接: ${socket.id}`);
    
    // 加入房间（可以基于用户ID或其他标识）
    socket.on('join', (data) => {
      const { userId, walletAddress } = data;
      
      if (userId) {
        socket.join(`user_${userId}`);
        logger.info(`用户 ${userId} 加入了WebSocket房间`);
      }
      
      if (walletAddress) {
        socket.join(`wallet_${walletAddress}`);
        logger.info(`钱包 ${walletAddress} 加入了WebSocket房间`);
      }
      
      socket.emit('joined', { success: true, message: '成功加入' });
    });
    
    // 当客户端断开连接
    socket.on('disconnect', () => {
      logger.info(`WebSocket客户端断开连接: ${socket.id}`);
    });
    
    // 处理客户端错误
    socket.on('error', (error) => {
      logger.error(`WebSocket客户端错误: ${error.message}`);
    });
  });
  
  // 设置错误处理
  io.engine.on('connection_error', (err) => {
    logger.error(`WebSocket连接错误: ${err.message}`);
  });
  
  logger.info('WebSocket服务器初始化完成');
  
  return io;
}

module.exports = {
  initializeWebSocketServer
}; 