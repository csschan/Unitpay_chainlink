const ethers = require('ethers');

/**
 * 验证合约地址
 * @param {string} address 要验证的合约地址
 * @param {ethers.providers.JsonRpcProvider} provider Web3 provider
 * @returns {Promise<boolean>} 是否是有效的合约地址
 */
async function validateContract(address, provider) {
  try {
    console.log('验证合约地址:', address);

    // 验证地址格式
    if (!ethers.utils.isAddress(address)) {
      console.log('无效的地址格式');
      return false;
    }

    // 验证合约代码
    const code = await provider.getCode(address);
    const isContract = code !== '0x' && code !== '0x0';
    
    console.log('合约验证结果:', {
      address,
      hasCode: isContract,
      codeLength: (code.length - 2) / 2 // 减去'0x'前缀，除以2得到字节数
    });

    return isContract;
  } catch (error) {
    console.error('合约验证失败:', error);
    return false;
  }
}

/**
 * 验证USDT合约
 * @param {string} address USDT合约地址
 * @param {ethers.providers.JsonRpcProvider} provider Web3 provider
 * @returns {Promise<boolean>} 是否是有效的USDT合约
 */
async function validateUSDTContract(address, provider) {
  try {
    console.log('验证USDT合约:', address);

    // 首先验证是否是合约
    if (!await validateContract(address, provider)) {
      return false;
    }

    // 创建合约实例
    const ERC20_ABI = [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address to, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function transferFrom(address from, address to, uint256 amount) returns (bool)",
      "event Transfer(address indexed from, address indexed to, uint256 value)",
      "event Approval(address indexed owner, address indexed spender, uint256 value)"
    ];

    const contract = new ethers.Contract(address, ERC20_ABI, provider);

    // 验证合约接口
    const [name, symbol, decimals] = await Promise.all([
      contract.name().catch(() => null),
      contract.symbol().catch(() => null),
      contract.decimals().catch(() => null)
    ]);

    const isValid = name && symbol && decimals;
    
    console.log('USDT合约验证结果:', {
      address,
      name,
      symbol,
      decimals: decimals?.toString(),
      isValid
    });

    return isValid;
  } catch (error) {
    console.error('USDT合约验证失败:', error);
    return false;
  }
}

module.exports = {
  validateContract,
  validateUSDTContract
}; 