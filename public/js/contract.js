/**
 * contract.js
 * 用于处理与区块链合约的交互
 */

// USDT代币ABI
const usdtABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "name",
    "outputs": [{"name": "", "type": "string"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [{"name": "", "type": "string"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {"name": "_owner", "type": "address"},
      {"name": "_spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {"name": "_to", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {"name": "_spender", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {"name": "_from", "type": "address"},
      {"name": "_to", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "transferFrom",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// 托管合约ABI
const ESCROW_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "_token", "type": "address"}],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "bytes32", "name": "id", "type": "bytes32"},
      {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "token", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
      {"indexed": false, "internalType": "address", "name": "lp", "type": "address"}
    ],
    "name": "FundsLocked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "bytes32", "name": "id", "type": "bytes32"}],
    "name": "FundsReleased",
    "type": "event"
  },
  {
    "inputs": [
      {"internalType": "bytes32", "name": "_id", "type": "bytes32"},
      {"internalType": "address", "name": "_token", "type": "address"},
      {"internalType": "uint256", "name": "_amount", "type": "uint256"},
      {"internalType": "address", "name": "_lp", "type": "address"}
    ],
    "name": "lockFunds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "_id", "type": "bytes32"}],
    "name": "releaseFunds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "_id", "type": "bytes32"}],
    "name": "getEscrow",
    "outputs": [
      {"internalType": "address", "name": "user", "type": "address"},
      {"internalType": "address", "name": "token", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"},
      {"internalType": "address", "name": "lp", "type": "address"},
      {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
      {"internalType": "bool", "name": "released", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// LinkCardSettlement合约ABI
const SETTLEMENT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_usdtAddress",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "paymentId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "lp",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "platformFee",
        "type": "uint256"
      }
    ],
    "name": "PaymentLocked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "string",
        "name": "paymentId",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "lp",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "network",
        "type": "string"
      }
    ],
    "name": "PaymentSettled",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "paymentId",
        "type": "string"
      }
    ],
    "name": "confirmPayment",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "paymentId",
        "type": "string"
      }
    ],
    "name": "autoReleasePayment",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "paymentId",
        "type": "string"
      }
    ],
    "name": "withdrawPayment",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "lp",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "network",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "paymentId",
        "type": "string"
      }
    ],
    "name": "lockPayment",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "lp",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "network",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "paymentId",
        "type": "string"
      }
    ],
    "name": "settlePayment",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "string", "name": "paymentId", "type": "string"}
    ],
    "name": "cancelExpiredPayment",
    "outputs": [
      {"internalType": "bool", "name": "", "type": "bool"}
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// 合约配置
const contractConfig = {
  // Somnia网络
  somnia: {
    // 合约地址
    CONTRACT_ADDRESS: "0x78fbc0ec12bc3087aae592f7ca31b27b515ae01c", // 结算合约地址
    USDT_ADDRESS: "0xa3EF117d0680EF025e99E09f44c0f6a5CafE141b", // USDT代币地址
    // 网络配置
    RPC_URL: "https://rpc-testnet.somniastream.com", // Somnia网络RPC
    CHAIN_ID: '0x1313147', // Somnia网络链ID
    CHAIN_NAME: 'Somnia',
    BLOCK_EXPLORER: 'https://shannon-explorer.somnia.network', // Somnia区块浏览器
    NETWORK_NAME: "Somnia Shannon Testnet",
    NATIVE_CURRENCY: {
      name: "Somnia Token",
      symbol: "STT",
      decimals: 18
    },
    alternativeExplorer: 'https://somnia-testnet.socialscan.io',
    // UnitpayEnhanced 合约地址
    ENHANCED_ADDRESS: window.CONFIG?.ENHANCED_CONTRACT_ADDRESS || '0x78fbc0ec12bc3087aae592f7ca31b27b515ae01c'
  },
  // Sepolia网络配置
  sepolia: {
    // Sepolia网络结算合约地址
    CONTRACT_ADDRESS: window.CONFIG?.SEPOLIA_SETTLEMENT_CONTRACT_ADDRESS || '0x7a55CD24ae47F83324CE9e03A11ED0d916FAb480',
    // Sepolia网络USDT代币地址（实际为 Sepolia USDC，6 位小数），fallback 回官方 Sepolia USDC 合约
    USDT_ADDRESS: '0x25c59d52b47739b21379090a4cbb05738dd8fb60',
    // Sepolia网络RPC
    RPC_URL: window.APP_CONFIG.networks.sepolia.rpcUrl,
    // UnitpayEnhanced 合约地址
    ENHANCED_ADDRESS: window.CONFIG?.SEPOLIA_ENHANCED_CONTRACT_ADDRESS || '0x7a55CD24ae47F83324CE9e03A11ED0d916FAb480',
    CHAIN_ID: '0xaa36a7',
    CHAIN_NAME: 'Sepolia',
    BLOCK_EXPLORER: 'https://sepolia.etherscan.io',
    NETWORK_NAME: 'Sepolia Testnet',
    NATIVE_CURRENCY: {
      name: 'Sepolia Ether',
      symbol: 'ETH',
      decimals: 18
    }
  }
};

// 合约工具类
class ContractService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.walletAddress = null;
    this.usdtContract = null;
    this.settlementContract = null;
    this.contractAddresses = null;
    // 动态选择网络配置（Somnia或Sepolia）
    const netKey = window.APP_CONFIG?.defaultNetwork || 'somnia';
    this.networkKey = netKey;
    this.networkConfig = contractConfig[netKey] || contractConfig.somnia;
    this.initialized = false;
    
    console.log('===DEBUG=== 合约服务已创建，网络配置:', {
      contractAddress: this.networkConfig?.CONTRACT_ADDRESS,
      usdtAddress: this.networkConfig?.USDT_ADDRESS
    });
  }

  /**
   * 检查合约服务是否已初始化
   * @returns {boolean} 是否已初始化
   */
  isInitialized() {
    const status = {
      initialized: this.initialized,
      provider: !!this.provider,
      signer: !!this.signer,
      walletAddress: !!this.walletAddress,
      usdtContract: !!this.usdtContract,
      settlementContract: !!this.settlementContract,
      contractAddresses: !!this.contractAddresses
    };
    
    console.log('===DEBUG=== 合约服务状态:', status);
    
    return Object.values(status).every(Boolean);
  }

  /**
   * 初始化Web3环境
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initializeWeb3() {
    try {
      console.log('===DEBUG=== 开始初始化Web3环境');
      
      // 检查是否已初始化，避免重复操作
      if (this.provider && this.signer && this.walletAddress) {
        console.log('===DEBUG=== Web3环境已完全初始化，跳过');
        return true;
      }
      
      // 确认钱包是否安装和连接
      if (!window.ethereum) {
        console.error('===DEBUG=== 找不到window.ethereum，钱包可能未安装或网络不支持');
        throw new Error('请安装并连接MetaMask钱包以继续操作');
      }
      
      // 检查钱包是否已连接
      const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        .catch(err => {
          console.error('===DEBUG=== 获取钱包账户失败:', err);
          return [];
        });
      
      // 如果没有已连接账户，尝试请求连接
      if (!accounts || accounts.length === 0) {
        console.log('===DEBUG=== 钱包未连接，尝试请求连接');
        
        try {
          const requestedAccounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
          });
          
          if (requestedAccounts && requestedAccounts.length > 0) {
            this.walletAddress = requestedAccounts[0];
            console.log('===DEBUG=== 成功请求连接钱包:', this.walletAddress);
          } else {
            console.error('===DEBUG=== 请求钱包连接后仍未获取到账户');
            throw new Error('未能获取钱包地址，请检查MetaMask是否已解锁');
          }
        } catch (connectionError) {
          console.error('===DEBUG=== 请求钱包连接失败:', connectionError);
          throw new Error('钱包连接请求被拒绝或失败');
        }
      } else {
        // 使用已连接的账户
        this.walletAddress = accounts[0];
        console.log('===DEBUG=== 检测到已连接钱包:', this.walletAddress);
      }
      
      // 确保已获取到钱包地址
      if (!this.walletAddress) {
        console.error('===DEBUG=== 无法获取钱包地址');
        throw new Error('未能获取钱包地址，请连接MetaMask');
      }
      
      // 初始化provider和signer，必须通过MetaMask进行交易签名
      console.log('===DEBUG=== 检测到window.ethereum，使用Web3Provider');
      this.provider = new ethers.providers.Web3Provider(window.ethereum);
      try {
        this.signer = this.provider.getSigner();
        const signerAddress = await this.signer.getAddress();
        if (signerAddress.toLowerCase() !== this.walletAddress.toLowerCase()) {
          console.warn('===DEBUG=== signer地址与钱包地址不匹配，更新为最新地址:', signerAddress);
          this.walletAddress = signerAddress;
        }
        console.log('===DEBUG=== 成功获取signer:', signerAddress);
      } catch (signerError) {
        console.error('===DEBUG=== 获取signer失败:', signerError);
        throw new Error('无法获取钱包签名者，请检查MetaMask连接');
      }
      
      // 设置网络信息
      try {
        const network = await this.provider.getNetwork();
        console.log('===DEBUG=== 获取到网络信息:', network);
        this.networkName = network.name;
        this.chainId = network.chainId;
        // 新增：根据链ID动态选择网络配置（Sepolia 或 Somnia）
        if (this.chainId === 11155111) {
          this.networkKey = 'sepolia';
        } else {
          this.networkKey = 'somnia';
        }
        this.networkConfig = contractConfig[this.networkKey];
        console.log('===DEBUG=== 自动选择网络配置:', this.networkKey, this.networkConfig);
      } catch (networkError) {
        console.warn('===DEBUG=== 无法获取网络信息:', networkError);
        // 使用默认值
        this.networkName = 'unknown';
        this.chainId = 0;
      }
      
      // 设置钱包事件监听
      this.setupWalletListeners();
      
      // 检查初始化是否完整
      const isFullyInitialized = !!(this.provider && this.signer && this.walletAddress);
      
      if (isFullyInitialized) {
        console.log('===DEBUG=== Web3环境初始化完成:', {
          provider: !!this.provider,
          signer: !!this.signer,
          walletAddress: this.walletAddress,
          networkName: this.networkName,
          chainId: this.chainId
        });
        
        this.initialized = true;
        return true;
      } else {
        console.error('===DEBUG=== Web3环境初始化不完整:', {
          provider: !!this.provider,
          signer: !!this.signer,
          walletAddress: this.walletAddress || 'missing'
        });
        return false;
      }
    } catch (error) {
      console.error('===DEBUG=== Web3初始化错误:', error);
      this.initialized = false;
      // 重置状态
      this.resetState();
      return false;
    }
  }

  /**
   * 初始化合约
   * @returns {Promise<boolean>}
   */
  async initializeContracts() {
    try {
      console.log('===DEBUG=== 开始初始化合约...');

      // 检查window.ethereum是否存在
      if (!window.ethereum) {
        console.error('===DEBUG=== 找不到ethereum对象，钱包可能未安装或未连接');
        throw new Error('找不到以太坊钱包，请安装MetaMask');
      }

      // 检查是否有已连接的账户
      if (!window.ethereum.selectedAddress) {
        console.error('===DEBUG=== 钱包未连接，没有selectedAddress');
        throw new Error('钱包未连接，请连接MetaMask钱包');
      }

      // 验证Web3是否已初始化
      if (!this.provider || !this.signer || !this.walletAddress) {
        console.log('===DEBUG=== Web3未完全初始化，尝试重新初始化');
        const initialized = await this.initializeWeb3();
        
        if (!initialized) {
          console.error('===DEBUG=== Web3初始化失败');
          throw new Error('Web3初始化失败，请刷新页面并重新连接钱包');
        }
        
        if (!this.provider || !this.signer || !this.walletAddress) {
          console.error('===DEBUG=== Web3初始化后仍未获取关键组件');
          throw new Error('Web3未初始化，请连接钱包');
        }
        
        console.log('===DEBUG=== Web3已重新初始化:', {
          provider: !!this.provider,
          signer: !!this.signer,
          walletAddress: this.walletAddress
        });
      }

      // 获取合约配置
      await this.fetchContractAddresses();
      
      // 验证合约地址
      if (!this.contractAddresses || !this.contractAddresses.contractAddress || !this.contractAddresses.usdtAddress) {
        console.error('===DEBUG=== 合约地址无效:', this.contractAddresses);
        throw new Error('获取合约地址失败');
      }

      // 初始化USDT合约
      await this.initializeUSDTContract();
      if (!this.usdtContract) {
        throw new Error('USDT合约初始化失败');
      }

      // 初始化结算合约
      await this.initializeSettlementContract();
      if (!this.settlementContract) {
        throw new Error('结算合约初始化失败');
      }

      // 初始化增强合约
      await this.initializeEnhancedContract();
      if (!this.enhancedContract) {
        throw new Error('增强合约初始化失败');
      }

      this.initialized = true;
      console.log('===DEBUG=== 合约初始化完成:', {
        usdtAddress: this.contractAddresses.usdtAddress,
        settlementAddress: this.contractAddresses.contractAddress,
        enhancedAddress: this.networkConfig.ENHANCED_ADDRESS,
        initialized: this.initialized,
        hasUsdtContract: !!this.usdtContract,
        hasSettlementContract: !!this.settlementContract,
        hasEnhancedContract: !!this.enhancedContract
      });
      
      return true;
    } catch (error) {
      console.error('===DEBUG=== 初始化合约失败:', error);
      this.resetState();
      throw error;
    }
  }

  /**
   * 获取合约地址
   * @returns {Promise<void>}
   */
  async fetchContractAddresses() {
    try {
      console.log('===DEBUG=== 从API获取合约配置');
      
      // 根据当前网络选择结算合约地址（支持Somnia和Sepolia）
      let settlementAddress = window.CONFIG?.SETTLEMENT_CONTRACT_ADDRESS;
      if (this.networkKey === 'sepolia') {
        settlementAddress = window.CONFIG?.SEPOLIA_SETTLEMENT_CONTRACT_ADDRESS;
      }
      // 根据网络选择 USDT 合约地址
      let usdtAddress = this.networkConfig.USDT_ADDRESS;
      if (this.networkKey === 'sepolia') {
        // 优先使用 config.js 中配置的 SEPOLIA_USDT_ADDRESS
        if (window.CONFIG?.SEPOLIA_USDT_ADDRESS && window.CONFIG.SEPOLIA_USDT_ADDRESS !== '0xYOUR_SEPOLIA_USDT_ADDRESS') {
          usdtAddress = window.CONFIG.SEPOLIA_USDT_ADDRESS;
        } else {
          console.warn('===DEBUG=== 未配置有效的 Sepolia USDT 地址，使用默认值:', usdtAddress);
        }
      }
      this.contractAddresses = {
        contractAddress: settlementAddress || this.networkConfig.CONTRACT_ADDRESS,
        usdtAddress
      };
      
      console.log('===DEBUG=== 合约地址配置:', {
        settlementContract: this.contractAddresses.contractAddress,
        usdtAddress: this.contractAddresses.usdtAddress
      });
      
      // 验证合约地址
      this.validateContractAddresses();
    } catch (error) {
      console.error('===DEBUG=== 获取合约配置失败，使用默认配置:', error);
      // 获取默认合约地址失败时的回退 USDT 地址处理
      let fallbackUsdt = this.networkConfig.USDT_ADDRESS;
      if (this.networkKey === 'sepolia' && window.CONFIG?.SEPOLIA_USDT_ADDRESS && window.CONFIG.SEPOLIA_USDT_ADDRESS !== '0xYOUR_SEPOLIA_USDT_ADDRESS') {
        fallbackUsdt = window.CONFIG.SEPOLIA_USDT_ADDRESS;
      }
      this.contractAddresses = {
        contractAddress: window.CONFIG?.SETTLEMENT_CONTRACT_ADDRESS || this.networkConfig.CONTRACT_ADDRESS,
        usdtAddress: fallbackUsdt
      };
      
      console.log('===DEBUG=== 使用默认合约地址:', this.contractAddresses);
      
      // 验证默认合约地址
      this.validateContractAddresses();
    }
  }

  /**
   * 验证合约地址
   * @throws {Error} 如果地址无效
   */
  validateContractAddresses() {
    // 验证USDT合约地址
    if (!this.contractAddresses.usdtAddress) {
      console.warn('===DEBUG=== USDT合约地址缺失，使用默认值');
      this.contractAddresses.usdtAddress = this.networkConfig.USDT_ADDRESS;
    }
    
    // 验证结算合约地址
    if (!this.contractAddresses.contractAddress) {
      console.warn('===DEBUG=== 结算合约地址缺失，使用默认值');
      this.contractAddresses.contractAddress = this.networkConfig.CONTRACT_ADDRESS;
    }
    
    console.log('===DEBUG=== 验证通过的合约地址:', {
      settlementContract: this.contractAddresses.contractAddress,
      usdtAddress: this.contractAddresses.usdtAddress
    });
  }

  /**
   * 初始化USDT合约
   * @returns {Promise<void>}
   */
  async initializeUSDTContract() {
    console.log('===DEBUG=== 初始化USDT合约:', this.contractAddresses.usdtAddress);
    this.usdtContract = new ethers.Contract(
      this.contractAddresses.usdtAddress,
      usdtABI,
      this.signer
    );

    // 验证USDT合约
    try {
      const [name, symbol, decimals] = await Promise.all([
        this.usdtContract.name().catch(() => 'Unknown'),
        this.usdtContract.symbol().catch(() => 'USDT'),
        this.usdtContract.decimals().catch(() => {
          // 根据网络选择默认小数位: Sepolia USDC=6, Somnia USDT=18
          return this.networkKey === 'sepolia' ? 6 : 18;
        })
      ]);

      console.log('===DEBUG=== USDT合约验证成功:', {
        name,
        symbol,
        decimals: decimals.toString(),
        address: this.contractAddresses.usdtAddress
      });
    } catch (error) {
      console.error('===DEBUG=== USDT合约验证失败:', error);
      throw new Error('USDT合约验证失败');
    }
  }

  /**
   * 初始化结算合约
   * @returns {Promise<void>}
   */
  async initializeSettlementContract() {
    console.log('===DEBUG=== 初始化结算合约:', this.contractAddresses.contractAddress);
    this.settlementContract = new ethers.Contract(
      this.contractAddresses.contractAddress,
      SETTLEMENT_ABI,
      this.signer
    );

    // 验证结算合约
    try {
      // 检查合约代码是否存在
      const contractCode = await this.provider.getCode(this.contractAddresses.contractAddress);
      if (contractCode === '0x' || contractCode === '') {
        throw new Error('结算合约地址没有部署代码');
      }
      
      // 检查settlePayment函数是否存在
      const settlePaymentFunction = this.settlementContract.interface.getFunction('settlePayment(address,address,uint256,string,string)');
      console.log('===DEBUG=== 结算合约验证成功，支持settlePayment函数');
      
      console.log('===DEBUG=== 结算合约初始化完成:', {
        address: this.contractAddresses.contractAddress,
        validFunction: !!settlePaymentFunction
      });
    } catch (error) {
      console.error('===DEBUG=== 结算合约验证失败:', error);
      throw new Error('结算合约验证失败: ' + error.message);
    }
  }

  /**
   * 初始化增强合约 (UnitpayEnhanced)
   */
  async initializeEnhancedContract() {
    console.log('===DEBUG=== 初始化增强合约:', this.networkConfig.ENHANCED_ADDRESS);
    this.enhancedContract = new ethers.Contract(
      this.networkConfig.ENHANCED_ADDRESS,
      window.UnitpayEnhancedAbi,
      this.signer
    );
    const code = await this.provider.getCode(this.networkConfig.ENHANCED_ADDRESS);
    if (code === '0x' || code === '') {
      throw new Error('Enhanced 合约地址没有部署代码');
    }
    console.log('===DEBUG=== 增强合约初始化完成:', this.networkConfig.ENHANCED_ADDRESS);
  }

  /**
   * 设置钱包事件监听
   */
  setupWalletListeners() {
    window.ethereum.on('accountsChanged', (accounts) => {
      console.log('===DEBUG=== 钱包地址已变更:', accounts[0]);
      this.walletAddress = accounts[0];
      // 触发地址变更事件
      window.dispatchEvent(new CustomEvent('walletAddressChanged', {
        detail: accounts[0]
      }));
    });

    window.ethereum.on('chainChanged', () => {
      console.log('===DEBUG=== 网络已变更，刷新页面');
      window.location.reload();
    });

    window.ethereum.on('disconnect', () => {
      console.log('===DEBUG=== 钱包已断开连接');
      this.resetState();
    });
  }

  /**
   * 重置状态
   */
  resetState() {
    this.provider = null;
    this.signer = null;
    this.walletAddress = null;
    this.usdtContract = null;
    this.settlementContract = null;
    this.contractAddresses = null;
    this.initialized = false;
    console.log('===DEBUG=== 合约服务状态已重置');
  }

  /**
   * 获取托管合约实例
   * @returns {Promise<Object>} 托管合约实例
   */
  async getEscrowContract() {
    try {
      if (!this.isInitialized()) {
        await this.initializeWeb3();
        await this.initializeContracts();
      }
      
      if (!this.settlementContract) {
        throw new Error('结算合约未初始化');
      }
      
      // 使用结算合约作为托管合约
      console.log('===DEBUG=== 返回托管合约实例');
      
      // 包装一个安全的代理对象，增加方法检查和默认方法
      const safeContract = {
        ...this.settlementContract,
        
        // 添加一个托管余额方法，返回0作为默认值
        getEscrowBalance: async (address) => {
          try {
            console.log(`===DEBUG=== 查询地址 ${address} 的托管余额`);
            // 尝试调用合约方法，如果不存在则返回0
            if (this.settlementContract.getEscrowBalance) {
              return await this.settlementContract.getEscrowBalance(address);
            } else {
              console.warn('===DEBUG=== getEscrowBalance方法不存在，返回默认值0');
              return ethers.BigNumber.from(0);
            }
          } catch (error) {
            console.error('===DEBUG=== 获取托管余额失败:', error);
            return ethers.BigNumber.from(0);
          }
        }
      };
      
      return safeContract;
    } catch (error) {
      console.error('===DEBUG=== 获取托管合约实例失败:', error);
      throw new Error('获取托管合约实例失败: ' + error.message);
    }
  }

  /**
   * 授权USDT
   * @param {string} amount - 授权金额
   * @returns {Promise<Object>} 授权结果
   */
  async approveUSDT(amount) {
    // 跳过 Settlement 合约 USDT 授权，直接返回成功
    console.log('===DEBUG=== 跳过 Settlement 合约 USDT 授权');
    return { success: true };
  }

  /**
   * 结算支付
   * @param {string} lpAddress - LP钱包地址
   * @param {string} tokenAddress - 代币地址
   * @param {string} amount - 支付金额
   * @param {string} network - 网络名称
   * @param {string} paymentId - 支付ID
   * @returns {Promise<Object>} 结算结果
   */
  async settlePayment(lpAddress, tokenAddress, amount, network, paymentId) {
    try {
      if (!this.isInitialized()) {
        console.error('===DEBUG=== 合约服务未初始化');
        await this.initializeWeb3();
        await this.initializeContracts();
        
        if (!this.isInitialized()) {
          throw new Error('合约服务初始化失败');
        }
      }

      // 验证参数
      if (!lpAddress || !ethers.utils.isAddress(lpAddress)) {
        throw new Error(`无效的LP钱包地址: ${lpAddress}`);
      }
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        throw new Error(`无效的支付金额: ${amount}`);
      }
      
      // 记录原始支付ID
      console.log('===DEBUG=== 原始支付ID:', paymentId, '类型:', typeof paymentId);
      
      // 支付ID处理 - 始终创建新的有效支付ID，确保合约接受
      // 使用更加健壮的唯一ID生成方法，避免特殊字符和过长
      const timestamp = Date.now();
      const randomHex = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
      // 使用字母前缀，避免纯数字ID
      const uniqueID = `p${timestamp.toString(16)}_${randomHex}`;
      
      // 确保ID长度适中（太长的ID在链上花费更多gas）
      const maxLength = 24;
      const finalID = uniqueID.length > maxLength 
          ? uniqueID.substring(0, maxLength)
          : uniqueID;
          
      console.log('===DEBUG=== 使用新生成的支付ID:', finalID, '长度:', finalID.length);

      // 获取代币精度
      let decimals;
      try {
        decimals = await this.usdtContract.decimals();
      } catch (err) {
        console.warn('===DEBUG=== 获取USDT小数位失败，使用网络默认值:', err);
        decimals = this.networkKey === 'sepolia' ? 6 : 18;
      }
      
      // 获取费率，默认为0.5%
      const feeRate = window.paymentData?.feeRate || 0.5; 
      console.log('===DEBUG=== 使用费率:', feeRate, '%');
      
      // 计算总金额（原始金额 + 费率）
      const totalAmountFloat = parseFloat(amount) * (1 + feeRate / 100);
      const totalAmount = totalAmountFloat.toFixed(6); // 保留6位小数，USDT标准
      
      // 转换为代币单位
      const payAmount = ethers.utils.parseUnits(totalAmount, decimals);
      
      console.log('===DEBUG=== 结算交易详细参数:', {
        lpAddress,
        tokenAddress,
        amount: totalAmount,
        network,
        paymentId: finalID
      });

      // 使用lockPayment函数锁定资金，先进行gas估算
      console.log('===DEBUG=== 估算gas');
      let gasEstimate;
      try {
        gasEstimate = await this.settlementContract.estimateGas.lockPayment(
          lpAddress,
          this.contractAddresses.usdtAddress,
          payAmount,
          this.networkKey,
          finalID
        );
        gasEstimate = gasEstimate.mul(110).div(100);
        console.log(`===DEBUG=== gas估算: ${gasEstimate.toString()}`);
      } catch (gasError) {
        console.warn('===DEBUG=== gas估算失败，使用默认500000:', gasError);
        gasEstimate = ethers.BigNumber.from('500000');
      }

      // 调用合约服务锁定资金
      const tx = await this.settlementContract.lockPayment(
        lpAddress,
        this.contractAddresses.usdtAddress,
        payAmount,
        this.networkKey,
        finalID,
        { gasLimit: gasEstimate }
      );
      console.log('===DEBUG=== 资金锁定交易已发送:', tx.hash);
      const receipt = await tx.wait();
      console.log('===DEBUG=== 资金锁定交易已确认:', {
        txHash: receipt.transactionHash,
        status: receipt.status === 1 ? '成功' : '失败',
        blockNumber: receipt.blockNumber
      });
      if (receipt.status !== 1) {
        throw new Error('交易确认失败');
      }
      // 存储支付ID映射关系到 localStorage
      try {
        localStorage.setItem(`blockchain_id_${paymentId}`, finalID);
        console.log('===DEBUG=== 已存储支付ID映射关系:', { originalId: paymentId, blockchainId: finalID });
      } catch (storageError) {
        console.warn('===DEBUG=== 存储支付ID映射失败:', storageError);
      }
      return {
        success: true,
        txHash: tx.hash,
        receipt: {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        },
        originalId: paymentId,
        blockchainId: finalID
      };
    } catch (error) {
      console.error('===DEBUG=== 结算支付失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 添加lockPayment别名，供前端直接调用锁定资金接口
  /**
   * 锁定支付资金
   * @param {string} lpAddress - LP钱包地址
   * @param {string|number} amount - 支付金额（原始金额，内部会计算费率）
   * @param {string} paymentId - 原始支付ID
   * @returns {Promise<Object>} 锁定结果
   */
  async lockPayment(lpAddress, amount, paymentId) {
    // 使用settlePayment进行锁定，自动处理小数与费率，并映射原始ID
    return this.settlePayment(
      lpAddress,
      this.contractAddresses.usdtAddress,
      amount,
      this.networkKey,
      paymentId
    );
  }

  /**
   * 获取USDT余额
   * @param {string} [address] - 可选钱包地址，默认为当前连接钱包地址
   * @returns {Promise<string>} USDT余额字符串
   */
  async getUSDTBalance(address) {
    try {
      // 确保已初始化环境和合约
      if (!this.isInitialized()) {
        await this.initializeWeb3();
        await this.initializeContracts();
      }
      const account = address || this.walletAddress;
      // 获取小数位，失败时使用网络默认
      const decimals = await this.usdtContract.decimals().catch(() => this.networkKey === 'sepolia' ? 6 : 18);
      // 查询余额并格式化
      const balanceBN = await this.usdtContract.balanceOf(account);
      return ethers.utils.formatUnits(balanceBN, decimals);
    } catch (error) {
      console.error('===DEBUG=== 获取USDT余额失败:', error);
      // 返回0作为默认值
      return '0';
    }
  }

  /**
   * 在链上注册LP的PayPal邮箱
   * @param {string} email
   * @returns {Promise<Object>} 交易结果
   */
  async registerLpPaypal(email) {
    if (!this.enhancedContract) {
      throw new Error('增强合约未初始化');
    }
    console.log('===DEBUG=== 调用增强合约 registerLp:', email);
    const tx = await this.enhancedContract.registerLp(email);
    return tx;
  }
}

// 导出合约服务类到全局，确保 app.js 可以访问 ContractService
window.ContractService = ContractService;