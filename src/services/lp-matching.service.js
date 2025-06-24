/**
 * LP匹配服务
 * 用于根据费率和金额匹配合适的LP
 */

const { models } = require('../models');
const { Op } = require('sequelize');

/**
 * 查找匹配用户条件的最佳LP
 * @param {number} feeRate - 用户设置的费率
 * @param {number} amount - 支付金额
 * @returns {Object|null} - 匹配的LP或null
 */
async function findBestLP(feeRate, amount) {
  try {
    console.log(`查找最佳LP，费率: ${feeRate}%, 金额: ${amount}`);
    
    // 尝试获取LP表，如果不存在则使用User表
    let LP;
    try {
      LP = models.LP;
      if (!LP) {
        console.log('LP模型不存在，使用User模型替代');
        LP = models.User;
      }
    } catch (error) {
      console.log('获取LP模型失败，使用User模型替代:', error.message);
      LP = models.User;
    }
    
    // 查询条件
    let where = {};
    if (LP === models.User) {
      // 如果使用User表，只需要查询role为lp的用户
      where.role = 'lp';
    } else {
      // 如果使用LP表，添加状态和费率条件
      where = {
        status: 'active',
        minFeeRate: { [Op.lte]: feeRate }
      };
      
      // 只有在指定金额时才添加余额条件
      if (amount && amount > 0) {
        where.availableBalance = { [Op.gte]: amount };
      }
    }
    
    // 查找所有匹配的LP
    const lps = await LP.findAll({
      where,
      order: [
        ['successRate', 'DESC'], // 成功率高的优先
        ['availableBalance', 'DESC'] // 可用余额多的优先
      ],
      limit: 5
    });
    
    console.log(`找到 ${lps.length} 个匹配的LP`);
    
    if (lps.length > 0) {
      return lps[0];
    }
    
    // 如果没有找到完全匹配的LP，尝试宽松条件查询
    console.log('未找到完全匹配的LP，尝试宽松条件查询');
    
    // 只保留基本条件
    if (LP === models.User) {
      where = { role: 'lp' };
    } else {
      where = { status: 'active' };
    }
    
    const fallbackLPs = await LP.findAll({
      where,
      order: [
        ['availableBalance', 'DESC'], // 可用余额多的优先
        ['successRate', 'DESC'] // 成功率高的优先
      ],
      limit: 1
    });
    
    if (fallbackLPs.length > 0) {
      console.log('使用备选LP:', fallbackLPs[0].address);
      return fallbackLPs[0];
    }
    
    // 如果仍然找不到LP，创建一个默认LP（系统LP）
    // 这只是一个备选方案，确保系统不会因为找不到LP而失败
    return {
      id: 0,
      name: 'System LP',
      address: process.env.SYSTEM_LP_ADDRESS || '0x0000000000000000000000000000000000000001',
      feeRate: feeRate,
      availableBalance: amount * 10 // 假设系统LP有足够的余额
    };
  } catch (error) {
    console.error('查找最佳LP失败:', error);
    // 出错时返回系统LP作为最后的备选
    return {
      id: 0,
      name: 'System LP (Fallback)',
      address: process.env.SYSTEM_LP_ADDRESS || '0x0000000000000000000000000000000000000001',
      feeRate: feeRate || 0.5
    };
  }
}

/**
 * 获取可用LP列表
 * @returns {Array} - 可用LP列表
 */
async function getAvailableLPs() {
  try {
    // 尝试获取LP表，如果不存在则使用User表
    let LP;
    try {
      LP = models.LP;
      if (!LP) {
        console.log('LP模型不存在，使用User模型替代');
        LP = models.User;
      }
    } catch (error) {
      console.log('获取LP模型失败，使用User模型替代:', error.message);
      LP = models.User;
    }
    
    // 查询条件
    const where = LP === models.User ? { role: 'lp' } : { status: 'active' };
    
    // 查找所有可用LP
    const lps = await LP.findAll({
      where,
      attributes: ['id', 'name', 'address', 'feeRate', 'availableBalance', 'successRate'],
      order: [
        ['successRate', 'DESC'],
        ['availableBalance', 'DESC']
      ],
      limit: 20
    });
    
    return lps;
  } catch (error) {
    console.error('获取可用LP列表失败:', error);
    return [];
  }
}

/**
 * 确保系统中有至少一个LP
 * 如果LP表为空，创建一个默认LP
 */
async function ensureDefaultLP() {
  try {
    // 检查models.LP是否可用
    let LP;
    try {
      LP = models.LP;
      if (!LP) {
        console.log('LP模型不可用，尝试从User模型获取LP');
        // 如果LP模型不可用，检查User模型中的LP
        const User = models.User;
        const lpUsers = await User.findAll({
          where: { role: 'lp' }
        });
        
        if (lpUsers && lpUsers.length > 0) {
          console.log(`从User表中找到 ${lpUsers.length} 个LP用户`);
          return true;
        }
        
        // 如果User表中也没有LP，创建一个
        if (User) {
          const defaultLP = await User.create({
            walletAddress: process.env.DEFAULT_LP_ADDRESS || '0x1234567890123456789012345678901234567890',
            name: 'System Default LP',
            role: 'lp',
            email: 'system-lp@example.com',
            isActive: true
          });
          console.log('已在User表中创建默认LP:', defaultLP.walletAddress);
          return true;
        }
        
        console.warn('无法创建默认LP: User模型不可用');
        return false;
      }
    } catch (error) {
      console.error('获取LP模型失败:', error);
      return false;
    }
    
    // 检查LP表中是否有记录
    const count = await LP.count();
    console.log(`LP表中有 ${count} 条记录`);
    
    if (count > 0) {
      return true; // 已有LP记录
    }
    
    // 创建默认LP
    const defaultLP = await LP.create({
      walletAddress: process.env.DEFAULT_LP_ADDRESS || '0x1234567890123456789012345678901234567890',
      name: 'System Default LP',
      isVerified: true,
      isActive: true,
      supportedPlatforms: ['PayPal', 'GCash', 'Other'],
      totalQuota: 1000,
      availableQuota: 1000,
      lockedQuota: 0,
      perTransactionQuota: 100,
      feeRate: 0.5,
      minFeeRate: 0.1,
      maxFeeRate: 5.0,
      isDefault: true
    });
    
    console.log('已创建默认LP:', defaultLP.walletAddress);
    return true;
  } catch (error) {
    console.error('确保默认LP失败:', error);
    return false;
  }
}

// 在服务器启动时确保有默认LP
ensureDefaultLP().then(result => {
  console.log('确保默认LP存在:', result ? '成功' : '失败');
}).catch(err => {
  console.error('运行ensureDefaultLP时出错:', err);
});

module.exports = {
  findBestLP,
  getAvailableLPs,
  ensureDefaultLP
}; 