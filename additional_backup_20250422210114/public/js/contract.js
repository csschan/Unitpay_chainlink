/**
 * contract.js
 * 用于处理与区块链合约的交互
 */

// 合约ABI和地址
const contractABI = [
  // PaymentSettled event
  {
    "anonymous": false,
    "inputs": [
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
        "name": "timestamp",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "paymentId",
        "type": "string"
      }
    ],
    "name": "PaymentSettled",
    "type": "event"
  },
  // settlePayment function
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "lp",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
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
  // batchSettlePayments function
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "lps",
        "type": "address[]"
      },
      {
        "internalType": "uint256[]",
        "name": "amounts",
        "type": "uint256[]"
      },
      {
        "internalType": "string[]",
        "name": "paymentIds",
        "type": "string[]"
      }
    ],
    "name": "batchSettlePayments",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// USDT ABI (只包含我们需要的approve功能)
const usdtABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "approve",
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
        "name": "account",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// 合约配置（部署后需要更新）
const contractConfig = {
  // 测试网络
  testnet: {
    // 合约地址
    CONTRACT_ADDRESS: "0x3317D180BBbC540CaB9B15A62FcB12D68fb2bE08", // 已部署的结算合约地址
    USDT_ADDRESS: "0xa3EF117d0680EF025e99E09f44c0f6a5CafE141b", // 测试网络上的USDT代币地址
    // 网络配置
    RPC_URL: "https://data-seed-prebsc-1-s1.binance.org:8545/", // BSC测试网
    CHAIN_ID: 97, // BSC测试网链ID
    BLOCK_EXPLORER: "https://testnet.bscscan.com" // BSC测试网区块浏览器
  },
  // 主网
  mainnet: {
    // 合约地址
    CONTRACT_ADDRESS: "0x3317D180BBbC540CaB9B15A62FcB12D68fb2bE08", // 需要替换为主网部署的合约地址
    USDT_ADDRESS: "0xa3EF117d0680EF025e99E09f44c0f6a5CafE141b", // 目前使用的USDT代币地址
    // 网络配置
    RPC_URL: "https://bsc-dataseed.binance.org/", // BSC主网
    CHAIN_ID: 56, // BSC主网链ID
    BLOCK_EXPLORER: "https://bscscan.com" // BSC主网区块浏览器
  },
  // Somnia网络
  somnia: {
    // 合约地址
    CONTRACT_ADDRESS: "0x3317D180BBbC540CaB9B15A62FcB12D68fb2bE08", // 已部署的结算合约地址
    USDT_ADDRESS: "0xa3EF117d0680EF025e99E09f44c0f6a5CafE141b", // USDT代币地址
    // 网络配置
    RPC_URL: "https://somnia-rpc.publicnode.com", // Somnia网络RPC
    CHAIN_ID: 2044, // Somnia网络链ID
    BLOCK_EXPLORER: "https://somniaexplorer.com" // Somnia区块浏览器
  }
};

// 合约工具类
class ContractService {
  constructor() {
    this.web3 = null;
    this.contract = null;
    this.usdtContract = null;
    this.walletAddress = null;
    this.networkConfig = null;
    
    // 使用Somnia网络配置
    this.networkConfig = contractConfig.somnia;
  }
  
  /**
   * 初始化Web3连接
   * @returns {Promise<boolean>} 是否成功初始化
   */
  async initWeb3() {
    try {
      // 检查是否已安装MetaMask
      if (window.ethereum) {
        this.web3 = new Web3(window.ethereum);
        console.log("Web3已初始化");
        return true;
      } else if (window.web3) {
        this.web3 = new Web3(window.web3.currentProvider);
        console.log("Web3已初始化（旧版）");
        return true;
      } else {
        console.error("请安装MetaMask或其他Web3钱包");
        return false;
      }
    } catch (error) {
      console.error("初始化Web3失败:", error);
      return false;
    }
  }
  
  /**
   * 连接钱包
   * @returns {Promise<string|null>} 钱包地址或null（如果失败）
   */
  async connectWallet() {
    try {
      if (!this.web3) {
        const initialized = await this.initWeb3();
        if (!initialized) return null;
      }
      
      // 请求用户授权
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      if (accounts && accounts.length > 0) {
        this.walletAddress = accounts[0];
        console.log("钱包已连接:", this.walletAddress);
        
        // 初始化合约实例
        this.initContract();
        
        return this.walletAddress;
      } else {
        console.error("未能获取钱包账户");
        return null;
      }
    } catch (error) {
      console.error("连接钱包失败:", error);
      return null;
    }
  }
  
  /**
   * 初始化合约实例
   */
  initContract() {
    if (!this.web3 || !this.walletAddress) {
      console.error("Web3或钱包未连接，无法初始化合约");
      return;
    }
    
    try {
      // 初始化支付合约
      this.contract = new this.web3.eth.Contract(
        contractABI,
        this.networkConfig.CONTRACT_ADDRESS
      );
      
      // 初始化USDT合约
      this.usdtContract = new this.web3.eth.Contract(
        usdtABI,
        this.networkConfig.USDT_ADDRESS
      );
      
      console.log("合约已初始化");
    } catch (error) {
      console.error("初始化合约失败:", error);
    }
  }
  
  /**
   * 获取USDT余额
   * @returns {Promise<string>} USDT余额（格式化为小数，例如"100.5"）
   */
  async getUSDTBalance() {
    try {
      if (!this.usdtContract || !this.walletAddress) {
        throw new Error("USDT合约未初始化或钱包未连接");
      }
      
      const balance = await this.usdtContract.methods.balanceOf(this.walletAddress).call();
      // USDT有6位小数
      return (balance / 1000000).toFixed(2);
    } catch (error) {
      console.error("获取USDT余额失败:", error);
      return "0.00";
    }
  }
  
  /**
   * 批准USDT合约可以转移用户的代币
   * @param {number} amount USDT金额（例如100.5）
   * @returns {Promise<boolean>} 是否成功授权
   */
  async approveUSDT(amount) {
    try {
      if (!this.usdtContract || !this.walletAddress) {
        throw new Error("USDT合约未初始化或钱包未连接");
      }
      
      // 转换为USDT的最小单位（6位小数）
      const amountInWei = this.web3.utils.toBN(Math.round(amount * 1000000));
      
      // 批准合约可以转移用户的USDT
      const tx = await this.usdtContract.methods
        .approve(this.networkConfig.CONTRACT_ADDRESS, amountInWei)
        .send({ from: this.walletAddress });
      
      console.log("USDT授权成功:", tx.transactionHash);
      return true;
    } catch (error) {
      console.error("USDT授权失败:", error);
      return false;
    }
  }
  
  /**
   * 结算支付
   * @param {string} lpAddress LP的钱包地址
   * @param {number} amount USDT金额（例如100.5）
   * @param {string} paymentId 支付唯一标识ID
   * @returns {Promise<{success: boolean, txHash: string|null}>} 交易结果
   */
  async settlePayment(lpAddress, amount, paymentId) {
    try {
      if (!this.contract || !this.walletAddress) {
        throw new Error("合约未初始化或钱包未连接");
      }
      
      // 验证参数
      if (!this.web3.utils.isAddress(lpAddress)) {
        throw new Error("无效的LP地址");
      }
      
      if (amount <= 0) {
        throw new Error("金额必须大于0");
      }
      
      if (!paymentId || paymentId.trim() === "") {
        throw new Error("支付ID不能为空");
      }
      
      // 转换为USDT的最小单位（6位小数）
      const amountInWei = this.web3.utils.toBN(Math.round(amount * 1000000));
      
      // 调用合约的settlePayment方法
      const tx = await this.contract.methods
        .settlePayment(lpAddress, amountInWei, paymentId)
        .send({ from: this.walletAddress });
      
      console.log("支付结算成功:", tx.transactionHash);
      return {
        success: true,
        txHash: tx.transactionHash
      };
    } catch (error) {
      console.error("支付结算失败:", error);
      return {
        success: false,
        txHash: null,
        error: error.message
      };
    }
  }
  
  /**
   * 批量结算支付
   * @param {string[]} lpAddresses LP的钱包地址数组
   * @param {number[]} amounts 对应的USDT金额数组（例如[100.5, 200.75]）
   * @param {string[]} paymentIds 对应的支付ID数组
   * @returns {Promise<{success: boolean, txHash: string|null}>} 交易结果
   */
  async batchSettlePayments(lpAddresses, amounts, paymentIds) {
    try {
      if (!this.contract || !this.walletAddress) {
        throw new Error("合约未初始化或钱包未连接");
      }
      
      // 验证参数
      if (!lpAddresses || !amounts || !paymentIds || 
          lpAddresses.length === 0 || 
          lpAddresses.length !== amounts.length || 
          lpAddresses.length !== paymentIds.length) {
        throw new Error("参数错误：数组长度不匹配或为空");
      }
      
      // 验证地址和金额
      for (let i = 0; i < lpAddresses.length; i++) {
        if (!this.web3.utils.isAddress(lpAddresses[i])) {
          throw new Error(`无效的LP地址 #${i+1}: ${lpAddresses[i]}`);
        }
        
        if (amounts[i] <= 0) {
          throw new Error(`金额 #${i+1} 必须大于0`);
        }
        
        if (!paymentIds[i] || paymentIds[i].trim() === "") {
          throw new Error(`支付ID #${i+1} 不能为空`);
        }
      }
      
      // 转换为USDT的最小单位（6位小数）
      const amountsInWei = amounts.map(amount => 
        this.web3.utils.toBN(Math.round(amount * 1000000))
      );
      
      // 调用合约的batchSettlePayments方法
      const tx = await this.contract.methods
        .batchSettlePayments(lpAddresses, amountsInWei, paymentIds)
        .send({ from: this.walletAddress });
      
      console.log("批量支付结算成功:", tx.transactionHash);
      return {
        success: true,
        txHash: tx.transactionHash
      };
    } catch (error) {
      console.error("批量支付结算失败:", error);
      return {
        success: false,
        txHash: null,
        error: error.message
      };
    }
  }
  
  /**
   * 查询支付记录数量
   * @returns {Promise<number>} 记录数量
   */
  async getPaymentRecordsCount() {
    try {
      if (!this.contract) {
        throw new Error("合约未初始化");
      }
      
      const count = await this.contract.methods.getPaymentRecordsCount().call();
      return parseInt(count);
    } catch (error) {
      console.error("获取支付记录数量失败:", error);
      return 0;
    }
  }
  
  /**
   * 查询用户支付记录数量
   * @param {string} userAddress 用户地址（默认为当前连接的钱包）
   * @returns {Promise<number>} 记录数量
   */
  async getUserPaymentCount(userAddress = null) {
    try {
      if (!this.contract) {
        throw new Error("合约未初始化");
      }
      
      const address = userAddress || this.walletAddress;
      if (!address) {
        throw new Error("未提供用户地址且钱包未连接");
      }
      
      const count = await this.contract.methods.getUserPaymentCount(address).call();
      return parseInt(count);
    } catch (error) {
      console.error("获取用户支付记录数量失败:", error);
      return 0;
    }
  }
  
  /**
   * 查询LP支付记录数量
   * @param {string} lpAddress LP地址
   * @returns {Promise<number>} 记录数量
   */
  async getLPPaymentCount(lpAddress) {
    try {
      if (!this.contract || !lpAddress) {
        throw new Error("合约未初始化或未提供LP地址");
      }
      
      const count = await this.contract.methods.getLPPaymentCount(lpAddress).call();
      return parseInt(count);
    } catch (error) {
      console.error("获取LP支付记录数量失败:", error);
      return 0;
    }
  }
  
  /**
   * 检查支付ID是否已被使用
   * @param {string} paymentId 支付ID
   * @returns {Promise<boolean>} 是否已使用
   */
  async isPaymentIdUsed(paymentId) {
    try {
      if (!this.contract || !paymentId) {
        throw new Error("合约未初始化或未提供支付ID");
      }
      
      return await this.contract.methods.isPaymentIdUsed(paymentId).call();
    } catch (error) {
      console.error("检查支付ID失败:", error);
      return false;
    }
  }
}

// 导出合约服务实例
const contractService = new ContractService(); 