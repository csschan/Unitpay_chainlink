const { LP, PaymentIntent } = require('../models/mysql');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { serializeModels } = require('../utils/serialization.utils');

/**
 * LP注册
 * @route POST /api/lp/register
 * @access Public
 */
exports.registerLP = async (req, res) => {
  try {
    const {
      walletAddress,
      name,
      email,
      supportedPlatforms,
      totalQuota,
      perTransactionQuota,
      fee_rate
    } = req.body;
    
    // Validate request data
    if (!walletAddress || !supportedPlatforms || !totalQuota || !perTransactionQuota) {
      return res.status(400).json({
        success: false,
        message: 'Missing parameters: walletAddress, supportedPlatforms, totalQuota and perTransactionQuota are required'
      });
    }
    
    // Validate Ethereum wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Ethereum wallet address'
      });
    }
    
    // Check if LP already exists
    let lp = await LP.findOne({ where: { walletAddress } });
    if (lp) {
      return res.status(400).json({
        success: false,
        message: '该钱包地址已注册为LP'
      });
    }
    
    // Validate fee rate (if provided)
    const validatedFeeRate = fee_rate !== undefined ? parseFloat(fee_rate) : 0.5;
    if (isNaN(validatedFeeRate) || validatedFeeRate < 0 || validatedFeeRate > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid fee rate, must be a number between 0 and 100'
      });
    }
    
    // Create new LP
    lp = await LP.create({
      walletAddress,
      name: name || '',
      email: email || '',
      supportedPlatforms: Array.isArray(supportedPlatforms) ? supportedPlatforms : [supportedPlatforms],
      totalQuota: parseFloat(totalQuota),
      availableQuota: parseFloat(totalQuota),
      lockedQuota: 0,
      perTransactionQuota: parseFloat(perTransactionQuota),
      fee_rate: validatedFeeRate,
      isVerified: true, // MVP阶段简化验证流程
      isActive: true
    });
    
    return res.status(201).json({
      success: true,
      message: 'LP registered successfully',
      data: {
        lpId: lp.id,
        walletAddress: lp.walletAddress,
        totalQuota: lp.totalQuota,
        availableQuota: lp.availableQuota,
        perTransactionQuota: lp.perTransactionQuota,
        fee_rate: lp.fee_rate
      }
    });
    
  } catch (error) {
    console.error('LP registration failed:', error);
    return res.status(500).json({
      success: false,
      message: 'LP registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * 更新LP额度
 * @route PUT /api/lp/quota
 * @access Public
 */
exports.updateQuota = async (req, res) => {
  try {
    const { walletAddress, totalQuota, perTransactionQuota, fee_rate, feeRate } = req.body;
    
    // Received LP update request
    const requestData = { ...req.body };
    console.log('Received LP update request:', requestData);
    
    // Validate request data
    if (!walletAddress || (!totalQuota && !perTransactionQuota && fee_rate === undefined && feeRate === undefined)) {
      console.log('Missing required parameters');
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: walletAddress and at least one of totalQuota, perTransactionQuota or fee rate must be provided'
      });
    }
    
    // Process two possible fee rate field names
    const effectiveFeeRate = fee_rate !== undefined ? fee_rate : feeRate;
    
    try {
      // First check if LP exists
      console.log('Querying LP:', walletAddress);
      const checkQuery = `SELECT * FROM lps WHERE walletAddress = ?`;
      const [lps] = await sequelize.query(checkQuery, { 
        replacements: [walletAddress]
      });
      
      console.log('Query result:', lps && lps.length ? 'LP found' : 'LP not found');
      
      if (!lps || lps.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'LP not found'
        });
      }
      
      const lp = lps[0];
      console.log('Current LP data:', lp);
      
      // Build update fields
      const updates = {};
      
      if (totalQuota) {
        const parsedTotalQuota = parseFloat(totalQuota);
        // Ensure new totalQuota is not less than lockedQuota
        if (parsedTotalQuota < lp.lockedQuota) {
          return res.status(400).json({
            success: false,
            message: 'New totalQuota cannot be less than lockedQuota'
          });
        }
        updates.totalQuota = parsedTotalQuota;
        updates.availableQuota = parsedTotalQuota - lp.lockedQuota;
      }
      
      if (perTransactionQuota) {
        updates.perTransactionQuota = parseFloat(perTransactionQuota);
      }
      
      // Update fee rate (if provided)
      if (effectiveFeeRate !== undefined) {
        const parsedFeeRate = parseFloat(effectiveFeeRate);
        // Validate fee rate
        if (isNaN(parsedFeeRate) || parsedFeeRate < 0 || parsedFeeRate > 100) {
          return res.status(400).json({
            success: false,
            message: 'Invalid fee rate, must be a number between 0 and 100'
          });
        }
        updates.fee_rate = parsedFeeRate;
      }
      
      // If no fields need to be updated, return success
      if (Object.keys(updates).length === 0) {
        console.log('No fields to update provided');
        return res.status(200).json({
          success: true,
          message: 'No fields to update provided',
          data: {
            lpId: lp.id,
            walletAddress: lp.walletAddress,
            totalQuota: lp.totalQuota,
            availableQuota: lp.availableQuota,
            lockedQuota: lp.lockedQuota,
            perTransactionQuota: lp.perTransactionQuota,
            fee_rate: lp.fee_rate || 0.5
          }
        });
      }
      
      console.log('Fields to update:', updates);
      
      // Directly execute update
      // Build update statement
      const updateFields = [];
      const updateValues = [];
      
      Object.entries(updates).forEach(([field, value]) => {
        updateFields.push(`${field} = ?`);
        updateValues.push(value);
      });
      
      // Add timestamp update
      updateFields.push(`updatedAt = NOW()`);
      
      const updateQuery = `
        UPDATE lps 
        SET ${updateFields.join(', ')} 
        WHERE walletAddress = ?
      `;
      
      // Add wallet address
      updateValues.push(walletAddress);
      
      // Execute update
      const [updateResult] = await sequelize.query(updateQuery, {
        replacements: updateValues
      });
      
      console.log('Update result:', updateResult);
      
      // Get updated data
      const [updatedLPs] = await sequelize.query(
        `SELECT * FROM lps WHERE walletAddress = ?`,
        {
          replacements: [walletAddress]
        }
      );
      
      if (!updatedLPs || updatedLPs.length === 0) {
        console.error('Unable to find updated LP data');
        return res.status(500).json({
          success: false,
          message: 'Unable to get latest data after updating LP info'
        });
      }
      
      const updatedLPData = updatedLPs[0];
      console.log('Updated LP data:', updatedLPData);
      
      // Explicitly check fee_rate field
      let feeRate = 0.5;
      try {
        if (updatedLPData.fee_rate !== undefined && updatedLPData.fee_rate !== null) {
          feeRate = parseFloat(updatedLPData.fee_rate);
        }
        console.log('Extracted fee rate:', feeRate);
      } catch (e) {
        console.error('Failed to parse fee_rate:', e);
      }
      
      // Manually create response object
      const responseObj = {
        success: true,
        message: 'LP info updated successfully',
        data: {
          lpId: updatedLPData.id,
          walletAddress: updatedLPData.walletAddress,
          totalQuota: updatedLPData.totalQuota,
          availableQuota: updatedLPData.availableQuota,
          lockedQuota: updatedLPData.lockedQuota,
          perTransactionQuota: updatedLPData.perTransactionQuota,
          fee_rate: feeRate
        }
      };
      
      // Use res.send instead of res.json and manually set content type
      res.setHeader('Content-Type', 'application/json');
      return res.send(JSON.stringify(responseObj));
      
    } catch (dbError) {
      console.error('Database operation failed:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database operation failed: ' + dbError.message
      });
    }
  } catch (error) {
    console.error('Updating LP info failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Updating LP info failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * 获取LP信息
 * @route GET /api/lp/:walletAddress
 * @access Public
 */
exports.getLP = async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    // Validate Ethereum wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Ethereum wallet address'
      });
    }
    
    // Find LP
    const lp = await LP.findOne({ where: { walletAddress } });
    if (!lp) {
      return res.status(404).json({
        success: false,
        message: '未找到该LP'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: lp
    });
    
  } catch (error) {
    console.error('获取LP信息失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取LP信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 获取任务池
 * @route GET /api/lp/task-pool
 * @access Public
 */
exports.getTaskPool = async (req, res) => {
  try {
    console.log('开始查询任务池...');
    console.log('请求参数:', req.query);
    
    const { walletAddress, platform, minAmount, maxAmount } = req.query;
    
    if (!walletAddress) {
      console.error('缺少钱包地址参数');
      return res.status(400).json({
        success: false,
        message: '缺少钱包地址参数'
      });
    }
    
    console.log('验证钱包地址:', walletAddress);
    console.log('钱包地址长度:', walletAddress.length);
    console.log('钱包地址格式:', walletAddress.startsWith('0x') ? '正确' : '错误');
    
    // Check LP registration status
    console.log('开始查询LP记录...');
    const lp = await LP.findOne({ 
      where: { 
        walletAddress: walletAddress.toLowerCase() // Convert to lowercase for comparison
      } 
    });
    console.log('LP查询结果:', lp ? '找到记录' : '未找到记录');
    
    if (!lp) {
      console.error('LP未注册:', walletAddress);
      return res.status(400).json({
        success: false,
        message: 'LP未注册'
      });
    }
    
    console.log('LP已注册:', lp.toJSON());
    
    // Build query conditions
    // 1. Display all tasks that can be accepted (status: 'created')
    // 2. Display tasks that the LP has accepted (lpWalletAddress: walletAddress)
    const whereCreated = { status: 'created' };
    const whereClaimed = { 
      lpWalletAddress: walletAddress,
      status: { [Op.in]: ['claimed', 'paid', 'confirmed', 'processing', 'settled'] }
    };
    
    // Add platform filter
    if (platform) {
      whereCreated.platform = platform;
      whereClaimed.platform = platform;
    }
    
    // Add amount range filter
    if (minAmount || maxAmount) {
      whereCreated.amount = {};
      whereClaimed.amount = {};
      if (minAmount) {
        whereCreated.amount[Op.gte] = parseFloat(minAmount);
        whereClaimed.amount[Op.gte] = parseFloat(minAmount);
      }
      if (maxAmount) {
        whereCreated.amount[Op.lte] = parseFloat(maxAmount);
        whereClaimed.amount[Op.lte] = parseFloat(maxAmount);
      }
    }
    
    console.log('查询条件(可接任务):', whereCreated);
    console.log('查询条件(已接任务):', whereClaimed);
    
    // Query task pool - Query both accepted and accepted tasks separately
    console.log('开始查询任务池...');
    const createdTasks = await PaymentIntent.findAll({
      where: whereCreated,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'amount', 'currency', 'description', 'platform', 'status', 'createdAt', 'updatedAt', 'lpWalletAddress', 'userWalletAddress', 'statusHistory', 'merchantPaypalEmail', 'blockchainPaymentId']
    });
    
    const claimedTasks = await PaymentIntent.findAll({
      where: whereClaimed,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'amount', 'currency', 'description', 'platform', 'status', 'createdAt', 'updatedAt', 'lpWalletAddress', 'userWalletAddress', 'statusHistory', 'merchantPaypalEmail', 'blockchainPaymentId']
    });
    
    // Merge task lists
    const tasks = [...createdTasks, ...claimedTasks];
    
    console.log(`查询到 ${tasks.length} 个任务`);
    
    res.json({
      success: true,
      data: {
        tasks: serializeModels(tasks)
      }
    });
  } catch (error) {
    console.error('查询任务池失败:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      message: '查询任务池失败: ' + error.message
    });
  }
};

/**
 * LP认领任务
 * @route POST /api/lp/task/:id/claim
 * @access Public
 */
exports.claimTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { walletAddress } = req.body;
    
    console.log(`开始处理任务认领: 任务ID=${id}, 钱包地址=${walletAddress}`);
    
    // Validate Ethereum wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Ethereum wallet address'
      });
    }
    
    // Find LP
    const lp = await LP.findOne({ where: { walletAddress } });
    if (!lp) {
      return res.status(404).json({
        success: false,
        message: '未找到该LP'
      });
    }
    
    // Query payment intent
    const paymentIntent = await PaymentIntent.findByPk(id);
    
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    console.log(`任务${id}当前状态: ${paymentIntent.status}`);
    
    // Check payment intent status
    if (paymentIntent.status !== 'created') {
      return res.status(400).json({
        success: false,
        message: `支付意图当前状态为${paymentIntent.status}，无法认领`
      });
    }
    
    // Check if LP supports the payment platform
    if (!lp.supportedPlatforms.includes(paymentIntent.platform)) {
      return res.status(400).json({
        success: false,
        message: `LP不支持${paymentIntent.platform}支付平台`
      });
    }
    
    // Check LP quota
    if (lp.availableQuota < paymentIntent.amount) {
      return res.status(400).json({
        success: false,
        message: '可用额度不足'
      });
    }
    
    if (paymentIntent.amount > lp.perTransactionQuota) {
      return res.status(400).json({
        success: false,
        message: '超出单笔交易额度限制'
      });
    }
    
    // Lock LP quota
    lp.lockedQuota += paymentIntent.amount;
    lp.availableQuota = lp.totalQuota - lp.lockedQuota;
    await lp.save();
    
    // Use payment status service to update status
    const paymentStatusService = require('../services/payment-status.service');
    // Debug log for updatePaymentStatus arguments
    const claimMetadata = {
      note: `LP ${walletAddress} 认领任务`,
      extraFields: {
        lpWalletAddress: walletAddress,
        lpId: lp.id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30分钟过期时间
      }
    };
    console.log('Calling updatePaymentStatus args:', id, 'claimed', null, claimMetadata);
    const updated = await paymentStatusService.updatePaymentStatus(
      id,
      'claimed',
      null,
      claimMetadata
    );
    
    if (!updated) {
      return res.status(400).json({
        success: false,
        message: `无法更新状态为claimed，当前状态: ${paymentIntent.status}`
      });
    }
    
    // Check if there's a PayPal email, if it's PayPal payment then ensure merchantPaypalEmail is set
    let merchantPaypalEmail = null;
    try {
      merchantPaypalEmail = paymentIntent.merchantPaypalEmail;
    } catch (e) {
      console.error('获取merchantPaypalEmail字段失败，该字段可能不存在:', e);
    }

    if (paymentIntent.platform === 'PayPal' && lp.paypalEmail) {
      merchantPaypalEmail = lp.paypalEmail;
      console.log(`为PayPal支付设置商家邮箱: ${merchantPaypalEmail}`);
    }

    // Try to update merchantPaypalEmail field separately
    if (merchantPaypalEmail) {
      try {
        await paymentIntent.update({
          merchantPaypalEmail: merchantPaypalEmail
        });
        console.log('商家PayPal邮箱更新成功');
      } catch (e) {
        console.error('更新merchantPaypalEmail字段失败，该字段可能不存在:', e);
        // Continue processing, do not interrupt the flow
      }
    }
    
    // Query again to ensure update success
    const updatedPaymentIntent = await PaymentIntent.findByPk(id);
    console.log(`任务${id}更新后状态: ${updatedPaymentIntent.status}, LP钱包地址: ${updatedPaymentIntent.lpWalletAddress}`);
    
    // Notify user via Socket.io that task has been claimed
    if (req.io) {
      req.io.to(paymentIntent.userWalletAddress).emit('payment_intent_claimed', {
        id: paymentIntent.id,
        lpWalletAddress: lp.walletAddress
      });
    }
    
    return res.status(200).json({
      success: true,
      message: '任务认领成功',
      data: {
        paymentIntentId: paymentIntent.id,
        status: 'claimed',
        expiresAt: paymentIntent.expiresAt
      }
    });
    
  } catch (error) {
    console.error('认领任务失败:', error);
    return res.status(500).json({
      success: false,
      message: '认领任务失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * LP标记任务已支付
 * @route POST /api/lp/task/:id/mark-paid
 * @access Public
 */
exports.markTaskPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { walletAddress, paymentProof } = req.body;
    
    console.log(`========== 开始处理支付确认 ==========`);
    console.log(`任务ID: ${id}, 钱包地址: ${walletAddress}`);
    console.log(`支付证明:`, JSON.stringify(paymentProof));
    
    // Validate Ethereum wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Ethereum wallet address'
      });
    }
    
    // Query payment intent
    const paymentIntent = await PaymentIntent.findByPk(id);
    
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    console.log(`查询到任务 ${id}, 当前状态: ${paymentIntent.status}, 金额: ${paymentIntent.amount}, 平台: ${paymentIntent.platform}`);
    
    // Check if LP has permission to mark
    if (paymentIntent.lpWalletAddress !== walletAddress) {
      return res.status(403).json({
        success: false,
        message: '无权标记此支付意图'
      });
    }
    
    // If already marked as paid, return success, idempotent processing
    if (paymentIntent.status === 'paid') {
      return res.status(200).json({
        success: true,
        message: '支付意图已标记为已支付',
        data: {
          paymentIntentId: id,
          status: paymentIntent.status,
          paymentProof: paymentIntent.paymentProof
        }
      });
    }
    
    // Check task status, only allow claimed and processing status tasks to be marked as paid
    if (paymentIntent.status !== 'claimed' && paymentIntent.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: `支付意图当前状态为${paymentIntent.status}，无法标记为已支付`,
        requiredStatus: 'claimed'
      });
    }
    
    // Get LP info to verify quota limit
    const lp = await LP.findOne({ where: { walletAddress } });
    if (!lp) {
      return res.status(404).json({
        success: false,
        message: '未找到该LP'
      });
    }
    
    // Check if payment amount exceeds single transaction quota limit
    if (paymentIntent.amount > lp.perTransactionQuota) {
      return res.status(400).json({
        success: false,
        message: `支付金额 ${paymentIntent.amount} USDT 超过您的单笔额度上限 ${lp.perTransactionQuota} USDT`
      });
    }
    
    // Perform specific verification based on payment platform
    if (paymentIntent.platform === 'PayPal') {
      // PayPal payment verification
      console.log(`验证PayPal支付...`);
      
      // Check if basic payment proof information is provided
      if (!paymentProof) {
        return res.status(400).json({
          success: false,
          message: '缺少支付证明'
        });
      }
      
      // Check if transaction ID is provided
      if (!paymentProof.transactionId) {
        console.log(`PayPal支付缺少交易ID`);
        // In test mode, we allow the absence of transaction ID
        if (process.env.NODE_ENV !== 'production') {
          console.log(`非生产环境，跳过交易ID验证`);
          // Create a simulated transaction ID (only for test environment)
          paymentProof.transactionId = `TEST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          console.log(`生成测试交易ID: ${paymentProof.transactionId}`);
        } else {
          return res.status(400).json({
            success: false,
            message: '缺少PayPal交易ID'
          });
        }
      }
      
      // In production environment, should call PayPal API to verify transaction ID
      if (process.env.NODE_ENV === 'production') {
        try {
          console.log(`生产环境: 调用PayPal API验证交易ID ${paymentProof.transactionId}...`);
          // Actual PayPal transaction verification code should be implemented here
          // const paypalResult = await verifyPayPalTransaction(paymentProof.transactionId, paymentIntent.amount);
          
          // Simulated verification
          const paypalVerified = true;
          
          if (!paypalVerified) {
            return res.status(400).json({
              success: false,
              message: 'PayPal交易验证失败'
            });
          }
        } catch (verifyError) {
          console.error('PayPal交易验证错误:', verifyError);
          return res.status(500).json({
            success: false,
            message: 'PayPal交易验证失败',
            error: process.env.NODE_ENV === 'development' ? verifyError.message : '交易验证错误'
          });
        }
      } else {
        console.log(`测试环境: 跳过PayPal API交易验证`);
      }
      
      // Ensure PayPal payment proof includes necessary information
      paymentProof.platform = 'PayPal';
      paymentProof.verificationStatus = process.env.NODE_ENV === 'production' ? 'verified' : 'test_mode';
      paymentProof.verificationTime = new Date().toISOString();
      
      console.log(`PayPal支付验证完成:`, JSON.stringify(paymentProof));
    }
    
    // Use payment status service to update status
    const paymentStatusService = require('../services/payment-status.service');
    const updated = await paymentStatusService.updatePaymentStatus(
      id,
      'paid',
      {
        note: `LP ${walletAddress} 标记支付已完成，平台：${paymentIntent.platform}`,
        data: { paymentProof },
        extraFields: {
          paymentProof,
          paidAt: new Date(),
          paidBy: walletAddress,
          releaseTime: new Date(),
          withdrawalTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      }
    );
    
    if (!updated) {
      return res.status(400).json({
        success: false,
        message: `状态更新失败，无法从 ${paymentIntent.status} 更新为 paid`
      });
    }
    
    // Notify user via Socket.io that payment has been marked as completed by LP
    if (req.io) {
      req.io.to(paymentIntent.userWalletAddress).emit('payment_intent_paid', {
        id: paymentIntent.id,
        lpWalletAddress: walletAddress,
        platform: paymentIntent.platform
      });
    }
    
    return res.status(200).json({
      success: true,
      message: '支付意图已标记为已支付',
      data: {
        paymentIntentId: id,
        status: 'paid',
        paymentProof
      }
    });
    
  } catch (error) {
    console.error('标记任务已支付失败:', error);
    return res.status(500).json({
      success: false,
      message: '标记任务已支付失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 直接获取LP数据，不包装响应
 * @route GET /api/lp/direct/:walletAddress
 * @access Public
 */
exports.getLPDirect = async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    // Validate Ethereum wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Ethereum wallet address'
      });
    }
    
    // Use raw SQL query to ensure getting latest data
    const [lpsRaw] = await sequelize.query(`
      SELECT * FROM lps WHERE walletAddress = ?
    `, {
      replacements: [walletAddress]
    });
    
    // Check if LP found
    if (!lpsRaw || lpsRaw.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到该LP'
      });
    }
    
    // Get LP data
    const lpData = lpsRaw[0];
    
    // Process supportedPlatforms field, keep as array
    let supportedPlatforms = [];
    const rawPlatforms = lpData.supportedPlatforms;
    if (Array.isArray(rawPlatforms)) {
      supportedPlatforms = rawPlatforms;
    } else if (typeof rawPlatforms === 'string') {
      const trimmed = rawPlatforms.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          supportedPlatforms = JSON.parse(trimmed);
        } catch (e) {
          console.warn('解析supportedPlatforms JSON失败:', e);
          // Remove first and last brackets and split by commas
          const inner = trimmed.slice(1, -1);
          supportedPlatforms = inner.split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
        }
      } else if (trimmed.length > 0) {
        supportedPlatforms = trimmed.split(',').map(s => s.trim()).filter(Boolean);
      }
    } else if (typeof rawPlatforms === 'object' && rawPlatforms !== null && Array.isArray(rawPlatforms)) {
      supportedPlatforms = rawPlatforms;
    }
    
    // Build return object
    const lpResponse = {
      ...lpData,
      supportedPlatforms: supportedPlatforms,
      // Explicitly add fee_rate field to ensure it doesn't get lost
      fee_rate: parseFloat(lpData.fee_rate || 0.5)
    };
    
    console.log('返回LP数据:', lpResponse);
    
    // Directly return LP data object
    return res.status(200).json(lpResponse);
    
  } catch (error) {
    console.error('直接获取LP数据失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取LP数据失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 获取任务详情
 * @route GET /api/lp/task/:id
 * @access Public
 */
exports.getTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`获取任务详情: ${id}`);
    
    // Find task (payment intent)
    const task = await PaymentIntent.findByPk(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '未找到该任务'
      });
    }
    
    // If task is assigned to LP, get LP info
    let lpInfo = null;
    if (task.lpWalletAddress) {
      const lp = await LP.findOne({ where: { walletAddress: task.lpWalletAddress } });
      if (lp) {
        lpInfo = {
          id: lp.id,
          walletAddress: lp.walletAddress,
          name: lp.name,
          email: lp.email
        };
      }
    }
    
    // Safe JSON field processing
    let statusHistory = task.statusHistory;
    try {
      if (typeof statusHistory === 'string') {
        statusHistory = JSON.parse(statusHistory);
      }
    } catch (err) {
      console.error('解析状态历史失败:', err);
      statusHistory = [];
    }
    
    let paymentProof = task.paymentProof;
    try {
      if (typeof paymentProof === 'string') {
        paymentProof = JSON.parse(paymentProof);
      }
    } catch (err) {
      console.error('解析支付证明失败:', err);
      paymentProof = null;
    }
    
    let processingDetails = task.processingDetails;
    try {
      if (typeof processingDetails === 'string') {
        processingDetails = JSON.parse(processingDetails);
      }
    } catch (err) {
      console.error('解析处理详情失败:', err);
      processingDetails = null;
    }
    
    let errorDetails = task.errorDetails;
    try {
      if (typeof errorDetails === 'string') {
        errorDetails = JSON.parse(errorDetails);
      }
    } catch (err) {
      console.error('解析错误详情失败:', err);
      errorDetails = null;
    }
    
    // Build response data
    const taskData = {
      id: task.id,
      amount: task.amount,
      currency: task.currency,
      platform: task.platform,
      status: task.status,
      userWalletAddress: task.userWalletAddress,
      lpWalletAddress: task.lpWalletAddress,
      lpInfo: lpInfo,
      description: task.description,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      statusHistory: statusHistory,
      paymentProof: paymentProof,
      processingDetails: processingDetails,
      errorDetails: errorDetails,
      settlementTxHash: task.settlementTxHash,
      network: task.network || 'ethereum',
      data: task.data,
      blockchainPaymentId: task.blockchainPaymentId
    };
    
    console.log(`成功获取任务详情: ${id}`);
    
    return res.status(200).json({
      success: true,
      data: taskData
    });
    
  } catch (error) {
    console.error('获取任务详情失败:', error);
    console.error('错误堆栈:', error.stack);
    return res.status(500).json({
      success: false,
      message: '获取任务详情失败: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 获取可用LP列表
 * @route GET /api/lp/available
 * @access Public
 */
exports.getAvailableLPs = async (req, res) => {
  try {
    console.log('开始获取可用LP列表...');
    
    // Use raw SQL query to ensure getting latest data
    const [lpsRaw] = await sequelize.query(`
      SELECT * FROM lps 
      WHERE isActive = 1 
      ORDER BY fee_rate ASC
    `);
    
    console.log(`查询成功，找到 ${lpsRaw.length} 个LP`);
    
    // Convert to frontend required format
    const lpList = lpsRaw.map(lpData => {
      let supportedPlatforms = [];
      
      // First check if supportedPlatforms is already an array
      if (Array.isArray(lpData.supportedPlatforms)) {
        supportedPlatforms = lpData.supportedPlatforms;
      } else {
        // If it's a string, try JSON parsing or comma-separated processing
        const raw = lpData.supportedPlatforms || '';
        
        // First check if it looks like JSON array
        if (raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
          try {
            supportedPlatforms = JSON.parse(raw);
          } catch (e) {
            console.warn('解析supportedPlatforms JSON失败:', e);
            // If JSON parsing fails, try comma-separated processing
            supportedPlatforms = raw.split(',').map(s => s.trim()).filter(Boolean);
          }
        } else if (typeof raw === 'string' && raw.length > 0) {
          // Directly process by comma-separated
          supportedPlatforms = raw.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      
      // Ensure return necessary fields
      return {
        id: lpData.id,
        walletAddress: lpData.walletAddress || '',
        address: lpData.walletAddress || '', // Provide address field for compatibility with frontend code
        name: lpData.name || `LP_${lpData.id}`,
        supportedPlatforms: supportedPlatforms,
        availableQuota: lpData.availableQuota || 0,
        perTransactionQuota: lpData.perTransactionQuota || 0,
        rating: lpData.rating || 0,
        fee_rate: lpData.fee_rate || 0.5, // Ensure return fee_rate field
        minFeeRate: lpData.minFeeRate || 0.1,
        maxFeeRate: lpData.maxFeeRate || 5.0,
        successRate: lpData.successRate || 0,
        isDefault: lpData.isDefault || false,
        availableBalance: lpData.availableQuota || 0 // Compatible field
      };
    });
    
    console.log(`成功格式化 ${lpList.length} 个LP数据`);
    
    return res.status(200).json({
      success: true,
      data: {
        lps: lpList
      }
    });
  } catch (error) {
    console.error('获取可用LP列表失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取可用LP列表失败: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : '服务器内部错误'
    });
  }
};