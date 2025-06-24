/**
 * Link Card LP前端应用
 * 实现LP注册、额度管理和接单功能
 */

// 全局变量
const API_BASE_URL = '/api';  // 改回原来的值，LP页面API路径依赖这个前缀
let provider;
let signer;
let walletAddress;
let isWalletConnected = false;
let currentLP = null;
let currentTaskTab = 'created';
let lastRefreshTime = 0;
let socket;
let taskList = []; // 确保初始化为空数组而不是undefined
let paidAmount = 0; // 已支付额度
let DEBUG = false; // 新增开关，控制是否输出调试信息
const REFRESH_INTERVAL = 30000; // 30秒刷新一次
let refreshIntervalId = null;
let transactionHistory = [];
let usdtBalance = '0.00';

// Toast 通知函数
function showToast(message, type = 'info') {
  // 创建 toast 容器（如果不存在）
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
    `;
    document.body.appendChild(toastContainer);
  }

  // 创建新的 toast 元素
  const toast = document.createElement('div');
  toast.style.cssText = `
    min-width: 250px;
    margin-bottom: 10px;
    padding: 15px;
    border-radius: 4px;
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.3s ease-in;
    color: white;
    background-color: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#17a2b8'};
  `;
  toast.textContent = message;

  // 添加到容器
  toastContainer.appendChild(toast);

  // 触发动画
  setTimeout(() => {
    toast.style.opacity = '1';
  }, 10);

  // 3秒后移除
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toastContainer.removeChild(toast);
      if (toastContainer.children.length === 0) {
        document.body.removeChild(toastContainer);
      }
    }, 300);
  }, 3000);
}

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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 初始化事件监听器
  initEventListeners();

  // 检查钱包连接状态
  checkWalletConnection();
});

// 初始化事件监听器
function initEventListeners() {
  log('初始化事件监听器');
  
  // 连接钱包按钮
  document.getElementById('connect-wallet').addEventListener('click', () => connectWallet());
  
  // 注册表单提交
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await registerLP();
  });

  // 更新额度表单提交
  document.getElementById('update-quota-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateQuota();
  });

  // PayPal连接按钮
  document.getElementById('connect-paypal').addEventListener('click', async () => {
    await connectPayPal();
  });

  // 任务池筛选器
  document.getElementById('platform-filter').addEventListener('change', () => loadTaskPool(currentTaskTab));
  document.getElementById('amount-filter').addEventListener('change', () => loadTaskPool(currentTaskTab));
  
  // 任务标签页切换
  const taskTabs = document.querySelectorAll('#taskTabs button[data-task-status]');
  taskTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      // 获取状态
      const status = e.target.getAttribute('data-task-status');
      // 更新标签页状态
      updateTaskTabs(status);
      // 重新加载任务池
      loadTaskPool(status);
    });
  });
  
  // 自动刷新LP信息和任务池
  startAutoRefresh();
  
  log('事件监听器初始化完成');
}

// 更新任务标签页状态
function updateTaskTabs(status) {
  // 更新全局状态
  currentTaskTab = status;
  
  // 更新标签页UI
  const taskTabs = document.querySelectorAll('#taskTabs button[data-task-status]');
  taskTabs.forEach(tab => {
    if (tab.getAttribute('data-task-status') === status) {
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
    } else {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    }
  });
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
        log('检测到已连接的钱包:', walletAddress);
        
        // 获取signer
        signer = provider.getSigner();
        
        // 检查LP注册状态
        await checkLPRegistration(walletAddress);
      } else {
        isWalletConnected = false;  // 更新连接状态
        log('钱包未连接，显示连接按钮');
        hideAllSections();
        showRegistrationSection();
      }
    } else {
      isWalletConnected = false;  // 更新连接状态
      log('MetaMask未安装，显示连接按钮');
      hideAllSections();
      showRegistrationSection();
    }
  } catch (error) {
    logError('检查钱包连接状态失败:', error);
    isWalletConnected = false;  // 更新连接状态
    hideAllSections();
    showRegistrationSection();
  }
}

// 连接钱包
async function connectWallet() {
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
      
      // 检查LP注册状态
      await checkLPRegistration(walletAddress);
      
      // 连接Socket.io
      connectSocket();
      
      return true;
    } else {
        alert('请安装MetaMask钱包插件');
      return false;
    }
  } catch (error) {
    console.error('连接钱包失败:', error);
      alert('连接钱包失败: ' + error.message);
    return false;
  }
}

// 处理钱包断开连接
function handleWalletDisconnect() {
  log('钱包已断开连接');
  isWalletConnected = false;
  walletAddress = null;
  updateWalletConnectionUI(false);
  hideAllSections();
  showRegistrationSection();
}

// 更新钱包连接UI状态
function updateWalletConnectionUI(isConnected, address) {
  const connectWalletBtn = document.getElementById('connect-wallet');
  const walletStatusContainer = document.querySelector('.card.mb-4 .card-body');
  
  if (isConnected && address) {
    // 已连接状态
    connectWalletBtn.style.display = 'none';
    
    // 检查是否已经显示了地址信息
    let walletInfoElement = document.getElementById('wallet-info');
    if (!walletInfoElement) {
      // 创建钱包信息显示
      const walletInfo = document.createElement('div');
      walletInfo.id = 'wallet-info';
      walletInfo.innerHTML = `
        <p class="mb-1">钱包已连接</p>
        <p class="mb-2"><small class="text-muted">${address}</small></p>
        <button id="disconnect-wallet" class="btn btn-sm btn-outline-danger">断开连接</button>
      `;
      walletStatusContainer.appendChild(walletInfo);
      
      // 添加断开连接按钮事件
      document.getElementById('disconnect-wallet').addEventListener('click', () => {
        handleWalletDisconnect();
      });
    }
  } else {
    // 未连接状态
    connectWalletBtn.style.display = 'block';
    
    // 移除钱包信息显示
    const walletInfo = document.getElementById('wallet-info');
    if (walletInfo) {
      walletInfo.remove();
    }
  }
}

// 连接Socket.io
function connectSocket() {
  // 创建Socket连接
  socket = io('http://localhost:3005', {
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
    log('Socket.io连接成功');
    
    // 发送钱包连接事件
    socket.emit('wallet_connect', {
      walletAddress,
      userType: 'lp'
    });
  });

  // 连接错误事件
  socket.on('connect_error', (error) => {
    logError('Socket.io连接错误:', error);
  });
  
  // 更多Socket事件监听...
}

// 检查 LP 注册状态
async function checkLPRegistration(walletAddress) {
  try {
    log('检查LP注册状态:', walletAddress);
    
    // 验证钱包地址
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      logError('无效的钱包地址格式:', walletAddress);
      alert('无效的以太坊钱包地址');
      return;
    }
    
    // 首先更新钱包连接UI状态
    updateWalletConnectionUI(true, walletAddress);
    
    // 请求LP信息
    const response = await fetch(`${API_BASE_URL}/lp/${walletAddress}`);
    log('LP注册状态响应状态码:', response.status);
    
    if (response.status === 404) {
      // LP 未注册，显示注册表单
      log('LP未注册，显示注册表单');
      showRegistrationSection();
      hideDashboardSection();
      hideLPInfoSection();
      return;
    } 
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // LP 已注册，显示仪表板
    const result = await response.json();
    log('LP已注册，响应数据:', result);
    
    // 处理数据结构
    if (result.success && result.data) {
      // 服务器返回带 success 和 data 的响应格式
      currentLP = result.data;
    } else {
      // 服务器直接返回 LP 数据
      currentLP = result;
    }
    
    log('处理后的LP数据:', currentLP);
    
    hideRegistrationSection();
    showDashboardSection();
    showLPInfoSection();
    updateLPInfo(currentLP);
    
    // 计算已支付金额
    await loadPaidTasks();
    
    // 默认加载待认领任务
    updateTaskTabs('created');
    await loadTaskPool('created');
  } catch (error) {
    logError('检查 LP 注册状态失败:', error);
    alert('检查 LP 注册状态失败: ' + error.message);
    // 恢复UI状态
    showRegistrationSection();
    hideDashboardSection();
    hideLPInfoSection();
  }
}

// 注册 LP
async function registerLP() {
  try {
    if (!isWalletConnected || !walletAddress) {
      alert('请先连接钱包');
      return;
    }
    
    const formData = new FormData(document.getElementById('register-form'));
    const platforms = Array.from(document.querySelectorAll('input[name="platforms"]:checked')).map(cb => cb.value);

    const data = {
      walletAddress,
      name: formData.get('name'),
      email: formData.get('email'),
      totalQuota: parseFloat(formData.get('total-quota')),
      perTransactionQuota: parseFloat(formData.get('per-transaction-quota')),
      supportedPlatforms: platforms
    };

    const response = await fetch(`${API_BASE_URL}/lp/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '注册失败');
    }

    const lpData = await response.json();
    currentLP = lpData.data;
    
    // 明确隐藏注册部分
    hideRegistrationSection();
    
    // 显示仪表板和LP信息
    showDashboardSection();
    showLPInfoSection();
    
    // 更新LP信息显示
    updateLPInfo(currentLP);
    
    // 加载任务池
    await loadTaskPool();
    
    alert('注册成功!');
    
    // 刷新页面以确保所有UI正确更新
    // window.location.reload();
  } catch (error) {
    logError('注册 LP 失败:', error);
    alert('注册 LP 失败: ' + error.message);
  }
}

// 更新额度
async function updateQuota() {
  try {
    if (!isWalletConnected || !walletAddress) {
      alert('请先连接钱包');
      return;
    }
    
    const formData = new FormData(document.getElementById('update-quota-form'));

    const data = {
      walletAddress,
      totalQuota: parseFloat(formData.get('total-quota')),
      perTransactionQuota: parseFloat(formData.get('per-transaction-quota'))
    };

    const response = await fetch(`${API_BASE_URL}/lp/quota`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '更新额度失败');
    }

    const lpData = await response.json();
    currentLP = lpData.data;
    updateLPInfo(currentLP);
    bootstrap.Modal.getInstance(document.getElementById('update-quota-modal')).hide();
    
    // 刷新LP信息和已支付任务
    await refreshLPInfo(walletAddress);
    await loadPaidTasks();
    
    alert('额度更新成功!');
  } catch (error) {
    logError('更新额度失败:', error);
    alert('更新额度失败: ' + error.message);
  }
}

// 加载任务池
async function loadTaskPool(status = 'all') {
  try {
    // 获取钱包地址
    if (!isWalletConnected || !walletAddress) {
      logError('钱包未连接，无法加载任务池');
      return;
    }
    
    log(`开始加载任务池(状态: ${status})，钱包地址:`, walletAddress);

    // 获取平台和金额筛选条件
    const platformFilter = document.getElementById('platform-filter').value;
    const amountFilter = document.getElementById('amount-filter').value;
    
    // 构建查询参数
    let queryParams = `walletAddress=${walletAddress}`;
    if (platformFilter) {
      queryParams += `&platform=${platformFilter}`;
    }
    
    if (amountFilter) {
      const [minAmount, maxAmount] = amountFilter.split('-');
      if (minAmount) queryParams += `&minAmount=${minAmount}`;
      if (maxAmount) queryParams += `&maxAmount=${maxAmount}`;
    }
    
    log('查询参数:', queryParams);
    
    // 发起请求
    const response = await fetch(`${API_BASE_URL}/lp/task-pool?${queryParams}`);
    
    log('任务池响应状态:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      logError('获取任务池失败:', errorText);
      
      let errorObj;
      try {
        errorObj = JSON.parse(errorText);
      } catch (e) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }
      
      throw new Error(errorObj.message || '获取任务池失败');
    }
    
    const responseText = await response.text();
    log('任务池原始响应:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      logError('解析响应JSON失败:', e);
      throw new Error('解析响应失败');
    }
    
    log('解析后的响应:', result);
    
    if (!result.success) {
      throw new Error(result.message || '获取任务池失败');
    }
    
    // 更新任务列表 - 根据所选标签过滤任务
    const allTasks = result.data && result.data.tasks ? result.data.tasks : [];
    
    // 根据当前选中的标签过滤任务
    let filteredTasks = allTasks;
    if (status !== 'all') {
      if (status === 'paid') {
        filteredTasks = allTasks.filter(task => 
          task.status === 'paid' ||
          task.status === 'user_confirmed' ||
          task.status === 'settled'
        );
    } else {
        filteredTasks = allTasks.filter(task => task.status === status);
      }
    }
    
    // 更新全局taskList变量
    taskList = allTasks; // 保存所有任务，不仅仅是过滤后的
    
    log(`过滤后任务数量: ${filteredTasks.length}/${allTasks.length}`);
    log('全局taskList已更新，共有 ' + taskList.length + ' 个任务');
    
    // 显示过滤后的任务
    displayTasks(filteredTasks);

    // 加载USDT余额和交易历史
    await loadUSDTBalance();
    await loadTransactionHistory();
    
  } catch (error) {
    logError('加载任务池失败:', error);
    alert('加载任务池失败: ' + error.message);
  }
}

// 显示任务列表
function displayTasks(tasks) {
  log('当前钱包地址:', walletAddress);
  log('任务列表:', tasks);
  
  const taskList = document.getElementById('task-list');
  if (!taskList) return;
  
  if (!tasks || tasks.length === 0) {
    taskList.innerHTML = '<div class="alert alert-info">当前没有可用任务</div>';
      return;
    }
    
  let html = '';
      tasks.forEach(task => {
    const taskId = task.id || task.taskId;
    const status = task.status || 'created';
    const amount = task.amount || 0;
    const currency = task.currency || 'USDT';
    const platform = task.platform || '未知';
    const createdAt = task.createdAt ? new Date(task.createdAt).toLocaleString() : '未知';
    const userWalletAddress = task.userWalletAddress || '未知';
    
    // 获取状态变更时间
    let statusChangeTime = '未知';
    if (task.statusHistory && Array.isArray(task.statusHistory)) {
      // 查找对应状态的最新记录
      const statusEntry = [...task.statusHistory]
        .reverse()
        .find(entry => entry.status === status);
      
      if (statusEntry && statusEntry.timestamp) {
        statusChangeTime = new Date(statusEntry.timestamp).toLocaleString();
      }
    } else if (task.updatedAt) {
      // 如果没有状态历史记录，使用更新时间
      statusChangeTime = new Date(task.updatedAt).toLocaleString();
    }
    
    log(`显示任务ID=${taskId}, 状态=${status}, 状态变更时间=${statusChangeTime}`);
    
    // 确定是否能认领任务 - 任务状态为created且当前LP已注册
    const canClaim = status === 'created';
    
    // 确定是否能确认支付 - 任务状态为claimed或processing且是当前LP认领的
    const canConfirm = (status === 'claimed' || status === 'processing') && 
                      task.lpWalletAddress && 
                      task.lpWalletAddress.toLowerCase() === walletAddress.toLowerCase();
    
    // 根据任务状态显示不同的UI
    let statusInfo = '';
    let actionButtons = '';
    
    // 状态信息
    if (status === 'created') {
      statusInfo = `<span class="badge bg-primary me-2">待认领</span>`;
    } else if (status === 'claimed') {
      statusInfo = `<span class="badge bg-warning me-2">已认领</span>`;
    } else if (status === 'processing') {
      statusInfo = `<span class="badge bg-info me-2">处理中</span>`;
    } else if (status === 'paid') {
      statusInfo = `<span class="badge bg-success me-2">已支付</span>`;
    } else if (status === 'user_confirmed' || status === 'confirmed') {
      statusInfo = `<span class="badge bg-info me-2">用户已确认</span>`;
    } else if (status === 'settled') {
      statusInfo = `<span class="badge bg-secondary me-2">已结算</span>`;
    } else if (status === 'cancelled' || status === 'expired') {
      statusInfo = `<span class="badge bg-danger me-2">已取消/过期</span>`;
    } else {
      statusInfo = `<span class="badge bg-dark me-2">${status}</span>`;
    }
    
    // 操作按钮
    if (canClaim) {
      actionButtons = `<button class="btn btn-primary btn-sm" data-task-id="${taskId}" onclick="claimTask('${taskId}')">认领任务</button>`;
    } else if (canConfirm) {
      actionButtons = `<button class="btn btn-success btn-sm" data-task-id="${taskId}" onclick="markTaskPaid('${taskId}')">确认支付</button>`;
    } else if (status === 'paid' || status === 'confirmed' || status === 'user_confirmed') {
      // 添加查看详情按钮
      actionButtons = `<button class="btn btn-info btn-sm" onclick="viewTaskDetails('${taskId}')">查看详情</button>`;
    } else {
      actionButtons = '';
    }
    
    html += `
      <div class="card mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between">
            <h6 class="card-subtitle mb-2 text-muted">任务ID: ${taskId}</h6>
            ${statusInfo}
          </div>
          <div class="row mt-3">
            <div class="col-md-6">
              <p class="mb-1"><strong>金额:</strong> ${amount} ${currency}</p>
              <p class="mb-1"><strong>支付平台:</strong> ${platform}</p>
              <p class="mb-1"><strong>创建时间:</strong> ${createdAt}</p>
              <p class="mb-1"><strong>状态更新:</strong> ${statusChangeTime}</p>
            </div>
            <div class="col-md-6">
              <p class="mb-1"><strong>用户钱包地址:</strong> ${formatWalletAddress(userWalletAddress)}</p>
              ${task.description ? `<p class="mb-1"><strong>描述:</strong> ${task.description}</p>` : ''}
              ${task.lpWalletAddress ? `<p class="mb-1"><strong>LP钱包地址:</strong> ${formatWalletAddress(task.lpWalletAddress)}</p>` : ''}
              ${task.merchantPaypalEmail ? `<p class="mb-1"><strong>商家PayPal邮箱:</strong> ${task.merchantPaypalEmail}</p>` : ''}
            </div>
          </div>
          <div class="mt-3">
            ${actionButtons}
          </div>
        </div>
      </div>
    `;
  });
  
  taskList.innerHTML = html;
}

// 格式化时间戳
function formatTimestamp(timestamp) {
  if (!timestamp) return '未知';
  try {
    return new Date(timestamp).toLocaleString();
  } catch (e) {
    return timestamp;
  }
}

// 格式化地址显示
function formatAddress(address) {
  if (!address) return '';
  if (address.length < 10) return address;
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// 获取状态对应的Badge样式
function getStatusBadgeClass(status) {
  switch(status.toLowerCase()) {
    case 'created': return 'bg-primary';
    case 'claimed': return 'bg-info';
    case 'paid': return 'bg-success';
    case 'canceled': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

// 获取状态的显示文本
function getStatusText(status) {
  switch(status.toLowerCase()) {
    case 'created': return '待认领';
    case 'claimed': return '已认领';
    case 'paid': return '已支付';
    case 'canceled': return '已取消';
    case 'processing': return '处理中';
    default: return status;
  }
}

// 认领任务
async function claimTask(taskId) {
  try {
    // 禁用按钮防止重复点击
    const claimButton = document.querySelector(`button[data-task-id="${taskId}"]`);
    if (claimButton) {
      claimButton.disabled = true;
      claimButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 处理中...';
    }
    
    if (!isWalletConnected || !walletAddress) {
      alert('请先连接钱包');
      return;
    }
    
    log(`认领任务 ${taskId}...`);
    
    // 验证任务状态 - 确保仍然是 created
    const isValidStatus = await verifyTaskStatus(taskId, 'created');
    if (!isValidStatus) {
      logWarn('任务状态已变更，无法认领');
      alert('任务状态已变更，无法认领');
      return;
    }
    
    // 发起认领请求
    const response = await fetch(`${API_BASE_URL}/lp/task/${taskId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ walletAddress })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      log('认领失败，状态码:', response.status, '响应:', errorText);
      
      let errorObj;
      try {
        errorObj = JSON.parse(errorText);
        throw new Error(errorObj.message || `认领失败: ${response.status}`);
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new Error(`认领失败: ${response.status} ${response.statusText}`);
        }
        throw e;
      }
    }
    
    const result = await response.json();
    log('认领成功:', result);
    
    // 显示成功消息
    alert('认领任务成功!');
    
    // 刷新任务列表和LP信息
    loadTaskPool();
    await refreshLPInfo(walletAddress);
    await loadPaidTasks();
    
  } catch (error) {
    logError('认领任务失败:', error);
    alert(`认领任务失败: ${error.message}`);
  } finally {
    // 恢复按钮状态
    const claimButton = document.querySelector(`button[data-task-id="${taskId}"]`);
    if (claimButton) {
      claimButton.disabled = false;
      claimButton.innerHTML = '认领任务';
    }
  }
}

// 确认支付任务
async function markTaskPaid(taskId, button) {
  try {
    // 查找任务
    const task = taskList.find(t => t.id == taskId);
    
    if (!task) {
      showToast('无法找到任务信息', 'error');
      return;
    }
    
    // 如果是PayPal支付，调用PayPal支付流程
    if (task.platform === 'PayPal') {
      console.log('检测到PayPal任务，使用PayPal支付流程');
      await markTaskPaidWithPayPal(taskId);
      return;
    }
    
    // 其他支付平台的处理逻辑
    const paymentModal = document.createElement('div');
  } catch (error) {
    console.error('标记任务已支付失败:', error);
    showToast('标记任务已支付失败: ' + error.message, 'error');
  }
}

// 加载PayPal SDK
async function loadPayPalSDK() {
  return new Promise((resolve, reject) => {
    if (window.paypal) {
      resolve();
      return;
    }

    fetch(`${API_BASE_URL}/payment/paypal/config`)
      .then(response => response.json())
      .then(result => {
        if (!result.success || !result.data || !result.data.clientId) {
          throw new Error('获取PayPal配置失败');
        }

        const script = document.createElement('script');
        script.src = `https://www.paypal.com/sdk/js?client-id=${result.data.clientId}&currency=${result.data.currency || 'USD'}`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('加载PayPal SDK失败'));
        document.body.appendChild(script);
      })
      .catch(reject);
  });
}
      
      // 刷新LP信息
async function refreshLPInfo(address) {
  try {
    if (!isWalletConnected) {
      logError('钱包未连接，无法刷新LP信息');
      return;
    }
    
    const walletAddressToUse = address || walletAddress;
    
    if (!walletAddressToUse) {
      logError('无效的钱包地址，无法刷新LP信息');
      return;
    }
    
    log('刷新LP信息，地址:', walletAddressToUse);
    const response = await fetch(`${API_BASE_URL}/lp/direct/${walletAddressToUse}`);
    
    if (response.status === 404) {
      logError('LP不存在，可能未注册');
      return;
    }
    
    if (!response.ok) {
      logError('获取LP信息失败:', response.status, response.statusText);
      return;
    }
    
    const responseText = await response.text();
    let lpData;
    
    try {
      lpData = JSON.parse(responseText);
    } catch (e) {
      logError('解析LP数据失败:', e, '原始数据:', responseText);
      return;
    }
    
    log('获取到最新LP数据:', lpData);
    
    // 更新当前LP数据
    currentLP = lpData;
    
    // 更新LP信息显示
    updateLPInfo(lpData);
    
    return lpData;
  } catch (error) {
    logError('刷新LP信息失败:', error);
    return null;
  }
}

// 验证任务状态
async function verifyTaskStatus(taskId, expectedStatus) {
  try {
    log(`验证任务 ${taskId} 状态...`);
    
    // 直接请求单个任务详情
    const response = await fetch(`${API_BASE_URL}/lp/task/${taskId}`);
    
    if (!response.ok) {
      const errorStatus = response.status;
      let errorMessage = `获取任务详情失败: ${response.status} ${response.statusText}`;
      
      try {
        // 尝试获取更详细的错误信息
        const errorData = await response.json();
        if (errorData && errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (jsonError) {
        // 无法解析JSON，使用默认错误消息
      }
      
      logError(errorMessage);
      
      // 对于不同的错误状态码提供不同的用户提示
      if (errorStatus === 404) {
        showToast('找不到该任务，可能已被删除', 'error');
      } else if (errorStatus === 500) {
        showToast('服务器内部错误，请稍后再试', 'error');
        console.error('请联系管理员检查服务器日志');
      } else {
        showToast(`获取任务信息失败: ${errorMessage}`, 'error');
      }
      
      // 刷新任务列表
      await loadTaskPool(currentTaskTab);
      return false;
    }
    
    const result = await response.json();
    if (!result.success) {
      logError(`获取任务详情失败:`, result.message);
      showToast(`获取任务详情失败: ${result.message}`, 'error');
      return false;
    }
    
    const task = result.data;
    log(`任务 ${taskId} 当前状态:`, task.status);
    
    if (expectedStatus === 'claimed' && task.status !== 'claimed' && task.status !== 'processing') {
      // 如果期望是已认领状态，但当前不是claimed或processing
      showToast(`任务状态已更改为 "${getStatusText(task.status)}"，无法执行确认支付操作`, 'warning');
      await loadTaskPool(currentTaskTab); // 重新加载当前标签页的任务
      return false;
    } else if (expectedStatus === 'created' && task.status !== 'created') {
      // 如果期望是待认领状态，但当前不是
      showToast(`任务状态已更改为 "${getStatusText(task.status)}"，无法执行认领操作`, 'warning');
      await loadTaskPool(currentTaskTab); // 重新加载当前标签页的任务
      return false;
    }
    
    return true;
  } catch (error) {
    logError('验证任务状态失败:', error);
    showToast('验证任务状态失败，请重试', 'error');
    return false;
  }
}

// 更新 LP 信息显示
function updateLPInfo(lpData) {
  log('更新LP信息显示，原始数据类型:', typeof lpData);
  log('更新LP信息显示，原始数据:', JSON.stringify(lpData, null, 2));
  
  if (!lpData || typeof lpData !== 'object') {
    logError('LP 数据无效:', lpData);
    return;
  }
  
  // 确保我们有一个有效的对象
  const data = lpData || {};
  
  // 钱包地址
  const walletAddressElement = document.getElementById('wallet-address');
  if (walletAddressElement) {
    walletAddressElement.textContent = data.walletAddress || '';
  }
  
  // LP 名称
  const lpNameElement = document.getElementById('lp-name');
  if (lpNameElement) {
    lpNameElement.textContent = data.name || '';
  }
  
  // 邮箱
  const lpEmailElement = document.getElementById('lp-email');
  if (lpEmailElement) {
    lpEmailElement.textContent = data.email || '';
  }
  
  // 总额度显示 - 使用新的 ID
  const totalQuotaElement = document.getElementById('display-total-quota');
  if (totalQuotaElement) {
    log('总额度元素:', totalQuotaElement);
    log('总额度数据:', data.totalQuota);
    totalQuotaElement.textContent = data.totalQuota || 0;
  }
  
  // 单笔额度上限显示 - 使用新的 ID
  const perTransactionQuotaElement = document.getElementById('display-per-transaction-quota');
  if (perTransactionQuotaElement) {
    log('单笔额度上限元素:', perTransactionQuotaElement);
    log('单笔额度上限数据:', data.perTransactionQuota);
    perTransactionQuotaElement.textContent = data.perTransactionQuota || 0;
  }
  
  // 锁定额度显示
  const lockedQuotaElement = document.getElementById('locked-quota');
  if (lockedQuotaElement) {
    lockedQuotaElement.textContent = data.lockedQuota || 0;
  }
  
  // 可用额度显示
  const availableQuotaElement = document.getElementById('available-quota');
  if (availableQuotaElement) {
    availableQuotaElement.textContent = data.availableQuota || 0;
  }
  
  // 已支付额度显示
  const paidQuotaElement = document.getElementById('paid-quota');
  if (paidQuotaElement) {
    paidQuotaElement.textContent = paidAmount.toFixed(2);
  }
  
  // 支持的支付平台显示
  const supportedPlatformsElement = document.getElementById('supported-platforms');
  if (supportedPlatformsElement && data.supportedPlatforms) {
    let platformsArray = data.supportedPlatforms;
    
    // 如果是字符串（JSON格式），尝试解析
    if (typeof data.supportedPlatforms === 'string') {
      try {
        platformsArray = JSON.parse(data.supportedPlatforms);
      } catch (e) {
        // 如果解析失败，尝试以逗号分隔的方式处理
        platformsArray = data.supportedPlatforms.split(',').map(platform => platform.trim());
      }
    }
    
    // 清空现有的平台显示
    supportedPlatformsElement.innerHTML = '';
    
    // 如果平台列表为空，显示提示信息
    if (!platformsArray || !platformsArray.length) {
      supportedPlatformsElement.textContent = '未配置支持的支付平台';
    } else {
      // 为每个平台创建一个标签
      platformsArray.forEach(platform => {
        const badge = document.createElement('span');
        badge.className = 'badge badge-pill badge-info mr-1';
        badge.textContent = platform;
        supportedPlatformsElement.appendChild(badge);
      });
    }
  }
  
  // 显示PayPal邮箱信息
  if (data.paypalEmail) {
    document.getElementById('lp-paypal-email').textContent = data.paypalEmail;
    document.getElementById('paypal-email').value = data.paypalEmail; // 预填充输入框
    } else {
    document.getElementById('lp-paypal-email').textContent = '未设置';
  }
  
  log('LP信息更新完成');
}

// 显示/隐藏各个部分
function showRegistrationSection() {
  document.getElementById('registration-section').style.display = 'block';
}

function hideRegistrationSection() {
  document.getElementById('registration-section').style.display = 'none';
}

function showLPInfoSection() {
  document.getElementById('lp-info-section').style.display = 'block';
}

function hideLPInfoSection() {
  document.getElementById('lp-info-section').style.display = 'none';
}

function showDashboardSection() {
  document.getElementById('dashboard-section').style.display = 'block';
}

function hideDashboardSection() {
  document.getElementById('dashboard-section').style.display = 'none';
}

function hideAllSections() {
  hideRegistrationSection();
  hideLPInfoSection();
  hideDashboardSection();
}

// 加载已支付任务并计算总额
async function loadPaidTasks() {
  try {
    if (!isWalletConnected || !walletAddress) {
      logError('钱包未连接，无法加载已支付任务');
      return;
    }
    
    log('加载已支付任务以计算总额...');
    const response = await fetch(`${API_BASE_URL}/lp/task-pool?walletAddress=${walletAddress}`);
    
    if (!response.ok) {
      logError('获取任务池失败:', response.status);
      return;
    }
    
    const result = await response.json();
    if (!result.success || !result.data || !result.data.tasks) {
      logError('获取任务池数据格式错误');
      return;
    }
    
    // 筛选已支付的任务并计算总额
    const paidTasks = result.data.tasks.filter(task => 
      task.status === 'paid' && 
      task.lpWalletAddress && 
      task.lpWalletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
    
    paidAmount = paidTasks.reduce((sum, task) => sum + (parseFloat(task.amount) || 0), 0);
    log(`计算已支付总额: ${paidAmount} (共 ${paidTasks.length} 笔任务)`);
    
    // 更新已支付金额显示
    const paidQuotaElement = document.getElementById('paid-quota');
    if (paidQuotaElement) {
      paidQuotaElement.textContent = paidAmount.toFixed(2);
    }
    
  } catch (error) {
    logError('加载已支付任务失败:', error);
  }
}

// 开始自动刷新
function startAutoRefresh() {
  log('启动自动刷新');
  // 清除可能存在的旧定时器
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
  }
  
  // 设置新的定时器
  refreshIntervalId = setInterval(async () => {
    if (isWalletConnected && walletAddress) {
      log('自动刷新LP信息和任务池');
      await refreshLPInfo(walletAddress);
      await loadPaidTasks();
    }
  }, REFRESH_INTERVAL);
  
  log('自动刷新已启动');
}

// 停止自动刷新
function stopAutoRefresh() {
  log('停止自动刷新');
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
}

// 添加加载USDT余额的函数
async function loadUSDTBalance() {
  try {
    if (!isWalletConnected || !walletAddress || !signer) {
      return;
    }
    
    // 获取USDT合约信息
    const contractResponse = await fetch(`${API_BASE_URL}/settlement-contract-info`);
    if (!contractResponse.ok) {
      throw new Error('获取USDT合约信息失败');
    }
    
    const contractData = await contractResponse.json();
    if (!contractData.success) {
      throw new Error('获取USDT合约信息失败');
    }
    
    const usdtAddress = contractData.data.usdtAddress;
    
    // 创建USDT合约实例
    const usdtContract = new ethers.Contract(
      usdtAddress,
      [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ],
      signer
    );
    
    // 获取小数位数
    const decimals = await usdtContract.decimals();
    
    // 获取余额
    const balance = await usdtContract.balanceOf(walletAddress);
    usdtBalance = ethers.utils.formatUnits(balance, decimals);
    
    // 更新余额显示
    const usdtBalanceElement = document.getElementById('usdt-balance');
    if (usdtBalanceElement) {
      usdtBalanceElement.textContent = usdtBalance;
    }
    
    log(`更新USDT余额: ${usdtBalance}`);
  } catch (error) {
    logError('获取USDT余额失败:', error);
  }
}

// 添加加载交易历史的函数
async function loadTransactionHistory() {
  try {
    if (!isWalletConnected || !walletAddress) {
      return;
    }
    
    // 在这里可以添加获取链上交易历史的代码
    // 或者从后端获取交易记录的代码
    
    // 更新交易历史表格
    updateTransactionHistoryUI();
  } catch (error) {
    logError('加载交易历史失败:', error);
  }
}

// 添加更新交易历史UI的函数
function updateTransactionHistoryUI() {
  const container = document.getElementById('transaction-history');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (transactionHistory.length === 0) {
    container.innerHTML = '<p class="text-muted text-center my-3">暂无交易记录</p>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'table table-striped table-hover';
  
  // 创建表头
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>交易ID</th>
      <th>金额</th>
      <th>用户钱包</th>
      <th>支付方式</th>
      <th>交易时间</th>
      <th>状态</th>
      <th>操作</th>
    </tr>
  `;
  
  // 创建表体
  const tbody = document.createElement('tbody');
  
  // 填充数据
  transactionHistory.forEach(tx => {
    const tr = document.createElement('tr');
    
    const paymentMethodBadge = tx.paymentMethod ? 
      `<span class="badge ${tx.paymentMethod === 'PayPal' ? 'bg-primary' : 'bg-secondary'}">${tx.paymentMethod}</span>` : 
      '';
    
    const viewDetailsBtn = tx.paymentMethod === 'PayPal' && tx.transactionId ? 
      `<button class="btn btn-sm btn-outline-info" onclick="viewPayPalTransaction('${tx.transactionId}')">查看详情</button>` :
      `<button class="btn btn-sm btn-outline-secondary" disabled>无详情</button>`;
    
    tr.innerHTML = `
      <td>${tx.id}</td>
      <td>${formatCurrency(tx.amount, tx.currency)}</td>
      <td>${shortenAddress(tx.userWalletAddress)}</td>
      <td>${paymentMethodBadge}</td>
      <td>${tx.date}</td>
      <td><span class="badge ${tx.status === 'paid' ? 'bg-success' : 'bg-warning'}">${getStatusText(tx.status)}</span></td>
      <td>${viewDetailsBtn}</td>
    `;
    
    tbody.appendChild(tr);
  });
  
  // 组装表格
  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

// 添加PayPal交易详情查看功能
function viewPayPalTransaction(transactionId) {
  if (!transactionId) {
    alert('无效的交易ID');
    return;
  }
  
  // 创建模态框容器
  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal fade';
  modalContainer.id = 'paypal-transaction-modal';
  modalContainer.setAttribute('tabindex', '-1');
  modalContainer.setAttribute('aria-labelledby', 'paypal-transaction-modal-label');
  modalContainer.setAttribute('aria-hidden', 'true');
  
  // 模态框内容
  modalContainer.innerHTML = `
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="paypal-transaction-modal-label">PayPal交易详情</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="transaction-loading">
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            正在加载交易详情...
          </div>
          <div class="transaction-detail-container" style="display: none;">
            <div class="alert alert-info">
              <small>在实际生产环境中，您可以查看完整的PayPal交易详情，包括买家信息、支付状态和完整的交易记录。</small>
            </div>
            <div class="card mb-3">
              <div class="card-header">基本信息</div>
              <div class="card-body">
                <div class="row mb-2">
                  <div class="col-md-4"><strong>交易ID:</strong></div>
                  <div class="col-md-8" id="paypal-tx-id">${transactionId}</div>
                </div>
                <div class="row mb-2">
                  <div class="col-md-4"><strong>状态:</strong></div>
                  <div class="col-md-8" id="paypal-tx-status">COMPLETED</div>
                </div>
                <div class="row mb-2">
                  <div class="col-md-4"><strong>创建时间:</strong></div>
                  <div class="col-md-8" id="paypal-tx-create-time">${new Date().toLocaleString()}</div>
                </div>
                <div class="row mb-2">
                  <div class="col-md-4"><strong>更新时间:</strong></div>
                  <div class="col-md-8" id="paypal-tx-update-time">${new Date().toLocaleString()}</div>
                </div>
              </div>
            </div>
            
            <div class="card mb-3">
              <div class="card-header">金额信息</div>
              <div class="card-body">
                <div class="row mb-2">
                  <div class="col-md-4"><strong>总金额:</strong></div>
                  <div class="col-md-8" id="paypal-tx-gross-amount">$100.00 USD</div>
    </div>
                <div class="row mb-2">
                  <div class="col-md-4"><strong>PayPal手续费:</strong></div>
                  <div class="col-md-8" id="paypal-tx-fee">$3.20 USD</div>
                </div>
                <div class="row mb-2">
                  <div class="col-md-4"><strong>净收入:</strong></div>
                  <div class="col-md-8" id="paypal-tx-net-amount">$96.80 USD</div>
                </div>
              </div>
            </div>
            
            <div class="card">
              <div class="card-header">买家信息</div>
              <div class="card-body">
                <div class="row mb-2">
                  <div class="col-md-4"><strong>买家邮箱:</strong></div>
                  <div class="col-md-8" id="paypal-buyer-email">buyer@example.com</div>
                </div>
                <div class="row mb-2">
                  <div class="col-md-4"><strong>买家名称:</strong></div>
                  <div class="col-md-8" id="paypal-buyer-name">John Doe</div>
                </div>
                <div class="row mb-2">
                  <div class="col-md-4"><strong>买家ID:</strong></div>
                  <div class="col-md-8" id="paypal-buyer-id">BUYER12345</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
          <a href="https://sandbox.paypal.com/merchantapps/app/account/transactions" target="_blank" class="btn btn-primary">PayPal沙盒详情</a>
        </div>
      </div>
    </div>
  `;
  
  // 添加到页面
  document.body.appendChild(modalContainer);
  
  // 显示模态框
  const modal = new bootstrap.Modal(document.getElementById('paypal-transaction-modal'));
  modal.show();
  
  // 模拟数据加载
  setTimeout(() => {
    document.querySelector('.transaction-loading').style.display = 'none';
    document.querySelector('.transaction-detail-container').style.display = 'block';
    
    // 在实际应用中，这里应该从API获取真实的交易详情
    // 这里仅作模拟展示
    document.getElementById('paypal-tx-id').textContent = transactionId;
    document.getElementById('paypal-tx-status').textContent = 'COMPLETED';
    
    // 随机生成一些模拟数据
    const now = new Date();
    const createdAt = new Date(now.getTime() - Math.random() * 3600000); // 1-60分钟前
    
    document.getElementById('paypal-tx-create-time').textContent = createdAt.toLocaleString();
    document.getElementById('paypal-tx-update-time').textContent = now.toLocaleString();
    
    // 查找对应交易记录的金额
    const transaction = transactionHistory.find(tx => tx.transactionId === transactionId);
    const amount = transaction ? transaction.amount : (Math.random() * 500 + 50).toFixed(2);
    
    // 计算手续费和净额
    const fee = (amount * 0.029 + 0.30).toFixed(2);
    const netAmount = (amount - fee).toFixed(2);
    
    document.getElementById('paypal-tx-gross-amount').textContent = `$${amount} USD`;
    document.getElementById('paypal-tx-fee').textContent = `$${fee} USD`;
    document.getElementById('paypal-tx-net-amount').textContent = `$${netAmount} USD`;
    
    // 买家信息
    document.getElementById('paypal-buyer-email').textContent = 'sb-zs9v8j29741747@personal.example.com';
    document.getElementById('paypal-buyer-name').textContent = 'John Doe (沙盒测试账户)';
    document.getElementById('paypal-buyer-id').textContent = 'TESTBUYERID12345';
  }, 1500);
  
  // 在模态框关闭时移除元素
  document.getElementById('paypal-transaction-modal').addEventListener('hidden.bs.modal', function () {
    document.body.removeChild(modalContainer);
  });
}

// 格式化货币
function formatCurrency(amount, currency = 'USDT') {
  if (typeof amount !== 'number') {
    amount = parseFloat(amount) || 0;
  }
  return `${amount.toFixed(2)} ${currency}`;
}

// 添加钱包地址格式化辅助函数
function formatWalletAddress(address) {
  if (!address) return '-';
  // 显示前6位...后4位
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// 在页面加载时，添加新的USDT余额和交易历史区域到LP信息部分
document.addEventListener('DOMContentLoaded', function() {
  const lpInfoSection = document.getElementById('lp-info-section');
  if (lpInfoSection) {
    const transactionHistoryCard = document.createElement('div');
    transactionHistoryCard.className = 'card mb-4';
    transactionHistoryCard.innerHTML = `
      <div class="card-body">
        <h5 class="card-title">USDT余额与交易记录</h5>
        <div class="row mb-3">
          <div class="col-md-6">
            <p><strong>USDT余额:</strong> <span id="usdt-balance">0.00</span> USDT</p>
          </div>
          <div class="col-md-6 text-end">
            <button id="refresh-balance" class="btn btn-sm btn-outline-primary">刷新余额</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-striped">
            <thead>
              <tr>
                <th>#</th>
                <th>日期</th>
                <th>金额</th>
                <th>支付ID</th>
                <th>用户钱包地址</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="transaction-history">
              <tr>
                <td colspan="6" class="text-center">暂无交易记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    // 将交易历史卡片插入到LP信息区域后面
    lpInfoSection.appendChild(transactionHistoryCard);
    
    // 添加刷新余额按钮事件
    document.getElementById('refresh-balance').addEventListener('click', loadUSDTBalance);
  }
  
  // 初始化其他事件监听器
  initEventListeners();
});

// 连接PayPal账户
async function connectPayPal() {
  try {
    if (!isWalletConnected || !walletAddress) {
      alert('请先连接钱包');
      return;
    }
    
    const paypalEmail = document.getElementById('paypal-email').value;
    
    if (!paypalEmail) {
      alert('请输入PayPal邮箱');
      return;
    }
    
    // 验证邮箱格式
    if (!/^\S+@\S+\.\S+$/.test(paypalEmail)) {
      alert('请输入有效的邮箱地址');
      return;
    }
    
    // 验证码确认窗口
    const verificationCode = prompt(`为了验证您拥有此PayPal账户，我们将向 ${paypalEmail} 发送一封验证邮件。请在收到邮件后输入验证码:`);
    
    if (!verificationCode) {
      alert('验证已取消');
      return;
    }
    
    // 模拟验证过程
    if (verificationCode !== '123456') { // 在实际应用中，应该是服务器端验证
      alert('验证码不正确，请重试');
      return;
    }
    
    // 确认操作
    if (!confirm(`确定要将PayPal账户 ${paypalEmail} 与当前LP钱包绑定吗？`)) {
      return;
    }
    
    const response = await fetch(`${API_BASE_URL}/lp/paypal/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress,
        paypalEmail
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'PayPal账户连接失败');
    }
    
    const data = await response.json();
    
    // 更新LP信息
    document.getElementById('lp-paypal-email').textContent = data.data.paypalEmail;
    
    // 如果LP对象存在，更新它
    if (currentLP) {
      currentLP.paypalEmail = data.data.paypalEmail;
      currentLP.supportedPlatforms = data.data.supportedPlatforms;
    }
    
    alert('PayPal账户连接成功! 您的账户已通过验证。');
    
    // 刷新LP信息
    await refreshLPInfo(walletAddress);
    
  } catch (error) {
    logError('PayPal账户连接失败:', error);
    alert('PayPal账户连接失败: ' + error.message);
  }
}

// 更新LP的PayPal邮箱
async function updatePayPalEmail() {
  try {
    const newEmail = document.getElementById('paypal-email').value;
    if (!newEmail) {
      showToast('请输入PayPal邮箱', 'error');
      return;
    }

    const response = await fetch(`${API_BASE_URL}/lp/paypal/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: walletAddress,
        paypalEmail: newEmail
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '更新PayPal邮箱失败');
    }

    await refreshLPInfo(walletAddress);
    showToast('PayPal邮箱更新成功', 'success');
    
    // 关闭模态框
    const modal = document.getElementById('paypal-email-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  } catch (error) {
    console.error('更新PayPal邮箱失败:', error);
    showToast(error.message, 'error');
  }
}

// 显示更新PayPal邮箱的模态框
function showPayPalEmailModal() {
  // 创建模态框
  const modal = document.createElement('div');
  modal.id = 'paypal-email-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 20px;
    border-radius: 8px;
    width: 400px;
  `;

  content.innerHTML = `
    <h3>更新PayPal邮箱</h3>
    <p>请输入您的PayPal沙盒商家账号邮箱：</p>
    <input type="email" id="paypal-email" class="form-control" placeholder="PayPal邮箱" value="${currentLP?.paypalEmail || ''}" style="margin: 10px 0;">
    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;">
      <button onclick="document.getElementById('paypal-email-modal').remove()" class="btn btn-secondary">取消</button>
      <button onclick="updatePayPalEmail()" class="btn btn-primary">确认</button>
    </div>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
}

// 查看任务详情
async function viewTaskDetails(taskId) {
  try {
    console.log(`查看任务详情: ${taskId}`);
    
    // 获取任务详情
    const response = await fetch(`${API_BASE_URL}/lp/task/${taskId}`);
    
    if (!response.ok) {
      showToast(`获取任务详情失败: ${response.status}`, 'error');
      return;
    }
    
    const result = await response.json();
    if (!result.success) {
      showToast(`获取任务详情失败: ${result.message}`, 'error');
      return;
    }
    
    const task = result.data;
    
    // 提取PayPal支付信息
    let paypalInfo = { orderId: '未知', captureId: '未知', transactionTime: '未知' };
    if (task.paymentProof) {
      let proof = task.paymentProof;
      if (typeof proof === 'string') {
        try {
          proof = JSON.parse(proof);
        } catch (e) {
          console.error('解析支付凭证失败:', e);
        }
      }
      
      if (proof) {
        paypalInfo.orderId = proof.paypalOrderId || proof.orderId || '未知';
        paypalInfo.captureId = proof.paypalCaptureId || proof.captureId || proof.transactionId || '未知';
        paypalInfo.transactionTime = proof.captureTime || proof.transactionTime || '未知';
      }
    }
    
    // 创建详情弹窗
    const detailModal = document.createElement('div');
    detailModal.id = 'task-detail-modal';
    detailModal.className = 'modal fade show';
    detailModal.style.display = 'block';
    detailModal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    
    detailModal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">任务详情 #${task.id}</h5>
            <button type="button" class="btn-close" id="close-task-detail-modal"></button>
    </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">基本信息</div>
                  <div class="card-body">
                    <p><strong>任务ID:</strong> ${task.id}</p>
                    <p><strong>支付金额:</strong> ${task.amount} ${task.currency || 'USD'}</p>
                    <p><strong>支付平台:</strong> ${task.platform || '未知'}</p>
                    <p><strong>创建时间:</strong> ${new Date(task.createdAt).toLocaleString()}</p>
                    <p><strong>状态:</strong> ${getStatusText(task.status)}</p>
                    <p><strong>用户钱包地址:</strong> ${task.userWalletAddress || '未知'}</p>
                  </div>
                </div>
              </div>
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">PayPal交易信息</div>
                  <div class="card-body">
                    <p><strong>订单ID:</strong> <span class="text-primary">${paypalInfo.orderId}</span></p>
                    <p><strong>交易ID:</strong> <span class="text-primary">${paypalInfo.captureId}</span></p>
                    <p><strong>交易时间:</strong> ${paypalInfo.transactionTime ? new Date(paypalInfo.transactionTime).toLocaleString() : '未知'}</p>
                    <div class="mt-3">
                      <a href="https://sandbox.paypal.com/merchantapps/app/account/transactions" target="_blank" class="btn btn-sm btn-outline-primary">PayPal沙盒商家中心</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="card mb-3">
              <div class="card-header">状态历史</div>
              <div class="card-body">
                <div class="table-responsive">
                  <table class="table table-sm table-striped">
                    <thead>
                      <tr>
                        <th>状态</th>
                        <th>时间</th>
                        <th>备注</th>
                      </tr>
                    </thead>
                    <tbody id="status-history-table">
                      ${renderStatusHistory(task.statusHistory)}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="close-detail-button">关闭</button>
          </div>
      </div>
    </div>
  `;
  
    document.body.appendChild(detailModal);
    
    // 关闭按钮事件
    document.getElementById('close-task-detail-modal').addEventListener('click', function() {
      document.body.removeChild(detailModal);
    });
    
    document.getElementById('close-detail-button').addEventListener('click', function() {
      document.body.removeChild(detailModal);
    });
    
  } catch (error) {
    console.error('查看任务详情失败:', error);
    showToast('查看任务详情失败: ' + error.message, 'error');
  }
}

// 渲染状态历史
function renderStatusHistory(statusHistory) {
  if (!statusHistory) return '<tr><td colspan="3" class="text-center">无状态历史</td></tr>';
  
  let history = statusHistory;
  if (typeof history === 'string') {
    try {
      history = JSON.parse(history);
    } catch (e) {
      return '<tr><td colspan="3" class="text-center">状态历史解析失败</td></tr>';
    }
  }
  
  if (!Array.isArray(history)) {
    const entries = [];
    for (const [status, timestamp] of Object.entries(history)) {
      entries.push({
        status: status,
        timestamp: timestamp,
        note: ''
      });
    }
    history = entries;
  }
  
  if (history.length === 0) {
    return '<tr><td colspan="3" class="text-center">无状态历史</td></tr>';
  }
  
  return history.map(entry => {
    let description = entry.description || entry.note || '';
    
    // 添加交易哈希链接
    if (entry.txHash) {
      // 使用记录中的网络信息，如果没有则默认使用somnia（当前阶段）
      const network = entry.network || 'somnia';
      const explorerUrl = getExplorerUrl(entry.txHash, network);
      
      if (description) description += '<br>';
      description += `<a href="${explorerUrl}" target="_blank" class="text-primary">交易哈希: ${entry.txHash}</a>`;
    }
    
    return `
      <tr>
        <td><span class="badge ${getBadgeClass(entry.status)}">${getStatusText(entry.status)}</span></td>
        <td>${new Date(entry.timestamp).toLocaleString()}</td>
        <td>${description}</td>
      </tr>
    `;
  }).join('');
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
    somnia: 'https://shannon-explorer.somnia.network'  // 使用正确的Somnia浏览器地址
  };

  // 获取对应网络的浏览器URL
  const baseUrl = explorers[network.toLowerCase()] || explorers.ethereum;
  return `${baseUrl}/tx/${txHash}`;
}

// 获取状态对应的Badge样式类
function getBadgeClass(status) {
  switch(status.toLowerCase()) {
    case 'created': return 'bg-primary';
    case 'claimed': return 'bg-warning';
    case 'processing': return 'bg-secondary'; // 确保 processing 状态有样式
    case 'paid': return 'bg-success';
    case 'confirmed': 
    case 'user_confirmed': return 'bg-info';
    case 'processing': return 'bg-secondary';
    case 'cancelled':
    case 'expired':
    case 'failed': return 'bg-danger';
    default: return 'bg-dark';
  }
}

/* 标记任务已支付 - PayPal方式 */
async function markTaskPaidWithPayPal(taskId) {
  try {
    // 确保任务列表已加载
    if (!taskList || !Array.isArray(taskList)) {
      console.log('任务列表未加载，尝试加载任务池...');
      await loadTaskPool(currentTaskTab);
      
      if (!taskList || !Array.isArray(taskList)) {
        showToast('无法加载任务信息，请刷新页面重试', 'error');
        return;
      }
    }
    
    // 查找任务
    let task = taskList.find(t => t.id == taskId);
    
    if (!task) {
      // 如果在当前标签页找不到，尝试直接请求
      try {
        console.log(`在当前任务列表中未找到任务ID ${taskId}，尝试直接请求...`);
        const response = await fetch(`${API_BASE_URL}/lp/task/${taskId}`);
        
        if (!response.ok) {
          throw new Error(`获取任务详情失败: ${response.status}`);
        }
        
        const result = await response.json();
        if (!result.success || !result.data) {
          throw new Error('获取任务详情返回无效数据');
        }
        
        // 使用API获取的任务数据
        task = result.data;
      } catch (fetchError) {
        console.error('直接获取任务失败:', fetchError);
        showToast('无法找到任务信息', 'error');
        return;
      }
    }
    
    if (!task) {
      showToast('无法找到任务信息', 'error');
      return;
    }

    console.log('准备通过PayPal支付任务:', task);
    
    // 格式化金额
    const formattedAmount = parseFloat(task.amount).toFixed(2);
    
    // 创建支付确认模态框
    const paymentConfirmation = document.createElement('div');
    paymentConfirmation.id = 'payment-confirmation';
    paymentConfirmation.className = 'modal fade show';
    paymentConfirmation.style.display = 'block';
    document.body.appendChild(paymentConfirmation);

    // 在创建PayPal订单之前，先获取任务的商家邮箱信息
    console.log('开始获取商家信息...');
    let merchantEmail = null;
    let merchantEmailSource = "未知";
    let merchantInfoDetails = null;

    try {
      // 首先尝试从任务本身获取merchantInfo
      if (task.merchantInfo && typeof task.merchantInfo === 'object') {
        console.log('尝试从任务merchantInfo字段获取商家邮箱');
        if (task.merchantInfo.paypalEmail && 
            task.merchantInfo.paypalEmail.includes('@') && 
            !task.merchantInfo.paypalEmail.includes('personal.example.com')) {
          merchantEmail = task.merchantInfo.paypalEmail;
          merchantEmailSource = "支付订单商家信息";
          console.log(`从任务商家信息获取到PayPal邮箱: ${merchantEmail}`);
        }
      }
      
      // 其次尝试从任务merchantPaypalEmail字段获取
      if (!merchantEmail && task.merchantPaypalEmail && 
          task.merchantPaypalEmail.includes('@') && 
          !task.merchantPaypalEmail.includes('personal.example.com')) {
        merchantEmail = task.merchantPaypalEmail;
        merchantEmailSource = "支付订单商家邮箱";
        console.log(`从任务merchantPaypalEmail字段获取邮箱: ${merchantEmail}`);
      }
      
      // 最后尝试通过API获取
      if (!merchantEmail) {
        console.log('通过API获取商家信息:', `${API_BASE_URL}/payment/paypal/merchant-info/${task.id}`);
        const merchantInfoResponse = await fetch(`${API_BASE_URL}/payment/paypal/merchant-info/${task.id}`);
        
        if (merchantInfoResponse.ok) {
          const merchantInfo = await merchantInfoResponse.json();
          console.log('API返回的商家信息:', merchantInfo);
          
          if (merchantInfo.success && merchantInfo.data) {
            merchantInfoDetails = merchantInfo.data;
            if (merchantInfo.data.email && merchantInfo.data.email.includes('@') &&
                !merchantInfo.data.email.includes('personal.example.com')) {
              merchantEmail = merchantInfo.data.email;
              merchantEmailSource = merchantInfo.data.sourceType || "API获取";
              console.log(`从API获取到商家PayPal邮箱: ${merchantEmail}, 来源: ${merchantEmailSource}`);
            } else {
              console.warn('API返回的商家邮箱无效:', merchantInfo.data.email);
            }
          } else {
            console.error('API返回商家信息失败:', merchantInfo);
          }
        } else {
          console.error('获取商家信息API调用失败:', await merchantInfoResponse.text());
        }
      }
    } catch (error) {
      console.error('获取商家信息过程中出错:', error);
    }

    // 如果所有尝试都失败，使用系统默认值
    if (!merchantEmail || !merchantEmail.includes('@') || merchantEmail.includes('personal.example.com')) {
      console.warn('无法获取有效的商家邮箱，尝试获取系统默认值');
      try {
        const configResponse = await fetch(`${API_BASE_URL}/payment/paypal/config`);
        if (configResponse.ok) {
          const config = await configResponse.json();
          if (config.data && config.data.defaultMerchantEmail) {
            merchantEmail = config.data.defaultMerchantEmail;
            merchantEmailSource = "系统默认";
            console.log(`使用系统默认商家邮箱: ${merchantEmail}`);
          }
        }
      } catch (error) {
        console.error('获取系统默认商家邮箱失败:', error);
      }
    }
    
    // 最后的保底措施 - 使用硬编码的默认值
    if (!merchantEmail || !merchantEmail.includes('@') || merchantEmail.includes('personal.example.com')) {
      merchantEmail = 'sb-o3jcs29741632@business.example.com';
      merchantEmailSource = "硬编码默认";
      console.log(`使用硬编码默认商家邮箱: ${merchantEmail}`);
    }

    // 创建支付UI
    paymentConfirmation.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">确认PayPal支付</h5>
            <button type="button" class="btn-close" id="close-payment-confirmation"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <div class="d-flex align-items-center mb-2">
                <i class="bi bi-info-circle me-2"></i>
                <strong>支付信息</strong>
              </div>
              <p>任务ID: ${task.id}</p>
              <p>支付金额: $${formattedAmount} ${task.currency || 'USD'}</p>
              <p>描述: ${task.description || '无描述'}</p>
              <p class="text-primary"><strong>收款商家: ${merchantEmail}</strong></p>
              <p class="text-muted small">商家邮箱来源: ${merchantEmailSource}</p>
            </div>
            <div class="alert alert-warning">
              <i class="bi bi-exclamation-triangle me-2"></i>
              <strong>请确认收款商家邮箱正确后再付款。</strong>完成支付后，系统将自动更新任务状态。
            </div>
            <div class="alert alert-secondary">
              <small>支付将使用PayPal平台和您的PayPal账户进行。请确保您的PayPal账户有足够的余额。</small>
            </div>
            <div id="paypal-button-container"></div>
            <div class="text-center mt-3">
              <button type="button" class="btn btn-secondary" id="cancel-payment">取消</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // 添加关闭和取消事件处理
    document.getElementById('close-payment-confirmation').addEventListener('click', () => {
      document.body.removeChild(paymentConfirmation);
    });

    document.getElementById('cancel-payment').addEventListener('click', () => {
      document.body.removeChild(paymentConfirmation);
    });

    // 确保PayPal SDK已加载
    if (typeof paypal === 'undefined') {
      console.log('PayPal SDK未加载，开始加载...');
      await loadPayPalSDK();
    }
    
    console.log('渲染PayPal按钮...');
    // 渲染PayPal按钮
    paypal.Buttons({
      style: {
        layout: 'vertical',
        color: 'blue',
        shape: 'rect',
        label: 'pay'
      },
      
      createOrder: async function() {
        try {
          console.log('创建PayPal订单，使用商家邮箱:', merchantEmail);
          // 创建PayPal订单
          const orderResponse = await fetch(`${API_BASE_URL}/payment/paypal/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
            body: JSON.stringify({
              paymentIntentId: task.id,
              amount: task.amount,
              currency: task.currency || 'USD',
              description: task.description || 'UnitPay Payment',
              merchantPaypalEmail: merchantEmail // 确保使用有效的商家邮箱
            })
          });
          
          if (!orderResponse.ok) {
            const errorData = await orderResponse.json();
            console.error('创建PayPal订单API返回错误:', errorData);
            throw new Error(errorData.message || '创建PayPal订单失败');
          }
          
          const orderResult = await orderResponse.json();
          
          if (!orderResult.success) {
            console.error('创建订单返回失败状态:', orderResult);
            throw new Error(orderResult.message || '创建PayPal订单返回失败状态');
          }
          
          const orderId = orderResult.data.paypalOrderId;
          console.log('PayPal订单创建成功:', orderId);
          return orderId;
  } catch (error) {
          console.error('创建PayPal订单发生错误:', error);
          alert(`创建PayPal订单失败: ${error.message}`);
          document.body.removeChild(paymentConfirmation);
          throw error;
        }
      },
      
      onApprove: async function(data, actions) {
        try {
          console.log('PayPal支付已批准，OrderID:', data.orderID);
          
          // 显示处理中状态
          const paypalButtonContainer = document.getElementById('paypal-button-container');
          if (paypalButtonContainer) {
            paypalButtonContainer.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"></div><p class="mt-2">支付处理中，请稍候...</p></div>';
          }
          
          // 添加任务信息到记录中
          console.log('捕获支付的任务信息:', { 
            taskId, 
            amount: task.amount,
            currency: task.currency,
            merchantEmail
          });
          
          // 捕获支付
          const captureResponse = await fetch(`${API_BASE_URL}/payment/paypal/capture-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
            body: JSON.stringify({
              orderId: data.orderID,
              paymentIntentId: taskId,
              merchantPaypalEmail: merchantEmail // 传递商家邮箱确保一致性
            })
          });
          
          if (!captureResponse.ok) {
            const errorData = await captureResponse.json();
            console.error('支付捕获失败, 状态码:', captureResponse.status, '错误信息:', errorData);
            throw new Error(errorData.message || '支付捕获失败');
          }
          
          const captureResult = await captureResponse.json();
          
          if (!captureResult.success) {
            console.error('捕获返回失败状态:', captureResult);
            throw new Error(captureResult.message || '支付捕获返回失败状态');
          }
          
          // 支付捕获成功
          console.log('PayPal支付捕获成功:', captureResult);
          
          // 移除PayPal按钮，显示成功信息
          if (paypalButtonContainer) {
            paypalButtonContainer.innerHTML = `
              <div class="alert alert-success text-center">
                <i class="bi bi-check-circle-fill me-2"></i>
                <strong>支付成功!</strong>
                <p class="mt-2 mb-0">PayPal交易ID: ${captureResult.data?.captureId || data.orderID}</p>
              </div>
            `;
          }
          
          // 标记任务已支付
          try {
            const markPaidResponse = await fetch(`${API_BASE_URL}/lp/task/${taskId}/mark-paid`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                walletAddress,
                paymentProof: {
                  platform: 'PayPal',
                  orderId: data.orderID,
                  captureId: captureResult.data?.captureId || data.orderID,
                  transactionId: captureResult.data?.captureId || data.orderID,
                  transactionTime: new Date().toISOString()
                }
              })
            });
            
            if (!markPaidResponse.ok) {
              console.warn('标记任务已支付请求失败:', await markPaidResponse.text());
    } else {
              console.log('任务已成功标记为已支付');
    }
  } catch (error) {
            console.error('标记任务已支付错误:', error);
          }
          
          // 延迟关闭窗口，让用户看到成功信息
          setTimeout(() => {
            try {
              document.body.removeChild(paymentConfirmation);
            } catch (e) {
              console.warn('关闭支付窗口失败:', e);
            }
            
            // 刷新任务列表
            loadTaskPool(currentTaskTab);
            showToast('支付成功，任务状态已更新', 'success');
            
            // 刷新LP信息
            refreshLPInfo(walletAddress);
          }, 3000);
          
        } catch (error) {
          console.error('PayPal支付操作失败:', error);
          alert(`PayPal支付操作失败: ${error.message}`);
          
          const paypalButtonContainer = document.getElementById('paypal-button-container');
          if (paypalButtonContainer) {
            paypalButtonContainer.innerHTML = `
              <div class="alert alert-danger text-center">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                <strong>支付失败</strong>
                <p class="mt-2 mb-0">${error.message}</p>
                <button class="btn btn-outline-danger mt-3" id="retry-payment">重试</button>
              </div>
            `;
            
            document.getElementById('retry-payment').addEventListener('click', () => {
              // 重新加载PayPal按钮
              markTaskPaidWithPayPal(taskId);
            });
          }
        }
      },
      
      onCancel: function() {
        console.log('用户取消PayPal支付');
        alert('您已取消支付');
        document.body.removeChild(paymentConfirmation);
      },
      
      onError: function(err) {
        console.error('PayPal按钮发生错误:', err);
        alert(`PayPal处理过程中发生错误: ${err.message || '未知错误'}`);
        document.body.removeChild(paymentConfirmation);
      }
    }).render('#paypal-button-container');
    
  } catch (error) {
    console.error('PayPal支付初始化失败:', error);
    alert(`PayPal支付初始化失败: ${error.message}`);
    
    // 清理可能的模态框
    const modalElement = document.getElementById('payment-confirmation');
    if (modalElement) {
      document.body.removeChild(modalElement);
    }
  }
}

async function createOrder(taskId) {
  try {
    // 检查是否已取消
    if (paymentCancelled) {
      console.log('支付已被取消，不创建订单');
      return;
    }

    // 创建PayPal订单
    const response = await fetch(`${API_BASE_URL}/payment/paypal/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        taskId: taskId
      })
    });

    if (!response.ok) {
      throw new Error(`创建订单失败: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('创建PayPal订单时出错:', error);
    throw error;
  }
}