/**
 * 支付系统调试工具
 * 用于检查支付状态、获取支付详情、测试区块链同步等
 * 使用方法: 在浏览器控制台中调用这些函数
 */

// 检查支付状态并输出详细信息
async function checkPaymentStatus(paymentId) {
  console.log(`======== 检查支付ID: ${paymentId} 的状态 ========`);
  
  try {
    // 1. 从API获取支付详情
    console.log(`步骤1: 获取支付详情...`);
    const apiResponse = await fetch(`/api/payment-intent/${paymentId}`);
    
    if (!apiResponse.ok) {
      console.error(`API请求失败: ${apiResponse.status} ${apiResponse.statusText}`);
      const errorText = await apiResponse.text();
      console.error(`错误详情: ${errorText}`);
      return { success: false, error: `API请求失败: ${apiResponse.status}` };
    }
    
    const paymentData = await apiResponse.json();
    console.log(`支付详情:`, paymentData.data);
    
    // 2. 检查区块链ID
    console.log(`步骤2: 检查区块链ID...`);
    const blockchainId = paymentData.data?.blockchainPaymentId || 
                         localStorage.getItem(`blockchain_id_${paymentId}`);
    
    if (!blockchainId) {
      console.warn(`找不到区块链ID，无法检查链上状态`);
      return { success: true, data: paymentData.data, blockchainStatus: null };
    }
    
    console.log(`区块链ID: ${blockchainId}`);
    
    // 3. 如果有区块链ID，检查链上状态
    console.log(`步骤3: 检查链上状态...`);
    if (!window.ethereum) {
      console.warn(`未连接MetaMask，无法检查链上状态`);
      return { success: true, data: paymentData.data, blockchainStatus: null };
    }
    
    // 确保settlement合约地址存在
    const contractAddress = window.CONFIG?.SETTLEMENT_CONTRACT_ADDRESS;
    if (!contractAddress) {
      console.warn(`合约地址未设置，无法检查链上状态`);
      return { success: true, data: paymentData.data, blockchainStatus: null };
    }
    
    // 初始化合约
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const settlementABI = [
      "function getPaymentStatus(string calldata paymentId) external view returns (uint8 status, bool isDisputed, address owner, address recipient, uint256 amount, uint256 timestamp, uint256 lockTime, uint256 releaseTime)"
    ];
    
    const contract = new ethers.Contract(
      contractAddress,
      settlementABI,
      signer
    );
    
    // 查询链上状态
    const chainStatus = await contract.getPaymentStatus(blockchainId);
    const formattedStatus = formatChainStatus(chainStatus);
    console.log(`链上状态:`, formattedStatus);
    
    // 4. 对比数据库状态和链上状态
    console.log(`步骤4: 对比状态...`);
    const dbStatus = paymentData.data.status;
    const chainStatusCode = parseInt(chainStatus.status);
    
    // 链上状态码和数据库状态映射
    const expectedDbStatus = getExpectedDbStatusFromChain(chainStatusCode, dbStatus);
    const statusMatch = isStatusMatching(dbStatus, chainStatusCode);
    
    if (statusMatch) {
      console.log(`✅ 状态匹配: 数据库状态=${dbStatus}, 链上状态=${formattedStatus.statusText}`);
    } else {
      console.warn(`❌ 状态不匹配: 数据库状态=${dbStatus}, 链上状态=${formattedStatus.statusText}`);
      console.warn(`期望的数据库状态应为: ${expectedDbStatus}`);
    }
    
    return { 
      success: true, 
      data: paymentData.data, 
      blockchainStatus: formattedStatus,
      statusMatch,
      expectedDbStatus
    };
  } catch (error) {
    console.error(`检查支付状态出错:`, error);
    return { success: false, error: error.message };
  }
}

// 格式化链上状态为易读格式
function formatChainStatus(chainStatus) {
  const statusCode = parseInt(chainStatus.status);
  let statusText = '未知';
  
  switch(statusCode) {
    case 0: statusText = '无'; break;
    case 1: statusText = '锁定中'; break;
    case 2: statusText = '已确认'; break;
    case 3: statusText = '已释放'; break;
    case 4: statusText = '已退款'; break;
  }
  
  // 格式化时间戳
  const createTime = new Date(chainStatus.timestamp.toNumber() * 1000);
  const lockTime = new Date(chainStatus.lockTime.toNumber() * 1000);
  const releaseTime = new Date(chainStatus.releaseTime.toNumber() * 1000);
  
  // 提款期计算 (T+1)
  const withdrawalTime = new Date(releaseTime.getTime() + 24 * 60 * 60 * 1000);
  
  // 检查是否过了锁定期
  const now = new Date();
  const isLockExpired = now > releaseTime;
  const isWithdrawable = now > withdrawalTime && (statusCode === 2 || statusCode === 3);
  
  return {
    statusCode,
    statusText,
    isDisputed: chainStatus.isDisputed,
    owner: chainStatus.owner,
    recipient: chainStatus.recipient,
    amount: ethers.utils.formatUnits(chainStatus.amount, 'ether'),
    createTime,
    lockTime,
    releaseTime,
    withdrawalTime,
    isLockExpired,
    isWithdrawable
  };
}

// 通过链上状态获取预期的数据库状态
function getExpectedDbStatusFromChain(chainStatusCode, currentDbStatus) {
  switch(chainStatusCode) {
    case 0: return '无效';
    case 1: return 'confirmed';  // 锁定中 - 数据库应显示已确认
    case 2: return 'confirmed';  // 已确认 - 数据库应显示已确认
    case 3: return 'settled';    // 已释放 - 数据库应显示已结算
    case 4: return 'refunded';   // 已退款 - 数据库应显示已退款
    default: return currentDbStatus;
  }
}

// 检查数据库状态和链上状态是否匹配
function isStatusMatching(dbStatus, chainStatusCode) {
  switch(chainStatusCode) {
    case 0: return false;  // 无状态总是不匹配
    case 1: return dbStatus === 'confirmed' || dbStatus === 'pending' || dbStatus === 'processing';
    case 2: return dbStatus === 'confirmed';
    case 3: return dbStatus === 'settled' || dbStatus === 'completed';
    case 4: return dbStatus === 'refunded';
    default: return false;
  }
}

// 手动调用同步API
async function syncPayment(paymentId) {
  console.log(`======== 手动同步支付ID: ${paymentId} ========`);
  
  try {
    const response = await fetch(`/api/payment-intent/${paymentId}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`同步请求失败: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`错误详情: ${errorText}`);
      return { success: false, error: `同步请求失败: ${response.status}` };
    }
    
    const result = await response.json();
    console.log(`同步结果:`, result);
    
    // 同步后再次检查状态
    const statusAfterSync = await checkPaymentStatus(paymentId);
    return { success: true, syncResult: result, statusCheck: statusAfterSync };
  } catch (error) {
    console.error(`同步支付出错:`, error);
    return { success: false, error: error.message };
  }
}

// 更新前端UI状态显示
async function updateUIStatus(paymentId) {
  console.log(`======== 更新支付ID: ${paymentId} 的前端显示 ========`);
  
  try {
    // 先获取状态信息
    const statusInfo = await checkPaymentStatus(paymentId);
    if (!statusInfo.success) {
      console.error('获取状态信息失败，无法更新UI');
      return { success: false, error: '获取状态信息失败' };
    }
    
    // 获取页面元素
    const statusElement = document.querySelector(`.payment-status[data-payment-id="${paymentId}"]`);
    const badgeElement = document.querySelector(`.status-badge[data-payment-id="${paymentId}"]`);
    const actionButtons = document.querySelectorAll(`button[data-payment-id="${paymentId}"]`);
    
    if (!statusElement && !badgeElement) {
      console.warn('找不到状态显示元素，可能需要刷新页面');
      return { success: false, error: '找不到状态显示元素' };
    }
    
    const payment = statusInfo.data;
    const blockchainStatus = statusInfo.blockchainStatus;
    
    // 更新状态文本
    if (statusElement) {
      statusElement.textContent = getStatusDisplayText(payment.status);
      console.log(`已更新状态文本为: ${getStatusDisplayText(payment.status)}`);
    }
    
    // 更新状态标签样式
    if (badgeElement) {
      const badgeClass = getStatusBadgeClass(payment.status);
      // 移除所有可能的badge类
      badgeElement.classList.remove('badge-secondary', 'badge-primary', 'badge-success', 'badge-warning', 'badge-danger', 'badge-info');
      badgeElement.classList.add(badgeClass);
      badgeElement.textContent = getStatusDisplayText(payment.status);
      console.log(`已更新状态标签样式为: ${badgeClass}`);
    }
    
    // 更新按钮状态
    if (actionButtons.length > 0) {
      console.log(`找到 ${actionButtons.length} 个操作按钮`);
      updateActionButtons(actionButtons, payment.status, blockchainStatus);
    }
    
    // 如果有交易信息，确保交易链接正确显示
    if (payment.transactionHash) {
      const txLinks = document.querySelectorAll(`a[data-tx-hash="${payment.transactionHash}"]`);
      if (txLinks.length > 0) {
        console.log(`更新 ${txLinks.length} 个交易链接`);
        updateTransactionLinks(txLinks, payment.transactionHash);
      }
    }
    
    console.log('前端UI更新完成');
    return { success: true, message: '前端UI更新完成' };
  } catch (error) {
    console.error('更新UI状态时出错:', error);
    return { success: false, error: error.message };
  }
}

// 获取状态显示文本
function getStatusDisplayText(status) {
  const statusTextMap = {
    'created': '已创建',
    'claimed': '已认领',
    'paid': '已支付',
    'confirmed': '已确认',
    'pending': '处理中',
    'processing': '处理中',
    'completed': '已完成',
    'settled': '已结算',
    'failed': '失败',
    'cancelled': '已取消',
    'refunded': '已退款',
    'disputed': '争议中',
    'rejected': '已拒绝',
    'expired': '已过期'
  };
  
  return statusTextMap[status] || status;
}

// 获取状态徽章样式类
function getStatusBadgeClass(status) {
  const badgeClassMap = {
    'created': 'badge-secondary',
    'claimed': 'badge-primary',
    'paid': 'badge-primary',
    'confirmed': 'badge-info',
    'pending': 'badge-warning',
    'processing': 'badge-warning',
    'completed': 'badge-success',
    'settled': 'badge-success',
    'failed': 'badge-danger',
    'cancelled': 'badge-secondary',
    'refunded': 'badge-warning',
    'disputed': 'badge-danger',
    'rejected': 'badge-danger',
    'expired': 'badge-secondary'
  };
  
  return badgeClassMap[status] || 'badge-secondary';
}

// 更新操作按钮状态
function updateActionButtons(buttons, status, blockchainStatus) {
  buttons.forEach(button => {
    const action = button.getAttribute('data-action');
    if (!action) return;
    
    // 处理提取按钮
    if (action === 'withdraw') {
      if (status === 'settled' || status === 'completed') {
        if (blockchainStatus && blockchainStatus.isWithdrawable) {
          button.disabled = false;
          button.title = '可以提取资金';
          console.log('启用提取按钮: 状态允许提取');
        } else {
          button.disabled = true;
          button.title = '资金锁定期未到，暂时无法提取';
          console.log('禁用提取按钮: 锁定期未到');
        }
      } else {
        button.disabled = true;
        button.title = `当前状态 (${status}) 不允许提取资金`;
        console.log(`禁用提取按钮: 当前状态 (${status}) 不允许`);
      }
    }
    
    // 处理确认按钮
    if (action === 'confirm') {
      if (status === 'paid') {
        button.disabled = false;
        console.log('启用确认按钮: 状态为已支付');
      } else {
        button.disabled = true;
        console.log(`禁用确认按钮: 当前状态 (${status}) 不允许`);
      }
    }
    
    // 处理付款按钮
    if (action === 'pay') {
      if (status === 'claimed') {
        button.disabled = false;
        console.log('启用付款按钮: 状态为已认领');
      } else {
        button.disabled = true;
        console.log(`禁用付款按钮: 当前状态 (${status}) 不允许`);
      }
    }
  });
}

// 更新交易链接
function updateTransactionLinks(links, txHash) {
  links.forEach(link => {
    // 确保链接指向正确的区块浏览器
    const explorer = getExplorerUrl(txHash);
    link.href = explorer;
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    console.log(`更新交易链接: ${explorer}`);
  });
}

// 获取区块浏览器URL
function getExplorerUrl(txHash) {
  // 根据网络ID确定使用的区块浏览器
  const networkId = window.CONFIG?.NETWORK_ID || 97;  // 默认使用BSC测试网
  
  const explorers = {
    1: `https://etherscan.io/tx/${txHash}`,           // 以太坊主网
    3: `https://ropsten.etherscan.io/tx/${txHash}`,   // Ropsten测试网
    4: `https://rinkeby.etherscan.io/tx/${txHash}`,   // Rinkeby测试网
    5: `https://goerli.etherscan.io/tx/${txHash}`,    // Goerli测试网
    42: `https://kovan.etherscan.io/tx/${txHash}`,    // Kovan测试网
    56: `https://bscscan.com/tx/${txHash}`,           // BSC主网
    97: `https://testnet.bscscan.com/tx/${txHash}`,   // BSC测试网
    137: `https://polygonscan.com/tx/${txHash}`,      // Polygon主网
    80001: `https://mumbai.polygonscan.com/tx/${txHash}`, // Polygon测试网
  };
  
  return explorers[networkId] || `https://testnet.bscscan.com/tx/${txHash}`;
}

// 将调试工具暴露到全局作用域
window.PaymentDebugTools = {
  checkPaymentStatus,
  syncPayment,
  updateUIStatus
};

// 简便访问方法
window.checkPayment = checkPaymentStatus;
window.syncPayment = syncPayment;
window.updateUI = updateUIStatus;

console.log('支付调试工具已加载，可以使用以下函数进行调试:');
console.log('1. window.checkPayment(id) - 检查支付状态');
console.log('2. window.syncPayment(id) - 同步支付状态');
console.log('3. window.updateUI(id) - 更新前端显示'); 