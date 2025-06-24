// ... existing code ...
const WebSocket = require('ws');
const logger = require('./utils/logger');
const winston = require('winston');

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ port: 8080 });

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
// ... existing code ...