// Chainlink Functions request handler for PayPal verification

// This source code will be used by the Chainlink Functions service
// and will NOT be deployed on-chain, only its hash is stored on-chain

// 直接返回 Uint8Array 数据，简化代码，避免嵌套函数调用
console.log(`Request received, args:`, request.args);
  
// Arguments passed from the contract call
const [orderId, merchantEmail, amount, lpEmail] = request.args;

// Simple verification logic - in a real implementation, this would call PayPal API
console.log(`Verifying order ${orderId} for merchant ${merchantEmail} with amount ${amount}`);

// 直接返回 Uint8Array 数据，不使用中间变量
return Functions.encodeUint256(1);
