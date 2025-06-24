const { PaymentIntent, User, LP } = require('../models/mysql');
const { parseQRCode, identifyPaymentPlatform } = require('../utils/qrcode.utils');
const { validatePaymentData } = require('../utils/validation.utils');

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
    const { 
      amount, 
      currency = 'USD',
      platform,
      userWalletAddress,
      merchantPaypalEmail, // 从二维码扫描中获取的商家PayPal邮箱
      description 
    } = req.body;
    
    // 验证必要参数
    if (!amount || !platform || !userWalletAddress) {
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
    if (!/^0x[a-fA-F0-9]{40}$/.test(userWalletAddress)) {
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
    console.log('查找用户:', userWalletAddress);
    let user = await User.findOne({ where: { walletAddress: userWalletAddress } });
    if (!user) {
      console.log('用户不存在，创建新用户');
      user = await User.create({ walletAddress: userWalletAddress });
    }
    console.log('用户信息:', user.toJSON());

    // 创建支付意图
    console.log('开始创建支付意图，数据:', {
      amount: parsedAmount,
      currency,
      platform: paymentPlatform,
      userWalletAddress,
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
      currency,
      platform: paymentPlatform,
      userWalletAddress,
      userId: user.id,
      merchantPaypalEmail: paypalEmail, // 确保是字符串格式
      merchantInfo: Object.keys(merchantInfo).length > 0 ? merchantInfo : null,
      description,
      status: 'created',
      statusHistory: [{
        status: 'created',
        timestamp: new Date(),
        note: '支付意图创建'
      }],
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30分钟后过期
    });
    
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
        walletAddress: userWalletAddress,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status
      });
    }

    return res.status(201).json({
      success: true,
      message: '支付意图创建成功',
      data: {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        platform: paymentIntent.platform,
        status: paymentIntent.status,
        merchantPaypalEmail: paymentIntent.merchantPaypalEmail
      }
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
 * @route GET /api/payment-intent/user/:walletAddress
 * @access Public
 */
exports.getUserPaymentIntents = async (req, res) => {
  try {
    const { walletAddress } = req.params;
    console.log('获取用户支付意图列表，钱包地址:', walletAddress);
    
    // 验证钱包地址格式
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      console.log('无效的钱包地址');
      return res.status(400).json({
        success: false,
        message: '无效的以太坊钱包地址'
      });
    }
    
    // 查找用户的支付意图
    console.log('查询条件:', { userWalletAddress: walletAddress });
    const paymentIntents = await PaymentIntent.findAll({
      where: { userWalletAddress: walletAddress },
      order: [['createdAt', 'DESC']]
    });
    
    console.log('查询结果:', paymentIntents.map(pi => pi.toJSON()));
    
    return res.json({
      success: true,
      data: {
        paymentIntents: paymentIntents
      }
    });
  } catch (error) {
    console.error('获取支付意图列表失败:', error);
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
    
    return res.status(200).json({
      success: true,
      data: paymentIntents
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
 * 获取支付意图详情
 * @route GET /api/payment-intent/:id
 * @access Public
 */
exports.getPaymentIntent = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 查询支付意图
    const paymentIntent = await PaymentIntent.findByPk(id);
    
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: paymentIntent
    });
    
  } catch (error) {
    console.error('获取支付意图详情失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取支付意图详情失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
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
    const { walletAddress } = req.body;
    
    console.log('取消支付意图请求:', { id, walletAddress });
    
    // 验证钱包地址格式
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      console.log('无效的钱包地址:', walletAddress);
      return res.status(400).json({
        success: false,
        message: '无效的以太坊钱包地址'
      });
    }
    
    // 查询支付意图
    console.log('查询支付意图:', id);
    const paymentIntent = await PaymentIntent.findByPk(id);
    
    if (!paymentIntent) {
      console.log('支付意图不存在:', id);
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    console.log('找到支付意图:', paymentIntent.toJSON());
    
    // 验证用户是否有权限取消
    if (paymentIntent.userWalletAddress !== walletAddress) {
      console.log('无权取消:', { 
        requestWallet: walletAddress, 
        intentWallet: paymentIntent.userWalletAddress 
      });
      return res.status(403).json({
        success: false,
        message: '无权取消此支付意图'
      });
    }
    
    // 检查支付意图状态
    if (!['created', 'claimed'].includes(paymentIntent.status)) {
      console.log('当前状态不允许取消:', paymentIntent.status);
      return res.status(400).json({
        success: false,
        message: `支付意图当前状态为${paymentIntent.status}，无法取消`
      });
    }
    
    // 如果已被LP认领，需要解锁LP额度
    if (paymentIntent.status === 'claimed' && paymentIntent.lpId) {
      console.log('解锁LP额度:', paymentIntent.lpId);
      const lp = await LP.findByPk(paymentIntent.lpId);
      if (lp) {
        lp.lockedQuota -= paymentIntent.amount;
        lp.availableQuota = lp.totalQuota - lp.lockedQuota;
        await lp.save();
        console.log('LP额度已解锁:', lp.toJSON());
      }
    }
    
    // 更新支付意图状态
    const statusHistory = [...paymentIntent.statusHistory, {
      status: 'cancelled',
      timestamp: new Date(),
      note: `用户 ${walletAddress} 取消支付意图`
    }];
    
    await paymentIntent.update({
      status: 'cancelled',
      statusHistory
    });
    
    console.log('支付意图已取消:', paymentIntent.toJSON());
    
    // 通过Socket.io通知LP支付意图已取消
    if (paymentIntent.lpWalletAddress) {
      const io = req.app.get('io');
      if (io) {
        io.to(paymentIntent.lpWalletAddress).emit('payment_intent_cancelled', {
          id: paymentIntent.id,
          userWalletAddress: walletAddress
        });
        console.log('已通知LP支付意图已取消:', paymentIntent.lpWalletAddress);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: '支付意图取消成功',
      data: {
        paymentIntentId: paymentIntent.id,
        status: 'cancelled'
      }
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
    const { walletAddress, txHash, network, amount, receiverAddress } = req.body;

    // 获取支付意图
    const paymentIntent = await PaymentIntent.findByPk(id);
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }

    // 更新支付意图状态
    await paymentIntent.update({
      status: 'user_confirmed',
      settlementTxHash: txHash,
      network: 'somnia',  // 记录网络信息到主表
      statusHistory: [...(paymentIntent.statusHistory || []), {
        status: 'user_confirmed',
        timestamp: new Date(),
        txHash: txHash,
        network: 'somnia',  // 记录网络信息到状态历史
        description: '用户已确认支付'
      }]
    });

    // 返回成功响应
    return res.json({
      success: true,
      message: '支付确认成功',
      data: paymentIntent
    });
  } catch (error) {
    console.error('确认支付失败:', error);
    return res.status(500).json({
      success: false,
      message: '确认支付失败: ' + error.message
    });
  }
};

exports.confirmPayment = async (req, res) => {
  const { txHash, network, walletAddress } = req.body;
  
  console.log('[支付控制器] 收到确认请求:', {
    txHash,
    network,
    walletAddress
  });

  try {
    const paymentIntent = await PaymentIntent.findOne({
      where: { lpWalletAddress: walletAddress }
    });

    if (!paymentIntent) {
      console.error('[支付控制器] 未找到支付意向');
      return res.status(404).json({ error: 'Payment intent not found' });
    }

    console.log('[支付控制器] 当前状态历史:', paymentIntent.statusHistory);

    // 更新状态历史
    const statusHistory = Array.isArray(paymentIntent.statusHistory) 
      ? paymentIntent.statusHistory 
      : [];
      
    statusHistory.push({
      status: 'user_confirmed',
      timestamp: new Date(),
      txHash,
      network,
      description: '用户已确认转账'
    });

    console.log('[支付控制器] 更新后的状态历史:', statusHistory);

    await paymentIntent.update({
      status: 'user_confirmed',
      statusHistory
    });

    console.log('[支付控制器] 更新完成');
    
    res.json({ success: true });
  } catch (error) {
    console.error('[支付控制器] 错误:', error);
    res.status(500).json({ error: error.message });
  }
};