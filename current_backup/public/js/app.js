/**
 * Link Card 前端应用
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

// API基础URL
const API_BASE_URL = 'http://localhost:3000/api';

// 初始化应用
async function initApp() {
  // 初始化事件监听器
  initEventListeners();
  
  // 检查钱包连接状态
  await checkWalletConnection();
  
  // 如果已连接钱包，加载用户支付任务
  if (walletAddress) {
    loadUserPaymentTasks();
  }
}

// 初始化事件监听器
function initEventListeners() {
  // 连接钱包按钮
  connectWalletBtn.addEventListener('click', () => connectWallet());
  
  // 扫描二维码按钮
  scanQrBtn.addEventListener('click', () => qrFileInput.click());
  
  // 二维码文件输入
  qrFileInput.addEventListener('change', handleQrFileSelect);
  
  // 创建支付按钮
  createPaymentBtn.addEventListener('click', createPaymentIntent);
  
  // 确认收到按钮
  confirmReceivedBtn.addEventListener('click', confirmPaymentReceived);
  
  // 刷新余额按钮
  refreshBalanceBtn.addEventListener('click', loadUSDTBalance);
  
  // 支付平台选择变更事件
  document.getElementById('payment-platform').addEventListener('change', function() {
    const paypalEmailField = document.getElementById('paypal-email-field');
    if (this.value === 'PayPal') {
      paypalEmailField.style.display = 'block';
    } else {
      paypalEmailField.style.display = 'none';
    }
  });
}

// 连接钱包
async function connectWallet(autoConnect = false) {
  try {
    // 检查是否安装了MetaMask
    if (window.ethereum) {
      // 创建provider
      provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // 请求账户访问
      const accounts = await provider.send('eth_requestAccounts', []);
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
      // 创建provider
      provider = new ethers.providers.Web3Provider(window.ethereum);
      
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
        
        // 连接Socket.io
        connectSocket();
        
        // 加载用户支付任务
        loadUserPaymentTasks();
        
        // 加载USDT余额
        initUSDTContract();
      } else {
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
  socket = io('http://localhost:3000', {
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
    fetch(`${API_BASE_URL}/payment-intent/${data.paymentIntentId}`)
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
  
  // 断开连接事件
  socket.on('disconnect', () => {
    console.log('Socket.io连接断开');
  });
}

// 处理二维码文件选择
async function handleQrFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    // 显示加载中状态
    scanQrBtn.disabled = true;
    scanQrBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 处理中...';
    
    // 使用FileReader读取文件
    const reader = new FileReader();
    reader.onload = async function(e) {
      const img = new Image();
      img.onload = async function() {
        // 创建canvas用于图像处理
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);
        
        // 获取图像数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // 使用jsQR解码
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code) {
          console.log('二维码解析成功:', code.data);
          
          // 填充二维码内容到表单
          qrContent.value = code.data;
          
          // 显示支付表单
          paymentForm.classList.remove('d-none');
          
          // 尝试从二维码数据中提取支付平台
          const platform = identifyPaymentPlatform(code.data);
          if (platform) {
            paymentPlatform.value = platform;
            
            // 如果是PayPal，尝试提取邮箱
            if (platform === 'PayPal') {
              try {
                const merchantPaypalEmailField = document.getElementById('merchant-paypal-email');
                if (merchantPaypalEmailField) {
                  let merchantPaypalEmail = '';
                  
                  if (code.data.includes('@')) {
                    // 直接包含邮箱地址
                    const emailMatch = code.data.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                    if (emailMatch) {
                      merchantPaypalEmail = emailMatch[0];
                      console.log('从二维码中提取到PayPal邮箱:', merchantPaypalEmail);
                    }
                  } else if (code.data.includes('paypal.com')) {
                    // PayPal链接，尝试提取邮箱参数
                    const urlParams = new URLSearchParams(code.data.split('?')[1]);
                    merchantPaypalEmail = urlParams.get('business') || urlParams.get('email') || '';
                    console.log('从PayPal链接中提取到邮箱:', merchantPaypalEmail);
                  } else if (code.data.startsWith('{') && code.data.endsWith('}')) {
                    // JSON格式
                    try {
                      const jsonData = JSON.parse(code.data);
                      merchantPaypalEmail = jsonData.email || jsonData.paypalEmail || '';
                      console.log('从JSON中提取到PayPal邮箱:', merchantPaypalEmail);
                    } catch (e) {
                      console.error('解析JSON失败:', e);
                    }
                  }
                  
                  if (merchantPaypalEmail) {
                    // 设置商家PayPal邮箱
                    merchantPaypalEmailField.value = merchantPaypalEmail;
                    // 显示PayPal邮箱输入框
                    document.getElementById('paypal-email-field').style.display = 'block';
                  }
                }
              } catch (error) {
                console.error('提取PayPal邮箱出错:', error);
              }
            }
            
            // 触发平台选择变更事件，确保UI正确更新
            paymentPlatform.dispatchEvent(new Event('change'));
          }
          
          // 尝试从二维码数据中提取金额
          const amount = extractAmount(code.data);
          if (amount) {
            paymentAmount.value = amount;
          }
        } else {
          showMessage('无法从图像中解码二维码，请尝试重新扫描或手动输入信息', 'error');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.error('处理二维码文件失败:', error);
    showMessage('处理二维码文件失败: ' + error.message, 'error');
  } finally {
    // 恢复按钮状态
    scanQrBtn.disabled = false;
    scanQrBtn.textContent = '扫描二维码';
    
    // 重置文件输入，以便可以再次选择同一文件
    qrFileInput.value = '';
  }
}

// 识别支付平台
function identifyPaymentPlatform(content) {
  let platform = 'Unknown';
  let amount = null;
  
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
      }
    } else {
      // URL格式识别
      if (content.includes('paypal.com')) {
        platform = 'PayPal';
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
    
    // 如果找到金额，自动填充
    if (amount && !isNaN(amount) && amount > 0) {
      paymentAmount.value = amount.toFixed(2);
    }
    
    console.log('识别结果:', { platform, amount });
    return platform;
  } catch (error) {
    console.error('识别支付平台失败:', error);
    platform = 'Other';
    paymentPlatform.value = platform;
    return platform;
  }
}

// 显示消息
function showMessage(message, type) {
  const messageDiv = document.getElementById('message');
  if (messageDiv) {
    // 优化错误消息的显示
    let displayMessage = message;
    if (type === 'error') {
      // 替换一些常见的错误消息为更友好的提示
      displayMessage = message
        .replace('请填写完整的支付信息', '请填写所有必填信息，包括支付金额和钱包地址')
        .replace('请输入有效的支付金额', '请输入大于0的有效支付金额')
        .replace('无效的钱包地址', '请输入有效的以太坊钱包地址')
        .replace('创建支付意图失败', '创建支付订单失败，请稍后重试')
        .replace('二维码中的支付金额与输入金额不匹配', '支付金额与输入金额不一致，请检查后重试')
        .replace('获取支付详情失败', '无法获取支付详情，请刷新页面重试')
        .replace('获取合约信息失败', '无法获取智能合约信息，请稍后重试')
        .replace('交易失败', '区块链交易失败，请检查钱包余额后重试')
        .replace('确认失败', '确认支付失败，请稍后重试')
        .replace('取消失败', '取消订单失败，请稍后重试');
    }
    messageDiv.textContent = displayMessage;
    messageDiv.className = type + '-message';
  } else {
    // 如果找不到消息元素，使用alert作为后备方案
    alert(message);
  }
}

// 创建支付意图
async function createPaymentIntent() {
  try {
    // 禁用按钮，防止重复提交
    createPaymentBtn.disabled = true;
    createPaymentBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 处理中...';

    // 验证输入
    if (!qrContent.value || !paymentAmount.value || !walletAddress) {
      throw new Error('请填写完整的支付信息');
    }

    // 验证金额格式
    const amount = parseFloat(paymentAmount.value);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('请输入有效的支付金额');
    }

    // 验证钱包地址
    if (!ethers.utils.isAddress(walletAddress)) {
      throw new Error('无效的钱包地址');
    }

    // 准备请求数据
    const data = {
      amount: amount,
      platform: paymentPlatform.value,
      userWalletAddress: walletAddress,
      description: paymentDescription.value || '通过UnitPay支付'
    };

    // 如果是PayPal支付，从二维码中提取商家邮箱
    if (paymentPlatform.value === 'PayPal') {
      try {
        // 尝试从表单中获取商家PayPal邮箱
        const merchantPaypalEmailField = document.getElementById('merchant-paypal-email');
        let merchantPaypalEmail = '';
        
        if (merchantPaypalEmailField && merchantPaypalEmailField.value) {
          // 优先使用用户输入的邮箱
          merchantPaypalEmail = merchantPaypalEmailField.value.trim();
          console.log('使用用户手动输入的PayPal邮箱:', merchantPaypalEmail);
        } else if (qrContent.value) {
          // 如果用户没有输入邮箱，尝试从二维码内容中解析
          const qrData = qrContent.value;
          
          if (qrData.includes('@')) {
            // 直接包含邮箱地址
            const emailMatch = qrData.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) {
              merchantPaypalEmail = emailMatch[0];
              console.log('从二维码中提取到PayPal邮箱(直接格式):', merchantPaypalEmail);
            }
          } else if (qrData.includes('paypal.com')) {
            // PayPal链接，尝试提取邮箱参数
            const urlParams = new URLSearchParams(qrData.split('?')[1]);
            merchantPaypalEmail = urlParams.get('business') || urlParams.get('email') || '';
            console.log('从PayPal链接中提取到邮箱:', merchantPaypalEmail);
          } else if (qrData.startsWith('{') && qrData.endsWith('}')) {
            // JSON格式
            try {
              const jsonData = JSON.parse(qrData);
              merchantPaypalEmail = jsonData.email || jsonData.paypalEmail || '';
              console.log('从JSON中提取到PayPal邮箱:', merchantPaypalEmail);
            } catch (e) {
              console.error('解析JSON失败:', e);
            }
          }
        }
        
        if (merchantPaypalEmail && merchantPaypalEmail.includes('@')) {
          data.merchantPaypalEmail = merchantPaypalEmail;
          console.log('最终使用的PayPal商家邮箱:', merchantPaypalEmail);
        } else {
          throw new Error('请提供有效的商家PayPal邮箱，或确保二维码包含有效的PayPal支付信息');
        }
      } catch (error) {
        console.error('处理PayPal邮箱失败:', error);
        showMessage(error.message, 'error');
        return;
      }
    }

    console.log('发送创建支付意图请求，数据:', data);

    // 发送请求
    const response = await fetch(`${API_BASE_URL}/payment-intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      // 检查是否是金额不匹配错误
      if (result.message && result.message.includes('二维码中的支付金额与输入金额不匹配')) {
        showMessage(`支付金额不匹配：二维码金额 ${result.qrCodeAmount}，输入金额 ${result.inputAmount}`, 'error');
        return;
      }
      throw new Error(result.message || '创建支付意图失败');
    }

    // 重置表单
    paymentForm.classList.add('d-none');
    qrContent.value = '';
    paymentAmount.value = '';
    paymentPlatform.value = 'Other';
    paymentDescription.value = '';
    
    // 重置PayPal邮箱字段
    const merchantPaypalEmailField = document.getElementById('merchant-paypal-email');
    if (merchantPaypalEmailField) {
      merchantPaypalEmailField.value = '';
    }
    
    // 隐藏PayPal邮箱字段
    const paypalEmailField = document.getElementById('paypal-email-field');
    if (paypalEmailField) {
      paypalEmailField.style.display = 'none';
    }
    
    // 显示成功消息
    showMessage('支付意图创建成功，等待LP接单', 'success');
    
    // 重新加载任务列表
    await loadUserPaymentTasks();
  } catch (error) {
    console.error('创建支付意图失败:', error);
    showMessage(error.message || '创建支付意图失败', 'error');
  } finally {
    // 无论成功还是失败，都重置按钮状态
    createPaymentBtn.disabled = false;
    createPaymentBtn.textContent = '创建支付';
  }
}

// 加载用户支付任务
async function loadUserPaymentTasks() {
  try {
    console.log('加载用户支付任务，钱包地址:', walletAddress);
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/payment-intents/user/${walletAddress}`);
    const result = await response.json();
    
    console.log('加载任务结果:', result);
    
    if (result.success) {
      // 清空任务列表
      paymentTasksList.innerHTML = '';
      
      const tasks = result.data.paymentIntents;
      console.log('任务列表:', tasks);
      
      if (tasks.length === 0) {
        // 显示无任务消息
        noTasksMessage.classList.remove('d-none');
      } else {
        // 隐藏无任务消息
        noTasksMessage.classList.add('d-none');
        
        // 添加任务到列表
        tasks.forEach(task => {
          console.log('添加任务到列表:', task);
          addTaskToList(task);
        });
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
  const taskElement = document.createElement('div');
  taskElement.className = 'list-group-item';
  taskElement.id = `task-${task.id}`;
  
  // 获取状态标签样式
  const statusBadgeClass = getStatusBadgeClass(task.status);
  
  // 格式化创建时间
  const createdAt = new Date(task.createdAt).toLocaleString();
  
  // 获取LP钱包地址信息
  const lpAddress = task.lpWalletAddress ? 
    `<p class="mb-1">LP支付钱包: <small class="text-muted">${task.lpWalletAddress}</small></p>` : 
    '';
  
  // 显示商家PayPal邮箱（如果存在）
  const merchantPaypalEmail = task.merchantPaypalEmail ? 
    `<p class="mb-1">商家PayPal邮箱: <small class="text-muted font-weight-bold">${task.merchantPaypalEmail}</small></p>` : 
    '';
  
  taskElement.innerHTML = `
    <div class="d-flex w-100 justify-content-between">
      <h5 class="mb-1">${task.platform} 支付</h5>
      <small>${createdAt}</small>
    </div>
    <p class="mb-1">金额: ${task.amount} ${task.currency}</p>
    <p class="mb-1">描述: ${task.description || '无'}</p>
    ${lpAddress}
    ${merchantPaypalEmail}
    <div class="d-flex justify-content-between align-items-center">
      <span class="badge ${statusBadgeClass}">${getStatusText(task.status)}</span>
      <div class="btn-group">
        ${task.status === 'paid' ? `<button class="btn btn-sm btn-success confirm-btn" data-id="${task.id}" data-amount="${task.amount}">确认收到</button>` : ''}
        ${task.status === 'created' ? `<button class="btn btn-sm btn-danger cancel-btn" data-id="${task.id}">取消</button>` : ''}
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
}

// 获取状态标签样式
function getStatusBadgeClass(status) {
  switch (status) {
    case 'created':
      return 'bg-primary';
    case 'matched':
      return 'bg-info';
    case 'lp_paid':
      return 'bg-warning';
    case 'user_confirmed':
      return 'bg-info';
    case 'settled':
      return 'bg-success';
    case 'cancelled':
      return 'bg-danger';
    case 'expired':
      return 'bg-secondary';
    default:
      return 'bg-secondary';
  }
}

// 获取状态文本
function getStatusText(status) {
  switch (status) {
    case 'created':
      return '等待LP接单';
    case 'matched':
      return 'LP已接单';
    case 'lp_paid':
      return 'LP已支付';
    case 'user_confirmed':
      return '用户已确认';
    case 'settled':
      return '已结算';
    case 'cancelled':
      return '已取消';
    case 'expired':
      return '已过期';
    default:
      return status;
  }
}

// 更新任务状态
function updateTaskStatus(taskId, status) {
  const taskElement = document.getElementById(`task-${taskId}`);
  if (!taskElement) return;
  
  // 更新状态标签
  const statusBadge = taskElement.querySelector('.badge');
  statusBadge.className = `badge ${getStatusBadgeClass(status)}`;
  statusBadge.textContent = getStatusText(status);
  
  // 更新按钮
  const btnGroup = taskElement.querySelector('.btn-group');
  btnGroup.innerHTML = '';
  
  if (status === 'lp_paid') {
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-sm btn-success confirm-btn';
    confirmBtn.dataset.id = taskId;
    confirmBtn.textContent = '确认收到';
    confirmBtn.addEventListener('click', () => {
      showConfirmModal(taskId);
    });
    btnGroup.appendChild(confirmBtn);
  } else if (status === 'created') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-danger cancel-btn';
    cancelBtn.dataset.id = taskId;
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
      cancelPaymentIntent(taskId);
    });
    btnGroup.appendChild(cancelBtn);
  }
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

// 确认收到服务
async function confirmPaymentReceived() {
  try {
    if (!currentPaymentIntentId) {
      alert('无效的支付ID');
      return;
    }
    
    // 显示处理中提示
    confirmReceivedBtn.disabled = true;
    confirmReceivedBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 处理中...';
    
    // 获取支付意图详情
    const response = await fetch(`${API_BASE_URL}/payment-intents/${currentPaymentIntentId}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || '获取支付详情失败');
    }
    
    const paymentIntent = result.data;
    
    // 检查paymentIntent和LP信息是否存在
    if (!paymentIntent) {
      throw new Error('支付意图数据无效');
    }
    
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
    
    const amount = paymentIntent.amount;
    const currency = paymentIntent.currency || 'USDT';
    
    try {
      // 获取USDT合约信息 - 使用settlement-contract-info端点
      const contractResponse = await fetch(`${API_BASE_URL}/settlement-contract-info`);
      if (!contractResponse.ok) {
        throw new Error('获取USDT合约信息失败');
      }
      
      const contractResult = await contractResponse.json();
      if (!contractResult.success) {
        throw new Error('获取USDT合约信息失败');
      }
      
      const usdtAddress = contractResult.data.usdtAddress;
      console.log('===== USDT转账操作开始 =====');
      console.log('LP钱包地址:', lpWalletAddress);
      console.log('USDT合约地址:', usdtAddress);
      console.log('转账原始金额:', amount, currency);
      
      // 创建USDT合约实例
      usdtContract = new ethers.Contract(
        usdtAddress,
        [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)',
          'function balanceOf(address owner) view returns (uint256)'
        ],
        signer
      );
      
      // 获取USDT小数位数
      const decimals = await usdtContract.decimals();
      console.log('USDT小数位数:', decimals);
      
      // 根据实际小数位转换金额
      const usdtAmount = ethers.utils.parseUnits(amount.toString(), decimals);
      console.log('转账金额(wei):', usdtAmount.toString());
      console.log('转账金额(USDT):', ethers.utils.formatUnits(usdtAmount, decimals));
      
      // 获取当前钱包USDT余额
      const balance = await usdtContract.balanceOf(walletAddress);
      console.log('当前钱包USDT余额(wei):', balance.toString());
      console.log('当前钱包USDT余额(USDT):', ethers.utils.formatUnits(balance, decimals));
      
      if (balance.lt(usdtAmount)) {
        throw new Error(`USDT余额不足，需要 ${ethers.utils.formatUnits(usdtAmount, decimals)} USDT，当前余额 ${ethers.utils.formatUnits(balance, decimals)} USDT`);
      }
      
      // 显示转账中提示
      confirmReceivedBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 转账中...';
      
      // 直接转账给LP
      console.log(`准备转账 ${ethers.utils.formatUnits(usdtAmount, decimals)} USDT 到 ${lpWalletAddress}`);
      const tx = await usdtContract.transfer(lpWalletAddress, usdtAmount);
      console.log('转账交易已发送，哈希:', tx.hash);
      
      // 等待转账交易确认
      const receipt = await tx.wait();
      console.log('转账交易已确认:', receipt.transactionHash);
      
      // 获取当前网络信息
      const network = await window.ethereum.request({ method: 'eth_chainId' });
      const networkType = getNetworkType(network); // 添加这个辅助函数来转换chainId到网络名称
      
      // 准备提交确认数据
      const confirmData = {
        walletAddress,
        txHash: receipt.transactionHash,
        usedDirectTransfer: true,
        network: 'somnia'  // 直接记录为somnia网络
      };
      
      // 显示确认中提示
      confirmReceivedBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 确认中...';
      
      // 发送确认请求
      const confirmResponse = await fetch(`${API_BASE_URL}/payment-intents/${currentPaymentIntentId}/confirm`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(confirmData)
      });
      
      const confirmResult = await confirmResponse.json();
      
      if (confirmResult.success) {
        // 关闭模态框
        confirmPaymentModal.hide();
        
        // 更新任务状态
        updateTaskStatus(currentPaymentIntentId, 'settled');
        
        // 显示成功消息
        showTransactionProcessingModal({
          status: 'success',
          message: '转账成功，服务确认完成',
          lpAddress: lpWalletAddress,
          amount: ethers.utils.formatUnits(usdtAmount, decimals),
          txHash: receipt.transactionHash
        });
        
        // 更新交易详情
        document.getElementById('tx-hash').textContent = receipt.transactionHash;
        document.getElementById('tx-hash-container').style.display = 'block';
        document.getElementById('view-explorer-btn').style.display = 'block';
        document.getElementById('view-explorer-btn').href = getExplorerUrl(receipt.transactionHash, networkType);
        
        // 显示成功状态
        document.getElementById('status-processing').style.display = 'none';
        document.getElementById('status-success').style.display = 'block';
        
        // 更新任务状态
        updateTaskStatus(currentPaymentIntentId, 'settled');
        
        // 刷新USDT余额
        await loadUSDTBalance();
        
        console.log('===== USDT转账操作完成 =====');
      } else {
        throw new Error(confirmResult.message || '确认失败');
      }
    } catch (txError) {
      console.error('===== USDT转账失败 =====', txError);
      alert('USDT转账失败: ' + (txError.message || '未知错误'));
    }
  } catch (error) {
    console.error('确认失败:', error);
    alert('确认失败: ' + (error.message || '未知错误'));
  } finally {
    // 恢复按钮状态
    confirmReceivedBtn.disabled = false;
    confirmReceivedBtn.textContent = '确认收到';
    currentPaymentIntentId = null;
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
  }
}

// 显示交易处理模态框
async function showTransactionProcessingModal(data) {
  const modal = document.getElementById('transaction-status-modal');
  const statusProcessing = document.getElementById('status-processing');
  const statusSuccess = document.getElementById('status-success');
  const statusError = document.getElementById('status-error');
  const txLpAddress = document.getElementById('tx-lp-address');
  const txAmount = document.getElementById('tx-amount');
  const txHashContainer = document.getElementById('tx-hash-container');
  const txHash = document.getElementById('tx-hash');
  const viewExplorerBtn = document.getElementById('view-explorer-btn');
  const closeBtn = document.querySelector('.close-transaction');
  const closeTransactionBtn = document.getElementById('close-transaction-btn');
  
  // 重置所有状态
  statusProcessing.style.display = 'none';
  statusSuccess.style.display = 'none';
  statusError.style.display = 'none';
  txHashContainer.style.display = 'none';
  viewExplorerBtn.style.display = 'none';
  
  // 设置LP地址和金额
  if (data.lpAddress) {
    txLpAddress.textContent = data.lpAddress;
  } else {
    txLpAddress.textContent = '未知';
  }
  
  if (data.amount) {
    txAmount.textContent = `${data.amount} USDT`;
  } else {
    txAmount.textContent = '未知';
  }
  
  // 根据状态显示不同内容
  if (data.status === 'processing') {
    statusProcessing.style.display = 'block';
  } else if (data.status === 'success') {
    statusSuccess.style.display = 'block';
    
    // 显示交易哈希
    if (data.txHash) {
      txHashContainer.style.display = 'flex';
      txHash.textContent = data.txHash;
      
      // 使用统一的浏览器URL生成函数
      const explorerUrl = getExplorerUrl(data.txHash, 'somnia');  // 当前阶段默认使用somnia
      viewExplorerBtn.href = explorerUrl;
      viewExplorerBtn.style.display = 'inline-block';
    }
  } else if (data.status === 'error') {
    statusError.style.display = 'block';
  }
  
  // 显示模态框
  modal.style.display = 'block';
  
  // 关闭按钮事件
  closeBtn.onclick = function() {
    modal.style.display = 'none';
  };
  
  closeTransactionBtn.onclick = function() {
    modal.style.display = 'none';
  };
  
  // 点击模态框外部关闭
  window.onclick = function(event) {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };
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

// 添加网络类型判断的辅助函数
function getNetworkType(chainId) {
  const networks = {
    '0x1': 'ethereum',    // Ethereum Mainnet
    '0x5': 'goerli',     // Goerli Testnet
    '0xaa36a7': 'sepolia', // Sepolia Testnet
    '0x38': 'bsc',       // BSC Mainnet
    '0x89': 'polygon',   // Polygon Mainnet
    '0x1c': 'somnia'     // Somnia Network
  };
  return networks[chainId.toLowerCase()] || 'ethereum';
}

// 修改区块浏览器URL生成函数
function getExplorerUrl(txHash, network = 'ethereum') {
  if (!txHash) return '';
  
  const explorers = {
    ethereum: 'https://etherscan.io',
    goerli: 'https://goerli.etherscan.io',
    sepolia: 'https://sepolia.etherscan.io',
    bsc: 'https://bscscan.com',
    polygon: 'https://polygonscan.com',
    somnia: 'https://shannon-explorer.somnia.network'
  };

  const baseUrl = explorers[network.toLowerCase()] || explorers.ethereum;
  return `${baseUrl}/tx/${txHash}`;
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp);