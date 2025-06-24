/**
 * 托管余额辅助模块
 * 用于安全地处理托管余额相关功能
 */

// 用于存储全局状态的对象
const EscrowState = {
  balance: '0.00',
  
  // 设置余额的安全方法
  setBalance: function(value) {
    this.balance = value;
    return value;
  },
  
  // 获取余额的安全方法
  getBalance: function() {
    return this.balance || '0.00';
  }
};

/**
 * 安全的托管余额更新函数
 */
async function safeUpdateEscrowBalance() {
  try {
    if (!contractService || typeof contractService.getEscrowContract !== 'function') {
      console.error('合约服务未初始化或不可用');
      const escrowBalanceEl = document.getElementById('escrowBalance');
      if (escrowBalanceEl) {
        escrowBalanceEl.textContent = '服务未加载';
      }
      return EscrowState.getBalance();
    }
    
    const escrowContract = await contractService.getEscrowContract();
    const walletAddress = localStorage.getItem('currentWallet');
    
    if (!walletAddress) {
      console.warn('未连接钱包，无法获取托管余额');
      const escrowBalanceEl = document.getElementById('escrowBalance');
      if (escrowBalanceEl) {
        escrowBalanceEl.textContent = '未连接钱包';
      }
      return EscrowState.getBalance();
    }
    
    const escrowBalance = await escrowContract.methods.getEscrowBalance(walletAddress).call();
    
    // 使用ethers或自定义函数将Wei转换为Ether，避免依赖web3
    let balanceInEth;
    if (typeof ethers !== 'undefined' && ethers.utils && typeof ethers.utils.formatEther === 'function') {
      // 使用ethers
      balanceInEth = ethers.utils.formatEther(escrowBalance);
    } else {
      // 简单的转换函数
      balanceInEth = convertWeiToEther(escrowBalance);
    }
    
    // 安全地更新余额
    EscrowState.setBalance(balanceInEth);
    
    // 更新UI
    const escrowBalanceEl = document.getElementById('escrowBalance');
    if (escrowBalanceEl) {
      escrowBalanceEl.textContent = balanceInEth;
    }
    
    return balanceInEth;
  } catch (error) {
    console.error('获取托管余额失败:', error);
    const escrowBalanceEl = document.getElementById('escrowBalance');
    if (escrowBalanceEl) {
      escrowBalanceEl.textContent = '获取失败';
    }
    return EscrowState.getBalance();
  }
}

// 辅助函数：从Wei转换为Ether
function convertWeiToEther(weiValue) {
  // 1 Ether = 10^18 Wei
  if (!weiValue || isNaN(weiValue)) return '0';
  const value = typeof weiValue === 'string' ? weiValue : weiValue.toString();
  
  // 转换逻辑
  if (value.length <= 18) {
    return '0.' + value.padStart(18, '0');
  } else {
    const decimalPoint = value.length - 18;
    return value.substring(0, decimalPoint) + '.' + value.substring(decimalPoint);
  }
}

// 导出到window对象，使函数全局可用
window.safeUpdateEscrowBalance = safeUpdateEscrowBalance;
window.EscrowState = EscrowState;
