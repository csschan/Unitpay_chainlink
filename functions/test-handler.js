// 极简测试处理程序 - 只返回标准的32字节Buffer

function handler(request) {
  // 创建一个32字节的Buffer
  const buffer = Buffer.alloc(32, 0);
  // 最后一个字节设为1
  buffer[31] = 1;
  // 直接返回Buffer
  return buffer;
}

// 导出供本地测试使用
module.exports = handler; 