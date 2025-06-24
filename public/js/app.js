/**
 * UnitPay 前端应用
 * 实现钱包连接、扫码支付和与后端API交互
 */

// 全局变量
let walletAddress = '';
let provider = null;
let signer = null;
let socket = null;
let currentPaymentIntentId = null;
let isWalletConnected = false;  // 新增：用于跟踪钱包连接状态
let DEBUG = false; // 新增：控制是否输出调试信息
let usdtContract = null; // USDT合约实例

// 自定义日志函数，仅在DEBUG为true时输出
function log(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

function logError(...args) {
  if (DEBUG) {
    console.error(...args);
  } else {
    // 非调试模式下也保留错误关键信息，但不包含详细堆栈
    const message = args.map(arg => {
      if (arg instanceof Error) {
        return arg.message;
      }
      if (typeof arg === 'object') {
        return 'Error object';
      }
      return arg;
    }).join(' ');
    console.error('Error occurred:', message);
  }
}

function logWarn(...args) {
  if (DEBUG) {
    console.warn(...args);
  }
}

// DOM元素
const connectWalletBtn = document.getElementById('connect-wallet-btn');
const walletConnectSection = document.getElementById('wallet-connect-section');
const userDashboard = document.getElementById('user-dashboard');
const walletAddressSpan = document.getElementById('wallet-address');
const scanQrBtn = document.getElementById('scan-qr-btn');
const qrFileInput = document.getElementById('qr-file-input');
const qrContent = document.getElementById('qr-content');
const paymentPlatform = document.getElementById('payment-platform');
const paymentAmount = document.getElementById('payment-amount');
const paymentDescription = document.getElementById('payment-description');
const createPaymentBtn = document.getElementById('create-payment-btn');
const paymentForm = document.getElementById('payment-form');
const paymentTasksList = document.getElementById('payment-tasks-list');
const noTasksMessage = document.getElementById('no-tasks-message');
const confirmPaymentModal = new bootstrap.Modal(document.getElementById('confirm-payment-modal'));
const confirmAmount = document.getElementById('confirm-amount');
const confirmReceivedBtn = document.getElementById('confirm-received-btn');
const usdtBalanceSpan = document.getElementById('usdt-balance');
const refreshBalanceBtn = document.getElementById('refresh-balance-btn');

// 实例化钱包连接组件
const walletConnector = new WalletConnector();
window.walletConnector = walletConnector;
walletConnector.onConnect = (address) => {
  walletAddress = address;
  provider = new ethers.providers.Web3Provider(window.ethereum, "any");
  signer = provider.getSigner();
  isWalletConnected = true;
  walletAddressSpan.textContent = address;
  walletConnectSection.classList.add('d-none');
  userDashboard.classList.remove('d-none');
  connectSocket();
  loadUserPaymentTasks();
  initUSDTContract();
};
walletConnector.onError = (error) => {
  alert(error.message || '连接钱包失败');
};

// API基础URL
const API_BASE_URL = 'http://localhost:4000/api';

// 安全的localStorage访问
function safeLocalStorage(operation, key, value) {
  try {
    if (operation === 'get') {
      return localStorage.getItem(key);
    } else if (operation === 'set') {
      localStorage.setItem(key, value);
      return true;
    } else if (operation === 'remove') {
      localStorage.removeItem(key);
      return true;
    }
  } catch (error) {
    console.warn('localStorage访问失败:', error);
    return operation === 'get' ? null : false;
  }
}

// 安全的sessionStorage访问
function safeSessionStorage(operation, key, value) {
  try {
    if (operation === 'get') {
      return sessionStorage.getItem(key);
    } else if (operation === 'set') {
      sessionStorage.setItem(key, value);
      return true;
    } else if (operation === 'remove') {
      sessionStorage.removeItem(key);
      return true;
    }
  } catch (error) {
    console.warn('sessionStorage访问失败:', error);
    return operation === 'get' ? null : false;
  }
}

// 归一化状态：将后端原始状态映射到前端熟悉的UI状态
function normalizeStatus(status) {
  switch (status) {
    case 'paid':
      return 'lp_paid';
    case 'confirmed':
      return 'user_confirmed';
    default:
      return status;
  }
}

// 在初始化过程中确保合约服务和ethers可用
function ensureContractServiceAvailable() {
    if (typeof ContractService === 'undefined') {
        console.error('===DEBUG=== ContractService未定义！');
        alert('合约服务未加载，请刷新页面或检查网络连接。');
        return false;
    }

    if (typeof ethers === 'undefined') {
        console.error('===DEBUG=== ethers库未定义！');
        alert('ethers库未加载，请刷新页面或检查网络连接。');
        return false;
    }

    console.log('===DEBUG=== 合约服务和ethers库已可用');
    return true;
}

/**
 * 显示支付成功消息
 * @param {Object} data - 成功消息数据
 */
function showPaymentSuccessMessage(data) {
  try {
    // 如果没有交易哈希，则不显示
    if (!data || !data.txHash) return;
    
    console.log('显示支付成功信息:', data);
    
    // 获取或创建通知容器
    let notificationContainer = document.getElementById('payment-success-notification');
    if (!notificationContainer) {
      notificationContainer = document.createElement('div');
      notificationContainer.id = 'payment-success-notification';
      notificationContainer.className = 'payment-success-notification';
      document.body.appendChild(notificationContainer);
    }
    
    // 设置显示时间
    let displayTime = new Date();
    if (data.timestamp) {
      try {
        displayTime = new Date(data.timestamp);
      } catch (e) {
        console.error('解析时间戳失败:', e);
      }
    }
    
    // 格式化时间
    const timeString = displayTime.toLocaleString();
    
    // 设置区块浏览器URL
    const explorerUrl = `https://shannon-explorer.somnia.network/tx/${data.txHash}`;
    
    // 创建通知内容
    notificationContainer.innerHTML = `
      <div class="notification-content">
        <div class="success-icon"><i class="fas fa-check-circle"></i></div>
        <div class="notification-text">
          <h5>支付已锁定</h5>
          <p>金额: ${data.amount || 'N/A'} USDT</p>
          <p class="small">
            交易哈希: <a href="${explorerUrl}" target="_blank">${data.txHash.substring(0, 10)}...${data.txHash.substring(data.txHash.length - 8)}</a>
          </p>
          <p class="timestamp">时间: ${timeString}</p>
        </div>
        <button class="close-btn" onclick="this.parentElement.parentElement.remove();">&times;</button>
      </div>
    `;
    
    // 添加自动消失
    setTimeout(() => {
      if (notificationContainer && notificationContainer.parentElement) {
        notificationContainer.remove();
      }
    }, 10000); // 10秒后消失
  } catch (error) {
    console.error('显示支付成功通知失败:', error);
  }
}

// 修改initApp函数以在初始化时恢复交易信息和检查成功消息
async function initApp() {
    try {
        console.log('正在初始化应用...');
        
        // 确保依赖库可用
        if (!ensureContractServiceAvailable()) {
            console.error('依赖库不可用，应用初始化失败');
            return;
        }
        
        // 初始化全局合约服务 - 在所有操作之前确保合约服务存在
        console.log('===DEBUG=== 创建全局合约服务');
        if (!window.contractService) {
            window.contractService = new ContractService();
            console.log('===DEBUG=== 全局合约服务已创建');
        } else {
            console.log('===DEBUG=== 全局合约服务已存在');
        }
        
        // 初始化事件监听器
        initEventListeners();
        
        // 设置钱包事件监听
        setupWalletEventHandlers();
        
        // 检查钱包连接状态
        const alreadyConnected = await walletConnector.checkConnection();
        if (alreadyConnected) {
          walletConnector.onConnect(walletConnector.getWalletAddress());
        }
        
        // 如果已连接钱包，尝试初始化合约服务
        if (walletAddress && window.contractService && !window.contractService.isInitialized()) {
            console.log('===DEBUG=== 初始化全局合约服务的Web3环境');
            await window.contractService.initializeWeb3();
            console.log('===DEBUG=== 合约服务Web3初始化状态:', {
                initialized: window.contractService.isInitialized(),
                provider: !!window.contractService.provider,
                signer: !!window.contractService.signer,
                walletAddress: window.contractService.walletAddress || 'missing'
            });
        }
        
        // 如果已连接钱包，加载用户支付任务
        if (walletAddress) {
            loadUserPaymentTasks();
        }
        
        // 检查是否有成功消息需要显示
        const successData = safeLocalStorage('get', 'paymentSuccessMessage');
        if (successData) {
            try {
                const data = JSON.parse(successData);
                // 只显示最近30分钟内的成功消息
                const messageTime = new Date(data.timestamp);
                const now = new Date();
                const timeDiff = (now - messageTime) / 1000 / 60; // 分钟
                
                if (timeDiff < 30) {
                    // 显示成功消息
                    setTimeout(() => {
                        showPaymentSuccessMessage(data);
                    }, 500); // 延迟显示，确保页面已加载
                }
                
                // 显示后清除消息，避免重复显示
                safeLocalStorage('remove', 'paymentSuccessMessage');
            } catch (e) {
                console.error('解析成功消息失败:', e);
                safeLocalStorage('remove', 'paymentSuccessMessage');
            }
        }
        
        // 尝试恢复交易信息
        setTimeout(() => {
            restoreTransactionDetails();
        }, 1000); // 延迟一秒执行，确保页面其他元素已加载
        
    } catch (error) {
        console.error('初始化应用失败:', error);
    }
}

// 设置钱包事件监听
function setupWalletEventHandlers() {
  if (window.ethereum) {
    // 监听账户变化
    window.ethereum.on('accountsChanged', function (accounts) {
      console.log('钱包账户变化:', accounts);
      if (accounts.length === 0) {
        // 用户断开了连接
        console.log('用户断开了钱包连接');
        walletAddress = null;
        isWalletConnected = false;
        
        // 更新UI
        if (walletAddressSpan) {
          walletAddressSpan.textContent = '';
        }
        if (walletConnectSection) {
          walletConnectSection.classList.remove('d-none');
        }
        if (userDashboard) {
          userDashboard.classList.add('d-none');
        }
      } else {
        // 用户切换了账户
        walletAddress = accounts[0];
        console.log('钱包地址已更新:', walletAddress);
        
        // 更新UI
        if (walletAddressSpan) {
          walletAddressSpan.textContent = walletAddress;
        }
        
        // 重新加载任务
        loadUserPaymentTasks();
        
        // 更新USDT余额
        if (typeof initUSDTContract === 'function') {
          initUSDTContract();
        }
      }
    });
    
    // 监听链ID变化
    window.ethereum.on('chainChanged', function (chainId) {
      console.log('网络链ID变化:', chainId);
      // 网络变化时建议刷新页面以避免状态不一致
      window.location.reload();
    });
  }
}

// 初始化事件监听器
function initEventListeners() {
  // 连接钱包按钮
  if (connectWalletBtn) {
    console.log('设置连接钱包按钮点击事件...');
    
    // 移除可能存在的事件监听器（避免多次触发）
    connectWalletBtn.removeEventListener('click', handleConnectWalletClick);
    
    // 添加新的事件监听器
    connectWalletBtn.addEventListener('click', handleConnectWalletClick);
  } else {
    console.error('找不到连接钱包按钮!');
  }
  
  // 扫描二维码按钮
  if (scanQrBtn) {
    scanQrBtn.addEventListener('click', () => qrFileInput.click());
  }
  
  // 二维码文件输入
  if (qrFileInput) {
    qrFileInput.addEventListener('change', handleQrFileSelect);
  }
  
  // 创建支付按钮
  if (createPaymentBtn) {
    createPaymentBtn.addEventListener('click', createPaymentIntent);
  }
  
  // 原始的确认收到按钮 - 恢复原来的监听器
  if (confirmReceivedBtn) {
    confirmReceivedBtn.addEventListener('click', function(event) {
      // 阻止默认事件
      event.preventDefault();
      
      // 获取支付ID
      let paymentId = currentPaymentIntentId;
      
      // 如果没有当前支付ID，尝试从按钮属性获取
      if (!paymentId && this.getAttribute('data-payment-id')) {
        paymentId = this.getAttribute('data-payment-id');
      }
      
      if (!paymentId) {
        showErrorMessage('找不到支付ID，无法确认支付');
        return;
      }
      
      // 先检查状态是否允许确认
      const cachedStatus = localStorage.getItem(`payment_status_name_${paymentId}`);
      if (cachedStatus) {
        if (['CONFIRMED', 'RELEASED', 'CANCELLED', '2', '3', '4'].includes(cachedStatus)) {
          const statusMap = {
            'CONFIRMED': '已确认',
            '2': '已确认',
            'RELEASED': '已释放',
            '3': '已释放',
            'CANCELLED': '已取消',
            '4': '已取消'
          };
          
          showErrorMessage(`此支付已${statusMap[cachedStatus] || '处理完毕'}，无需再次确认`);
          
          // 提示是否刷新
          setTimeout(() => {
            if (confirm('状态信息可能已过期，是否刷新最新状态？')) {
              refreshPaymentStatus(paymentId);
            }
          }, 500);
          
          return;
        }
      }
      
      // 确认用户意图
      if (confirm('确定要确认此支付吗？确认后资金将解锁给收款方。')) {
        confirmPaymentReceived(event);
      }
    });
  }
  
  // 确认支付按钮 - 可能在其他页面出现的确认按钮
  const otherConfirmButtons = document.querySelectorAll('#confirmPaymentBtn, .confirm-payment-btn:not(#confirmReceivedBtn)');
  otherConfirmButtons.forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      
      // 获取支付ID
      let paymentId = currentPaymentIntentId;
      
      // 如果按钮有data-payment-id属性，优先使用
      if (this.getAttribute('data-payment-id')) {
        paymentId = this.getAttribute('data-payment-id');
      } 
      // 从模态框获取
      else if (document.getElementById('confirmPaymentModal') && 
               document.getElementById('confirmPaymentModal').getAttribute('data-payment-id')) {
        paymentId = document.getElementById('confirmPaymentModal').getAttribute('data-payment-id');
      }
      
      if (!paymentId) {
        showErrorMessage('找不到支付ID，无法确认支付');
        return;
      }
      
      // 先检查状态是否允许确认
      const cachedStatus = localStorage.getItem(`payment_status_name_${paymentId}`);
      if (cachedStatus) {
        if (['CONFIRMED', 'RELEASED', 'CANCELLED', '2', '3', '4'].includes(cachedStatus)) {
          const statusMap = {
            'CONFIRMED': '已确认',
            '2': '已确认',
            'RELEASED': '已释放',
            '3': '已释放',
            'CANCELLED': '已取消',
            '4': '已取消'
          };
          
          showErrorMessage(`此支付已${statusMap[cachedStatus] || '处理完毕'}，无需再次确认`);
          
          // 提示是否刷新
          setTimeout(() => {
            if (confirm('状态信息可能已过期，是否刷新最新状态？')) {
              refreshPaymentStatus(paymentId);
            }
          }, 500);
          
          return;
        }
      }
      
      // 确认用户意图
      if (confirm('确定要确认此支付吗？确认后资金将解锁给收款方。')) {
        // 将当前支付ID设为全局变量，供confirmPaymentReceived使用
        currentPaymentIntentId = paymentId;
        confirmPaymentReceived(e);
      }
    });
  });
  
  // 刷新余额按钮
  refreshBalanceBtn.addEventListener('click', loadUSDTBalance);
  
  // 支付平台选择变更事件
  paymentPlatform.addEventListener('change', function() {
    const paypalEmailField = document.getElementById('paypal-email-field');
    if (this.value === 'PayPal') {
      paypalEmailField.style.display = 'block';
    } else {
      paypalEmailField.style.display = 'none';
    }
  });
  
  // LP选择下拉框事件监听
  const lpSelect = document.getElementById('lp-select');
  if (lpSelect) {
    lpSelect.addEventListener('change', function() {
      const rateField = document.getElementById('rate-field');
      const feeRateInput = document.getElementById('fee-rate');
      
      if (this.value === 'auto') {
        // 系统自动匹配LP时，费率设置更重要，可以高亮显示
        rateField.classList.add('highlight-field');
        feeRateInput.setAttribute('required', 'required');
      } else {
        // 选择了特定LP时，费率字段仍然显示但不高亮
        rateField.classList.remove('highlight-field');
        feeRateInput.removeAttribute('required');
      }
    });
    
    // 初始化加载LP列表
    loadLPList();
    
    // 触发change事件以更新UI
    lpSelect.dispatchEvent(new Event('change'));
  }
}

// 连接钱包
async function connectWallet(autoConnect = false) {
  try {
    // 检查是否安装了MetaMask
    if (window.ethereum) {
      try {
        // 用户手势下发起连接请求
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        // 创建provider并获取signer
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        
        if (accounts && accounts.length > 0) {
          walletAddress = accounts[0];
          isWalletConnected = true;  // 更新连接状态
          
          // 获取signer
          signer = provider.getSigner();
          
          // 更新UI
          walletAddressSpan.textContent = walletAddress;
          walletConnectSection.classList.add('d-none');
          userDashboard.classList.remove('d-none');
          
          // 连接Socket.io
          connectSocket();
          
          // 加载用户支付任务
          loadUserPaymentTasks();
          
          // 加载USDT余额
          initUSDTContract();
          
      return true;
        } else {
          throw new Error('未能获取钱包地址');
        }
      } catch (web3Error) {
        console.error('Web3连接错误:', web3Error);
        if (!autoConnect) {
          // 提供更友好的错误信息
          if (web3Error.code === 4001) {
            alert('用户拒绝了连接请求');
          } else if (web3Error.code === -32002) {
            alert('连接请求已挂起，请检查钱包');
          } else {
            alert('连接钱包时发生错误: ' + (web3Error.message || '未知错误'));
          }
        }
    return false;
      }
    } else {
      if (!autoConnect) {
        alert('请安装MetaMask钱包插件');
      }
      return false;
    }
  } catch (error) {
    console.error('连接钱包失败:', error);
    if (!autoConnect) {
      alert('连接钱包失败: ' + error.message);
    }
    return false;
  }
}

// 检查钱包连接状态
async function checkWalletConnection() {
  try {
    if (typeof window.ethereum !== 'undefined') {
      try {
        // 创建provider
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        
        const accounts = await provider.send('eth_accounts', []);
        if (accounts && accounts.length > 0) {
          walletAddress = accounts[0];
          isWalletConnected = true;  // 更新连接状态
          console.log('检测到已连接的钱包:', walletAddress);
          
          // 获取signer
          signer = provider.getSigner();
          
          // 更新UI
          walletAddressSpan.textContent = walletAddress;
          walletConnectSection.classList.add('d-none');
          userDashboard.classList.remove('d-none');
          
          // 初始化合约服务
          console.log('===DEBUG=== 初始化全局合约服务');
          if (!window.contractService) {
            window.contractService = new ContractService();
          }
          
          // 确保合约服务初始化
          if (!window.contractService.isInitialized()) {
            console.log('===DEBUG=== 执行合约服务初始化');
            await window.contractService.initializeWeb3();
            
            // 记录初始化状态
            console.log('===DEBUG=== 合约服务初始化状态:', {
              initialized: window.contractService.isInitialized(),
              provider: !!window.contractService.provider,
              signer: !!window.contractService.signer,
              walletAddress: window.contractService.walletAddress
            });
          } else {
            console.log('===DEBUG=== 合约服务已初始化');
          }
          
          // 连接Socket.io
          connectSocket();
          
          // 加载用户支付任务
          loadUserPaymentTasks();
          
          // 加载USDT余额
          initUSDTContract();
        } else {
          isWalletConnected = false;  // 更新连接状态
        }
      } catch (web3Error) {
        console.error('检查钱包状态时发生Web3错误:', web3Error);
        isWalletConnected = false;  // 更新连接状态
      }
    } else {
      isWalletConnected = false;  // 更新连接状态
    }
  } catch (error) {
    console.error('检查钱包连接状态失败:', error);
    isWalletConnected = false;  // 更新连接状态
  }
}

// 连接Socket.io
function connectSocket() {
  // 创建Socket连接
  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true
  });
  
  // 连接成功事件
  socket.on('connect', () => {
    console.log('Socket.io连接成功');
    
    // 发送钱包连接事件
    socket.emit('wallet_connect', {
      walletAddress,
      userType: 'user'
    });
  });

  // 连接错误事件
  socket.on('connect_error', (error) => {
    console.error('Socket.io连接错误:', error);
  });

  // 重连尝试事件
  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`Socket.io正在尝试重连(第${attemptNumber}次)`);
  });

  // 重连成功事件
  socket.on('reconnect', (attemptNumber) => {
    console.log(`Socket.io重连成功(第${attemptNumber}次)`);
  });

  // 重连失败事件
  socket.on('reconnect_failed', () => {
    console.error('Socket.io重连失败，已达到最大重试次数');
  });
  
  // 监听LP已支付事件
  socket.on('payment_intent_lp_paid', (data) => {
    console.log('收到LP已支付通知:', data);
    
    // 更新任务状态
    updateTaskStatus(data.id, data.status);
    
    // 显示确认模态框
    showConfirmModal(data.id);
  });
  
  // 监听结算成功事件
  socket.on('settlement_success', (data) => {
    console.log('结算成功:', data);
    
    // 更新任务状态
    updateTaskStatus(data.paymentIntentId, 'settled');
    
    // 获取任务详情并显示成功界面
    fetch(`${API_BASE_URL}/payment-intents/${data.paymentIntentId}`)
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          const paymentIntent = result.data;
          // 显示交易成功界面
          showTransactionProcessingModal({
            status: 'success',
            message: '支付已成功结算',
            lpAddress: paymentIntent.lp.walletAddress,
            amount: paymentIntent.amount,
            txHash: data.txHash
          });
        }
      })
      .catch(error => {
        console.error('获取支付详情失败:', error);
        // 显示简化版成功界面
        showTransactionProcessingModal({
          status: 'success',
          message: '支付已成功结算',
          txHash: data.txHash
        });
      });
  });
  
  // 监听结算失败事件
  socket.on('settlement_failed', (data) => {
    console.log('结算失败:', data);
    
    // 显示失败界面
    showTransactionProcessingModal({
      status: 'error',
      message: `结算失败: ${data.error}`,
      paymentIntentId: data.paymentIntentId
    });
  });
  // 监听订单过期事件
  socket.on('payment_intent_expired', (data) => {
    console.log('收到订单过期通知:', data);
    updateTaskStatus(data.id, data.status);
  });
  
  // 断开连接事件
  socket.on('disconnect', () => {
    console.log('Socket.io连接断开');
  });
}

// 处理二维码文件选择
function handleQrFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // 创建canvas用于解析二维码
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      context.drawImage(img, 0, 0, img.width, img.height);
      
      // 获取图像数据
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      // 使用jsQR解析二维码
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        // 显示二维码内容
        qrContent.value = code.data;
        
        // 尝试识别支付平台
        identifyPaymentPlatform(code.data);
        
        // 显示支付表单
        paymentForm.classList.remove('d-none');
      } else {
        alert('无法识别二维码，请尝试其他图片');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  
  // 重置文件输入，以便可以重新选择同一文件
  event.target.value = '';
}

// 识别支付平台
function identifyPaymentPlatform(content) {
  let platform = 'Unknown';
  let amount = null;
  let paypalEmail = null;
  
  try {
    // 尝试解析JSON格式
    if (content.startsWith('{') && content.endsWith('}')) {
      const data = JSON.parse(content);
      if (data.p) {
        // 平台代码映射
        const platformMap = {
          'W': 'WeChat',
          'A': 'Alipay',
          'G': 'GCash',
          'P': 'PayPal'
        };
        platform = platformMap[data.p] || 'Other';
        if (data.v) {
          amount = parseFloat(data.v);
        }
        // 提取PayPal邮箱 (支持 data.email 或 data.a 字段)
        if (data.email || data.a) {
          paypalEmail = data.email || data.a;
        }
      }
    } else {
      // URL格式识别
      if (content.includes('paypal.com')) {
        platform = 'PayPal';
        
        // 尝试从URL中提取PayPal邮箱
        const emailMatch = content.match(/paypal_email=([^&]+)/i) || 
                         content.match(/receiver=([^&]+)/i) || 
                         content.match(/merchantEmail=([^&]+)/i);
        if (emailMatch) {
          paypalEmail = decodeURIComponent(emailMatch[1]);
        }
      } else if (content.includes('gcash.com') || content.includes('gcash.ph')) {
        platform = 'GCash';
      } else if (content.includes('alipay.com')) {
        platform = 'Alipay';
      } else if (content.includes('weixin.qq.com') || content.includes('wechat.com')) {
        platform = 'WeChat';
  } else {
        platform = 'Other';
      }
      
      // 尝试从URL中提取金额
      const amountMatch = content.match(/amount=([^&]+)/i) || 
                         content.match(/value=([^&]+)/i) || 
                         content.match(/price=([^&]+)/i);
      if (amountMatch) {
        amount = parseFloat(amountMatch[1]);
      }
    }
    
    // 设置支付平台
    paymentPlatform.value = platform;
    
    // 触发change事件，以便根据平台显示/隐藏相关字段
    paymentPlatform.dispatchEvent(new Event('change'));
    
    // 如果是PayPal平台并且找到了邮箱，自动填充PayPal邮箱
    if (platform === 'PayPal' && paypalEmail) {
      const merchantPaypalEmail = document.getElementById('merchant-paypal-email');
      if (merchantPaypalEmail) {
        merchantPaypalEmail.value = paypalEmail;
      }
    }
    
    // 如果找到金额，自动填充
    if (amount && !isNaN(amount) && amount > 0) {
      paymentAmount.value = amount.toFixed(2);
    }
    
    console.log('识别结果:', { platform, amount, paypalEmail });
    return platform;
  } catch (error) {
    console.error('识别支付平台失败:', error);
    platform = 'Other';
    paymentPlatform.value = platform;
    // 触发change事件
    paymentPlatform.dispatchEvent(new Event('change'));
    return platform;
  }
}

/**
 * 显示消息提示
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型 (success, error, warning, info)
 */
function showMessage(message, type = 'info') {
  try {
    console.log(`显示${type}消息:`, message);
    
    // 检查是否已有消息容器
    let messageContainer = document.getElementById('app-message-container');
    if (!messageContainer) {
      // 创建消息容器
      messageContainer = document.createElement('div');
      messageContainer.id = 'app-message-container';
      messageContainer.style.position = 'fixed';
      messageContainer.style.top = '20px';
      messageContainer.style.right = '20px';
      messageContainer.style.zIndex = '9999';
      document.body.appendChild(messageContainer);
    }
    
    // 创建消息元素
    const messageElement = document.createElement('div');
    messageElement.className = `alert alert-${type} alert-dismissible fade show`;
    messageElement.style.minWidth = '300px';
    messageElement.style.marginBottom = '10px';
    messageElement.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    
    // 设置消息内容
    messageElement.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // 添加到容器
    messageContainer.appendChild(messageElement);
    
    // 设置自动消失
    setTimeout(() => {
      if (messageElement && messageElement.parentNode) {
        // 使用Bootstrap淡出效果 (如果可用)
        if (typeof bootstrap !== 'undefined' && bootstrap.Alert) {
          const bsAlert = new bootstrap.Alert(messageElement);
          bsAlert.close();
        } else {
          // 否则直接移除
          messageElement.parentNode.removeChild(messageElement);
        }
      }
    }, 5000);
    
  } catch (error) {
    console.error('显示消息失败:', error);
  }
}

/**
 * 显示错误消息 - 便捷函数
 * @param {string} message - 错误消息
 */
function showErrorMessage(message) {
  showMessage(message, 'danger');
}

// 在支付意图创建成功后处理
async function handlePaymentIntent(paymentData) {
  try {
    console.log('===DEBUG=== 处理创建的支付意图:', paymentData);
    
    // 保存支付ID
    currentPaymentIntentId = paymentData.id || paymentData.paymentIntentId;
    
    // 保存支付数据到全局变量
    window.paymentData = paymentData;
    // 保留用户输入的 LP 费率，优先使用前端费率输入
    const uiFeeRate = document.getElementById('fee-rate')?.value;
    if (uiFeeRate) {
      paymentData.feeRate = parseFloat(uiFeeRate);
    }
    try {
      localStorage.setItem('paymentData', JSON.stringify(paymentData));
      console.log('===DEBUG=== 支付数据已保存到localStorage');
    } catch (e) {
      console.error('===DEBUG=== 保存支付数据失败:', e);
    }
    
    // 如果在订单详情页，显示订单详情
    if (window.location.pathname === '/payment-detail') {
      showPaymentDetails(paymentData);
    }
    
    // 自动执行智能合约托管处理
    console.log('===DEBUG=== 自动执行区块链托管处理');
    await startBlockchainProcess();
    return true;
  } catch (error) {
    console.error('===DEBUG=== 处理支付意图失败:', error);
    showMessage(error.message || '处理支付意图失败', 'error');
    return false;
  }
}

async function createPaymentIntent() {
  try {
    // 确保钱包已连接，同步在用户点击按钮时发起请求
    if (!isWalletConnected) {
      const connected = await walletConnector.connect();
      if (!connected) {
        throw new Error('请先连接钱包以继续操作');
      }
    }
    // 禁用按钮，防止重复提交
    createPaymentBtn.disabled = true;
    createPaymentBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 处理中...';

    // 验证输入
    const qrContent = document.getElementById('qr-content').value;
    const amount = document.getElementById('payment-amount').value;
    const platform = document.getElementById('payment-platform').value;
    const description = document.getElementById('payment-description').value || '';
    
    if (!qrContent || !amount || !walletAddress) {
      throw new Error('请填写完整的支付信息');
    }

    // 验证金额
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      throw new Error('请输入有效的支付金额');
    }

    // 获取LP地址
    const lpSelect = document.getElementById('lp-select');
    let lpAddress = null;
    
    if (lpSelect && lpSelect.value && lpSelect.value !== 'auto') {
      lpAddress = lpSelect.value;
      console.log('===DEBUG=== 使用选择的LP地址:', lpAddress);
    } else {
      console.log('===DEBUG=== 没有选择LP地址，将使用后端自动匹配');
    }

    // 准备请求数据
    const data = {
      qrCodeContent: qrContent,
      amount: paymentAmount,
      walletAddress: walletAddress,
      platform,
      description
    };
    
    // 如果选择了LP，添加到请求数据
    if (lpAddress) {
      data.lpAddress = lpAddress;
      
      // 获取费率
      const feeRateInput = document.getElementById('fee-rate');
      if (feeRateInput && feeRateInput.value) {
        const feeRate = parseFloat(feeRateInput.value);
        if (!isNaN(feeRate) && feeRate >= 0) {
          data.feeRate = feeRate;
          console.log('===DEBUG=== 包含费率:', feeRate, '%');
        }
      } else {
        // 尝试从选中的LP选项获取费率
        const lpSelect = document.getElementById('lp-select');
        if (lpSelect) {
          const selectedOption = lpSelect.options[lpSelect.selectedIndex];
          if (selectedOption && selectedOption.getAttribute('data-fee-rate')) {
            const feeRate = parseFloat(selectedOption.getAttribute('data-fee-rate'));
            if (!isNaN(feeRate) && feeRate >= 0) {
              data.feeRate = feeRate;
              console.log('===DEBUG=== 从LP选项获取费率:', feeRate, '%');
            }
          }
        }
      }
    }
    
    // 如果是PayPal，检查并添加商家邮箱
    if (platform === 'PayPal') {
      const merchantEmail = document.getElementById('merchant-paypal-email')?.value;
      if (merchantEmail) {
        data.merchantPaypalEmail = merchantEmail;
      } else {
        // 解析二维码中的邮箱
        const extractedEmail = extractPayPalEmail(qrContent);
        if (extractedEmail) {
          data.merchantPaypalEmail = extractedEmail;
        } else {
          throw new Error('PayPal支付需要商家邮箱');
        }
      }
    }

    // 在创建支付意图前，先进行 USDT 授权（含LP费率）
    showMessage('正在授权USDT，请在钱包中确认', 'info');
    // 初始化合约服务实例
    if (!window.contractService) {
      window.contractService = new ContractService();
    }
    // 初始化 Web3 和合约
    await window.contractService.initializeWeb3();
    await window.contractService.initializeContracts();
    // 计算需要授权的 USDT 金额 = 订单金额 + LP 费率
    const originalAmount = data.amount;
    const feeRate = data.feeRate || 0;
    const totalAmount = originalAmount * (1 + feeRate / 100);
    console.log(`===DEBUG=== 授权USDT金额（含LP费率）: ${totalAmount}`);
    // 授权金额为总额（含LP费率），保留6位小数
    const approveAmount = totalAmount.toFixed(6);
    console.log(`===DEBUG=== 授权USDT金额（含LP费率）: ${approveAmount}`);
    const approveResult = await window.contractService.approveUSDT(approveAmount);
    if (!approveResult.success) {
      throw new Error(approveResult.error || 'USDT授权失败');
    }
    showMessage('USDT授权成功', 'success');

    console.log('===DEBUG=== 创建支付意图请求数据:', data);
    
    // 发送请求创建支付意图
    const response = await fetch(`${API_BASE_URL}/payment-intents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    // 解析响应
    const result = await response.json();
    console.log('===DEBUG=== 支付意图创建响应:', result);

    // 处理错误
    if (!response.ok || !result.success) {
      throw new Error(result.message || '创建支付意图失败');
    }

    // 成功创建支付意图
    showMessage('支付意图创建成功', 'success');
    
    // 清空表单并刷新任务列表，立即反映新订单
    if (paymentForm) paymentForm.classList.add('d-none');
    qrContent.value = '';
    paymentAmount.value = '';
    paymentDescription.value = '';
    const merchantInput = document.getElementById('merchant-paypal-email');
    if (merchantInput) merchantInput.value = '';
    paymentPlatform.value = 'PayPal';
    paymentPlatform.dispatchEvent(new Event('change'));
    loadUserPaymentTasks();

    // 处理支付意图并启动链上托管流程
    await handlePaymentIntent(result.data);
  } catch (error) {
    console.error('创建支付意图失败:', error);
    showMessage(error.message || '创建支付意图失败', 'error');
  } finally {
    // 无论成功还是失败，都重置按钮状态
    createPaymentBtn.disabled = false;
    createPaymentBtn.textContent = '创建支付';
  }
}

// 从PayPal链接中提取邮箱
function extractPayPalEmail(text) {
  try {
    // 检查是否是JSON格式
    if (text.startsWith('{') && text.endsWith('}')) {
      const data = JSON.parse(text);
      // 支持 data.email、data.paypalEmail、data.receiver 或 data.a
      return data.email || data.paypalEmail || data.receiver || data.a || null;
    }
    
    // 检查是否是URL格式
    if (text.startsWith('http')) {
      try {
        const url = new URL(text);
        return url.searchParams.get('paypalEmail') || 
               url.searchParams.get('receiver') || 
               url.searchParams.get('merchantEmail') || 
               url.searchParams.get('paypal_email');
      } catch (e) {
        // URL解析失败，尝试正则匹配
        const emailMatch = text.match(/paypal_email=([^&]+)/i) || 
                         text.match(/receiver=([^&]+)/i) || 
                         text.match(/merchantEmail=([^&]+)/i);
        if (emailMatch) {
          return decodeURIComponent(emailMatch[1]);
        }
      }
    }
    
    // 直接搜索邮箱格式
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const emailMatch = text.match(emailRegex);
    if (emailMatch) {
      return emailMatch[0];
    }
    
    return null;
  } catch (e) {
    console.error('提取PayPal邮箱失败:', e);
    return null;
  }
}

// 加载用户支付任务
async function loadUserPaymentTasks() {
  try {
    console.log('加载用户支付任务，钱包地址:', walletAddress);
    
    // 发送请求 - 修复API路径为复数形式
    const response = await fetch(`${API_BASE_URL}/payment-intents/user/${walletAddress}`);
    const result = await response.json();
    
    console.log('加载任务结果:', result);
    
    if (result.success) {
      // 清空任务列表
      paymentTasksList.innerHTML = '';
      
      const rawTasks = result.data.paymentIntents;
      console.log('任务列表 (原始):', rawTasks);
      const tasks = Array.isArray(rawTasks) ? rawTasks.map(task => {
        const history = Array.isArray(task.statusHistory) ? task.statusHistory : [];
        if (history.length > 0) {
          const lastEntry = history[history.length - 1];
          task.status = lastEntry.status || lastEntry.mainStatus || task.status;
        }
        return task;
      }) : [];
      console.log('任务列表 (处理后):', tasks);
      
      if (tasks.length === 0) {
        // 显示无任务消息
        noTasksMessage.classList.remove('d-none');
      } else {
        // 隐藏无任务消息
        noTasksMessage.classList.add('d-none');
        
        // 直接使用数据库返回的任务列表展示，无需单条详情查询
        tasks.forEach(task => addTaskToList(task));
      }
    } else {
      console.error('加载任务失败:', result.message);
    }
  } catch (error) {
    console.error('加载任务失败:', error);
  }
}

// 添加任务到列表
function addTaskToList(task) {
  const uiStatus = normalizeStatus(task.status);
  const taskElement = document.createElement('div');
  taskElement.className = 'list-group-item';
  taskElement.id = `task-${task.id}`;
  
  // 获取状态标签样式
  const statusBadgeClass = getStatusBadgeClass(uiStatus);
  
  // 格式化创建时间
  const createdAt = new Date(task.createdAt).toLocaleString();
  
  // 获取LP钱包地址信息
  const lpAddress = task.lpWalletAddress ? 
    `<p class="mb-1">LP Wallet Address: <small class="text-muted">${task.lpWalletAddress}</small></p>` : 
    '';
  
  taskElement.innerHTML = `
    <div class="d-flex w-100 justify-content-between">
      <h5 class="mb-1">${task.platform} Payment</h5>
      <small>${createdAt}</small>
    </div>
    <p class="mb-1">Task ID: ${task.id}</p>
    <p class="mb-1">Amount: ${task.amount} ${task.currency}</p>
    <p class="mb-1">Description: ${task.description || 'None'}</p>
    <p class="mb-1">Merchant PayPal Email: ${task.merchantPaypalEmail || (task.merchantInfo && task.merchantInfo.paypalEmail) || 'Not Set'}</p>
    ${lpAddress}
    <div class="d-flex justify-content-between align-items-center">
      <span class="badge ${statusBadgeClass}">${getStatusText(uiStatus)}</span>
      <div class="btn-group">
        ${uiStatus === 'lp_paid' ? `<button class="btn btn-sm btn-success confirm-btn" data-id="${task.id}" data-amount="${task.amount}">Confirm Received</button>` : ''}
        ${uiStatus === 'created' ? `<button class="btn btn-sm btn-danger cancel-btn" data-id="${task.id}">Cancel</button>` : ''}
        ${uiStatus === 'expired' ? `<button class="btn btn-sm btn-warning refund-btn" data-id="${task.id}" data-capture-id="${task.paymentProof && task.paymentProof.paypalCaptureId}">Refund</button>` : ''}
        <button class="btn btn-sm btn-info details-btn" data-id="${task.id}">View Details</button>
      </div>
    </div>
  `;
  
  // 添加到列表
  paymentTasksList.appendChild(taskElement);
  
  // 添加确认按钮事件监听器
  const confirmBtn = taskElement.querySelector('.confirm-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      showConfirmModal(task.id, task.amount);
    });
  }
  
  // 添加取消按钮事件监听器
  const cancelBtn = taskElement.querySelector('.cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      cancelPaymentIntent(task.id);
    });
  }
  
  // 添加查看详情按钮事件监听器，使用弹窗显示详情
  const detailsBtn = taskElement.querySelector('.details-btn');
  if (detailsBtn) {
    detailsBtn.addEventListener('click', async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/payment-intents/${task.id}`);
        const result = await response.json();
        if (result.success) {
          // Show details modal and then update UI using the database status directly
          await showUserPaymentDetailModal(result.data);
          updateTaskStatus(task.id, result.data.status);
        } else {
          showErrorMessage(result.message || '获取支付详情失败');
        }
      } catch (error) {
        showErrorMessage('获取支付详情失败: ' + error.message);
      }
    });
  }
  // 添加取回托管资金按钮事件监听，使用链上调用
  const refundBtn = taskElement.querySelector('.refund-btn');
  if (refundBtn) {
    refundBtn.addEventListener('click', async () => {
      if (!confirm('确认取回托管资金？')) return;
      try {
        // 确保合约服务已初始化
        if (!window.contractService || !window.contractService.isInitialized()) {
          await window.contractService.initializeWeb3();
          await window.contractService.initializeContracts();
        }
        // 获取链上支付ID映射
        const blockchainId = localStorage.getItem(`blockchain_id_${task.id}`) || task.id;
        // 调用合约方法取回资金
        const tx = await window.contractService.cancelExpiredPayment(blockchainId, { gasLimit: 200000 });
        alert('取回资金交易已提交，交易哈希: ' + tx.hash);
        // 更新后端数据库状态
        const resp = await fetch(`${API_BASE_URL}/payment-intents/${task.id}/expire`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash: tx.hash, blockchainPaymentId: blockchainId })
        });
        const result = await resp.json();
        if (!resp.ok || !result.success) {
          alert('标记取回失败: ' + (result.message || resp.statusText));
          return;
        }
        // 清理本地缓存，确保下次渲染使用最新状态
        clearPaymentCache(task.id);
        // 刷新任务列表
        await loadUserPaymentTasks();
      } catch (error) {
        console.error('取回资金失败:', error);
        alert('取回资金失败: ' + (error.message || error.toString()));
      }
    });
  }
}

// 获取状态标签样式
function getStatusBadgeClass(status) {
  switch (status) {
    case 'created':
      return 'bg-primary';
    case 'matched':
      return 'bg-info';
    case 'paid':
    case 'lp_paid':
      return 'bg-warning';
    case 'confirmed':
    case 'user_confirmed':
      return 'bg-info';
    case 'settled':
      return 'bg-success';
    case 'cancelled':
      return 'bg-danger';
    case 'expired':
      return 'bg-secondary';
    case 'claimed':
      return 'bg-warning';
    case 'locked':
      return 'bg-secondary';
    case 'refunded':
      return 'bg-success';
    default:
      return 'bg-secondary';
  }
}

// 获取状态文本
function getStatusText(status) {
  switch (status) {
    case 'created':
      return 'Waiting for LP Match';
    case 'matched':
      return 'LP Matched';
    case 'paid':
    case 'lp_paid':
      return 'LP Paid';
    case 'confirmed':
    case 'user_confirmed':
      return 'User Confirmed';
    case 'settled':
      return 'User Confirmed';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
    case 'claimed':
      return 'LP Claimed';
    case 'locked':
      return 'Locked';
    case 'refunded':
      return 'Refunded';
    default:
      return status;
  }
}

// 更新任务状态
function updateTaskStatus(taskId, status) {
  const uiStatus = normalizeStatus(status);
  const taskElement = document.getElementById(`task-${taskId}`);
  if (!taskElement) return;
  
  // 更新状态标签
  const statusBadge = taskElement.querySelector('.badge');
  statusBadge.className = `badge ${getStatusBadgeClass(uiStatus)}`;
  statusBadge.textContent = getStatusText(uiStatus);
  
  // 更新按钮
  const btnGroup = taskElement.querySelector('.btn-group');
  btnGroup.innerHTML = '';
  
  if (uiStatus === 'lp_paid') {
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-sm btn-success confirm-btn';
    confirmBtn.dataset.id = taskId;
    confirmBtn.textContent = 'Confirm Received';
    confirmBtn.addEventListener('click', () => showConfirmModal(taskId));
    btnGroup.appendChild(confirmBtn);
  } else if (uiStatus === 'created') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-danger cancel-btn';
    cancelBtn.dataset.id = taskId;
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancelPaymentIntent(taskId));
    btnGroup.appendChild(cancelBtn);
  } else if (uiStatus === 'expired') {
    const refundBtn = document.createElement('button');
    refundBtn.className = 'btn btn-sm btn-warning refund-btn';
    refundBtn.dataset.id = taskId;
    refundBtn.textContent = 'Refund';
    refundBtn.addEventListener('click', async () => {
      if (!confirm('确认取回托管资金？')) return;
      try {
        // 确保合约服务已初始化
        if (!window.contractService || !window.contractService.isInitialized()) {
          await window.contractService.initializeWeb3();
          await window.contractService.initializeContracts();
        }
        // 获取链上支付ID映射
        const blockchainId = localStorage.getItem(`blockchain_id_${taskId}`) || taskId;
        // 调用合约方法取回资金
        const tx = await window.contractService.cancelExpiredPayment(blockchainId, { gasLimit: 200000 });
        alert('取回资金交易已提交，交易哈希: ' + tx.hash);
        // 更新后端数据库状态
        const resp = await fetch(`${API_BASE_URL}/payment-intents/${taskId}/expire`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash: tx.hash, blockchainPaymentId: blockchainId })
        });
        const result = await resp.json();
        if (!resp.ok || !result.success) {
          alert('标记取回失败: ' + (result.message || resp.statusText));
          return;
        }
        // 清理本地缓存，确保下次渲染使用最新状态
        clearPaymentCache(taskId);
        // 刷新任务列表
        await loadUserPaymentTasks();
      } catch (error) {
        console.error('取回资金失败:', error);
        alert('取回资金失败: ' + (error.message || error.toString()));
      }
    });
    btnGroup.appendChild(refundBtn);
  }
  // 始终添加查看详情按钮
  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'btn btn-sm btn-info details-btn';
  detailsBtn.dataset.id = taskId;
  detailsBtn.textContent = 'View Details';
  detailsBtn.addEventListener('click', async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/payment-intents/${taskId}`);
      const result = await response.json();
      if (result.success) {
        // Display modal and update UI based on the actual backend status
        await showUserPaymentDetailModal(result.data);
        updateTaskStatus(taskId, result.data.status);
      } else {
        showErrorMessage(result.message || '获取支付详情失败');
      }
    } catch (error) {
      showErrorMessage('获取支付详情失败: ' + error.message);
    }
  });
  btnGroup.appendChild(detailsBtn);
}

// 显示确认模态框
async function showConfirmModal(taskId, amount) {
  try {
    // 设置当前支付意图ID
    currentPaymentIntentId = taskId;
    
    // 获取支付意图详情
    const response = await fetch(`${API_BASE_URL}/payment-intents/${taskId}`);
    
    if (!response.ok) {
      throw new Error('获取支付详情失败');
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || '获取支付详情失败');
    }
    
    const paymentIntent = result.data;
    
    // 存储合约支付ID，用于链上确认调用（优先使用本地存储的映射）
    let bcId = localStorage.getItem(`blockchain_id_${taskId}`)
             || localStorage.getItem(`blockchain_payment_id_${taskId}`)
             || localStorage.getItem(`payment_blockchain_id_${taskId}`);
    window.currentBlockchainId = bcId || paymentIntent.blockchainPaymentId;
    console.log('Current blockchain payment ID:', window.currentBlockchainId);
    
    // 检查LP信息
    let lpWalletAddress = null;
    if (paymentIntent.lpWalletAddress) {
      lpWalletAddress = paymentIntent.lpWalletAddress;
    } else if (paymentIntent.lp && paymentIntent.lp.walletAddress) {
      lpWalletAddress = paymentIntent.lp.walletAddress;
    }
    
    if (!lpWalletAddress) {
      throw new Error('无法确认支付，未找到LP钱包地址');
    }
    
    // 设置金额
    document.getElementById('confirm-amount').textContent = amount;
    
    // 设置LP钱包地址
    document.getElementById('confirm-lp-address').textContent = lpWalletAddress;
    
    // 显示模态框
    confirmPaymentModal.show();
  } catch (error) {
    console.error('显示确认模态框失败:', error);
    alert('显示确认模态框失败: ' + error.message);
  }
}

// 简化后的确认服务，仅调用后端接口更新数据库状态
async function confirmPaymentReceived(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  if (typeof closeModals === 'function') {
    try { closeModals(); } catch {}
  }
  // 获取支付ID
  let paymentId = currentPaymentIntentId;
  if (!paymentId) {
    const params = new URLSearchParams(window.location.search);
    paymentId = params.get('id') ||
      document.getElementById('payment-id')?.textContent.trim() ||
      document.getElementById('confirmPaymentModal')?.getAttribute('data-payment-id') ||
      (window.paymentData && (window.paymentData.id || window.paymentData.paymentIntentId));
  }
  if (!paymentId) {
    showErrorMessage('未找到支付ID，无法确认');
    return;
  }
  try {
    // 执行链上交易解锁
    if (!window.contractService || !window.contractService.isInitialized()) {
      await window.contractService.initializeWeb3();
    }
    const escrowContract = await window.contractService.getEscrowContract();
    // 确定链上支付ID
    let blockchainId = window.currentBlockchainId;
    if (!blockchainId) {
      blockchainId = localStorage.getItem(`blockchain_id_${paymentId}`)
                    || localStorage.getItem(`blockchain_payment_id_${paymentId}`)
                    || localStorage.getItem(`payment_blockchain_id_${paymentId}`)
                    || paymentId;
    }
    console.log('Using blockchain ID for confirmation:', blockchainId);
    // 在发送交易前检查链上状态，确保可以确认支付
    const canConfirm = await isPaymentConfirmable(blockchainId);
    if (!canConfirm) return;
    showMessage('请在钱包中确认解锁资金…', 'info');
    // 为避免Gas估算失败，手动设置gasLimit
    const tx = await escrowContract.confirmPayment(blockchainId, { gasLimit: 500000 });
    const receipt = await tx.wait();
    // 调用后端写回数据库
    const proof = { method: 'blockchain', proof: receipt.transactionHash, blockchainId };
    const response = await fetch(
      `${API_BASE_URL}/payment-intents/${paymentId}/confirm`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, walletAddress })
      }
    );
    const result = await response.json();
    if (result.success) {
      // 显示带有交易哈希链接的成功消息
      const txHash = receipt.transactionHash;
      const explorerUrl = getExplorerTxUrl(txHash);
      const shortHash = txHash.substring(0, 10) + '...' + txHash.slice(-8);
      showMessage(`支付已确认! 交易哈希: <a href="${explorerUrl}" target="_blank">${shortHash}</a>`, 'success');
      // 更新任务状态并刷新列表
      updateTaskStatus(paymentId, result.data.status);
      await loadUserPaymentTasks();
    } else {
      showErrorMessage(result.message || '确认支付失败');
    }
  } catch (err) {
    console.error('确认支付失败:', err);
    showErrorMessage('确认支付失败: ' + err.message);
  }
}

/**
 * 检查交易状态
 * @param {string} txHash - 交易哈希
 * @param {string} paymentId - 支付ID
 */
async function checkTransactionStatus(txHash, paymentId) {
  try {
    if (typeof startLoading === 'function') {
      startLoading('正在查询交易状态...');
    }
    
    console.log(`查询交易状态, 哈希: ${txHash}, 支付ID: ${paymentId}`);
    
    if (!window.contractService || !window.contractService.isInitialized()) {
      await window.contractService.initializeWeb3();
    }
    
    // 从区块链获取交易收据
    const provider = window.contractService.provider;
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      // 交易尚未被确认
      showErrorMessage('交易尚未被确认，请稍后再次检查');
      return;
    }
    
    console.log('获取到交易收据:', receipt);
    
    // 判断交易是否成功
    if (receipt.status === 1) {
      // 交易成功，更新支付状态
      localStorage.setItem(`payment_status_${paymentId}`, '2'); // 已确认
      localStorage.setItem(`payment_status_name_${paymentId}`, 'CONFIRMED');
      localStorage.setItem(`payment_status_last_sync_${paymentId}`, new Date().toISOString());
      
      // 显示成功消息
      showMessage('交易已成功！支付已确认', 'success');
      
      // 更新UI
      const confirmBtn = document.getElementById('confirmPaymentBtn');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '已确认';
      }
      
      // 刷新支付详情
      if (typeof loadPaymentDetails === 'function') {
        loadPaymentDetails(paymentId);
      } else {
        // 给用户提供刷新选项
        if (confirm('支付已成功确认。是否刷新页面查看最新状态？')) {
          location.reload();
        }
      }
    } else {
      // 交易失败
      showErrorMessage('交易失败，请检查区块链浏览器查看详情');
      
      // 提供链接
      const statusElement = document.createElement('div');
      statusElement.className = 'alert alert-danger mt-3';
      statusElement.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i> 交易失败<br>
        详情请查看: <a href="${getExplorerTxUrl(txHash)}" target="_blank">区块链浏览器</a>
      `;
      
      // 添加到页面
      const confirmBtn = document.getElementById('confirmPaymentBtn');
      if (confirmBtn && confirmBtn.parentNode) {
        const existingStatus = confirmBtn.parentNode.querySelector('.alert');
        if (existingStatus) {
          existingStatus.replaceWith(statusElement);
        } else {
          confirmBtn.parentNode.appendChild(statusElement);
        }
      } else {
        document.body.appendChild(statusElement);
      }
    }
  } catch (error) {
    console.error('查询交易状态失败:', error);
    showErrorMessage(`查询交易状态失败: ${error.message}`);
  } finally {
    if (typeof stopLoading === 'function') {
      stopLoading();
    }
  }
}

// 取消支付意图
async function cancelPaymentIntent(taskId) {
  try {
    if (!confirm('确定要取消此支付任务吗？')) {
      return;
    }
    
    console.log('取消支付意图:', taskId);
    
    // 准备请求数据
    const data = {
      walletAddress
    };
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/payment-intents/${taskId}/cancel`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json'
                },
      body: JSON.stringify(data)
              });
              
              const result = await response.json();
    console.log('取消结果:', result);
              
              if (result.success) {
      // 更新UI
      updateTaskStatus(taskId, 'cancelled');
      
      // 显示成功消息
      alert('支付任务已取消');
      
      // 刷新USDT余额
      await loadUSDTBalance();
              } else {
      throw new Error(result.message || '取消失败');
              }
            } catch (error) {
    console.error('取消失败:', error);
    alert('取消失败: ' + error.message);
  } finally {
      // 不管成功或失败，都重新拉取最新任务列表，保证状态与数据库同步
      await loadUserPaymentTasks();
    }
}

// 申请退款
async function requestRefund(taskId, captureId) {
  try {
    if (!confirm('确定要申请退款吗？')) return;
    const response = await fetch(`${API_BASE_URL}/payment/paypal/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captureId })
    });
    const result = await response.json();
    if (result.success) {
      showMessage('退款申请已提交', 'success');
      // 刷新列表以同步最新状态
      await loadUserPaymentTasks();
    } else {
      throw new Error(result.message || '退款失败');
    }
  } catch (error) {
    console.error('退款申请失败:', error);
    showErrorMessage('退款申请失败: ' + error.message);
  }
}

// 显示交易处理模态框
async function showTransactionProcessingModal(data) {
  // 获取模态框元素
  const modal = document.getElementById('transaction-status-modal');
  const closeBtn = document.querySelector('.close-transaction');
  const closeTransactionBtn = document.getElementById('close-transaction-btn');
  
  // 获取状态元素
  const statusProcessing = document.getElementById('status-processing');
  const statusSuccess = document.getElementById('status-success');
  const statusError = document.getElementById('status-error');
  
  // 获取详情元素
  const txLpAddress = document.getElementById('tx-lp-address');
  const txAmount = document.getElementById('tx-amount');
  const txHashContainer = document.getElementById('tx-hash-container');
  const txHash = document.getElementById('tx-hash');
  const viewExplorerBtn = document.getElementById('view-explorer-btn');
  
  // 根据传入的数据显示内容
  if (data.lpAddress) txLpAddress.textContent = data.lpAddress;
  if (data.amount) txAmount.textContent = `${data.amount} ${data.currency || 'USDT'}`;
  
  // 隐藏所有状态
  statusProcessing.style.display = 'none';
  statusSuccess.style.display = 'none';
  statusError.style.display = 'none';
  
  // 显示对应状态
  if (data.status === 'processing') {
    statusProcessing.style.display = 'block';
  } else if (data.status === 'success') {
    statusSuccess.style.display = 'block';
    
    // 更新成功状态下的文本
    if (data.message) {
      document.querySelector('#status-success p').textContent = data.message;
    }
    
    // 添加子消息（如释放时间）
    if (data.subMessage) {
      const subMessageElement = document.createElement('p');
      subMessageElement.className = 'status-sub-message';
      subMessageElement.innerHTML = data.subMessage;
      document.querySelector('#status-success').appendChild(subMessageElement);
    }
    
    // 如果有交易哈希，显示交易哈希
    if (data.txHash) {
      txHash.textContent = data.txHash;
      txHashContainer.style.display = 'block';
      
      // 尝试获取网络信息以显示正确的区块浏览器链接
      try {
        // 获取contractService的网络配置
        const contractResponse = await fetch(`${API_BASE_URL}/settlement-contract-info`);
        if (contractResponse.ok) {
          const contractResult = await contractResponse.json();
          const networkInfo = contractResult.data.networkInfo;
          let explorerUrl;
          
          // 根据网络信息构建区块浏览器URL
          if (networkInfo.blockExplorer) {
            explorerUrl = `${networkInfo.blockExplorer}/tx/${data.txHash}`;
          } else if (networkInfo.name === 'Somnia') {
            explorerUrl = `https://shannon-explorer.somnia.network/tx/${data.txHash}`;
          } else if (networkInfo.name === 'Goerli') {
            explorerUrl = `https://goerli.etherscan.io/tx/${data.txHash}`;
          } else {
            // 默认以太坊主网
            explorerUrl = `https://etherscan.io/tx/${data.txHash}`;
          }
          
          console.log(`使用区块浏览器: ${explorerUrl}`);
          viewExplorerBtn.href = explorerUrl;
          viewExplorerBtn.style.display = 'inline-block';
        } else {
          // 无法获取网络信息，使用默认浏览器URL
          const explorerUrl = `https://shannon-explorer.somnia.network/tx/${data.txHash}`;
          viewExplorerBtn.href = explorerUrl;
          viewExplorerBtn.style.display = 'inline-block';
        }
      } catch (error) {
        console.error('获取网络信息失败:', error);
        // 使用备用浏览器URL
        const explorerUrl = `https://shannon-explorer.somnia.network/tx/${data.txHash}`;
        viewExplorerBtn.href = explorerUrl;
        viewExplorerBtn.style.display = 'inline-block';
      }
    }
  } else if (data.status === 'error') {
    statusError.style.display = 'block';
    
    // 更新错误状态下的文本
    if (data.message) {
      document.querySelector('#status-error p').textContent = data.message;
    }
  }
  
  // 显示模态框
  modal.style.display = 'block';
  
  // 关闭按钮事件
  closeBtn.onclick = function() {
    modal.style.display = 'none';
    // 清除附加的子消息元素
    const subMessages = document.querySelectorAll('.status-sub-message');
    subMessages.forEach(el => el.remove());
  };
  
  closeTransactionBtn.onclick = function() {
    modal.style.display = 'none';
    // 清除附加的子消息元素
    const subMessages = document.querySelectorAll('.status-sub-message');
    subMessages.forEach(el => el.remove());
  };
  
  // 点击模态框外部关闭
  window.onclick = function(event) {
    if (event.target === modal) {
      modal.style.display = 'none';
      // 清除附加的子消息元素
      const subMessages = document.querySelectorAll('.status-sub-message');
      subMessages.forEach(el => el.remove());
    }
  };
}

// 加载USDT余额
async function loadUSDTBalance() {
  try {
    if (!isWalletConnected || !usdtContract) {
      console.log('钱包未连接或USDT合约未初始化');
      return;
    }
    
    // 显示加载中
    usdtBalanceSpan.textContent = '加载中...';
    
    // 获取USDT小数位数
    const decimals = await usdtContract.decimals();
    
    // 获取USDT余额
    const balance = await usdtContract.balanceOf(walletAddress);
    
    // 格式化余额 (USDT通常有6位小数)
    const formattedBalance = ethers.utils.formatUnits(balance, decimals);
    
    // 更新UI
    usdtBalanceSpan.textContent = parseFloat(formattedBalance).toFixed(2);
    
    console.log('USDT余额已更新:', formattedBalance);
    
  } catch (error) {
    console.error('获取USDT余额失败:', error);
    usdtBalanceSpan.textContent = '获取失败';
  }
}

// 初始化USDT合约
async function initUSDTContract() {
  try {
    if (!isWalletConnected || !signer) {
      console.log('钱包未连接，无法初始化USDT合约');
      return;
    }
    
    // 获取USDT合约信息
    const response = await fetch(`${API_BASE_URL}/settlement-contract-info`);
    if (!response.ok) {
      throw new Error('获取合约信息失败');
    }
    
    const result = await response.json();
    if (!result.success) {
      throw new Error('获取合约信息失败: ' + result.message);
    }
    
    // 获取USDT合约地址
    const usdtAddress = result.data.usdtAddress;
    
    // 创建USDT合约实例
    usdtContract = new ethers.Contract(
      usdtAddress,
      [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ],
      signer
    );
    
    // 加载USDT余额
    await loadUSDTBalance();
    
  } catch (error) {
    console.error('初始化USDT合约失败:', error);
  }
}

// 加载LP列表
async function loadLPList() {
  try {
    // 获取LP选择下拉框
    const lpSelect = document.getElementById('lp-select');
    if (!lpSelect) return;
    
    // 保留第一个选项(auto)，清除其他选项
    const autoOption = lpSelect.querySelector('option[value="auto"]');
    lpSelect.innerHTML = '';
    if (autoOption) {
      lpSelect.appendChild(autoOption);
      // 禁用"任意LP"选项，因为当前合约版本不支持
      autoOption.disabled = true;
    }
    
    // 请求LP列表 - 尝试多个可能的API端点
    console.log('正在加载LP列表...');
    let response;
    let apiUrl = '';
    
    // 依次尝试不同的API端点
    const possibleEndpoints = [
      `${API_BASE_URL}/lp/available`, 
      `${API_BASE_URL}/lps/available`,
      `${API_BASE_URL}/lp/list`,
      `${API_BASE_URL}/lps/list`
    ];
    
    for (const endpoint of possibleEndpoints) {
      try {
        console.log(`尝试从 ${endpoint} 获取LP列表...`);
        const tempResponse = await fetch(endpoint);
        if (tempResponse.ok) {
          response = tempResponse;
          apiUrl = endpoint;
          console.log(`成功从 ${endpoint} 获取LP列表`);
          break;
        }
      } catch (e) {
        console.log(`从 ${endpoint} 获取LP列表失败:`, e);
      }
    }
    
    if (!response || !response.ok) {
      throw new Error('无法从任何API端点获取LP列表');
    }
    
    const result = await response.json();
    console.log(`从 ${apiUrl} 获取到的API响应:`, result);
    
    // 正确处理API返回的嵌套数据结构
    let lpList = [];
    
    // 处理多种可能的数据结构
    if (result.success && result.data && Array.isArray(result.data.lps)) {
      // 标准结构: {success: true, data: {lps: [...]}}
      lpList = result.data.lps;
      console.log('从result.data.lps获取LP列表');
    } else if (result.success && Array.isArray(result.data)) {
      // 替代结构: {success: true, data: [...]}
      lpList = result.data;
      console.log('从result.data获取LP列表');
    } else if (Array.isArray(result)) {
      // 直接数组结构: [...]
      lpList = result;
      console.log('从result直接获取LP列表');
    } else if (result.success && typeof result.data === 'object') {
      // 尝试从对象属性中找到数组
      const possibleArrays = Object.values(result.data).filter(Array.isArray);
      if (possibleArrays.length > 0) {
        // 使用找到的第一个数组
        lpList = possibleArrays[0];
        console.log('从result.data的对象属性中找到LP列表');
      }
    } else if (typeof result === 'object') {
      // 尝试查找可能的数组字段
      for (const key in result) {
        if (Array.isArray(result[key])) {
          lpList = result[key];
          console.log(`从result.${key}获取LP列表`);
          break;
        }
        // 检查嵌套对象
        else if (typeof result[key] === 'object') {
          for (const nestedKey in result[key]) {
            if (Array.isArray(result[key][nestedKey])) {
              lpList = result[key][nestedKey];
              console.log(`从result.${key}.${nestedKey}获取LP列表`);
              break;
            }
          }
        }
      }
    }
    
    console.log('处理后的LP数组:', lpList);
    
    if (!lpList || lpList.length === 0) {
      console.log('当前没有可用的LP');
      
      // 添加提示选项
      const noLPOption = document.createElement('option');
      noLPOption.value = '';
      noLPOption.textContent = '-- 当前没有可用的LP --';
      noLPOption.disabled = true;
      lpSelect.appendChild(noLPOption);
      return;
    }
    
    // 设置默认的LP选项和最低费率
    let defaultLP = null;
    let lowestFeeRate = 5.0; // 默认最高费率为5%
    
    // 添加LP选项
    lpList.forEach(lp => {
      // 确保LP对象有必要的属性
      if (!lp || typeof lp !== 'object') {
        console.warn('跳过无效的LP数据:', lp);
        return;
      }
      
      const option = document.createElement('option');
      // 使用walletAddress或address属性
      option.value = lp.walletAddress || lp.address || '';
      
      if (!option.value) {
        console.warn('跳过缺少地址的LP:', lp);
        return;
      }
      
      // 获取当前LP的费率
      const feeRate = lp.fee_rate;
      
      // 设置option的data-fee-rate属性，用于后续获取选中LP的费率
      option.setAttribute('data-fee-rate', feeRate);
      
      // 格式化LP地址显示
      const shortAddress = option.value.slice(0, 6) + '...' + option.value.slice(-4);
      option.textContent = `${lp.name || 'LP'} (${shortAddress})`;
      
      // 如果有费率信息，添加到显示
      if (feeRate) {
        option.textContent += ` - 费率: ${feeRate}%`;
      }
      
      lpSelect.appendChild(option);
      
      // 更新默认LP（选择费率最低的LP）
      if (lp.isDefault || (feeRate < lowestFeeRate)) {
        defaultLP = option.value;
        lowestFeeRate = feeRate;
      }
    });
    
    // 设置选中的LP
    if (defaultLP) {
      lpSelect.value = defaultLP;
      console.log('自动选中费率最低的LP:', defaultLP, '费率:', lowestFeeRate);
      
      // 更新费率输入框，使用选中LP的费率
      const feeRateInput = document.getElementById('fee-rate');
      if (feeRateInput) {
        feeRateInput.value = lowestFeeRate;
      }
    }
    
    // 添加LP选择变更事件监听器，当选择不同LP时更新费率
    lpSelect.addEventListener('change', function() {
      const selectedOption = lpSelect.options[lpSelect.selectedIndex];
      const feeRateInput = document.getElementById('fee-rate');
      
      if (feeRateInput && selectedOption && selectedOption.getAttribute('data-fee-rate')) {
        feeRateInput.value = selectedOption.getAttribute('data-fee-rate');
      }
    });
    
    console.log('LP列表加载完成，已添加', lpList.length, '个选项');
  } catch (error) {
    console.error('加载LP列表失败:', error);
    // 如果有错误显示功能，可以显示错误提示
    if (typeof showToast === 'function') {
      showToast('加载LP列表失败: ' + error.message, 'error');
    } else if (typeof showMessage === 'function') {
      showMessage('加载LP列表失败: ' + error.message, 'error');
    } else {
      alert('加载LP列表失败: ' + error.message);
    }
  }
}

// 显示订单详情
function showPaymentDetails(payment) {
    console.log('===DEBUG=== 显示支付详情:', payment);
    if (!payment) return;
    // 填充静态页面元素
    document.getElementById('payment-id').textContent = payment.paymentIntentId || payment.id || '';
    document.getElementById('payment-amount').textContent = `${payment.amount} ${payment.currency || 'USDT'}`;
    document.getElementById('payment-status').textContent = payment.status || '';
    document.getElementById('lp-address').textContent = payment.lpWalletAddress || payment.lpAddress || '';
    document.getElementById('created-at').textContent = payment.createdAt ? new Date(payment.createdAt).toLocaleString() : '';
    // PayPal商家邮箱显示
    const merchantContainer = document.getElementById('merchant-email-container');
    if (payment.platform && payment.platform.toLowerCase() === 'paypal') {
      merchantContainer.style.display = 'block';
      document.getElementById('merchant-paypal-email').textContent = payment.merchantPaypalEmail || '-';
      // Populate PayPal order, capture, and time
      const proof = payment.paymentProof || {};
      let orderId = proof.paypalOrderId || proof.orderId || '-';
      let captureId = proof.paypalCaptureId || proof.captureId || proof.transactionId || '-';
      let timeRaw = proof.captureTime || proof.transactionTime || payment.updatedAt;
      let formattedTime = timeRaw ? new Date(timeRaw).toLocaleString() : '-';
      document.getElementById('paypal-order-id').textContent = orderId;
      document.getElementById('paypal-order-id-container').style.display = 'block';
      document.getElementById('paypal-capture-id').textContent = captureId;
      document.getElementById('paypal-capture-id-container').style.display = 'block';
      document.getElementById('paypal-capture-time').textContent = formattedTime;
      document.getElementById('paypal-capture-time-container').style.display = 'block';
        } else {
      merchantContainer.style.display = 'none';
      document.getElementById('paypal-order-id-container').style.display = 'none';
      document.getElementById('paypal-capture-id-container').style.display = 'none';
      document.getElementById('paypal-capture-time-container').style.display = 'none';
    }
    // 根据状态显示退款按钮
    const refundBtnContainer = document.getElementById('refund-button-container');
    if (payment.status && ['paid','confirmed'].includes(payment.status.toLowerCase())) {
      refundBtnContainer.style.display = 'block';
          } else {
      refundBtnContainer.style.display = 'none';
    }
}

/**
 * 更新确认按钮的UI状态
 * @param {string} paymentId - 支付ID
 */
function updateConfirmButtonUI(paymentId) {
  const confirmBtn = document.getElementById('confirmPaymentBtn');
  if (!confirmBtn) return;
  
  // 获取缓存的支付状态
  const statusName = localStorage.getItem(`payment_status_name_${paymentId}`);
  if (!statusName) return;
  
  console.log(`更新确认按钮UI，当前状态: ${statusName}`);
  
  // 根据状态设置按钮
  if (statusName === 'LOCKED' || statusName === '1') {
    // 可确认状态
    confirmBtn.disabled = false;
    confirmBtn.textContent = '确认支付';
    confirmBtn.className = 'btn btn-primary';
    
    // 移除可能存在的状态提示
    const existingStatus = confirmBtn.parentNode.querySelector('.payment-status-info');
    if (existingStatus) {
      existingStatus.remove();
    }
  } else {
    // 不可确认状态
    confirmBtn.disabled = true;
    
    let statusText = '不可确认';
    let btnClass = 'btn-secondary';
    let statusInfo = null;
    
    if (statusName === 'CONFIRMED' || statusName === '2') {
      statusText = '已确认';
      btnClass = 'btn-success';
      statusInfo = {
        class: 'alert-info',
        text: '此支付已被确认，无需重复操作'
      };
    } else if (statusName === 'RELEASED' || statusName === '3') {
      statusText = '已释放';
      btnClass = 'btn-info';
      statusInfo = {
        class: 'alert-info',
        text: '此支付已被释放，资金已转移到收款方'
      };
    } else if (statusName === 'CANCELLED' || statusName === '4') {
      statusText = '已取消';
      btnClass = 'btn-warning';
      statusInfo = {
        class: 'alert-warning',
        text: '此支付已被取消'
      };
    } else if (statusName === 'INVALID_STATUS') {
      statusText = '状态异常';
      btnClass = 'btn-danger';
      statusInfo = {
        class: 'alert-danger',
        text: '支付状态异常，无法确认'
      };
    } else if (statusName === 'NOT_FOUND') {
      statusText = '未找到';
      btnClass = 'btn-danger';
      statusInfo = {
        class: 'alert-danger',
        text: '找不到此支付记录'
      };
    }
    
    // 更新按钮
    confirmBtn.textContent = statusText;
    confirmBtn.className = confirmBtn.className.replace(/btn-(primary|success|warning|danger|secondary|info)/g, btnClass);
    
    // 添加状态提示
    if (statusInfo) {
      // 移除可能存在的旧提示
      const existingStatus = confirmBtn.parentNode.querySelector('.payment-status-info');
      if (existingStatus) {
        existingStatus.remove();
      }
      
      const statusElement = document.createElement('div');
      statusElement.className = `alert ${statusInfo.class} mt-2 payment-status-info`;
      statusElement.innerHTML = `
        <i class="fas fa-info-circle"></i> ${statusInfo.text}
        <div class="mt-2">
          <button onclick="showPaymentDiagnostics('${paymentId}')" class="btn btn-sm btn-primary">查看详情</button>
          <button onclick="refreshPaymentStatus('${paymentId}')" class="btn btn-sm btn-secondary ml-2">刷新状态</button>
        </div>
      `;
      
      confirmBtn.parentNode.insertBefore(statusElement, confirmBtn.nextSibling);
    }
  }
}

// 启动自动化区块链处理过程
async function startBlockchainProcess() {
    console.log('===DEBUG=== 开始自动化区块链处理流程');
    
    try {
        // 首先检查payment数据
        let paymentData = window.paymentData;
        
        // 如果没有，尝试从localStorage恢复
        if (!paymentData) {
            try {
                const savedData = localStorage.getItem('paymentData');
                if (savedData) {
                    paymentData = JSON.parse(savedData);
                    window.paymentData = paymentData; // 恢复全局变量
                    console.log('===DEBUG=== 从localStorage恢复支付数据:', paymentData);
                }
            } catch (e) {
                console.error('===DEBUG=== 恢复支付数据失败:', e);
            }
        }
        
        // 如果仍然没有找到支付数据，使用当前显示的数据
        if (!paymentData) {
            const paymentIdElement = document.getElementById('payment-id');
            const amountElement = document.getElementById('payment-amount');
            const lpAddressElement = document.getElementById('lp-address');
            const feeRateElement = document.getElementById('payment-fee-rate');
            
            if (paymentIdElement && amountElement && lpAddressElement) {
                // 从UI元素提取数据
                const id = paymentIdElement.textContent.trim();
                // 提取数字部分，移除"USDT"
                const amount = amountElement.textContent.replace('USDT', '').trim();
                const lpAddress = lpAddressElement.textContent.trim();
                // 提取费率，默认0.5%
                const feeRate = feeRateElement ? 
                    parseFloat(feeRateElement.textContent.replace('%', '').trim()) : 0.5;
                
                if (id && amount && lpAddress) {
                    paymentData = {
                        id: id,
                        paymentIntentId: id,
                        amount: amount,
                        lpWalletAddress: lpAddress,
                        lpAddress: lpAddress,
                        feeRate: feeRate
                    };
                    
                    window.paymentData = paymentData;
                    console.log('===DEBUG=== 从UI元素恢复支付数据:', paymentData);
                }
            }
        }
        
        if (!paymentData) {
            throw new Error('未找到支付数据');
        }
        
        // 规范化支付数据
        const normalizedData = normalizePaymentData(paymentData);
        if (!normalizedData) {
            throw new Error('支付数据无效');
        }
        
        // 确保window.paymentData已更新为规范化数据
        window.paymentData = normalizedData;
        
        // 连接钱包 - 增加更清晰的错误处理
        // 确保钱包已连接：请先点击页面上的"连接钱包"按钮并在钱包中授权
        if (!window.ethereum || !window.ethereum.selectedAddress) {
            throw new Error('请先点击页面上的"连接钱包"按钮并在钱包中授权');
        }
        
        // 检查USDT余额
        showBlockchainStatus('正在检查USDT余额...');
        const balanceResult = await checkAppUSDTBalance();
        
        // 处理余额检查结果
        if (!balanceResult.success) {
            // 根据错误类型抛出不同的错误信息
            switch (balanceResult.error) {
                case 'WALLET_NOT_CONNECTED':
                    throw new Error('钱包未连接，请先连接钱包');
                    
                case 'WEB3_INIT_FAILED':
                case 'CONTRACT_INIT_FAILED':
                    // 直接使用返回的错误消息
                    throw new Error(balanceResult.message);
                    
                case 'INVALID_PAYMENT_DATA':
                    throw new Error('支付数据无效，请重新创建支付');
                    
                case 'INSUFFICIENT_BALANCE':
                    throw new Error(`USDT余额不足: ${balanceResult.balance} < ${balanceResult.required.toFixed(6)}`);
                    
                default:
                    throw new Error(balanceResult.message || '检查USDT余额时发生未知错误');
            }
        }
        
        console.log('===DEBUG=== USDT余额充足:', balanceResult);
        
        // 授权USDT
        showBlockchainStatus('正在授权USDT...');
        const approveResult = await approveAppUSDT();
        if (!approveResult || !approveResult.success) {
            throw new Error(approveResult?.error || 'USDT授权失败，请在钱包中确认授权');
        }
        
        // 在Enhanced合约上创建链上订单并获取 paymentId
        showBlockchainStatus('正在创建链上订单...');
        // 初始化 Enhanced 合约实例
        const provider2 = new ethers.providers.Web3Provider(window.ethereum);
        const signer2 = provider2.getSigner();
        const enhancedContract = new ethers.Contract(
            window.CONFIG.ENHANCED_ADDRESS,
            window.UnitpayEnhancedAbi,
            signer2
        );
        // 计算支付金额单位
        const decimals2 = await window.contractService.usdtContract.decimals().catch(() => this.networkKey === 'sepolia' ? 6 : 18);
        // 根据 LP 费率计算包含手续费的总金额
        const feeRate2 = window.paymentData.feeRate || 0;
        const originalAmount2 = parseFloat(window.paymentData.amount);
        const totalAmountWithFee = (originalAmount2 * (1 + feeRate2 / 100)).toString();
        const payAmount2 = ethers.utils.parseUnits(totalAmountWithFee, decimals2);
        const network2 = window.APP_CONFIG.defaultNetwork;
        // 商家邮箱：从前端支付数据里读取 merchantPaypalEmail 字段，若无则 fallback 到 merchantEmail 或钱包地址
        const merchantEmail2 = window.paymentData.merchantPaypalEmail || window.paymentData.merchantEmail;
        if (!merchantEmail2) {
            throw new Error('商家邮箱不能为空');
        }
        // 新增: 批准 Enhanced 合约使用 USDT（ERC20 approve）
        showBlockchainStatus('正在授权USDT给 Enhanced 合约...');
        const erc20Abi = ["function approve(address,uint256) public returns (bool)"];
        const usdtForEnhanced = new ethers.Contract(window.CONFIG.USDT_ADDRESS, erc20Abi, signer2);
        const approveTxEnhanced = await usdtForEnhanced.approve(window.CONFIG.ENHANCED_ADDRESS, payAmount2);
        await approveTxEnhanced.wait();
        console.log('===DEBUG=== 已批准 Enhanced 合约 USDT, txHash:', approveTxEnhanced.hash);
        // 静态调用获取支付ID
        let blockchainPaymentId = await enhancedContract.callStatic.createOrder(
            window.paymentData.lpWalletAddress,
            window.CONFIG.USDT_ADDRESS,
            payAmount2,
            network2,
            merchantEmail2
        );
        // 发送交易创建订单
        const tx2 = await enhancedContract.createOrder(
            window.paymentData.lpWalletAddress,
            window.CONFIG.USDT_ADDRESS,
            payAmount2,
            network2,
            merchantEmail2
        );
        const receipt2 = await tx2.wait();
        // 从事件中提取真实链上支付ID，覆盖静态模拟值
        const paymentLockedEvent = receipt2.events.find(evt => evt.event === 'PaymentLocked');
        if (paymentLockedEvent && paymentLockedEvent.args && paymentLockedEvent.args.paymentId) {
          blockchainPaymentId = paymentLockedEvent.args.paymentId;
          console.log('===DEBUG=== 读取链上事件获取真实paymentId:', blockchainPaymentId);
        }
        // 定义 lockResult 对象，供后续 UI 更新使用
        const lockResult = {
            txHash: tx2.hash,
            receipt: receipt2,
            txTime: new Date().toISOString()
        };
        console.log('===DEBUG=== 链上订单创建完成，paymentId:', blockchainPaymentId);
        window.paymentData.blockchainPaymentId = blockchainPaymentId;
        // 初始化 LP 页面 PayPal 按钮
        if (typeof initializePayPal === 'function') {
          initializePayPal();
        }
        // 将真正的 createOrder 返回的 paymentId 保存到后端数据库
        try {
          await fetch(
            `${window.CONFIG.API_BASE_URL}/payment-intent/${window.paymentData.paymentIntentId}/generate-blockchain-id`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blockchainPaymentId })
            }
          );
          console.log('已向后端持久化区块链支付ID:', blockchainPaymentId);
        } catch (e) {
          console.warn('持久化区块链支付ID失败:', e);
        }
        // 更新状态并继续流程
        showBlockchainStatus('链上订单创建成功', 'success');
        
        // 更新状态
        showBlockchainStatus('区块链处理成功完成！', 'success');
        
        // 更新UI显示
        const statusElement = document.getElementById('payment-status');
        if (statusElement) {
            statusElement.textContent = '已锁定';
            statusElement.className = 'status locked';
        }
        
        // 禁用"开始处理"按钮，防止重复点击
        const startProcessBtn = document.getElementById('start-blockchain-process');
        if (startProcessBtn) {
            startProcessBtn.disabled = true;
            startProcessBtn.textContent = '处理完成';
        }
        
        // 显示交易详情 - 确保这里能看到交易详情
        if (!document.getElementById('transaction-details')) {
            // 如果详情面板还未创建，使用displayTransactionDetails函数创建
            displayTransactionDetails(lockResult);
        }
        
        // 更新页面中的状态历史，并弹出成功通知
        updateHistoryUI();
        showPaymentSuccessMessage({
            txHash: lockResult.txHash,
            amount: window.paymentData.amount,
            timestamp: lockResult.txTime || new Date().toISOString()
        });
        
        // 添加：定义支付ID以便后续存储
        const paymentId = window.paymentData.id || window.paymentData.paymentIntentId;

        // 储存交易信息到localStorage以便页面刷新后恢复
        try {
            safeLocalStorage('set', 'lastTxHash', lockResult.txHash);
            // 同时存储支付状态和区块高度
            safeLocalStorage('set', 'paymentStatus', 'locked');
            if (lockResult.receipt && lockResult.receipt.blockNumber) {
                safeLocalStorage('set', 'lastBlockNumber', lockResult.receipt.blockNumber);
            }
            // 存储交易时间
            safeLocalStorage('set', 'lastTxTime', lockResult.txTime || new Date().toISOString());
            // 存储支付详情
            if (window.paymentData) {
                safeLocalStorage('set', 'lastPaymentAmount', window.paymentData.amount);
                safeLocalStorage('set', 'lastPaymentId', paymentId);
                safeLocalStorage('set', 'lastLpAddress', window.paymentData.lpWalletAddress || window.paymentData.lpAddress);
                safeLocalStorage('set', 'lastStatus', window.paymentData.status);
                safeLocalStorage('set', 'lastStatusHistory', JSON.stringify(window.paymentData.statusHistory));
            }
        } catch (e) {
            console.warn('===DEBUG=== 存储交易数据失败:', e);
        }
    } catch (error) {
        console.error('===DEBUG=== 区块链处理失败:', error);
        showBlockchainStatus(`处理失败: ${error.message}`, 'danger');
        
        // 启用手动操作按钮，允许用户尝试其他方式
        enableBlockchainButtons();
    }
}

/**
 * 锁定支付资金 (适用于app.js)
 * @returns {Promise<Object>} 锁定结果
 */
async function lockAppPaymentOnChain() {
    try {
        console.log('===DEBUG=== 开始锁定资金');
        
        // 初始化合约服务
        if (!window.contractService) {
            console.log('===DEBUG=== 初始化合约服务');
            window.contractService = new ContractService();
            await window.contractService.initializeWeb3();
            await window.contractService.initializeContracts();
        }
        
        // 验证支付数据
        if (!window.paymentData) {
            throw new Error('支付数据缺失');
        }
        
        const lpAddress = window.paymentData.lpWalletAddress || window.paymentData.lpAddress;
        const amount = window.paymentData.amount;
        const paymentId = window.paymentData.id || window.paymentData.paymentIntentId;
        
        if (!lpAddress || !ethers.utils.isAddress(lpAddress)) {
            throw new Error('LP地址无效');
        }
        
        if (!amount || parseFloat(amount) <= 0) {
            throw new Error('支付金额无效');
        }
        
        // 移除不必要的支付ID验证，contract.js中将生成有效的ID
        console.log('===DEBUG=== 锁定参数:', {
            lpAddress,
            amount,
            paymentId: paymentId || '将自动生成'
        });
        
        // 调用合约服务锁定资金
        const result = await window.contractService.lockPayment(lpAddress, amount, paymentId);
        console.log('===DEBUG=== 锁定结果:', result);
        
        // 如果锁定成功，直接使用区块链交易结果更新UI
        if (result.success) {
            // 直接更新UI状态，不再调用API
            const statusElement = document.getElementById('payment-status');
            if (statusElement) {
                statusElement.textContent = '已锁定';
                statusElement.className = 'status locked';
            }
            
            // 显示成功消息，强调交易哈希
            const explorerUrl = `https://shannon-explorer.somnia.network/tx/${result.txHash}`;
            const txHashDisplay = `${result.txHash.substring(0, 10)}...${result.txHash.substring(result.txHash.length - 8)}`;
            
            showBlockchainStatus(`
                <strong>资金已成功锁定！</strong><br>
                交易哈希: <a href="${explorerUrl}" target="_blank" class="text-break">${txHashDisplay}</a>
                <button class="btn btn-sm btn-outline-secondary ms-2" 
                        onclick="navigator.clipboard.writeText('${result.txHash}').then(() => alert('交易哈希已复制到剪贴板'))">
                    复制 <i class="fas fa-copy"></i>
                </button>
            `, 'success');
            
            // 显示完整交易详情
            displayTransactionDetails(result);
            
            // 储存交易信息到localStorage以便页面刷新后恢复
            try {
                safeLocalStorage('set', 'lastTxHash', result.txHash);
                // 同时存储支付状态和区块高度
                safeLocalStorage('set', 'paymentStatus', 'locked');
                if (result.receipt && result.receipt.blockNumber) {
                    safeLocalStorage('set', 'lastBlockNumber', result.receipt.blockNumber);
                }
                // 存储交易时间
                safeLocalStorage('set', 'lastTxTime', new Date().toISOString());
                // 存储支付详情
                if (window.paymentData) {
                    safeLocalStorage('set', 'lastPaymentAmount', window.paymentData.amount);
                    safeLocalStorage('set', 'lastPaymentId', paymentId);
                    safeLocalStorage('set', 'lastLpAddress', lpAddress);
                    safeLocalStorage('set', 'lastStatus', window.paymentData.status);
                    safeLocalStorage('set', 'lastStatusHistory', JSON.stringify(window.paymentData.statusHistory));
                }
                
                // 显示成功消息，用于页面刷新后显示
                const successMessage = JSON.stringify({
                    message: '订单创建成功，资金已托管！',
                    txHash: result.txHash,
                    amount: window.paymentData?.amount || '未知',
                    timestamp: new Date().toISOString()
                });
                safeLocalStorage('set', 'paymentSuccessMessage', successMessage);
                
                // 不自动刷新页面，保留交易详情供用户查看
            } catch (e) {
                console.warn('===DEBUG=== 存储交易数据失败:', e);
            }
        }
        
        return result;
    } catch (error) {
        console.error('===DEBUG=== 锁定资金失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 显示倒计时刷新提示
 * @param {number} seconds - 倒计时秒数
 */
function showRefreshCountdown(seconds) {
    let countdownElement = document.getElementById('refresh-countdown');
    if (!countdownElement) {
        countdownElement = document.createElement('div');
        countdownElement.id = 'refresh-countdown';
        countdownElement.className = 'alert alert-info mt-3';
        
        // 插入到区块链状态下方
        const blockchainStatus = document.getElementById('blockchain-status');
        if (blockchainStatus) {
            blockchainStatus.parentNode.insertBefore(countdownElement, blockchainStatus.nextSibling);
        } else {
            // 找不到区块链状态元素时，添加到交易详情上方
            const txDetails = document.getElementById('transaction-details');
            if (txDetails) {
                txDetails.parentNode.insertBefore(countdownElement, txDetails);
            }
        }
    }
    
    function updateCountdown(secondsLeft) {
        if (secondsLeft > 0) {
            countdownElement.innerHTML = `
                <div class="d-flex align-items-center">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <span>页面将在 <strong>${secondsLeft}</strong> 秒后刷新，返回首页...</span>
                </div>
            `;
            setTimeout(() => updateCountdown(secondsLeft - 1), 1000);
        } else {
            countdownElement.innerHTML = `<div class="d-flex align-items-center">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span>正在刷新页面...</span>
            </div>`;
        }
    }
    
    updateCountdown(seconds);
}

/**
 * 显示交易详情
 * @param {Object} result - 交易结果
 */
function displayTransactionDetails(result) {
    // 已移除静态区块链交易详情面板
    return;
    if (!result || !result.txHash) return;
    
    console.log('===DEBUG=== 显示交易详情:', result);
    
    // 获取或创建交易详情容器
    let txDetailsContainer = document.getElementById('transaction-details');
    if (!txDetailsContainer) {
        // 在支付详情区域下方创建交易详情容器
        const paymentDetailsSection = document.querySelector('.payment-details-section');
        if (paymentDetailsSection) {
            txDetailsContainer = document.createElement('div');
            txDetailsContainer.id = 'transaction-details';
            txDetailsContainer.className = 'transaction-details-section mt-4 p-3 border rounded';
            paymentDetailsSection.parentNode.insertBefore(txDetailsContainer, paymentDetailsSection.nextSibling);
        } else {
            // 如果找不到支付详情区域，则添加到主容器
            const mainContainer = document.querySelector('.container');
            if (mainContainer) {
                txDetailsContainer = document.createElement('div');
                txDetailsContainer.id = 'transaction-details';
                txDetailsContainer.className = 'transaction-details-section mt-4 p-3 border rounded';
                mainContainer.appendChild(txDetailsContainer);
            } else {
                console.error('===DEBUG=== 无法找到适合添加交易详情的容器');
                return;
            }
        }
    }
    
    // 创建区块浏览器链接
    const explorerUrl = `https://shannon-explorer.somnia.network/tx/${result.txHash}`;
    const shortTxHash = `${result.txHash.substring(0, 8)}...${result.txHash.substring(result.txHash.length - 6)}`;
    
    // 获取交易时间，如果没有则使用当前时间
    const txTime = result.txTime || new Date().toISOString();
    const formattedTime = new Date(txTime).toLocaleString();
    
    // 获取支付金额
    const paymentAmount = window.paymentData?.amount || safeLocalStorage('get', 'lastPaymentAmount') || '未知';
    
    // 设置交易详情内容
    txDetailsContainer.innerHTML = `
        <h4 class="mb-3">区块链交易详情</h4>
        <div class="transaction-info">
            <div class="row mb-2">
                <div class="col-md-4 fw-bold">交易哈希:</div>
                <div class="col-md-8">
                    <a href="${explorerUrl}" target="_blank" class="text-break">
                        ${result.txHash}
                        <i class="fas fa-external-link-alt ms-1"></i>
                    </a>
                </div>
            </div>
            <div class="row mb-2">
                <div class="col-md-4 fw-bold">区块高度:</div>
                <div class="col-md-8">${result.receipt?.blockNumber || '等待确认...'}</div>
            </div>
            <div class="row mb-2">
                <div class="col-md-4 fw-bold">支付金额:</div>
                <div class="col-md-8">${paymentAmount} USDT</div>
            </div>
            <div class="row mb-2">
                <div class="col-md-4 fw-bold">状态:</div>
                <div class="col-md-8">
                    <span class="badge bg-success">成功</span>
                </div>
            </div>
            <div class="row mb-2">
                <div class="col-md-4 fw-bold">确认时间:</div>
                <div class="col-md-8">${formattedTime}</div>
            </div>
            <div class="row mt-3">
                <div class="col-12">
                    <a href="${explorerUrl}" target="_blank" class="btn btn-sm btn-primary">
                        在区块浏览器中查看 <i class="fas fa-external-link-alt ms-1"></i>
                    </a>
                    <button class="btn btn-sm btn-outline-secondary ms-2" 
                            onclick="navigator.clipboard.writeText('${result.txHash}').then(() => alert('交易哈希已复制到剪贴板'))">
                        复制交易哈希 <i class="fas fa-copy ms-1"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .transaction-details-section {
            background-color: #f8f9fa;
            border-color: #dee2e6 !important;
        }
        .transaction-details-section h4 {
            color: #495057;
            font-size: 1.25rem;
        }
        .transaction-info {
            font-size: 0.95rem;
        }
        .text-break {
            word-break: break-all;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 检查USDT余额 (适用于app.js)
 * @returns {Promise<{success: boolean, error: string|null, balance: string|null, required: number|null}>} 结果对象
 */
async function checkAppUSDTBalance() {
    try {
        console.log('===DEBUG=== 开始检查USDT余额');
        
        // 确保钱包已连接
        if (!window.ethereum || !window.ethereum.selectedAddress) {
            console.error('===DEBUG=== 钱包未连接，无法检查USDT余额');
            showBlockchainStatus('请先连接钱包', 'warning');
            return {
                success: false,
                error: 'WALLET_NOT_CONNECTED',
                message: '钱包未连接，请先连接钱包',
                balance: null,
                required: null
            };
        }
        
        // 初始化合约服务 - 优先使用已存在的实例
        if (!window.contractService) {
            console.log('===DEBUG=== 创建合约服务实例');
            window.contractService = new ContractService();
        }
        
        // 确保Web3已初始化
        if (!window.contractService.isInitialized()) {
            console.log('===DEBUG=== 初始化Web3');
            const web3Initialized = await window.contractService.initializeWeb3();
            if (!web3Initialized) {
                console.error('===DEBUG=== Web3初始化失败');
                showBlockchainStatus('Web3初始化失败，请确保钱包已正确连接', 'danger');
                return {
                    success: false,
                    error: 'WEB3_INIT_FAILED',
                    message: 'Web3初始化失败，请确保钱包已正确连接',
                    balance: null,
                    required: null
                };
            }
        }
        
        // 确保合约已初始化
        try {
            console.log('===DEBUG=== 初始化合约');
            await window.contractService.initializeContracts();
        } catch (contractError) {
            console.error('===DEBUG=== 合约初始化失败:', contractError);
            showBlockchainStatus(`合约初始化失败: ${contractError.message}`, 'danger');
            return {
                success: false,
                error: 'CONTRACT_INIT_FAILED',
                message: `合约初始化失败: ${contractError.message}`,
                balance: null,
                required: null
            };
        }
        
        // 验证支付数据
        if (!window.paymentData || !window.paymentData.amount) {
            showBlockchainStatus('支付数据缺失或金额无效', 'danger');
            return {
                success: false,
                error: 'INVALID_PAYMENT_DATA',
                message: '支付数据缺失或金额无效',
                balance: null,
                required: null
            };
        }
        
        // 获取USDT余额
        const balance = await window.contractService.getUSDTBalance();
        console.log('===DEBUG=== 当前USDT余额:', balance);
        
        // 获取费率，默认为0.5%
        const feeRate = window.paymentData.feeRate || 0.5;
        
        // 计算需要的总金额（原始金额 + 费率）
        const originalAmount = parseFloat(window.paymentData.amount);
        const totalRequiredAmount = originalAmount * (1 + feeRate / 100);
        
        console.log('===DEBUG=== 检查余额:', {
            currentBalance: parseFloat(balance),
            originalAmount: originalAmount,
            feeRate: feeRate + '%',
            totalRequiredAmount: totalRequiredAmount
        });
        
        // 检查余额是否足够支付总金额
        if (parseFloat(balance) < totalRequiredAmount) {
            const message = `USDT余额不足: ${balance} < ${totalRequiredAmount.toFixed(6)} (含${feeRate}%费率)`;
            showBlockchainStatus(message, 'danger');
            return {
                success: false,
                error: 'INSUFFICIENT_BALANCE',
                message: message,
                balance: balance,
                required: totalRequiredAmount
            };
        }
        
        return {
            success: true,
            error: null,
            message: null,
            balance: balance,
            required: totalRequiredAmount
        };
    } catch (error) {
        console.error('===DEBUG=== 检查USDT余额失败:', error);
        showBlockchainStatus(`USDT余额检查失败: ${error.message}`, 'danger');
        return {
            success: false,
            error: 'CHECK_BALANCE_FAILED',
            message: `USDT余额检查失败: ${error.message}`,
            balance: null,
            required: null
        };
    }
}

/**
 * 授权USDT (适用于app.js)
 * @returns {Promise<Object>} 授权结果
 */
async function approveAppUSDT() {
    try {
        console.log('===DEBUG=== 开始授权USDT');
        
        // 确保钱包已连接
        if (!window.ethereum || !window.ethereum.selectedAddress) {
            console.error('===DEBUG=== 钱包未连接，无法授权USDT');
            return {
                success: false,
                error: '请先连接钱包',
                errorCode: 'WALLET_NOT_CONNECTED'
            };
        }
        
        // 初始化合约服务 - 优先使用已存在的实例
        if (!window.contractService) {
            console.log('===DEBUG=== 创建合约服务实例');
            window.contractService = new ContractService();
        }
        
        // 确保Web3已初始化
        if (!window.contractService.isInitialized()) {
            console.log('===DEBUG=== 初始化Web3');
            const web3Initialized = await window.contractService.initializeWeb3();
            if (!web3Initialized) {
                console.error('===DEBUG=== Web3初始化失败');
                return {
                    success: false,
                    error: 'Web3初始化失败，请确保钱包已正确连接',
                    errorCode: 'WEB3_INIT_FAILED'
                };
            }
        }
        
        // 确保合约已初始化
        try {
            console.log('===DEBUG=== 初始化合约');
            await window.contractService.initializeContracts();
        } catch (contractError) {
            console.error('===DEBUG=== 合约初始化失败:', contractError);
            return {
                success: false,
                error: `合约初始化失败: ${contractError.message}`,
                errorCode: 'CONTRACT_INIT_FAILED'
            };
        }
        
        // 验证支付数据
        if (!window.paymentData || !window.paymentData.amount) {
            return {
                success: false,
                error: '支付数据缺失或金额无效',
                errorCode: 'INVALID_PAYMENT_DATA'
            };
        }
        
        // 获取费率和计算总金额
        const originalAmount = parseFloat(window.paymentData.amount);
        const feeRate = window.paymentData.feeRate || 0.5;
        const totalAmount = originalAmount * (1 + feeRate / 100);
        
        // 四舍五入到6位小数（USDT标准）
        const formattedTotalAmount = totalAmount.toFixed(6);
        
        console.log('===DEBUG=== 授权USDT金额:', {
            originalAmount: originalAmount,
            feeRate: feeRate + '%',
            totalAmount: formattedTotalAmount
        });
        
        // 授权包含费率的总金额
        const result = await window.contractService.approveUSDT(formattedTotalAmount);
        console.log('===DEBUG=== 授权结果:', result);
        
        return result;
    } catch (error) {
        console.error('===DEBUG=== 授权USDT失败:', error);
        return {
            success: false,
            error: error.message,
            errorCode: 'APPROVE_FAILED'
        };
    }
}

// 规范化支付数据
function normalizePaymentData(rawData) {
    if (!rawData) {
        console.error('===DEBUG=== 没有提供支付数据');
        return null;
    }
    
    console.log('===DEBUG=== 规范化支付数据:', rawData);
    
    // 检查LP地址字段
    const lpAddressValue = rawData.lpWalletAddress || rawData.lpAddress;
    
    // 获取费率，默认为0.5%
    const feeRate = rawData.feeRate || 0.5;
    
    // 创建标准化数据对象
    const normalizedData = {
        id: rawData.id || rawData.paymentIntentId || '',
        paymentIntentId: rawData.paymentIntentId || rawData.id || '',
        amount: rawData.amount || '0',
        lpWalletAddress: lpAddressValue || '',
        lpAddress: lpAddressValue || '',
        platform: rawData.platform || 'Other',
        status: rawData.status || 'created',
        description: rawData.description || '',
        currency: rawData.currency || 'USDT',
        feeRate: feeRate, // 添加费率字段
        // 保留商家邮箱和钱包地址以供区块链调用
        merchantPaypalEmail: rawData.merchantPaypalEmail || '',
        merchantEmail: rawData.merchantEmail || '',
        walletAddress: rawData.walletAddress || ''
    };
    
    // 添加状态历史记录字段，如果后端提供则使用，否则初始化为空数组
    normalizedData.statusHistory = rawData.statusHistory || [];
    
    console.log('===DEBUG=== 规范化后的数据:', normalizedData);
    return normalizedData;
}

// 显示区块链处理状态
function showBlockchainStatus(message, type = 'info') {
    const statusElement = document.getElementById('blockchain-status');
    if (statusElement) {
        statusElement.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    }
}

// 启用区块链操作按钮
function enableBlockchainButtons() {
    const approveButton = document.getElementById('approve-usdt');
    const settleButton = document.getElementById('settle-payment');
    
    if (approveButton) approveButton.disabled = false;
    if (settleButton) settleButton.disabled = false;
}

// 禁用区块链操作按钮
function disableBlockchainButtons() {
    const approveButton = document.getElementById('approve-usdt');
    const settleButton = document.getElementById('settle-payment');
    
    if (approveButton) approveButton.disabled = true;
    if (settleButton) settleButton.disabled = true;
}

/**
 * 从本地存储恢复交易信息
 */
function restoreTransactionDetails() {
    try {
        // 尝试获取存储的交易哈希和支付状态
        const txHash = safeLocalStorage('get', 'lastTxHash');
        const paymentStatus = safeLocalStorage('get', 'paymentStatus');
        
        if (!txHash || paymentStatus !== 'locked') {
            return false;
        }
        
        console.log('===DEBUG=== 从本地存储恢复交易信息:', { txHash, status: paymentStatus });
        
        // 获取其他交易详情
        const blockNumber = safeLocalStorage('get', 'lastBlockNumber') || '已确认';
        const txTime = safeLocalStorage('get', 'lastTxTime') || new Date().toISOString();
        const paymentAmount = safeLocalStorage('get', 'lastPaymentAmount') || '';
        const paymentId = safeLocalStorage('get', 'lastPaymentId') || '';
        const lpAddress = safeLocalStorage('get', 'lastLpAddress') || '';
        
        // 如果存在支付数据，恢复为全局变量
        if (paymentId && paymentAmount && lpAddress) {
            window.paymentData = {
                id: paymentId,
                paymentIntentId: paymentId,
                amount: paymentAmount,
                lpWalletAddress: lpAddress,
                lpAddress: lpAddress,
                status: 'locked'
            };
            console.log('===DEBUG=== 恢复payment数据:', window.paymentData);
        }
        
        // 模拟交易结果对象
        const mockResult = {
            success: true,
            txHash: txHash,
            receipt: {
                blockNumber: blockNumber
            },
            txTime: txTime
        };
        
        // 生成交易详情面板
        displayTransactionDetails(mockResult);
        
        // 更新状态显示
        const statusElement = document.getElementById('payment-status');
        if (statusElement) {
            statusElement.textContent = '已锁定';
            statusElement.className = 'status locked';
        }
        
        // 显示成功消息
        showBlockchainStatus('交易已成功处理并保存到区块链', 'success');
        
        // 禁用处理按钮
        const startProcessBtn = document.getElementById('start-blockchain-process');
        if (startProcessBtn) {
            startProcessBtn.disabled = true;
            startProcessBtn.textContent = '处理完成';
        }
        
        // 如果存在支付金额，显示到UI
        if (paymentAmount) {
            const amountElement = document.getElementById('payment-amount');
            if (amountElement && !amountElement.textContent.includes(paymentAmount)) {
                amountElement.textContent = `${paymentAmount} USDT`;
            }
        }
        
        // 如果存在LP地址，显示到UI
        if (lpAddress) {
            const lpAddressElement = document.getElementById('lp-address');
            if (lpAddressElement && !lpAddressElement.textContent.includes(lpAddress)) {
                lpAddressElement.textContent = lpAddress;
            }
        }
        
        return true;
    } catch (e) {
        console.error('===DEBUG=== 恢复交易信息失败:', e);
        return false;
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp);

/**
 * 模拟后端响应
 * @param {string} type - 响应类型 (blockchain-lock, confirm, etc)
 * @param {Object} data - 响应数据
 * @returns {Object} 模拟的响应结果
 */
function simulateBackendResponse(type, data = {}) {
    console.log(`===DEBUG=== 模拟后端${type}响应:`, data);
    
    // 根据不同类型返回不同的模拟数据
    switch(type) {
        case 'blockchain-lock':
            return {
                success: true,
                message: '交易已记录',
                status: 'locked',
                updatedAt: new Date().toISOString(),
                txHash: data.txHash || 'unknown'
            };
        case 'confirm':
            return {
                success: true,
                message: '支付已确认',
                status: 'confirmed',
                updatedAt: new Date().toISOString()
            };
        case 'cancel':
            return {
                success: true,
                message: '支付已取消',
                status: 'cancelled',
                updatedAt: new Date().toISOString()
            };
        default:
            return {
                success: true,
                message: '操作已模拟',
                status: 'processed',
                updatedAt: new Date().toISOString()
            };
    }
}

/**
 * 确认收到付款
 * @param {string} paymentId - 支付ID
 */
async function confirmPaymentReceivedByID(paymentId) {
  try {
    // 获取区块链支付ID（如果存在）
    const blockchainPaymentId = localStorage.getItem(`blockchain_payment_id_${paymentId}`) || paymentId;
    console.log('使用区块链支付ID:', blockchainPaymentId);
    
    // 更新UI显示处理中
    const confirmBtn = document.getElementById('confirm-receipt-btn');
    // 添加对按钮是否存在的检查
    if (!confirmBtn) {
      console.error('找不到确认收款按钮元素');
      return; // 如果找不到按钮，则退出函数
    }
    
    const originalBtnText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
    confirmBtn.disabled = true;
    
    // 显示状态信息
    let statusElement = document.getElementById('transaction-status');
    if (!statusElement) {
      statusElement = document.createElement('div');
      statusElement.id = 'transaction-status';
      statusElement.className = 'alert alert-info mt-3';
      confirmBtn.parentNode.appendChild(statusElement);
    }
    statusElement.innerHTML = '<i class="fas fa-info-circle"></i> 正在准备确认收款...';
    
    // 确认收款
    const result = await ContractService.confirmPaymentReceived(blockchainPaymentId);
    console.log('确认收款结果:', result);
    
    // 保存交易哈希
    if (result && result.transactionHash) {
      localStorage.setItem(`confirm_tx_${paymentId}`, result.transactionHash);
      
      // 验证交易状态
      statusElement.innerHTML = '<i class="fas fa-sync fa-spin"></i> 正在验证交易状态...';
      
      // 使用verifyTransactionStatus验证交易状态
      const verifyResult = await verifyTransactionStatus(result.transactionHash, (status) => {
        statusElement.innerHTML = `<i class="fas fa-info-circle"></i> ${status}`;
      });
      
      console.log('交易验证结果:', verifyResult);
      
      if (verifyResult.success) {
        // 交易成功
        statusElement.className = 'alert alert-success mt-3';
        statusElement.innerHTML = '<i class="fas fa-check-circle"></i> 确认收款成功!';
        
        // 更新支付状态
        await updatePaymentStatus(paymentId, 'confirmed');
        
        // 为了良好的用户体验，等待一会再刷新
        setTimeout(() => {
          location.reload();
        }, 2000);
      } else if (verifyResult.pending) {
        // 交易处理中
        statusElement.className = 'alert alert-warning mt-3';
        statusElement.innerHTML = `<i class="fas fa-clock"></i> 交易处理中，请稍后刷新页面查看结果。<br>交易哈希: <a href="${getExplorerTxUrl(result.transactionHash)}" target="_blank">${shortenHash(result.transactionHash)}</a>`;
        confirmBtn.innerHTML = originalBtnText;
        confirmBtn.disabled = false;
      } else {
        // 交易失败
        statusElement.className = 'alert alert-danger mt-3';
        statusElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 确认收款失败: ${verifyResult.error || '未知错误'}<br>交易哈希: <a href="${getExplorerTxUrl(result.transactionHash)}" target="_blank">${shortenHash(result.transactionHash)}</a>`;
        confirmBtn.innerHTML = originalBtnText;
        confirmBtn.disabled = false;
      }
    } else {
      // 没有交易哈希
      statusElement.className = 'alert alert-danger mt-3';
      statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 确认收款失败: 没有收到交易哈希';
      confirmBtn.innerHTML = originalBtnText;
      confirmBtn.disabled = false;
    }
  } catch (error) {
    console.error('确认收款错误:', error);
    
    // 处理特定错误
    let errorMessage = '确认收款时发生错误';
    
    if (error.message) {
      if (error.message.includes('not owner') || error.message.includes('NotOwner')) {
        errorMessage = '您不是此支付的所有者，无权确认收款';
      } else if (error.message.includes('invalid status') || error.message.includes('InvalidStatus')) {
        errorMessage = '当前支付状态不允许确认收款，可能已经被确认或释放';
      } else if (error.message.includes('payment not found') || error.message.includes('PaymentNotFound')) {
        errorMessage = '找不到对应的支付记录，请检查支付ID是否正确';
      } else if (error.message.includes('rejected')) {
        errorMessage = '您拒绝了交易签名';
      } else {
        errorMessage = `确认收款失败: ${error.message}`;
      }
    }
    
    // 更新UI显示错误
    const statusElement = document.getElementById('transaction-status') || document.createElement('div');
    statusElement.id = 'transaction-status';
    statusElement.className = 'alert alert-danger mt-3';
    statusElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${errorMessage}`;
    
    const confirmBtn = document.getElementById('confirm-receipt-btn');
    if (confirmBtn) {
      confirmBtn.innerHTML = '确认收款';
      confirmBtn.disabled = false;
      if (!statusElement.parentNode) {
        confirmBtn.parentNode.appendChild(statusElement);
      }
    }
  }
}

/**
 * 获取交易浏览器URL
 * @param {string} txHash - 交易哈希
 * @returns {string} 交易浏览器URL
 */
function getExplorerTxUrl(txHash) {
  // 优先使用 contractService 实例提供的获取方法
  if (window.contractService && typeof window.contractService.getExplorerTxUrl === 'function') {
    return window.contractService.getExplorerTxUrl(txHash);
  }
  // 使用 APP_CONFIG 中配置的 explorerBase
  const cfg = window.APP_CONFIG || {};
  const netKey = cfg.defaultNetwork || 'somnia';
  const networkCfg = cfg.networks && cfg.networks[netKey];
  if (networkCfg && networkCfg.explorerBase) {
    // 确保不重复斜杠
    return `${networkCfg.explorerBase.replace(/\/+$/, '')}/${txHash}`;
  }
  // 回退到 Somnia 默认区块链浏览器
  return `https://shannon-explorer.somnia.network/tx/${txHash}`;
}

/**
 * 缩短哈希值显示
 * @param {string} hash - 哈希值
 * @returns {string} 缩短后的哈希值
 */
function shortenHash(hash) {
  if (!hash) return '';
  return hash.substring(0, 6) + '...' + hash.substring(hash.length - 4);
}

/**
 * 释放支付
 * @param {string} paymentId - 支付ID
 */
async function releasePayment(e) {
  e.preventDefault();
  closeModals();

  try {
    // 显示加载提示
    startLoading('正在解锁支付，请稍候...');
    
    // 获取当前支付ID
    if (!currentPaymentIntentId) {
      throw new Error('未找到支付ID，请刷新页面重试');
    }
    
    let paymentId = currentPaymentIntentId;
    console.log(`正在解锁支付，前端ID: ${paymentId}`);
    
    // 获取区块链支付ID（如果存在）
    // 检查多种可能的ID映射键格式
    let blockchainPaymentId = null;
    
    // 首先检查标准格式
    blockchainPaymentId = localStorage.getItem(`blockchain_id_${paymentId}`);
    
    // 然后检查其他可能的格式
    if (!blockchainPaymentId) {
      blockchainPaymentId = localStorage.getItem(`blockchain_payment_id_${paymentId}`);
    }
    
    if (!blockchainPaymentId) {
      blockchainPaymentId = localStorage.getItem(`payment_blockchain_id_${paymentId}`);
    }
    
    if (!blockchainPaymentId) {
      // 如果找不到映射，则使用原始ID
      blockchainPaymentId = paymentId;
      console.warn(`找不到支付ID: ${paymentId} 的区块链ID映射，将直接使用前端ID`);
    } else {
      console.log(`找到区块链ID映射: 前端ID ${paymentId} -> 区块链ID ${blockchainPaymentId}`);
    }
    
    // 执行解锁交易
    console.log(`提交解锁交易，使用区块链ID: ${blockchainPaymentId}...`);
    const tx = await settlementContract.withdrawPayment(blockchainPaymentId);
    console.log('解锁支付交易已提交:', tx.hash);
    
    // 更新UI
    showMessage('解锁支付交易已提交，等待区块确认...', 'info');
    updateTransactionStatus('解锁交易已提交，等待确认', 'inProgress', getExplorerTxUrl(tx.hash));
    
    // 等待交易确认
    const receipt = await tx.wait();
    console.log('解锁支付交易已确认:', receipt);
    
    // 判断交易是否成功
    if (receipt.status === 1) {
      // 更新UI显示
      showMessage('支付已成功解锁给接收方', 'success');
      updateTransactionStatus('支付已解锁', 'success', getExplorerTxUrl(receipt.transactionHash));
      document.getElementById('releasePaymentBtn').disabled = true;
      document.getElementById('releasePaymentBtn').textContent = '已解锁';
      
      // 更新支付状态
      loadPaymentDetails(paymentId);
    } else {
      showMessage('解锁支付失败，交易被回滚', 'error');
      updateTransactionStatus('解锁支付失败', 'error', getExplorerTxUrl(receipt.transactionHash));
    }
  } catch (error) {
    console.error('解锁支付时发生错误:', error);
    handleContractError(error, '解锁支付失败');
  } finally {
    stopLoading();
  }
}

/**
 * 检查支付状态是否允许确认
 * @param {string} paymentId - 支付ID
 * @returns {Promise<boolean>} 是否可以确认
 */
async function isPaymentConfirmable(paymentId) {
  try {
    console.log(`[isPaymentConfirmable] 开始检查支付是否可确认, ID: ${paymentId}`);
    
    if (!paymentId) {
      console.error('[isPaymentConfirmable] 支付ID为空');
      showMessage('支付ID不能为空', 'error');
      return false;
    }
    
    if (!window.contractService) {
      console.error('[isPaymentConfirmable] 合约服务未初始化');
      showMessage('区块链服务未初始化，请刷新页面重试', 'error');
      return false;
    }
    
    // 确保合约服务已初始化
    if (!window.contractService.isInitialized()) {
      console.log('[isPaymentConfirmable] 合约服务未初始化，尝试初始化...');
      try {
        await window.contractService.initializeWeb3();
        console.log('[isPaymentConfirmable] 合约服务初始化成功');
      } catch (initError) {
        console.error('[isPaymentConfirmable] 合约服务初始化失败:', initError);
        showMessage('初始化区块链服务失败，请检查钱包连接并刷新页面', 'error');
        return false;
      }
    }
    
    // 检查钱包地址
    const walletAddress = window.contractService.walletAddress;
    if (!walletAddress) {
      console.error('[isPaymentConfirmable] 未检测到钱包地址');
      showMessage('请先连接钱包', 'warning');
      return false;
    }
    console.log(`[isPaymentConfirmable] 当前钱包地址: ${walletAddress}`);
    
    // 获取托管合约
    let settlementContract;
    try {
      settlementContract = await window.contractService.getEscrowContract();
      console.log('[isPaymentConfirmable] 托管合约获取成功');
    } catch (contractError) {
      console.error('[isPaymentConfirmable] 获取托管合约失败:', contractError);
      showMessage('获取智能合约失败，请检查网络连接', 'error');
      return false;
    }
    
    try {
      // 尝试使用getPayment方法（如果存在）
      console.log(`[isPaymentConfirmable] 尝试获取支付状态，支付ID: ${paymentId}`);
      
      // 由于我们不确定合约上确切的方法名称，尝试几种可能的方法名
      let payment;
      let methodUsed = '';
      
      if (typeof settlementContract.getPayment === 'function') {
        try {
          payment = await settlementContract.getPayment(paymentId);
          methodUsed = 'getPayment';
          console.log(`[isPaymentConfirmable] 使用${methodUsed}获取到支付状态:`, payment);
        } catch (e) {
          console.warn(`[isPaymentConfirmable] ${methodUsed}方法调用失败:`, e.message);
        }
      }
      
      if (!payment && typeof settlementContract.getEscrow === 'function') {
        try {
          payment = await settlementContract.getEscrow(paymentId);
          methodUsed = 'getEscrow';
          console.log(`[isPaymentConfirmable] 使用${methodUsed}获取到支付状态:`, payment);
        } catch (e) {
          console.warn(`[isPaymentConfirmable] ${methodUsed}方法调用失败:`, e.message);
        }
      }
      
      if (!payment && typeof settlementContract.payments === 'function') {
        try {
          payment = await settlementContract.payments(paymentId);
          methodUsed = 'payments';
          console.log(`[isPaymentConfirmable] 使用${methodUsed}获取到支付状态:`, payment);
        } catch (e) {
          console.warn(`[isPaymentConfirmable] ${methodUsed}方法调用失败:`, e.message);
        }
      }
      
      if (!payment && typeof settlementContract.escrows === 'function') {
        try {
          payment = await settlementContract.escrows(paymentId);
          methodUsed = 'escrows';
          console.log(`[isPaymentConfirmable] 使用${methodUsed}获取到支付状态:`, payment);
        } catch (e) {
          console.warn(`[isPaymentConfirmable] ${methodUsed}方法调用失败:`, e.message);
        }
      }
      
      // 如果能获取到payment对象，分析它的结构
      if (payment) {
        console.log(`[isPaymentConfirmable] 成功通过${methodUsed}获取支付对象:`, payment);
        
        // 尝试从返回的结构中确定状态
        // 如果返回的是数组，尝试按照标准Escrow结构解析
        if (Array.isArray(payment)) {
          // 标准Escrow返回: [user, token, amount, lp, timestamp, released]
          const released = payment[5]; // 假设第6个元素是released状态
          const owner = payment[0];    // 假设第1个元素是所有者地址
          
          console.log(`[isPaymentConfirmable] 支付对象是数组，解析结果 - 所有者: ${owner}, 已释放: ${released}`);
          
          // 检查用户是否为支付的所有者
          const currentWallet = window.contractService.walletAddress;
          const isOwner = owner && currentWallet ? 
                          owner.toLowerCase() === currentWallet.toLowerCase() : 
                          false;
          
          console.log(`[isPaymentConfirmable] 当前钱包是否为所有者: ${isOwner}`);
          
          // 如果不是所有者，显示错误
          if (!isOwner) {
            showMessage('您不是此支付的所有者，无法确认', 'warning');
            return false;
          }
          
          // 如果已释放，显示错误
          if (released) {
            showMessage('此支付已释放，无法再次确认', 'warning');
            return false;
          }
          
          // 支付未释放且当前用户是所有者，则可以确认
          console.log('[isPaymentConfirmable] 支付状态检查通过，可以确认');
          return true;
        } 
        // 如果返回的是对象，查找status或state属性
        else if (typeof payment === 'object') {
          const status = payment.status || payment.state;
          const owner = payment.user || payment.owner;
          const released = payment.released || payment.isReleased || payment.status === 'RELEASED';
          
          console.log(`[isPaymentConfirmable] 支付对象是对象，解析结果 - 所有者: ${owner}, 状态: ${status}, 已释放: ${released}`);
          
          // 检查用户是否为支付的所有者
          const currentWallet = window.contractService.walletAddress;
          const isOwner = owner && currentWallet ? 
                          owner.toLowerCase() === currentWallet.toLowerCase() : 
                          false;
                          
          console.log(`[isPaymentConfirmable] 当前钱包是否为所有者: ${isOwner}`);
          
          // 如果不是所有者，显示错误
          if (!isOwner) {
            showMessage('您不是此支付的所有者，无法确认', 'warning');
            return false;
          }
          
          // 如果已释放，显示错误
          if (released) {
            showMessage('此支付已释放，无法再次确认', 'warning');
            return false;
          }
          
          // 如果有明确的status或state字段
          if (status) {
            const validStatuses = ['ACTIVE', 'LOCKED', 'CREATED'];
            const canConfirm = validStatuses.includes(status);
            
            console.log(`[isPaymentConfirmable] 状态(${status})是否允许确认: ${canConfirm}`);
            
            if (!canConfirm) {
              showMessage(`当前支付状态(${status})不允许确认`, 'warning');
              return false;
            }
            
            return true;
          }
          
          // 否则看released字段
          console.log('[isPaymentConfirmable] 支付状态检查通过，可以确认');
          return !released && isOwner;
        }
      } else {
        console.log('[isPaymentConfirmable] 无法通过合约方法获取支付信息，尝试使用估算gas方式检查');
      }
      
      // 尝试调用confirmPayment方法进行估算，看是否会失败
      try {
        // 这里我们不实际执行交易，只是估算gas
        console.log(`[isPaymentConfirmable] 尝试估算确认交易gas，支付ID: ${paymentId}`);
        const gasEstimate = await settlementContract.estimateGas.confirmPayment(paymentId);
        console.log('[isPaymentConfirmable] 确认交易gas估算成功:', gasEstimate.toString());
        // 如果能够成功估算gas，说明支付状态允许确认
        console.log('[isPaymentConfirmable] Gas估算成功，支付可以确认');
        return true;
      } catch (gasError) {
        console.error('[isPaymentConfirmable] 确认交易gas估算失败:', gasError);
        
        // 解析合约错误消息
        let errorReason = '';
        const errorObject = gasError.error || gasError;
        const errorData = errorObject?.data?.data;
        
        // 尝试从错误数据中提取实际错误消息
        if (errorData) {
          try {
            // 错误数据通常是十六进制编码的字符串，需要解码
            // 截取错误数据的有效部分（跳过前缀）并解码
            // 典型格式: 0x08c379a0...
            const PREFIX_LENGTH = 138; // 典型的错误数据前缀长度
            if (typeof ethers !== 'undefined' && typeof ethers.utils !== 'undefined') {
              const decodedError = ethers.utils.toUtf8String('0x' + errorData.slice(PREFIX_LENGTH));
              console.log('[isPaymentConfirmable] 解码后的错误消息:', decodedError);
              errorReason = decodedError;
            }
          } catch (decodeError) {
            console.error('[isPaymentConfirmable] 解析错误数据失败:', decodeError);
          }
        }
        
        // 合约错误: Payment not found
        if ((errorReason && errorReason.includes('Payment not found')) || 
            (gasError.message && gasError.message.includes('Payment not found'))) {
          showMessage(`支付ID "${paymentId}" 在链上不存在，请确认ID是否正确或重新创建订单`, 'warning');
          return false;
        }
        
        // 合约错误: Invalid payment status - 提供更具体的错误信息
        if ((errorReason && (errorReason.includes('Invalid payment status') || errorReason.includes('invalid status'))) ||
            (gasError.message && (gasError.message.includes('Invalid payment status') || gasError.message.includes('invalid status')))) {
          
          console.log('[isPaymentConfirmable] 检测到无效支付状态错误，尝试获取详细信息');
          
          // 尝试获取支付的当前状态来提供更详细的错误信息
          try {
            // 尝试调用查询方法获取支付状态（如果存在）
            let paymentStatus = null;
            let statusName = "未知";
            
            // 根据合约提供的方法获取状态
            if (typeof settlementContract.getPaymentStatus === 'function') {
              paymentStatus = await settlementContract.getPaymentStatus(paymentId);
              console.log(`[isPaymentConfirmable] 通过getPaymentStatus获取到状态:`, paymentStatus);
            } else if (typeof settlementContract.getEscrowStatus === 'function') {
              paymentStatus = await settlementContract.getEscrowStatus(paymentId);
              console.log(`[isPaymentConfirmable] 通过getEscrowStatus获取到状态:`, paymentStatus);
            }
            
            // 如果能获取到状态，提供更具体的信息
            if (paymentStatus !== null) {
              // 解析状态码为状态名称
              if (typeof paymentStatus === 'number') {
                statusName = getPaymentStatusName(paymentStatus);
              } else if (typeof paymentStatus === 'string') {
                statusName = paymentStatus;
              }
              
              if (statusName === "CONFIRMED" || statusName === "SETTLED" || 
                  statusName.includes('confirm') || statusName.includes('settle')) {
                showMessage(`此支付已被确认，不能重复确认`, 'warning');
              } else if (statusName === "RELEASED" || statusName.includes('release')) {
                showMessage(`此支付已被释放，无法确认`, 'warning');
              } else if (statusName === "CANCELLED" || statusName.includes('cancel')) {
                showMessage(`此支付已被取消，无法确认`, 'warning');
              } else if (statusName === "DISPUTED" || statusName.includes('dispute')) {
                showMessage(`此支付处于争议状态，请联系客服处理`, 'warning');
              } else {
                showMessage(`支付当前状态(${statusName})不允许确认`, 'warning');
              }
            } else {
              // 无法获取具体状态时提供一般性信息
              showMessage(`支付状态不允许确认，可能已被确认、释放或取消`, 'warning');
            }
          } catch (statusError) {
            console.error('[isPaymentConfirmable] 获取支付状态失败:', statusError);
            showMessage(`支付状态不允许确认，可能已被确认、释放或取消`, 'warning');
          }
          
          return false;
        }
        
        // 合约错误: Not owner
        if ((errorReason && errorReason.includes('not owner')) ||
            (gasError.message && gasError.message.includes('not owner'))) {
          showMessage('您不是此支付的所有者，无法确认', 'warning');
          return false;
        }
        
        // 从错误消息中检查常见错误
        const message = gasError.message || '';
        if (message.includes('Payment not found') || errorObject?.data?.message?.includes('Payment not found')) {
          showMessage(`支付ID "${paymentId}" 在链上不存在，请确认ID是否正确或重新创建订单`, 'warning');
          return false;
        }
        
        if (message.includes('invalid status') || message.includes('InvalidStatus')) {
          showMessage('支付状态不允许确认，可能已确认或已释放', 'warning');
          return false;
        }
        
        if (message.includes('not owner')) {
          showMessage('您不是此支付的所有者，无法确认', 'warning');
          return false;
        }
        
        // 默认错误信息，如果无法确定具体原因
        const errorMessage = errorReason || message || '未知错误';
        console.error(`[isPaymentConfirmable] 未能识别的合约错误: ${errorMessage}`);
        showMessage(`无法确认支付，原因: ${errorMessage}`, 'warning');
        return false;
      }
      
    } catch (contractError) {
      console.error('[isPaymentConfirmable] 获取支付详情失败:', contractError);
      
      // 如果错误是因为找不到支付记录
      if (contractError.message && (
          contractError.message.includes('not found') || 
          contractError.message.includes('Payment not found') ||
          contractError.message.includes('revert')
      )) {
        showMessage('找不到支付记录，可能ID无效或已被删除', 'warning');
        return false;
      }
      
      // 尝试调用confirmPayment方法，看是否会成功
      // 这是一个兜底处理方案
      console.log('[isPaymentConfirmable] 获取支付详情失败，尝试使用gas估算作为最后手段');
      try {
        // 只估算gas，不实际执行交易
        const gasEstimate = await settlementContract.estimateGas.confirmPayment(paymentId);
        console.log('[isPaymentConfirmable] 确认交易gas估算成功，支付可能可以确认:', gasEstimate.toString());
        return true;
      } catch (gasError) {
        console.error('[isPaymentConfirmable] 确认交易gas估算失败，支付不能确认:', gasError);
        
        // 尝试解析错误消息
        if (gasError.message) {
          if (gasError.message.includes('not found') || gasError.message.includes('Payment not found')) {
            showMessage('找不到对应的支付记录', 'warning');
          } else if (gasError.message.includes('not owner')) {
            showMessage('您不是此支付的所有者', 'warning');
          } else if (gasError.message.includes('invalid status')) {
            showMessage('支付状态不允许确认', 'warning');
          } else {
            showMessage(`确认失败: ${gasError.message}`, 'error');
          }
        } else {
          showMessage('确认支付失败，请稍后重试', 'error');
        }
        
        return false;
      }
    }
  } catch (error) {
    console.error('[isPaymentConfirmable] 检查支付状态过程中发生未处理的错误:', error);
    showMessage(`检查支付状态失败: ${error.message || '未知错误'}`, 'error');
    return false;
  }
}

/**
 * 根据状态码获取支付状态名称
 * @param {number} statusCode - 状态码
 * @returns {string} 状态名称
 */
function getPaymentStatusName(statusCode) {
  // 根据合约中的状态码定义映射状态名称
  const statusMap = {
    0: 'CREATED',    // 初始创建
    1: 'LOCKED',     // 资金已锁定
    2: 'CONFIRMED',  // 已确认
    3: 'RELEASED',   // 已释放
    4: 'CANCELLED',  // 已取消
    5: 'DISPUTED',   // 争议中
    6: 'REFUNDED'    // 已退款
  };
  
  return statusMap[statusCode] || `未知状态(${statusCode})`;
}

/**
 * 检查并显示支付状态，并提供刷新解决方案
 * @param {string} paymentId - 前端支付ID
 * @param {string} blockchainId - 区块链支付ID
 * @returns {Promise<boolean>} 支付是否可操作
 */
async function checkAndShowPaymentStatus(paymentId, blockchainId) {
  try {
    console.log(`[checkAndShowPaymentStatus] 开始检查支付状态，前端ID: ${paymentId}, 区块链ID: ${blockchainId}`);
    
    // 先尝试从localStorage获取之前同步的状态
    const cachedStatusName = localStorage.getItem(`payment_status_name_${paymentId}`);
    const lastSyncTime = localStorage.getItem(`payment_status_last_sync_${paymentId}`);
    
    if (cachedStatusName && lastSyncTime) {
      const syncTime = new Date(lastSyncTime);
      const now = new Date();
      const diffMinutes = (now - syncTime) / (1000 * 60);
      
      // 如果缓存状态较新（5分钟内）直接使用
      if (diffMinutes < 5) {
        console.log(`[checkAndShowPaymentStatus] 使用缓存状态: ${cachedStatusName}，同步于 ${diffMinutes.toFixed(1)} 分钟前`);
        createStatusMessage(paymentId, blockchainId, cachedStatusName);
        
        // 根据状态确定是否可操作
        const actionableStatuses = ['LOCKED', '1'];
        return actionableStatuses.includes(cachedStatusName);
      }
    }
    
    // 如果没有缓存或缓存过期，同步状态
    const syncResult = await syncPaymentStatus(paymentId);
    
    if (syncResult.success) {
      createStatusMessage(paymentId, blockchainId, syncResult.statusName);
      
      // 根据状态确定是否可操作
      return syncResult.statusName === 'LOCKED' || syncResult.status === 1;
    } else {
      // 同步失败，创建错误状态消息
      // 如果是NOT_FOUND错误，建议创建新订单
      if (syncResult.status === 'NOT_FOUND') {
        createStatusMessage(paymentId, blockchainId, syncResult.status || 'NOT_FOUND', '系统已升级到新的智能合约，请创建新订单');
      } else {
        createStatusMessage(paymentId, blockchainId, syncResult.status || 'ERROR', syncResult.error);
      }
      return false;
    }
    
  } catch (error) {
    console.error('[checkAndShowPaymentStatus] 执行过程中发生错误:', error);
    showMessage('检查支付状态失败: ' + error.message, 'error');
    
    // 创建错误消息，建议创建新订单
    const errorMsg = document.createElement('div');
    errorMsg.className = 'alert alert-danger mt-3';
    errorMsg.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i> 获取支付状态失败<br>
      <p>系统已升级到新的智能合约，建议创建新订单</p>
      <button onclick="showPaymentDiagnostics('${paymentId}')" class="btn btn-sm btn-primary mt-2">诊断问题</button>
    `;
    
    // 添加到页面
    const confirmBtn = document.getElementById('confirmPaymentBtn') || document.getElementById('confirm-receipt-btn');
    if (confirmBtn && confirmBtn.parentNode) {
      const existingStatus = confirmBtn.parentNode.querySelector('.alert');
      if (existingStatus) {
        existingStatus.replaceWith(errorMsg);
      } else {
        confirmBtn.parentNode.appendChild(errorMsg);
      }
    } else {
      document.body.appendChild(errorMsg);
    }
    
    return false;
  }
}

/**
 * 创建并显示状态消息
 * @param {string} paymentId - 支付ID
 * @param {string} blockchainId - 区块链ID
 * @param {string} statusName - 状态名称
 * @param {string} errorMessage - 错误消息（可选）
 */
function createStatusMessage(paymentId, blockchainId, statusName, errorMessage) {
  // 创建状态消息元素
  const statusMsg = document.createElement('div');
  statusMsg.id = 'payment-status-msg';
  
  // 根据状态提供不同的消息和操作建议
  if (statusName === 'LOCKED' || statusName === '1') {
    statusMsg.className = 'alert alert-success mt-3';
    statusMsg.innerHTML = '<i class="fas fa-check-circle"></i> 支付状态正常，可以进行确认操作';
  } else if (statusName === 'CONFIRMED' || statusName === '2' || 
              statusName.includes('confirm') || statusName.includes('settle')) {
    statusMsg.className = 'alert alert-info mt-3';
    statusMsg.innerHTML = `
      <i class="fas fa-info-circle"></i> 此支付已被确认，无需重复操作<br>
      <a href="javascript:void(0)" onclick="location.reload()" class="btn btn-sm btn-primary mt-2">刷新页面</a>
    `;
  } else if (statusName === 'RELEASED' || statusName === '3' || statusName.includes('release')) {
    statusMsg.className = 'alert alert-info mt-3';
    statusMsg.innerHTML = `
      <i class="fas fa-info-circle"></i> 此支付已被释放，无需操作<br>
      <a href="javascript:void(0)" onclick="location.reload()" class="btn btn-sm btn-primary mt-2">刷新页面</a>
    `;
  } else if (statusName === 'CANCELLED' || statusName === '4' || statusName.includes('cancel')) {
    statusMsg.className = 'alert alert-warning mt-3';
    statusMsg.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i> 此支付已被取消<br>
      <a href="javascript:void(0)" onclick="location.reload()" class="btn btn-sm btn-primary mt-2">刷新页面</a>
    `;
  } else if (statusName === 'DISPUTED' || statusName === '5' || statusName.includes('dispute')) {
    statusMsg.className = 'alert alert-danger mt-3';
    statusMsg.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i> 此支付处于争议状态，请联系客服处理
    `;
  } else if (statusName === 'REFUNDED' || statusName === '6' || statusName.includes('refund')) {
    statusMsg.className = 'alert alert-info mt-3';
    statusMsg.innerHTML = `
      <i class="fas fa-info-circle"></i> 此支付已退款<br>
      <a href="javascript:void(0)" onclick="location.reload()" class="btn btn-sm btn-primary mt-2">刷新页面</a>
    `;
  } else if (statusName === 'NOT_FOUND') {
    statusMsg.className = 'alert alert-danger mt-3';
    statusMsg.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i> 找不到此支付记录<br>
      <p>${errorMessage || '系统已升级到最新智能合约V2版本，建议创建新订单'}</p>
      <a href="/create-payment.html" class="btn btn-sm btn-success mt-2">创建新订单</a>
      <button onclick="showPaymentDiagnostics('${paymentId}')" class="btn btn-sm btn-primary mt-2">诊断问题</button>
    `;
  } else if (statusName === 'INVALID_STATUS') {
    statusMsg.className = 'alert alert-warning mt-3';
    statusMsg.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i> 支付状态异常，无法确认<br>
      <p>系统已升级到最新智能合约V2版本，可能与旧订单不兼容</p>
      <a href="/create-payment.html" class="btn btn-sm btn-success mt-2">创建新订单</a>
      <button onclick="showPaymentDiagnostics('${paymentId}')" class="btn btn-sm btn-primary mt-2">诊断问题</button>
    `;
  } else if (statusName === 'NOT_OWNER') {
    statusMsg.className = 'alert alert-warning mt-3';
    statusMsg.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i> 您不是此支付的所有者，无法进行操作<br>
      <button onclick="showPaymentDiagnostics('${paymentId}')" class="btn btn-sm btn-primary mt-2">诊断问题</button>
    `;
  } else if (statusName === 'ERROR') {
    statusMsg.className = 'alert alert-danger mt-3';
    statusMsg.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i> 获取支付状态出错: ${errorMessage || '未知错误'}<br>
      <p>系统已升级到最新智能合约V2版本，建议创建新订单</p>
      <a href="/create-payment.html" class="btn btn-sm btn-success mt-2">创建新订单</a>
      <button onclick="showPaymentDiagnostics('${paymentId}')" class="btn btn-sm btn-primary mt-2">诊断问题</button>
    `;
  } else {
    statusMsg.className = 'alert alert-warning mt-3';
    statusMsg.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i> 支付状态(${statusName})不允许确认<br>
      <button onclick="showPaymentDiagnostics('${paymentId}')" class="btn btn-sm btn-primary mt-2">诊断问题</button>
    `;
  }
  
  // 添加到页面
  const confirmBtn = document.getElementById('confirmPaymentBtn') || document.getElementById('confirm-receipt-btn');
  if (confirmBtn && confirmBtn.parentNode) {
    const existingStatus = confirmBtn.parentNode.querySelector('.alert');
    if (existingStatus) {
      existingStatus.replaceWith(statusMsg);
    } else {
      confirmBtn.parentNode.appendChild(statusMsg);
    }
  } else {
    document.body.appendChild(statusMsg);
  }
}

/**
 * 刷新支付状态（可以从页面上调用）
 * @param {string} paymentId - 支付ID
 */
function refreshPaymentStatus(paymentId) {
  showMessage('正在刷新支付状态...', 'info');
  
  // 获取区块链ID
  let blockchainId = localStorage.getItem(`blockchain_id_${paymentId}`);
  if (!blockchainId) {
    blockchainId = localStorage.getItem(`blockchain_payment_id_${paymentId}`);
  }
  if (!blockchainId) {
    blockchainId = localStorage.getItem(`payment_blockchain_id_${paymentId}`);
  }
  
  if (!blockchainId) {
    blockchainId = paymentId;
    console.warn(`找不到支付ID: ${paymentId} 的区块链ID映射，将尝试使用前端ID`);
  }
  
  // 使用新的同步机制
  syncPaymentStatus(paymentId).then(syncResult => {
    if (syncResult.success) {
      showMessage(`支付状态已更新: ${syncResult.statusName}`, 'success');
      
      // 重新检查和显示支付状态
      checkAndShowPaymentStatus(paymentId, syncResult.blockchainId || blockchainId).then(isActionable => {
        if (isActionable) {
          showMessage('支付可以确认，请点击确认按钮', 'success');
        }
      });
    } else {
      showMessage(`刷新状态失败: ${syncResult.error}`, 'warning');
      
      // 如果同步失败，显示诊断界面
      showPaymentDiagnostics(paymentId);
    }
  }).catch(error => {
    console.error('刷新支付状态失败:', error);
    showMessage(`刷新支付状态失败: ${error.message}`, 'error');
  });
}

/**
 * 同步支付状态，确保前端显示的状态与链上一致
 * @param {string} paymentId - 前端支付ID
 * @returns {Promise<Object>} 同步结果，包含状态信息
 */
async function syncPaymentStatus(paymentId) {
  try {
    console.log(`[syncPaymentStatus] 尝试同步支付状态，ID: ${paymentId}`);
    
    // 获取区块链ID
    let blockchainId = localStorage.getItem(`blockchain_id_${paymentId}`);
    if (!blockchainId) {
      blockchainId = localStorage.getItem(`blockchain_payment_id_${paymentId}`);
    }
    if (!blockchainId) {
      blockchainId = localStorage.getItem(`payment_blockchain_id_${paymentId}`);
    }
    
    if (!blockchainId) {
      console.warn(`[syncPaymentStatus] 找不到支付ID: ${paymentId} 的区块链ID映射`);
      return { success: false, error: '找不到区块链ID映射', status: null };
    }
    
    // 获取合约服务
    if (!window.contractService) {
      return { success: false, error: '合约服务未初始化', status: null };
    }
    
    if (!window.contractService.isInitialized()) {
      try {
        await window.contractService.initializeWeb3();
      } catch (initError) {
        console.error('[syncPaymentStatus] 初始化合约服务失败:', initError);
        return { success: false, error: '初始化合约服务失败', status: null };
      }
    }
    
    // 获取托管合约
    const settlementContract = await window.contractService.getEscrowContract();
    if (!settlementContract) {
      return { success: false, error: '无法获取托管合约', status: null };
    }
    
    // 获取链上支付状态
    let onChainStatus = null;
    let statusCode = null;
    let statusName = '未知';
    
    // 尝试不同的方法获取支付状态
    try {
      if (typeof settlementContract.getPaymentStatus === 'function') {
        statusCode = await settlementContract.getPaymentStatus(blockchainId);
        onChainStatus = statusCode;
        console.log(`[syncPaymentStatus] 通过getPaymentStatus获取状态:`, statusCode);
      } else if (typeof settlementContract.getEscrowStatus === 'function') {
        statusCode = await settlementContract.getEscrowStatus(blockchainId);
        onChainStatus = statusCode;
        console.log(`[syncPaymentStatus] 通过getEscrowStatus获取状态:`, statusCode);
      } else if (typeof settlementContract.getPayment === 'function') {
        const paymentData = await settlementContract.getPayment(blockchainId);
        if (paymentData && typeof paymentData === 'object') {
          if (typeof paymentData.status !== 'undefined') {
            statusCode = paymentData.status;
            onChainStatus = statusCode;
          } else if (Array.isArray(paymentData) && paymentData.length > 5) {
            // 如果返回的是数组，尝试从固定位置获取状态信息
            const released = paymentData[5]; // 假设第6个元素是released状态
            statusCode = released ? 3 : 1;  // 3=RELEASED, 1=LOCKED
            onChainStatus = statusCode;
          }
          console.log(`[syncPaymentStatus] 通过getPayment获取状态:`, onChainStatus);
        }
      }
    } catch (statusError) {
      console.error('[syncPaymentStatus] 获取链上状态失败:', statusError);
      
      // 尝试从错误中提取信息
      if (statusError.message) {
        if (statusError.message.includes('Payment not found')) {
          return { 
            success: false, 
            error: '支付不存在', 
            errorDetail: statusError.message,
            status: 'NOT_FOUND'
          };
        }
      }
      
      return { 
        success: false, 
        error: '获取链上状态失败', 
        errorDetail: statusError.message,
        status: null
      };
    }
    
    // 尝试用gas估算来判断状态
    if (onChainStatus === null) {
      try {
        // 估算gas，看是否允许确认
        await settlementContract.estimateGas.confirmPayment(blockchainId);
        // 如果能估算成功，说明支付处于可确认状态
        statusCode = 1; // LOCKED
        onChainStatus = statusCode;
        console.log(`[syncPaymentStatus] 通过gas估算判断支付状态为可确认`);
      } catch (gasError) {
        console.log(`[syncPaymentStatus] gas估算失败，尝试从错误中提取状态信息:`, gasError);
        
        // 从错误中提取信息
        if (gasError.message) {
          if (gasError.message.includes('Payment not found')) {
            return { 
              success: false, 
              error: '支付不存在', 
              errorDetail: gasError.message,
              status: 'NOT_FOUND'
            };
          } else if (gasError.message.includes('Invalid payment status') || 
                    gasError.message.includes('invalid status')) {
            // 尝试解析详细错误数据
            const errorObject = gasError.error || gasError;
            const errorData = errorObject?.data?.data;
            
            if (errorData && typeof ethers !== 'undefined' && typeof ethers.utils !== 'undefined') {
              try {
                const PREFIX_LENGTH = 138;
                const decodedError = ethers.utils.toUtf8String('0x' + errorData.slice(PREFIX_LENGTH));
                console.log('[syncPaymentStatus] 解码后的错误消息:', decodedError);
                
                if (decodedError.includes('already confirmed')) {
                  statusCode = 2; // CONFIRMED
                  onChainStatus = statusCode;
                } else if (decodedError.includes('already released')) {
                  statusCode = 3; // RELEASED
                  onChainStatus = statusCode;
                } else if (decodedError.includes('cancelled')) {
                  statusCode = 4; // CANCELLED
                  onChainStatus = statusCode;
                }
              } catch (decodeError) {
                console.error('[syncPaymentStatus] 解析错误数据失败:', decodeError);
              }
            }
            
            if (onChainStatus === null) {
              // 如果仍然无法确定具体状态，返回INVALID_STATUS
              return { 
                success: false, 
                error: '支付状态异常', 
                errorDetail: gasError.message,
                status: 'INVALID_STATUS'
              };
            }
          }
        }
      }
    }
    
    if (onChainStatus !== null) {
      // 将数字状态码转换为状态名称
      if (typeof onChainStatus === 'number') {
        statusName = getPaymentStatusName(onChainStatus);
      } else if (typeof onChainStatus === 'string') {
        statusName = onChainStatus;
      }
      
      // 将链上状态保存到localStorage
      localStorage.setItem(`payment_status_${paymentId}`, typeof onChainStatus === 'number' ? 
                           onChainStatus.toString() : onChainStatus);
      localStorage.setItem(`payment_status_name_${paymentId}`, statusName);
      localStorage.setItem(`payment_status_last_sync_${paymentId}`, new Date().toISOString());
      
      console.log(`[syncPaymentStatus] 已同步支付状态: ${statusName} (${onChainStatus})`);
      
      return { 
        success: true, 
        status: onChainStatus,
        statusName: statusName,
        blockchainId: blockchainId
      };
    }
    
    return { 
      success: false, 
      error: '无法确定链上状态', 
      status: null 
    };
  } catch (error) {
    console.error(`[syncPaymentStatus] 同步支付状态失败:`, error);
    return { 
      success: false, 
      error: '同步支付状态失败', 
      errorDetail: error.message,
      status: null 
    };
  }
}

/**
 * 诊断支付状态问题
 * @param {string} paymentId - 前端支付ID 
 * @returns {Promise<Object>} 诊断结果
 */
async function diagnosePaymentStatus(paymentId) {
  console.log(`[diagnosePaymentStatus] 开始诊断支付状态，ID: ${paymentId}`);
  
  const results = {
    findings: [],
    hasSolution: false,
    solutionType: null,
    solution: '',
    status: null,
    blockchainId: null
  };
  
  try {
    // 1. 检查区块链ID映射
    let blockchainId = localStorage.getItem(`blockchain_id_${paymentId}`);
    if (!blockchainId) {
      blockchainId = localStorage.getItem(`blockchain_payment_id_${paymentId}`);
    }
    if (!blockchainId) {
      blockchainId = localStorage.getItem(`payment_blockchain_id_${paymentId}`);
    }
    
    if (!blockchainId) {
      results.findings.push('找不到区块链ID映射，无法在链上查询支付');
      results.findings.push('系统已升级到最新智能合约V2版本');
      results.hasSolution = true;
      results.solutionType = 'RECREATE';
      results.solution = '系统已升级到新的智能合约，建议创建新订单';
      return results;
    }
    
    results.blockchainId = blockchainId;
    results.findings.push(`找到区块链ID映射: ${blockchainId}`);
    results.findings.push('系统已升级到最新智能合约V2版本');
    
    // 2. 同步支付状态
    const syncResult = await syncPaymentStatus(paymentId);
    if (!syncResult.success) {
      results.findings.push(`同步状态失败: ${syncResult.error}`);
      
      if (syncResult.status === 'NOT_FOUND') {
        results.findings.push('支付在区块链上不存在，可能是因为系统已升级到新的智能合约');
        results.hasSolution = true;
        results.solutionType = 'RECREATE';
        results.solution = '系统已升级到新的智能合约，建议创建新订单';
      } else if (syncResult.status === 'INVALID_STATUS') {
        results.findings.push('支付状态异常，不允许确认操作');
        results.hasSolution = true;
        results.solutionType = 'RECREATE';
        results.solution = '系统已升级到新的智能合约，建议创建新订单';
      } else {
        results.findings.push('无法确定支付状态，系统已升级到新的智能合约');
        results.hasSolution = true;
        results.solutionType = 'RECREATE';
        results.solution = '建议创建新订单以使用最新合约功能';
      }
    } else {
      results.status = syncResult.status;
      results.findings.push(`支付当前状态: ${syncResult.statusName}`);
      
      // 根据状态提供解决方案
      if (syncResult.statusName === 'CONFIRMED' || syncResult.status === 2) {
        results.findings.push('支付已被确认，无需再次确认');
        results.hasSolution = true;
        results.solutionType = 'RELOAD';
        results.solution = '刷新页面，查看最新支付状态';
      } else if (syncResult.statusName === 'RELEASED' || syncResult.status === 3) {
        results.findings.push('支付已被释放，无法确认');
        results.hasSolution = true;
        results.solutionType = 'RELOAD';
        results.solution = '刷新页面，查看最新支付状态';
      } else if (syncResult.statusName === 'CANCELLED' || syncResult.status === 4) {
        results.findings.push('支付已被取消，无法确认');
        results.hasSolution = true;
        results.solutionType = 'RECREATE';
        results.solution = '需要重新创建支付';
      } else if (syncResult.statusName === 'LOCKED' || syncResult.status === 1) {
        results.findings.push('支付状态正常，可以确认');
        results.hasSolution = true;
        results.solutionType = 'CONFIRM';
        results.solution = '尝试再次确认支付';
      } else {
        results.findings.push(`支付处于未知状态: ${syncResult.statusName}`);
        results.findings.push('系统已升级到新的智能合约V2版本');
        results.hasSolution = true;
        results.solutionType = 'RECREATE';
        results.solution = '建议创建新订单以使用最新合约功能';
      }
    }
    
    // 3. 检查钱包权限
    const walletAddress = window.contractService?.walletAddress;
    if (!walletAddress) {
      results.findings.push('当前未连接钱包，无法确认支付');
      results.hasSolution = true;
      results.solutionType = 'CONNECT_WALLET';
      results.solution = '请先连接钱包';
      return results;
    }
    
    // 4. 检查链上余额
    try {
      const balance = await window.contractService.getUSDTBalance(walletAddress);
      results.findings.push(`当前钱包USDT余额: ${balance}`);
      
      if (parseFloat(balance) <= 0) {
        results.findings.push('钱包USDT余额不足');
        results.hasSolution = false;
        results.solution = '请确保钱包中有足够的USDT用于支付Gas费';
      }
    } catch (balanceError) {
      console.error('[diagnosePaymentStatus] 获取余额失败:', balanceError);
      results.findings.push('无法获取钱包余额');
    }
    
    return results;
  } catch (error) {
    console.error(`[diagnosePaymentStatus] 诊断过程中发生错误:`, error);
    results.findings.push(`诊断过程出错: ${error.message}`);
    results.findings.push('系统已升级到新的智能合约V2版本');
    results.hasSolution = true;
    results.solutionType = 'RECREATE';
    results.solution = '建议创建新订单以使用最新合约功能';
    return results;
  }
}

/**
 * 显示支付状态诊断结果模态框
 * @param {string} paymentId - 支付ID
 */
async function showPaymentDiagnostics(paymentId) {
  // 创建模态框
  const modalId = 'payment-diagnostic-modal';
  let diagnosticModal = document.getElementById(modalId);
  
  if (!diagnosticModal) {
    diagnosticModal = document.createElement('div');
    diagnosticModal.className = 'modal fade';
    diagnosticModal.id = modalId;
    diagnosticModal.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">支付状态诊断 (ID: ${paymentId})</h5>
            <button type="button" class="close" data-dismiss="modal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <strong>系统提示:</strong> 本系统已升级到最新智能合约V2版本，旧合约上的订单可能无法正常操作。建议创建新订单。
            </div>
            <div id="diagnostic-loading" class="text-center">
              <div class="spinner-border text-primary"></div>
              <p class="mt-2">正在诊断支付状态，请稍候...</p>
            </div>
            <div id="diagnostic-results" class="mt-3" style="display:none;">
              <h6>诊断发现:</h6>
              <ul id="diagnostic-findings" class="list-group mb-3"></ul>
              
              <div id="diagnostic-solution-container" class="mt-3">
                <h6>解决方案:</h6>
                <div id="diagnostic-solution" class="alert"></div>
              </div>
              
              <div id="diagnostic-actions" class="mt-3"></div>
            </div>
          </div>
          <div class="modal-footer">
            <a href="/create-payment.html" class="btn btn-success">创建新订单</a>
            <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(diagnosticModal);
  }
  
  // 显示模态框
  if (typeof $ !== 'undefined') {
    $(diagnosticModal).modal('show');
  } else {
    diagnosticModal.style.display = 'block';
  }
  
  // 执行诊断
  try {
    const results = await diagnosePaymentStatus(paymentId);
    
    // 显示诊断结果
    const loadingDiv = document.getElementById('diagnostic-loading');
    const resultsDiv = document.getElementById('diagnostic-results');
    const findingsList = document.getElementById('diagnostic-findings');
    const solutionDiv = document.getElementById('diagnostic-solution');
    const actionsDiv = document.getElementById('diagnostic-actions');
    
    // 填充发现列表
    findingsList.innerHTML = '';
    results.findings.forEach(finding => {
      const li = document.createElement('li');
      li.className = 'list-group-item';
      li.innerText = finding;
      findingsList.appendChild(li);
    });
    
    // 显示解决方案
    solutionDiv.innerHTML = results.solution;
    solutionDiv.className = results.hasSolution ? 
      'alert alert-success' : 'alert alert-warning';
    
    // 添加操作按钮
    actionsDiv.innerHTML = '';
    
    if (results.hasSolution) {
      switch (results.solutionType) {
        case 'RELOAD':
          actionsDiv.innerHTML = `
            <button onclick="location.reload()" class="btn btn-primary">刷新页面</button>
          `;
          break;
        case 'RECREATE':
          actionsDiv.innerHTML = `
            <a href="/create-payment.html" class="btn btn-success">创建新订单</a>
          `;
          break;
        case 'RECOVER':
          actionsDiv.innerHTML = `
            <button onclick="refreshPaymentStatus('${paymentId}')" class="btn btn-primary">刷新状态</button>
            <button onclick="resetPaymentState('${paymentId}')" class="btn btn-warning ml-2">重置状态</button>
          `;
          break;
        case 'CONFIRM':
          actionsDiv.innerHTML = `
            <button onclick="confirmPaymentReceivedByID('${paymentId}')" class="btn btn-success">确认支付</button>
          `;
          break;
        case 'CONNECT_WALLET':
          actionsDiv.innerHTML = `
            <button onclick="connectWallet()" class="btn btn-primary">连接钱包</button>
          `;
          break;
      }
    } else {
      actionsDiv.innerHTML = `
        <div class="alert alert-info">
          系统已升级到最新智能合约V2版本，建议创建新订单<br>
          <a href="/create-payment.html" class="btn btn-success mt-2">创建新订单</a>
        </div>
      `;
    }
    
    // 显示结果，隐藏加载
    loadingDiv.style.display = 'none';
    resultsDiv.style.display = 'block';
    
  } catch (error) {
    console.error('诊断失败:', error);
    
    // 显示错误
    const loadingDiv = document.getElementById('diagnostic-loading');
    const resultsDiv = document.getElementById('diagnostic-results');
    
    resultsDiv.innerHTML = `
      <div class="alert alert-danger">
        <strong>诊断失败:</strong> ${error.message}
      </div>
      <div class="alert alert-info mt-3">
        系统已升级到最新智能合约V2版本，建议创建新订单<br>
        <a href="/create-payment.html" class="btn btn-success mt-2">创建新订单</a>
      </div>
    `;
    
    loadingDiv.style.display = 'none';
    resultsDiv.style.display = 'block';
  }
}

/**
 * 重置支付状态
 * @param {string} paymentId - 支付ID
 */
async function resetPaymentState(paymentId) {
  try {
    if (!confirm('确定要重置支付状态吗？这将清除本地缓存的状态信息。')) {
      return;
    }
    
    // 清除状态相关的localStorage
    localStorage.removeItem(`payment_status_${paymentId}`);
    localStorage.removeItem(`payment_status_name_${paymentId}`);
    localStorage.removeItem(`payment_status_last_sync_${paymentId}`);
    
    showMessage('支付状态已重置，正在刷新...', 'info');
    
    // 重新同步状态
    const syncResult = await syncPaymentStatus(paymentId);
    
    if (syncResult.success) {
      showMessage(`支付状态已刷新: ${syncResult.statusName}`, 'success');
    } else {
      showMessage(`重置状态后出现问题: ${syncResult.error}`, 'warning');
    }
    
    // 刷新页面以更新UI
    setTimeout(() => {
      location.reload();
    }, 2000);
    
  } catch (error) {
    console.error('重置支付状态失败:', error);
    showMessage(`重置支付状态失败: ${error.message}`, 'error');
  }
}

// 在文件末尾添加渲染和弹窗函数
// 渲染状态历史
function renderHistory(history) {
    let list = history;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch (e) { list = []; }
    }
    if (!Array.isArray(list)) list = [];
    if (list.length === 0) {
        return '<tr><td colspan="3" class="text-center">No status history</td></tr>';
    }
    return list.map(entry => {
        // Translate Chinese history notes to English
        let desc = entry.description || entry.note || '';
        const mapping = [
            ['支付意图创建', 'Payment Intent Created'],
            ['资金已锁定', 'Funds Locked'],
            ['本地缓存', '(Local Cache)'],
            ['认领任务', 'Task Claimed'],
            ['PayPal支付已捕获', 'PayPal payment captured'],
            ['订单ID', 'Order ID'],
            ['捕获ID', 'Capture ID'],
            ['Chainlink 验证通过', 'Chainlink Verification Passed'],
            ['Chainlink 验证已完成', 'Chainlink Verification Passed'],
            ['Chainlink 验证确认', 'Chainlink Verification Passed'],
            ['Chainlink 自动释放资金', 'Chainlink Funds Released'],
            ['自动释放资金', 'Funds Released'],
            ['用户已确认', 'User Confirmed'],
            ['Chainlink 验证完成事件', 'Chainlink Verification Completed'],
            ['Chainlink 验证确认事件', 'Chainlink Verification Confirmed']
        ];
        mapping.forEach(([cn, en]) => { desc = desc.split(cn).join(en); });
        const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
        // Build description with hyperlink for transaction hashes
        if (entry.txHash) {
            const url = getExplorerTxUrl(entry.txHash);
            const link = `<a href="${url}" target="_blank">${shortenHash(entry.txHash)}</a>`;
            desc = desc ? `${desc}<br>${link}` : link;
        } else {
            // Auto-link any hex transaction hash in the text
            desc = (desc || '').replace(/(0x[a-fA-F0-9]+)/g, function(match) {
                const url = getExplorerTxUrl(match);
                return `<a href="${url}" target="_blank">${match}</a>`;
            });
        }
        // 使用 status 或 mainStatus
        const statusKey = entry.status || entry.mainStatus;
        return `<tr>
            <td>${time}</td>
            <td><span class="badge ${getStatusBadgeClass(statusKey)}">${getStatusText(statusKey)}</span></td>
            <td>${desc}</td>
        </tr>`;
    }).join('');
}

// 用户详情弹窗
async function showUserPaymentDetailModal(payment) {
    // 防止重复打开多个详情弹窗
    const existingModal = document.getElementById('user-detail-modal');
    if (existingModal) {
      existingModal.remove();
    }
    // 直接使用传入的数据库数据，无需再次调用后端
    const originalHistory = payment.statusHistory || [];
    const history = Array.isArray(originalHistory) ? [...originalHistory] : [];
    const hasLocked = history.some(e => (e.status || e.mainStatus || '').toLowerCase() === 'locked');
    if (!hasLocked) {
        const lastPaymentId = safeLocalStorage('get', 'lastPaymentId');
        const lastTxHash = safeLocalStorage('get', 'lastTxHash');
        const lastTxTime = safeLocalStorage('get', 'lastTxTime');
        if ((payment.id || payment.paymentIntentId) && String(lastPaymentId) === String(payment.id || payment.paymentIntentId) && lastTxHash) {
            history.push({ timestamp: lastTxTime || new Date().toISOString(), status: 'locked', txHash: lastTxHash, note: '资金已锁定 (本地缓存)' });
        }
    }
    // 本地缓存用户确认状态填充
    const lastStatusName = safeLocalStorage('get', `payment_status_name_${payment.id}`);
    if (lastStatusName) {
      const normalizedLast = lastStatusName.toLowerCase();
      if (['confirmed','user_confirmed'].includes(normalizedLast)) {
        const lastSync = safeLocalStorage('get', `payment_status_last_sync_${payment.id}`) || new Date().toISOString();
        const hasConfirmed = history.some(e => (e.status || e.mainStatus || '').toLowerCase().includes('confirm'));
        if (!hasConfirmed) {
          history.push({ timestamp: lastSync, status: normalizeStatus(normalizedLast), note: '用户已确认 (本地缓存)' });
        }
        // 覆盖整体状态
        payment.status = normalizeStatus(normalizedLast);
      }
    }
    // 按时间排序，保证顺序正确
    history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    payment.statusHistory = history;
    // 根据历史记录最后一条状态更新整体状态，确保详情显示最新状态
    if (history.length > 0) {
      const lastEntry = history[history.length - 1];
      const lastStatusKey = lastEntry.status || lastEntry.mainStatus;
      payment.status = normalizeStatus(lastStatusKey);
    }
    const modal = document.createElement('div');
    modal.className = 'modal fade show';
    modal.style.display = 'block';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Payment Details</h5>
          <button type="button" class="btn-close" id="close-user-detail-modal"></button>
        </div>
        <div class="modal-body">
          <div class="row">
            <div class="col-md-6">
              <div class="card mb-3">
                <div class="card-header">Basic Information</div>
                <div class="card-body">
                  <p><strong>Amount:</strong> ${payment.amount} ${payment.currency || 'USDT'}</p>
                  <p><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(payment.status)}">${getStatusText(payment.status)}</span></p>
                  <p><strong>Payment Platform:</strong> ${payment.platform}</p>
                  <p><strong>Created At:</strong> ${new Date(payment.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="card mb-3">
                <div class="card-header">LP Information</div>
                <div class="card-body">
                  <p><strong>LP Address:</strong> ${payment.lpWalletAddress || payment.lpAddress}</p>
                  <p><strong>Action:</strong> <a href="#" onclick="viewProof('${payment.id}'); return false;">View Proof</a></p>
                </div>
              </div>
            </div>
          </div>
          <div class="card mb-3">
            <div class="card-header">Status History</div>
            <div class="card-body">
              <table class="table table-sm table-striped">
                <thead><tr><th>Time</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>${renderHistory(payment.statusHistory)}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="close-user-detail-button">Close</button>
        </div>
      </div>
    </div>
    `;
    document.body.appendChild(modal);
    const closeIcon = modal.querySelector('#close-user-detail-modal');
    if (closeIcon) {
      closeIcon.addEventListener('click', () => modal.remove());
    }
    const closeBtn = modal.querySelector('#close-user-detail-button');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.remove());
    }
    return payment;
}

// 添加: 更新状态历史UI的函数
function updateHistoryUI() {
  const container = document.getElementById('payment-history');
  if (!container) return;
  container.innerHTML = `
    <div class="card mb-3">
      <div class="card-header">Status History</div>
      <div class="card-body">
        <table class="table table-sm table-striped">
          <thead><tr><th>Time</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>${renderHistory(window.paymentData.statusHistory)}</tbody>
        </table>
      </div>
    </div>
  `;
}

// 新增：清理本地缓存相关函数
function clearPaymentCache(paymentId) {
  try {
    localStorage.removeItem(`payment_status_name_${paymentId}`);
    localStorage.removeItem(`payment_status_last_sync_${paymentId}`);
    localStorage.removeItem('paymentData');
    localStorage.removeItem('lastPaymentId');
    localStorage.removeItem('lastTxHash');
    localStorage.removeItem('lastTxTime');
    localStorage.removeItem(`payment_status_${paymentId}`);
  } catch (e) {
    console.warn('清理本地缓存失败:', e);
  }
}

// 全局函数：查看支付凭证（使用Bootstrap模态框展示）
window.viewProof = async function(paymentId) {
  try {
    const response = await fetch(`${API_BASE_URL}/payment-intents/${paymentId}`);
    const result = await response.json();
    if (!response.ok || !result.success || !result.data || !result.data.paymentProof) {
      showErrorMessage('没有找到支付凭证');
      return;
    }
    const proof = result.data.paymentProof;
    // 创建或重用模态框
    let proofModal = document.getElementById('proof-modal');
    if (!proofModal) {
      proofModal = document.createElement('div');
      proofModal.id = 'proof-modal';
      proofModal.className = 'modal fade';
      proofModal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">支付凭证</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <pre id="proof-content" style="white-space: pre-wrap; word-break: break-all;"></pre>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(proofModal);
    }
    // 填充凭证内容
    const modalBody = proofModal.querySelector('.modal-body');
    const coreFields = [
      { label: '订单号', value: proof.orderId || proof.orderID || proof.order_number || proof.orderNumber || proof.paypalOrderId || proof.paypal_order_id },
      { label: '捕获ID', value: proof.captureId || proof.captureID || proof.capture_id || proof.paypalCaptureId || proof.paypal_capture_id },
      { label: '状态', value: proof.status || proof.state || proof.paypalStatus },
      { label: '时间', value: (proof.createTime || proof.transactionTime || proof.time || proof.timestamp)
          ? new Date(proof.createTime || proof.transactionTime || proof.time || proof.timestamp).toLocaleString()
          : 'N/A' },
      { label: '商家邮箱', value: proof.merchantEmail || proof.merchant_email || proof.email },
    ];
    let html = '<div>';
    coreFields.forEach(field => {
      html += `<p><strong>${field.label}:</strong> ${field.value || 'N/A'}</p>`;
    });
    html += '</div>';
    html += '<details><summary>原始凭证 (点击展开)</summary>';
    html += `<pre style="white-space: pre-wrap; word-break: break-all;">${JSON.stringify(proof, null, 2)}</pre>`;
    html += '</details>';
    modalBody.innerHTML = html;
    // 显示模态框
    const bsModal = new bootstrap.Modal(proofModal);
    bsModal.show();
  } catch (err) {
    showErrorMessage('获取支付凭证失败: ' + err.message);
  }
};

// 简化并修复 Connect Wallet 按钮点击处理
async function handleConnectWalletClick(event) {
  event.preventDefault();
  console.log('连接钱包按钮被点击');
  const btn = event.currentTarget;
  btn.disabled = true;
  const originalText = btn.innerText;
  btn.innerText = '连接中...';
  try {
    const address = await walletConnector.connect();
    console.log('walletConnector.connect 返回地址:', address);
    if (!address) {
      btn.disabled = false;
      btn.innerText = originalText;
    }
  } catch (error) {
    console.error('连接钱包失败:', error);
    alert(error.message || '连接钱包失败');
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

// 处理成功连接
function handleSuccessfulConnection(accounts, button, originalText) {
  if (accounts && accounts.length > 0) {
    // 设置全局变量
    walletAddress = accounts[0];
    isWalletConnected = true;
    
    console.log('成功获取钱包地址:', walletAddress);
    
    try {
      // 创建provider和signer
      provider = new ethers.providers.Web3Provider(window.ethereum);
      signer = provider.getSigner();
      console.log('Provider和Signer创建成功');
      
      // 更新UI
      if (walletAddressSpan) {
        walletAddressSpan.textContent = walletAddress;
      }
      
      // 隐藏连接区域，显示用户仪表盘
      if (walletConnectSection) {
        walletConnectSection.classList.add('d-none');
      }
      if (userDashboard) {
        userDashboard.classList.remove('d-none');
      }
      
      console.log('UI已更新');
      
      // 设置walletConnector状态
      if (window.walletConnector) {
        walletConnector.walletAddress = walletAddress;
        walletConnector.isConnected = true;
        walletConnector.provider = provider;
        walletConnector.signer = signer;
        console.log('WalletConnector已更新');
      }
      
      // 加载用户数据
      if (typeof loadUserPaymentTasks === 'function') {
        loadUserPaymentTasks();
      }
      
      // 初始化合约
      if (typeof initUSDTContract === 'function') {
        initUSDTContract();
      }
      
      // 连接Socket
      if (typeof connectSocket === 'function') {
        connectSocket();
      }
      
      console.log('钱包连接流程完成');
    } catch (error) {
      console.error('处理成功连接过程中发生错误:', error);
    }
  } else {
    console.error('账户列表为空');
  }
  
  // 恢复按钮状态
  if (button) {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}
