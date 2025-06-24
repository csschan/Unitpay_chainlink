const { PaymentIntent, User, LP } = require('../models/mysql/index');
const { parseQRCode, identifyPaymentPlatform } = require('../utils/qrcode.utils');
const { validatePaymentData } = require('../utils/validation.utils');
const { paymentService } = require('../services/payment.service');
const web3 = require('web3');
const { serializeModel, serializeModels } = require('../utils/serialization.utils');
const { Op, Sequelize } = require('sequelize');
const PaymentStatus = require('../constants/payment-status');
const blockchainSyncService = require('../services/blockchain-sync.service');
const contractService = require('../services/contract.service');

// 支持的支付平台列表
const SUPPORTED_PLATFORMS = ['PayPal', 'GCash', 'Alipay', 'WeChat', 'Other'];

/**
 * 创建支付意图
 * @route POST /api/payment-intent
 * @access Public
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    console.log('开始创建支付意图，请求数据:', req.body);
    // 获取请求参数
    let { 
      userWalletAddress,
      walletAddress, 
      amount, 
      platform, 
      description = '', 
      qrContent = '',
      merchantPaypalEmail = '',
      lpWalletAddress,
      lpAddress = null,
      fee_rate = 0.5,
      fee_amount = 0,
      total_amount = 0,
      autoMatchLP = false
    } = req.body;
    
    // 确保兼容性 - 支持用户钱包地址字段的两种命名方式
    walletAddress = userWalletAddress || walletAddress;
    lpAddress = lpWalletAddress || lpAddress;
    
    // 费率处理
    const feeRate = parseFloat(fee_rate || 0.5);
    
    console.log('支付请求参数:', {
      walletAddress,
      amount,
      platform,
      lpAddress,
      feeRate,
      autoMatchLP
    });
    
    // 验证必填字段
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: '钱包地址不能为空'
      });
    }
    
    if (!platform) {
      return res.status(400).json({
        success: false,
        message: '支付平台不能为空'
      });
    }
    
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: '金额必须为正数'
      });
    }

    // 金额转换为数字
    amount = parseFloat(amount);
    
    // 处理LP地址
    // 如果请求了自动匹配或没有提供LP地址，使用LP匹配服务
    if (autoMatchLP || !lpAddress || lpAddress === 'auto') {
      try {
        console.log(`需要自动匹配LP，费率: ${feeRate}%`);
        const lpMatchingService = require('../services/lp-matching.service');
        
        // 确保系统中有默认LP
        await lpMatchingService.ensureDefaultLP();
        
        const lp = await lpMatchingService.findBestLP(feeRate, amount);
        
        if (lp) {
          lpAddress = lp.walletAddress || lp.address;
          console.log(`自动匹配成功，LP地址: ${lpAddress}, 费率: ${lp.feeRate || feeRate}%`);
        } else {
          // 如果LP匹配服务返回null（极少情况），使用环境变量中的默认LP
          lpAddress = process.env.DEFAULT_LP_ADDRESS;
          console.log(`LP匹配失败，使用默认LP地址: ${lpAddress}`);
          
          // 如果仍然没有LP地址，创建一个系统LP
          if (!lpAddress) {
            lpAddress = '0x0000000000000000000000000000000000000001';
            console.log(`没有配置默认LP，使用系统LP地址: ${lpAddress}`);
          }
        }
      } catch (error) {
        console.error('LP匹配失败:', error);
        
        // 使用备用LP地址
        lpAddress = process.env.DEFAULT_LP_ADDRESS || '0x0000000000000000000000000000000000000001';
        console.log(`LP匹配出错，使用备用LP地址: ${lpAddress}`);
      }
    }
    
    // 确保LP地址有效
    if (!lpAddress || lpAddress === 'auto') {
      return res.status(400).json({
        success: false,
        message: 'LP地址无效或未能找到合适的LP'
      });
    }
    
    console.log(`最终使用LP地址: ${lpAddress}, 费率: ${feeRate}%`);
    
    // 验证必要参数
    if (!amount || !platform || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：金额、支付平台和用户钱包地址必须提供'
      });
    }

    // 如果是PayPal支付，验证商家PayPal邮箱
    if (platform === 'PayPal' && !merchantPaypalEmail) {
      console.error('缺少PayPal商家邮箱');
      return res.status(400).json({
        success: false,
        message: '使用PayPal支付时必须提供商家PayPal邮箱'
      });
    }
    
    // 如果是PayPal支付，额外验证商家邮箱格式
    if (platform === 'PayPal' && merchantPaypalEmail) {
      // 简单验证邮箱格式
      if (!merchantPaypalEmail.includes('@') || merchantPaypalEmail.length < 5) {
        console.error('无效的PayPal邮箱格式:', merchantPaypalEmail);
        return res.status(400).json({
          success: false,
          message: '无效的PayPal邮箱格式'
        });
      }

      // 检查是否是个人账号
      if (merchantPaypalEmail.includes('personal.example.com')) {
        console.error('提供的是PayPal个人账号，无法用于商家收款:', merchantPaypalEmail);
        return res.status(400).json({
          success: false,
          message: '请提供PayPal商家账号，而不是个人账号'
        });
      }
      
      console.log(`验证通过，商家PayPal邮箱: ${merchantPaypalEmail}`);
    } else if (platform === 'PayPal' && !merchantPaypalEmail) {
      console.error('使用PayPal支付时未提供商家邮箱');
      return res.status(400).json({
        success: false,
        message: '使用PayPal支付时必须提供商家PayPal邮箱'
      });
    }

    // 验证金额
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: '无效的支付金额，金额必须大于0'
      });
    }
    
    // 验证钱包地址格式
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: '无效的以太坊钱包地址'
      });
    }
    
    let paymentPlatform = platform;
    let merchantInfo = {};
    let qrCodeAmount = null;

    // 如果提供了二维码内容，则解析二维码
    if (merchantPaypalEmail) {
      console.log('商家PayPal邮箱:', merchantPaypalEmail);
      
      // 如果是PayPal支付，确保平台设置为PayPal
      if (platform === 'PayPal') {
        paymentPlatform = 'PayPal';
        merchantInfo = {
          email: merchantPaypalEmail,
          platform: 'PayPal'
        };
        console.log('设置支付平台为PayPal，邮箱:', merchantPaypalEmail);
      } else {
        // 否则尝试解析二维码内容
        const parsedQRData = await parseQRCode(merchantPaypalEmail);
        console.log('Parsed QR Data:', parsedQRData);
        
    if (!parsedQRData.success) {
      return res.status(400).json({
        success: false,
        message: '无法解析二维码内容',
        error: parsedQRData.error
      });
    }
    
    // 识别支付平台
    const platformInfo = identifyPaymentPlatform(parsedQRData.data);
        console.log('Platform Info:', platformInfo);
        
    if (!platformInfo.success) {
          return res.status(400).json({
            success: false,
            message: platformInfo.message || '无法识别支付平台',
            debug: {
              qrContent: merchantPaypalEmail,
              parsedData: parsedQRData.data
            }
          });
        }

        paymentPlatform = platformInfo.platform;
        qrCodeAmount = platformInfo.data.amount;
        merchantInfo = {
          id: platformInfo.data.merchantId || '',
          name: platformInfo.data.merchantName || '',
          accountId: platformInfo.data.accountId || '',
          qrCodeContent: merchantPaypalEmail,
          platform: paymentPlatform
        };

        // 验证二维码中的金额是否匹配
        if (qrCodeAmount && Math.abs(qrCodeAmount - parsedAmount) > 0.01) {
          return res.status(400).json({
            success: false,
            message: '二维码中的支付金额与输入金额不匹配',
            qrCodeAmount,
            inputAmount: parsedAmount
          });
        }
      }
    } else if (!platform) {
      return res.status(400).json({
        success: false,
        message: '必须提供支付平台或二维码内容'
      });
    }

    // 验证支付平台
    if (!SUPPORTED_PLATFORMS.includes(paymentPlatform)) {
      return res.status(400).json({
        success: false,
        message: '不支持的支付平台'
      });
    }
    
    // 查找或创建用户
    console.log('查找用户:', walletAddress);
    let user = await User.findOne({ where: { walletAddress: walletAddress } });
    if (!user) {
      console.log('用户不存在，创建新用户');
      user = await User.create({ walletAddress: walletAddress });
    }
    console.log('用户信息:', user.toJSON());
    
    // 创建支付意图
    console.log('开始创建支付意图，数据:', {
      amount: parsedAmount,
      currency: 'USD',
      platform: paymentPlatform,
      userWalletAddress: walletAddress,
      userId: user.id,
      merchantPaypalEmail
    });
    
    // 确保PayPal商家邮箱是一个字符串
    let paypalEmail = null;
    if (merchantPaypalEmail) {
      if (typeof merchantPaypalEmail === 'object') {
        console.warn('商家PayPal邮箱是一个对象，尝试提取字符串值:', JSON.stringify(merchantPaypalEmail));
        if (merchantPaypalEmail.email) {
          paypalEmail = merchantPaypalEmail.email;
        } else {
          paypalEmail = JSON.stringify(merchantPaypalEmail);
        }
      } else {
        paypalEmail = String(merchantPaypalEmail);
      }
      console.log('最终使用的商家PayPal邮箱(字符串格式):', paypalEmail);

      // 再次检查是否是个人账号
      if (paypalEmail.includes('personal.example.com')) {
        console.error('提供的是PayPal个人账号，无法用于商家收款:', paypalEmail);
        return res.status(400).json({
          success: false,
          message: '请提供PayPal商家账号，而不是个人账号'
        });
      }
    }
    
    // 构建merchantInfo对象
    if (platform === 'PayPal' && paypalEmail) {
      merchantInfo = {
        paypalEmail: paypalEmail,
        platform: 'PayPal'
      };
    }
    
    console.log(`创建支付意图 - 平台: ${platform}, 商家信息:`, JSON.stringify(merchantInfo));
    
    const paymentIntent = await PaymentIntent.create({
      amount: parsedAmount,
      currency: 'USD',
      platform: paymentPlatform,
      userWalletAddress: walletAddress,
      userId: user.id,
      merchantPaypalEmail: paypalEmail,
      merchantInfo: Object.keys(merchantInfo).length > 0 ? merchantInfo : null,
      description,
      status: 'created',
      statusHistory: [{
        status: 'created',
        timestamp: new Date(),
        note: '支付意图创建'
      }],
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      lpWalletAddress: lpAddress,
      fee_rate: feeRate,
      fee_amount: fee_amount || (parsedAmount * feeRate / 100),
      total_amount: total_amount || (parsedAmount * (1 + feeRate / 100))
    });
    
    // 生成并保存区块链支付ID
    const { ethers } = require('ethers');
    try {
      const idBytes = ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'uint256'],
        [paymentIntent.id, paymentIntent.userWalletAddress, Date.now()]
      );
      const blockchainPaymentId = ethers.utils.keccak256(idBytes);
      await paymentIntent.update({ blockchainPaymentId });
      console.log(`已为支付意图 ${paymentIntent.id} 生成区块链ID: ${blockchainPaymentId}`);

      // 前端将使用用户钱包进行链上锁定，后端不再发起链上交易
      console.log('后端已生成 blockchainPaymentId，由前端负责链上锁定');
    } catch (err) {
      console.error('生成区块链ID失败:', err);
    }
    
    // 确保merchantInfo字段已正确保存
    if (platform === 'PayPal' && paypalEmail && !paymentIntent.merchantInfo) {
      console.log('merchantInfo字段未正确保存，尝试更新...');
      await paymentIntent.update({
        merchantInfo: merchantInfo
      });
      console.log('merchantInfo字段已更新');
    }
    
    console.log('支付意图创建成功:', JSON.stringify({
      id: paymentIntent.id,
      platform: paymentIntent.platform,
      amount: paymentIntent.amount,
      merchantPaypalEmail: paymentIntent.merchantPaypalEmail,
      merchantInfo: paymentIntent.merchantInfo
    }));

    // 确保最终保存的商家邮箱有效 
    const finalMerchantPaypalEmail = paymentIntent.merchantPaypalEmail;
    console.log(`最终保存在支付意图中的PayPal商家邮箱: ${finalMerchantPaypalEmail || '无'}`);
    
    if (platform === 'PayPal' && (!finalMerchantPaypalEmail || 
        !finalMerchantPaypalEmail.includes('@') || 
        finalMerchantPaypalEmail.includes('personal.example.com'))) {
      console.error(`警告: 支付意图创建成功但商家PayPal邮箱无效或丢失: ${finalMerchantPaypalEmail || '无'}`);
      // 不中断流程，但记录错误
    }
    
    // 发送支付状态更新事件
    const io = req.app.get('io');
    if (io) {
      io.emit('paymentStatusUpdate', {
        walletAddress: walletAddress,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        lpAddress: lpAddress
      });
    }
    
    // 构建返回数据
    const responseData = {
      paymentIntentId: paymentIntent.id,
      blockchainPaymentId: paymentIntent.blockchainPaymentId,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      platform: paymentIntent.platform,
      status: paymentIntent.status,
      merchantPaypalEmail: paymentIntent.merchantPaypalEmail,
      lpAddress: lpAddress,
      feeRate: feeRate
    };
    
    console.log('支付创建成功，返回数据:', responseData);
    
    // 发送Socket.io通知
    try {
      if (io) {
        console.log('发送payment_created Socket事件:', { id: paymentIntent.id });
        io.emit('payment_created', responseData);
      }
    } catch (socketError) {
      console.error('发送Socket通知失败:', socketError);
      // 不影响主流程，继续返回成功响应
    }
    
    return res.status(201).json({
      success: true,
      message: '支付意图创建成功',
      data: responseData
    });
  } catch (error) {
    console.error('创建支付意图失败:', error);
    return res.status(500).json({
      success: false,
      message: '创建支付意图失败: ' + error.message
    });
  }
};

/**
 * 获取用户的支付意图列表
 * @route GET /api/payment-intents/user/:walletAddress
 * @access Public
 */
exports.getUserPaymentIntents = async (req, res) => {
  try {
    const { walletAddress } = req.params;
    console.log('[getUserPaymentIntents] 请求钱包地址:', walletAddress);
    // 验证钱包地址格式
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      console.log('[getUserPaymentIntents] 无效的钱包地址格式');
      return res.status(400).json({
        success: false,
        message: '无效的以太坊钱包地址'
      });
    }
    // 将钱包地址转换为小写进行查询
    const normalizedWalletAddress = walletAddress.toLowerCase();
    console.log('[getUserPaymentIntents] 规范化的钱包地址:', normalizedWalletAddress);
    // 查找用户的支付意图
    console.log('[getUserPaymentIntents] 开始查询数据库');
    const paymentIntents = await PaymentIntent.findAll({
      where: { 
        userWalletAddress: normalizedWalletAddress
      },
      order: [['createdAt', 'DESC']]
    });
    console.log('[getUserPaymentIntents] 数据库查询结果数量:', paymentIntents.length);
    if (paymentIntents.length > 0) {
      console.log('[getUserPaymentIntents] 第一条记录:', JSON.stringify(paymentIntents[0].toJSON(), null, 2));
    }
    // 只序列化数据库结果，不做链上同步
    const serializedPaymentIntents = serializeModels(paymentIntents);
    const response = {
      success: true,
      data: {
        paymentIntents: serializedPaymentIntents
      }
    };
    console.log('[getUserPaymentIntents] 最终返回数据结构:', JSON.stringify(response, null, 2));
    return res.json(response);
  } catch (error) {
    console.error('[getUserPaymentIntents] 获取支付意图列表失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取支付意图列表失败: ' + error.message
    });
  }
};

/**
 * 获取LP的支付意图列表
 * @route GET /api/payment-intent/lp/:walletAddress
 * @access Public
 */
exports.getLPPaymentIntents = async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    // 验证钱包地址格式
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: '无效的以太坊钱包地址'
      });
    }
    
    // 查询LP的支付意图
    const paymentIntents = await PaymentIntent.findAll({
      where: { lpWalletAddress: walletAddress },
      order: [['createdAt', 'DESC']]
    });
    
    // 使用序列化工具函数处理返回数据
    const serializedPaymentIntents = serializeModels(paymentIntents);
    
    return res.status(200).json({
      success: true,
      data: {
        paymentIntents: serializedPaymentIntents
      }
    });
    
  } catch (error) {
    console.error('获取LP支付意图列表失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取LP支付意图列表失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 获取单个支付意图的详情
 * @route GET /api/payment-intent/:id
 * @access Public
 */
exports.getPaymentIntentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`获取支付意图详情: ${id}`);
    
    // 在返回详情前手动同步链上状态到数据库
    try {
      await blockchainSyncService.manualSyncPayment(id);
    } catch (syncError) {
      console.warn(`手动同步支付意图 ${id} 失败:`, syncError);
    }
    
    // 查询（同步后更新后的）支付意图
    const paymentIntent = await PaymentIntent.findByPk(id);
    
    if (!paymentIntent) {
      console.log(`支付意图不存在: ${id}`);
      return res.status(404).json({
        success: false,
        message: '未找到请求的资源'
      });
    }
    
    // 序列化支付意图数据
    const serializedPaymentIntent = serializeModel(paymentIntent);
    
    console.log(`支付意图详情: ${JSON.stringify({
      id: serializedPaymentIntent.id,
      status: serializedPaymentIntent.status,
      blockchainPaymentId: serializedPaymentIntent.blockchainPaymentId || '未设置'
    })}`);
    
    return res.status(200).json({
      success: true,
      message: '获取支付意图成功',
      data: serializedPaymentIntent
    });
  } catch (error) {
    console.error('获取支付意图详情失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取支付意图失败',
      error: error.message
    });
  }
};

/**
 * 取消支付意图
 * @route PUT /api/payment-intent/:id/cancel
 * @access Public
 */
exports.cancelPaymentIntent = async (req, res) => {
  try {
    const { id } = req.params;
    const { walletAddress, reason } = req.body;
    
    console.log(`取消支付意图: ID=${id}, 钱包地址=${walletAddress}, 原因=${reason}`);
    
    // 验证钱包地址格式
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: '无效的以太坊钱包地址'
      });
    }
    
    // 查询支付意图
    const paymentIntent = await PaymentIntent.findByPk(id);
    
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    // 验证用户权限
    // 只有订单的创建者或者订单的LP可以取消
    if (paymentIntent.userWalletAddress !== walletAddress && 
        paymentIntent.lpWalletAddress !== walletAddress) {
      return res.status(403).json({
        success: false,
        message: '无权取消此支付意图'
      });
    }
    
    // 检查支付意图状态，只能取消特定状态的支付意图
    if (!['created', 'claimed'].includes(paymentIntent.status)) {
      return res.status(400).json({
        success: false,
        message: `支付意图当前状态为${paymentIntent.status}，无法取消`
      });
    }
    
    // 如果是LP尝试取消已认领的支付意图，需要额外检查
    if (paymentIntent.status === 'claimed' && paymentIntent.lpId) {
      const lp = await LP.findByPk(paymentIntent.lpId);
      if (lp && lp.walletAddress !== walletAddress) {
        return res.status(403).json({
          success: false,
          message: '只有认领的LP可以取消已认领的支付意图'
        });
      }
    }
    
    // 调用状态服务更新状态
    const paymentStatusService = require('../services/payment-status.service');
    const updated = await paymentStatusService.updatePaymentStatus(
      id,
      'cancelled',
      null,
      {
        note: `用户 ${walletAddress} 取消支付意图，原因: ${reason || '未提供'}`,
        data: { cancelledBy: walletAddress, reason: reason || '未提供' }
      }
    );
    if (!updated) {
      return res.status(400).json({
        success: false,
        message: `状态更新失败，无法从 ${paymentIntent.status} 更新为 cancelled`
      });
    }
    // 重新加载最新数据并序列化，确保返回包含完整的 statusHistory
    const refreshed = await PaymentIntent.findByPk(id);
    const serialized = serializeModel(refreshed);
    
    // 通过Socket.io通知LP支付意图已取消
    if (paymentIntent.lpWalletAddress) {
      const io = req.app.get('io');
      if (io) {
        console.log(`发送payment_intent_cancelled Socket事件: ${id}`);
        io.emit('payment_intent_cancelled', {
          id,
          userWalletAddress: walletAddress
        });
      }
    }
    
    return res.status(200).json({
      success: true,
      message: '支付意图取消成功',
      data: serialized
    });
  } catch (error) {
    console.error('取消支付意图失败:', error);
    return res.status(500).json({
      success: false,
      message: '取消支付意图失败: ' + error.message
    });
  }
};

/**
 * 确认支付意图（用户确认已收到付款）
 * @route PUT /api/payment-intent/:id/confirm
 * @access Public
 */
exports.confirmPaymentIntent = async (req, res) => {
  try {
    const { id } = req.params;
    const { proof, walletAddress } = req.body;
    
    console.log('确认支付意图请求:', { id, walletAddress, proof });
    
    // 验证钱包地址格式
    if (walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: '无效的以太坊钱包地址'
      });
    }
    
    // 查询支付意图
    const paymentIntent = await PaymentIntent.findByPk(id);
    
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    // 如果提供了钱包地址，验证用户是否有权限确认
    if (walletAddress && paymentIntent.userWalletAddress !== walletAddress) {
      return res.status(403).json({
        success: false,
        message: '无权确认此支付意图'
      });
    }
    
    // 检查状态对于不同的支付方式
    let isBlockchainSettlement = false;
    
    // 检查是否为区块链结算
    if (proof && proof.method === 'blockchain') {
      // 区块链结算允许从created或claimed状态直接确认
      isBlockchainSettlement = true;
      if (!['created', 'claimed', 'paid'].includes(paymentIntent.status)) {
        return res.status(400).json({
          success: false,
          message: `支付意图当前状态为${paymentIntent.status}，无法进行区块链结算`
        });
      }
    } else {
      // 常规API结算仅允许从paid状态确认
      if (paymentIntent.status !== 'paid') {
        return res.status(400).json({
          success: false,
          message: `支付意图当前状态为${paymentIntent.status}，无法确认`
        });
      }
    }
    
    // 使用支付状态服务更新状态
    const paymentStatusService = require('../services/payment-status.service');
    const statusNote = isBlockchainSettlement 
      ? `通过区块链结算完成，交易哈希: ${proof.proof}`
      : `用户 ${walletAddress || '系统'} 确认已收到付款`;
    
    // 准备额外字段
    const extraFields = {};
    
    if (isBlockchainSettlement) {
      if (proof.blockchainId) {
        extraFields.blockchainPaymentId = proof.blockchainId;
        console.log(`保存区块链支付ID: ${proof.blockchainId} 到支付记录 ${id}`);
      }
      extraFields.settlementTxHash = proof.proof;
    }
    
    // 合并保存支付证明 (仅当用户传入 proof 时合并已有 PayPal 信息)
    if (proof && typeof proof === 'object' && Object.keys(proof).length > 0) {
    try {
      let existingProof = paymentIntent.paymentProof;
      if (typeof existingProof === 'string') {
        existingProof = JSON.parse(existingProof);
      }
      if (!existingProof || typeof existingProof !== 'object') {
        existingProof = {};
      }
        extraFields.paymentProof = { ...existingProof, ...proof };
    } catch (mergeError) {
        console.error('合并支付凭证失败，保留原凭证:', mergeError);
      }
    }
    
    // 更新状态
    const updated = await paymentStatusService.updatePaymentStatus(
      id,
      'confirmed',
      {
        note: statusNote,
        data: {
          isBlockchainSettlement,
          proof
        },
        extraFields: extraFields
      }
    );
    
    if (!updated) {
      return res.status(400).json({
        success: false,
        message: `状态更新失败，无法从 ${paymentIntent.status} 更新为 confirmed`
      });
    }
    
    // 通过Socket.io通知LP支付意图已确认
    const io = req.app.get('io');
    if (io && paymentIntent.lpWalletAddress) {
      io.to(paymentIntent.lpWalletAddress).emit('payment_intent_confirmed', {
        id: paymentIntent.id,
        userWalletAddress: paymentIntent.userWalletAddress,
        isBlockchainSettlement
      });
    }
    
    // 如果不是区块链结算，将任务添加到结算队列
    if (!isBlockchainSettlement && req.settlementQueue) {
      req.settlementQueue.add({
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        userWalletAddress: paymentIntent.userWalletAddress,
        lpWalletAddress: paymentIntent.lpWalletAddress
      });
    }
    
    // 重新加载完整的支付意图，包含 PayPal 交易信息
    const refreshedIntent = await PaymentIntent.findByPk(id);
    const serializedIntent = serializeModel(refreshedIntent);
    return res.status(200).json({
      success: true,
      message: isBlockchainSettlement ? 
        '支付意图通过区块链结算确认成功' : 
        '支付意图确认成功，已加入结算队列',
      data: serializedIntent
    });
  } catch (error) {
    console.error('确认支付意图失败:', error);
    return res.status(500).json({
      success: false,
      message: '确认支付意图失败',
      error: error.message
    });
  }
};

// 检查用户余额
exports.checkBalance = async (req, res) => {
  try {
    const { userWalletAddress, amount } = req.body;
    const hasEnoughBalance = await paymentService.checkUserBalance(userWalletAddress, amount);
    res.json({ hasEnoughBalance });
  } catch (error) {
    console.error('检查余额失败:', error);
    res.status(500).json({ error: '检查余额失败' });
  }
};

// 锁定资金 - 模式二：链上锁定
exports.lockFunds = async (req, res) => {
  try {
    const { paymentIntentId, amount, userWalletAddress } = req.body;
    // 查找支付意向，获取 LP 地址
    const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
    if (!paymentIntent) {
      return res.status(404).json({ success: false, message: '支付意向不存在' });
    }
    const lpAddress = paymentIntent.lpWalletAddress;
    if (!lpAddress) {
      return res.status(400).json({ success: false, message: 'LP 地址未指定' });
    }
    // 调用合约锁定资金
    const tx = await contractService.handleEscrowPayment(
      paymentIntentId,
      userWalletAddress,
      lpAddress,
      amount
    );
    // 更新数据库状态
    await paymentIntent.update({
      status: 'PROCESSING',
      escrowStatus: 'LOCKED',
      txHash: tx.hash,
      lockTime: new Date(),
      blockchainPaymentId: paymentIntentId
    });
    res.json({ success: true, data: { paymentId: paymentIntentId, txHash: tx.hash } });
  } catch (error) {
    console.error('锁定资金失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 确认收款并释放资金
exports.confirmAndRelease = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const result = await paymentService.handleFundsRelease(paymentIntentId, false);
    res.json(result);
  } catch (error) {
    console.error('确认收款失败:', error);
    res.status(500).json({ error: error.message });
  }
};

// LP申请提币
exports.requestWithdrawal = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const result = await paymentService.handleLPWithdrawal(paymentIntentId);
    res.json(result);
  } catch (error) {
    console.error('申请提币失败:', error);
    res.status(500).json({ error: error.message });
  }
};

// 处理LP接单
exports.assignLP = async (req, res) => {
  try {
    const { orderId, lpWalletAddress } = req.body;

    // 验证订单是否存在
    const order = await PaymentIntent.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    // 验证订单状态
    if (order.status !== 'pending') {
      return res.status(400).json({ error: '订单状态不正确' });
    }

    // 验证LP钱包地址
    if (!lpWalletAddress || !web3.utils.isAddress(lpWalletAddress)) {
      return res.status(400).json({ error: '无效的LP钱包地址' });
    }

    // 检查LP托管余额
    const escrowContract = new web3.eth.Contract(
      ESCROW_ABI,
      process.env.ESCROW_ADDRESS
    );
    const escrowBalance = await escrowContract.methods
      .getEscrowBalance(lpWalletAddress)
      .call();
    
    if (web3.utils.toBN(escrowBalance).lt(
      web3.utils.toBN(web3.utils.toWei(order.amount.toString(), 'ether'))
    )) {
      return res.status(400).json({ error: 'LP托管资金不足' });
    }

    // 更新订单状态
    await order.update({
      lpWalletAddress,
      status: 'processing',
      statusHistory: [
        ...order.statusHistory,
        {
          status: 'processing',
          timestamp: new Date().toISOString(),
          details: `LP ${lpWalletAddress} 接单，锁定资金 ${order.amount} USDT`
        }
      ]
    });

    res.json({ success: true, order });
  } catch (error) {
    console.error('LP接单失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
};

// 完成订单
exports.completeOrder = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证订单是否存在
    const order = await PaymentIntent.findByPk(id);
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }
    
    // 验证订单状态
    if (order.status !== 'processing') {
      return res.status(400).json({ error: '订单状态不正确' });
    }
    
    // 更新订单状态
    await order.update({
      status: 'completed',
      statusHistory: [
        ...order.statusHistory,
        {
          status: 'completed',
          timestamp: new Date().toISOString(),
          details: '订单已完成，资金已释放'
        }
      ]
    });
    
    res.json({ success: true, order });
  } catch (error) {
    console.error('完成订单失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
};

/**
 * 更新支付意图状态
 * @route PUT /api/payment-intents/:id/status
 * @access Public
 */
exports.updatePaymentIntentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, txHash, error } = req.body;
    
    console.log('更新支付意图状态:', { id, status, txHash, error });
    
    // 查找支付意图
    const paymentIntent = await PaymentIntent.findByPk(id);
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    // 使用支付状态服务更新状态
    const paymentStatusService = require('../services/payment-status.service');
    const updated = await paymentStatusService.updatePaymentStatus(
      id,
      status,
      {
        note: `通过API更新状态为 ${status}`,
        extraFields: {
          settlementTxHash: txHash || paymentIntent.settlementTxHash,
          errorDetails: error || paymentIntent.errorDetails
        }
      }
    );
    
    if (!updated) {
      return res.status(400).json({
        success: false,
        message: `状态更新失败，无效的状态转换: ${paymentIntent.status} -> ${status}`
      });
    }
    
    // 序列化数据
    const serializedPayment = serializeModel(updated);
    
    // 发送Socket.io通知
    try {
      const io = req.app.get('io');
      if (io) {
        console.log('发送payment_updated Socket事件:', { id, status });
        io.emit('payment_updated', serializedPayment);
      }
    } catch (socketError) {
      console.error('发送Socket通知失败:', socketError);
      // 不影响主流程，继续返回成功响应
    }
    
    return res.json({
      success: true,
      message: '支付意图状态更新成功',
      data: serializedPayment
    });
    
  } catch (error) {
    console.error('更新支付意图状态失败:', error);
    return res.status(500).json({
      success: false,
      message: '更新支付意图状态失败',
      error: error.message
    });
  }
};

/**
 * 为支付记录生成并保存区块链ID
 * @route POST /api/payment-intent/:id/generate-blockchain-id
 * @access Public
 */
exports.generateBlockchainId = async (req, res) => {
  try {
    const { id } = req.params;
    const { blockchainPaymentId: clientId } = req.body;
    
    // If client provided a blockchainPaymentId, save it directly
    if (clientId) {
      const paymentIntent = await PaymentIntent.findByPk(id);
      if (!paymentIntent) {
        return res.status(404).json({ success: false, message: '未找到请求的资源' });
      }
      await paymentIntent.update({ blockchainPaymentId: clientId });
      return res.status(200).json({
        success: true,
        message: '成功保存客户端提供的区块链ID',
        data: { paymentIntentId: id, blockchainPaymentId: clientId }
      });
    }

    console.log(`尝试为支付ID ${id} 生成区块链ID`);
    
    // 查询支付意图
    const paymentIntent = await PaymentIntent.findByPk(id);
    
    if (!paymentIntent) {
      console.log(`支付意图 ${id} 不存在`);
      return res.status(404).json({
        success: false,
        message: '未找到请求的资源'
      });
    }
    
    // 检查是否已有区块链ID
    if (paymentIntent.blockchainPaymentId) {
      console.log(`支付意图 ${id} 已有区块链ID: ${paymentIntent.blockchainPaymentId}`);
      return res.status(200).json({
        success: true,
        message: '支付意图已有区块链ID',
        data: {
          paymentIntentId: id,
          blockchainPaymentId: paymentIntent.blockchainPaymentId
        }
      });
    }
    
    // 生成新的区块链ID (使用id和userWalletAddress的组合)
    const { ethers } = require('ethers');
    const idBytes = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'address', 'uint256'],
      [id, paymentIntent.userWalletAddress, Date.now()]
    );
    const blockchainPaymentId = ethers.utils.keccak256(idBytes);
    
    console.log(`为支付ID ${id} 生成区块链ID: ${blockchainPaymentId}`);
    
    // 更新支付意图
    await paymentIntent.update({ blockchainPaymentId });
    
    return res.status(200).json({
      success: true,
      message: '成功生成并保存区块链ID',
      data: {
        paymentIntentId: id,
        blockchainPaymentId: blockchainPaymentId
      }
    });
  } catch (error) {
    console.error('生成区块链ID失败:', error);
    return res.status(500).json({
      success: false,
      message: '生成区块链ID失败',
      error: error.message
    });
  }
};

/**
 * 更新支付意图为已提款状态
 * @route PUT /api/payment-intent/:id/withdraw-complete
 * @access Public
 */
exports.updateWithdrawalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { txHash, walletAddress } = req.body;
    
    console.log(`更新支付ID ${id} 的提款状态，交易哈希: ${txHash}`);
    
    if (!txHash) {
      return res.status(400).json({
        success: false,
        message: '交易哈希不能为空'
      });
    }
    
    // 查询支付意图
    const paymentIntent = await PaymentIntent.findByPk(id);
    
    if (!paymentIntent) {
      console.log(`支付意图 ${id} 不存在`);
      return res.status(404).json({
        success: false,
        message: '未找到请求的资源'
      });
    }
    
    // 验证钱包地址（如果提供）
    if (walletAddress && paymentIntent.lpWalletAddress !== walletAddress) {
      console.log(`钱包地址不匹配: ${walletAddress} != ${paymentIntent.lpWalletAddress}`);
      return res.status(403).json({
        success: false,
        message: '无权更新此支付状态'
      });
    }
    
    // 更新支付意图状态
    const updateData = {
      status: 'settled',
      settlementTxHash: txHash,
      statusHistory: [
        ...paymentIntent.statusHistory || [],
        {
          status: 'settled',
          timestamp: new Date(),
          txHash: txHash,
          note: '资金已提取到钱包',
          action: 'withdraw'
        }
      ]
    };
    
    await paymentIntent.update(updateData);
    
    // 获取更新后的支付意图
    const updatedPaymentIntent = await PaymentIntent.findByPk(id);
    const serializedPaymentIntent = serializeModel(updatedPaymentIntent);
    
    // 发送Socket.io通知（如果可用）
    try {
      const io = req.app.get('io');
      if (io) {
        console.log(`发送payment_withdrawn Socket事件: ${id}`);
        io.emit('payment_withdrawn', {
          id,
          txHash,
          status: 'settled'
        });
      }
    } catch (socketError) {
      console.error('发送Socket通知失败:', socketError);
      // 不影响主流程，继续返回成功响应
    }
    
    return res.status(200).json({
      success: true,
      message: '支付意图已更新为已提款状态',
      data: serializedPaymentIntent
    });
  } catch (error) {
    console.error('更新提款状态失败:', error);
    return res.status(500).json({
      success: false,
      message: '更新提款状态失败',
      error: error.message
    });
  }
};

exports.syncPaymentIntent = async (req, res) => {
  try {
    const { id } = req.params;
    // 手动触发区块链同步
    const result = await blockchainSyncService.manualSyncPayment(id);
    if (result.success) {
      const serialized = serializeModel(result.data);
      return res.status(200).json({ success: true, message: result.message, data: serialized });
    } else {
      return res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error('同步支付意图失败:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};