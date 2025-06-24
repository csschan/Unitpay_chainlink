/**
 * 钱包连接组件
 * 提供统一的钱包连接功能，可在不同页面复用
 */

// 添加缺失的辅助函数
function toHexChainId(chainId) {
  return '0x' + chainId.toString(16);
}

function getNetworkConfig() {
  const defaultNetwork = window.APP_CONFIG.defaultNetwork || 'somnia';
  const netCfg = window.APP_CONFIG.networks[defaultNetwork] || {};
  return {
    chainId: defaultNetwork === 'sepolia' ? 11155111 : undefined,
    chainName: defaultNetwork === 'sepolia' ? 'Sepolia Testnet' : defaultNetwork,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: netCfg.rpcUrl ? [netCfg.rpcUrl] : [],
    blockExplorerUrls: netCfg.explorerBase ? [netCfg.explorerBase] : []
  };
}

function isValidChainId(chainIdHex) {
  const cfg = getNetworkConfig();
  if (!cfg.chainId) return true;
  return chainIdHex === toHexChainId(cfg.chainId);
}

// 钱包连接组件
class WalletConnector {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.walletAddress = null;
    this.isConnected = false;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
    this.onNetworkChange = null;
    this.networkConfig = getNetworkConfig();
  }

  /**
   * 检查并切换到正确的网络
   */
  async checkAndSwitchNetwork() {
    try {
      if (!window.ethereum) {
        throw new Error('未检测到MetaMask');
      }

      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (!isValidChainId(chainId)) {
        console.log('需要切换到正确的网络');
        try {
          // 尝试切换到正确的网络
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: toHexChainId(this.networkConfig.chainId) }],
          });
        } catch (switchError) {
          // 如果网络不存在，添加网络
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: toHexChainId(this.networkConfig.chainId),
                chainName: this.networkConfig.chainName,
                nativeCurrency: this.networkConfig.nativeCurrency,
                rpcUrls: this.networkConfig.rpcUrls,
                blockExplorerUrls: this.networkConfig.blockExplorerUrls
              }],
            });
          } else {
            throw switchError;
          }
        }
      }
      return true;
    } catch (error) {
      console.error('切换网络失败:', error);
      throw error;
    }
  }

  /**
   * 连接钱包
   */
  async connect() {
    // 禁用 OKX Wallet，以保证调用正确的授权弹窗
    console.log('window.ethereum.isOkxWallet:', window.ethereum && window.ethereum.isOkxWallet);
    if (window.ethereum && window.ethereum.isOkxWallet) {
      const err = new Error('暂不支持 OKX Wallet，请使用 MetaMask 或其他钱包');
      console.error('禁用 OKX Wallet:', err);
      if (this.onError) this.onError(err);
      return;
    }
    try {
      if (!window.ethereum) {
        throw new Error('请安装MetaMask钱包');
      }

      // 检查并切换网络
      await this.checkAndSwitchNetwork();

      console.log('调用 eth_requestAccounts 请求');
      let accounts;
      try {
        // 请求连接钱包
        accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        console.log('eth_requestAccounts 返回 accounts:', accounts);
      } catch (reqErr) {
        console.warn('eth_requestAccounts 请求失败，尝试调用 enable():', reqErr);
        if (typeof window.ethereum.enable === 'function') {
          try {
            accounts = await window.ethereum.enable();
            console.log('enable() 返回 accounts:', accounts);
          } catch (enErr) {
            console.error('enable() 调用失败:', enErr);
            throw enErr;
          }
        } else {
          throw reqErr;
        }
      }
      if (!accounts) {
        throw new Error('未能获取钱包地址');
      }

      // 设置钱包地址
      this.walletAddress = accounts[0];
      
      // 使用ethers v5的新API
      this.provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      this.signer = this.provider.getSigner();
      this.isConnected = true;

      // 设置事件监听
      this.setupEventListeners();

      // 触发连接回调
      if (this.onConnect) {
        this.onConnect(this.walletAddress);
      }

      return this.walletAddress;
    } catch (error) {
      console.error('连接钱包失败:', error);
      if (this.onError) {
        this.onError(error);
      }
      // 已通过 onError 处理，阻止 Promise 拒绝以避免 unhandled rejection
      return;
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.provider = null;
    this.signer = null;
    this.walletAddress = null;
    this.isConnected = false;

    // 触发断开连接回调
    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  /**
   * 设置事件监听
   */
  setupEventListeners() {
    if (!window.ethereum) return;

    // 账户变化监听
    window.ethereum.on('accountsChanged', this.handleAccountsChanged.bind(this));
    // 链变化监听
    window.ethereum.on('chainChanged', this.handleChainChanged.bind(this));
    // 断开连接监听
    window.ethereum.on('disconnect', this.handleDisconnect.bind(this));
  }

  /**
   * 处理账户变化
   */
  async handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
      this.disconnect();
    } else {
      this.walletAddress = accounts[0];
      // 更新provider和signer
      this.provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      this.signer = this.provider.getSigner();
      if (this.onConnect) {
        this.onConnect(this.walletAddress);
      }
    }
  }

  /**
   * 处理链变化
   */
  async handleChainChanged(chainId) {
    try {
      if (!isValidChainId(chainId)) {
        await this.checkAndSwitchNetwork();
      }
      // 更新provider和signer
      this.provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      this.signer = this.provider.getSigner();
      if (this.onNetworkChange) {
        this.onNetworkChange(chainId);
      }
    } catch (error) {
      console.error('处理链变化失败:', error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * 处理断开连接
   */
  handleDisconnect() {
    this.disconnect();
  }

  /**
   * 检查钱包连接状态
   */
  async checkConnection() {
    try {
      if (typeof window.ethereum === 'undefined') {
        return false;
      }

      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length === 0) {
        return false;
      }

      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (!isValidChainId(chainId)) {
        return false;
      }

      this.walletAddress = accounts[0];
      this.provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      this.signer = this.provider.getSigner();
      this.isConnected = true;

      return true;
    } catch (error) {
      console.error('检查连接状态失败:', error);
      return false;
    }
  }

  /**
   * 检查是否已连接
   */
  isWalletConnected() {
    return this.isConnected;
  }

  /**
   * 获取钱包地址
   */
  getWalletAddress() {
    return this.walletAddress;
  }

  /**
   * 获取签名者
   */
  getSigner() {
    return this.signer;
  }

  /**
   * 获取Provider
   */
  getProvider() {
    return this.provider;
  }
}

// 导出钱包连接器实例
window.WalletConnector = WalletConnector; 