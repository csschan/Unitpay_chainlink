class DebugLogger {
  constructor() {
    this.ws = new WebSocket('ws://localhost:8080');
    
    this.ws.onmessage = (event) => {
      const logData = JSON.parse(event.data);
      console.log('[Backend Log]', logData);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket Connection Closed');
      // 可以在这里添加重连逻辑
      setTimeout(() => this.connect(), 5000);
    };
  }

  connect() {
    if (this.ws.readyState === WebSocket.CLOSED) {
      this.ws = new WebSocket('ws://localhost:8080');
    }
  }
}

export const debugLogger = new DebugLogger();