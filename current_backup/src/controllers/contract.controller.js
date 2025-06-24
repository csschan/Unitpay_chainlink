/**
 * 合约控制器
 * 提供合约相关的API
 */

/**
 * 获取合约信息
 * @route GET /api/contract-info
 * @access Public
 */
exports.getContractInfo = async (req, res) => {
  try {
    // 从环境变量中获取合约地址
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const usdtAddress = process.env.USDT_CONTRACT_ADDRESS;
    
    if (!contractAddress || !usdtAddress) {
      return res.status(500).json({
        success: false,
        message: '合约地址未配置'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: {
        contractAddress,
        usdtAddress
      }
    });
  } catch (error) {
    console.error('获取合约信息失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取合约信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 获取结算合约信息
 * @route GET /api/settlement-contract-info
 * @access Public
 */
exports.getSettlementContractInfo = async (req, res) => {
  try {
    // 硬编码结算合约信息
    const settlementContractAddress = "0x3317D180BBbC540CaB9B15A62FcB12D68fb2bE08";
    const usdtAddress = "0xa3EF117d0680EF025e99E09f44c0f6a5CafE141b";
    
    // Somnia网络配置
    const networkInfo = {
      name: 'Somnia',
      chainId: '0x1c',
      blockExplorer: 'https://shannon-explorer.somnia.network'  // 修正为正确的浏览器地址
    };
    
    return res.status(200).json({
      success: true,
      data: {
        settlementContractAddress,
        usdtAddress,
        network: 'somnia',
        networkInfo: networkInfo
      }
    });
  } catch (error) {
    console.error('获取结算合约信息失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取结算合约信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};