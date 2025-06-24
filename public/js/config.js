// 合约配置
window.CONFIG = {
  API_BASE_URL: '/api',
  // UnitPaySettlementV2合约地址
  SETTLEMENT_CONTRACT_ADDRESS: '0x38A29004d009A093a4350A0F504Dc5591314C651',
  SEPOLIA_SETTLEMENT_CONTRACT_ADDRESS: '0x38A29004d009A093a4350A0F504Dc5591314C651',
  // UnitpayEnhanced 合约地址
  ENHANCED_CONTRACT_ADDRESS: '0x38A29004d009A093a4350A0F504Dc5591314C651',
  SEPOLIA_ENHANCED_CONTRACT_ADDRESS: '0x38A29004d009A093a4350A0F504Dc5591314C651',
  // USDT 代币地址（默认主网）
  USDT_ADDRESS: '0xa3EF117d0680EF025e99E09f44c0f6a5CafE141b',
  // Sepolia USDT 代币地址，请替换为实际在 Sepolia 网络部署的 USDT 合约地址
  SEPOLIA_USDT_ADDRESS: '0x25c59d52b47739b21379090a4cbb05738dd8fb60'
};

// 全局应用配置: 支持 Somnia 和 Sepolia 两套网络
window.APP_CONFIG = {
  // 默认网络，可切换为 'sepolia'
  defaultNetwork: 'sepolia',
  networks: {
    somnia: {
      explorerBase: 'https://shannon-explorer.somnia.network/tx',
      rpcUrl: 'https://dream-rpc.somnia.network',
      chainId: 50312,
      chainName: 'Somnia Shannon Testnet',
      nativeCurrency: {
        name: 'Somnia Token',
        symbol: 'STT',
        decimals: 18
      }
    },
    sepolia: {
      explorerBase: 'https://sepolia.etherscan.io/tx',
      rpcUrl: 'https://rpc.sepolia.org',
      chainId: 11155111,
      chainName: 'Sepolia Testnet',
      nativeCurrency: {
        name: 'ETH',
        symbol: 'ETH',
        decimals: 18
      }
    }
  }
};

// 根据应用默认网络动态覆盖合约地址
if (window.APP_CONFIG.defaultNetwork === 'sepolia') {
  window.CONFIG.ENHANCED_CONTRACT_ADDRESS = window.CONFIG.SEPOLIA_ENHANCED_CONTRACT_ADDRESS;
  window.CONFIG.SETTLEMENT_CONTRACT_ADDRESS = window.CONFIG.SEPOLIA_SETTLEMENT_CONTRACT_ADDRESS;
  window.CONFIG.USDT_ADDRESS = window.CONFIG.SEPOLIA_USDT_ADDRESS;
}

// 监听钱包网络切换，重新加载页面以应用对应网络的合约地址
if (window.ethereum) {
  window.ethereum.on('chainChanged', () => window.location.reload());
}

// Alias for direct contract instantiation in app.js
window.CONFIG.ENHANCED_ADDRESS = window.CONFIG.ENHANCED_CONTRACT_ADDRESS; 
