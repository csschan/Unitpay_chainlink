require('dotenv').config();

/**
 * 系统配置
 */
const config = {
  // ... existing code ...
  
  // 区块链配置
  blockchain: {
    // RPC URL, prefer custom, then Alchemy or Sepolia env vars, fallback to default
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL || process.env.ALCHEMY_SEPOLIA_RPC_URL || process.env.SEPOLIA_RPC_URL || 'https://somnia-rpc.somnia.io',
    
    // 合约地址
    contractAddress: process.env.CONTRACT_ADDRESS || '0x25C7b46fFE961477d014a822c72B81Fc503f9Ef8',
    
    // UnitpayEnhanced 合约地址
    unitpayEnhancedAddress: process.env.UNITPAY_ENHANCED_ADDRESS || '0x25C7b46fFE961477d014a822c72B81Fc503f9Ef8',
    
    // Chainlink Functions configuration
    functionsRouter: process.env.FUNCTIONS_ROUTER,
    functionsSubscriptionId: parseInt(process.env.FUNCTIONS_SUBSCRIPTION_ID || '0'),
    functionsSourceHash: process.env.FUNCTIONS_SOURCE_HASH,
    functionsSecretsHash: process.env.FUNCTIONS_SECRETS_HASH,
    functionsDonId: process.env.FUNCTIONS_DON_ID,
    
    // 私钥 (用于签名交易)
    privateKey: process.env.BLOCKCHAIN_PRIVATE_KEY || '',
    
    // 同步间隔时间（毫秒）
    syncIntervalTime: parseInt(process.env.BLOCKCHAIN_SYNC_INTERVAL || 5 * 60 * 1000),
    
    // 区块确认数
    requiredConfirmations: parseInt(process.env.REQUIRED_CONFIRMATIONS || 12),
    
    // 交易超时时间（毫秒）
    txTimeout: parseInt(process.env.TX_TIMEOUT || 10 * 60 * 1000),
    
    // Gas Price倍数
    gasPriceMultiplier: parseFloat(process.env.GAS_PRICE_MULTIPLIER || 1.1),
    
    // Gas Limit
    gasLimit: parseInt(process.env.GAS_LIMIT || 200000)
  }
};

module.exports = config; 
