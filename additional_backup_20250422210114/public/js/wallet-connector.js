/**
 * 钱包连接组件
 * 提供统一的钱包连接功能，可在不同页面复用
 */

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
  }

  async connect() {
    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('请安装MetaMask钱包');
      }

      this.provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await this.provider.send('eth_requestAccounts', []);
      
      if (accounts.length === 0) {
        throw new Error('未获取到钱包地址');
      }

      this.walletAddress = accounts[0];
      this.signer = this.provider.getSigner();
      this.isConnected = true;

      if (this.onConnect) {
        this.onConnect(this.walletAddress);
      }

      // 监听账户变化
      window.ethereum.on('accountsChanged', this.handleAccountsChanged.bind(this));
      // 监听链变化
      window.ethereum.on('chainChanged', this.handleChainChanged.bind(this));
      // 监听断开连接
      window.ethereum.on('disconnect', this.handleDisconnect.bind(this));

      return this.walletAddress;
    } catch (error) {
      console.error('连接钱包失败:', error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  async disconnect() {
    this.provider = null;
    this.signer = null;
    this.walletAddress = null;
    this.isConnected = false;

    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  async checkConnection() {
    try {
      if (typeof window.ethereum === 'undefined') {
        return false;
      }

      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length === 0) {
        return false;
      }

      this.walletAddress = accounts[0];
      this.provider = new ethers.providers.Web3Provider(window.ethereum);
      this.signer = this.provider.getSigner();
      this.isConnected = true;

      return true;
    } catch (error) {
      console.error('检查钱包连接失败:', error);
      return false;
    }
  }

  handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
      this.disconnect();
    } else if (accounts[0] !== this.walletAddress) {
      this.walletAddress = accounts[0];
      if (this.onConnect) {
        this.onConnect(this.walletAddress);
      }
    }
  }

  handleChainChanged() {
    window.location.reload();
  }

  handleDisconnect() {
    this.disconnect();
  }

  getWalletAddress() {
    return this.walletAddress;
  }

  getSigner() {
    return this.signer;
  }

  getProvider() {
    return this.provider;
  }

  isWalletConnected() {
    return this.isConnected;
  }
}

// 导出组件
window.WalletConnector = WalletConnector; 