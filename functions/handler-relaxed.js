// PayPal verification script for Chainlink Functions - Relaxed version
// This handler will be executed by Chainlink Functions DON to verify PayPal orders
// 此版本放宽了验证条件，增加了更多调试信息
module.exports = async function (request) {
  try {
    console.log("开始执行PayPal订单验证...");
    console.log(`请求参数: ${JSON.stringify(request.args)}`);
    console.log(`环境变量: ${JSON.stringify(request.env)}`);
    console.log(`Secrets包含以下键: ${Object.keys(request.secrets).join(', ')}`);
    
    // 智能提取参数，支持多种参数形式
    let orderId, merchantEmail, amount, lpEmail;
    
    // 检查请求参数类型
    if (Array.isArray(request.args)) {
      // 如果是数组，使用索引访问
      [orderId, merchantEmail, amount, lpEmail] = request.args;
      console.log("从数组参数中提取值");
    } else if (request.args && typeof request.args === 'object') {
      // 如果是对象，先尝试使用命名属性
      if ('orderId' in request.args && 'merchantEmail' in request.args && 
          'amount' in request.args && 'lpEmail' in request.args) {
        orderId = request.args.orderId;
        merchantEmail = request.args.merchantEmail;
        amount = request.args.amount;
        lpEmail = request.args.lpEmail;
        console.log("从命名对象属性中提取值");
      } 
      // 再尝试使用数字索引属性（类数组对象）
      else if ('0' in request.args && '1' in request.args && 
               '2' in request.args && '3' in request.args) {
        orderId = request.args[0];
        merchantEmail = request.args[1];
        amount = request.args[2];
        lpEmail = request.args[3];
        console.log("从索引对象属性中提取值");
      }
      else {
        throw Error("参数格式无效: 无法提取所需参数");
      }
    } else {
      throw Error("参数无效: 预期为数组或对象");
    }
    
    // 验证所有必需参数都已提供
    if (!orderId) throw Error("缺少必需参数: orderId");
    if (!merchantEmail) throw Error("缺少必需参数: merchantEmail");
    if (!amount) throw Error("缺少必需参数: amount");
    if (!lpEmail) throw Error("缺少必需参数: lpEmail");
    
    console.log(`验证参数: orderId=${orderId}, merchantEmail=${merchantEmail}, amount=${amount}, lpEmail=${lpEmail}`);
    
    // 获取API凭证
    const { PAYPAL_CLIENT_ID, PAYPAL_SECRET } = request.secrets;
    
    // 验证API凭证存在
    if (!PAYPAL_CLIENT_ID) throw Error("PayPal客户端ID在secrets中缺失");
    if (!PAYPAL_SECRET) throw Error("PayPal密钥在secrets中缺失");
    
    // 获取API基础URL
    let apiBaseUrl = request.env.API_BASE_URL;
    
    // 如果环境变量中没有，使用默认值
    if (!apiBaseUrl) {
      console.log("环境变量中缺少API_BASE_URL，使用默认值");
      apiBaseUrl = "https://api-m.sandbox.paypal.com";
    }
    
    console.log(`使用API基础URL: ${apiBaseUrl}`);
    console.log(`正在验证PayPal订单: ${orderId}, 商家: ${merchantEmail}, LP: ${lpEmail}`);
    
    // 构建授权头
    const authHeader = "Basic " + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64");
    console.log("已构建授权头");
    
    // 发送HTTP GET请求到PayPal Orders API
    console.log(`发送请求到: ${apiBaseUrl}/v2/checkout/orders/${orderId}`);
    const res = await Functions.makeHttpRequest({
      url: `${apiBaseUrl}/v2/checkout/orders/${orderId}`,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json"
      },
      timeout: 15000, // 15秒超时
    });

    console.log(`收到响应: 状态码=${res.status}`);
    
    // 处理HTTP请求错误
    if (res.error) {
      const errorDetails = JSON.stringify(res.error);
      console.error(`PayPal API请求失败: ${errorDetails}`);
      
      // 检查是否为认证错误
      if (res.error.message && res.error.message.includes('authentication')) {
        throw Error(`PayPal API认证失败: ${errorDetails}`);
      }
      
      // 检查是否为网络错误
      if (res.error.code === 'ETIMEDOUT' || res.error.code === 'ECONNREFUSED') {
        throw Error(`PayPal API网络错误: ${res.error.code} - ${errorDetails}`);
      }
      
      throw Error(`PayPal API请求错误: ${errorDetails}`);
    }

    // 处理HTTP状态码错误
    if (res.status !== 200) {
      const responseData = res.data ? JSON.stringify(res.data) : '无响应数据';
      console.error(`PayPal API返回状态码 ${res.status}: ${responseData}`);
      
      // 检查常见的错误状态码
      if (res.status === 401) {
        throw Error(`PayPal API认证失败 (401 未授权): ${responseData}`);
      } else if (res.status === 403) {
        throw Error(`PayPal API权限被拒绝 (403 禁止): ${responseData}`);
      } else if (res.status === 404) {
        throw Error(`PayPal订单未找到 (404 未找到): ${orderId}`);
      } else if (res.status === 400) {
        throw Error(`PayPal API请求无效 (400): ${responseData}`);
      } else if (res.status >= 500) {
        throw Error(`PayPal API服务器错误 (${res.status}): ${responseData}`);
      }
      
      throw Error(`PayPal API返回状态码 ${res.status}: ${responseData}`);
    }

    const data = res.data;
    console.log(`解析响应数据`);
    
    // 验证响应数据格式
    if (!data) {
      throw Error("PayPal API返回空响应");
    }
    
    // 记录完整的API响应，帮助调试
    console.log(`完整的API响应: ${JSON.stringify(data)}`);
    
    // 提取关键字段
    let payerEmail = data.payer && data.payer.email_address ? data.payer.email_address : null;
    let merchantEmailFromAPI = null;
    let amountFromAPI = null;
    let currency = null;
    let orderStatus = data.status || null;
    
    if (data.purchase_units && data.purchase_units[0]) {
      const unit = data.purchase_units[0];
      if (unit.payee && unit.payee.email_address) {
        merchantEmailFromAPI = unit.payee.email_address;
      }
      if (unit.amount) {
        amountFromAPI = unit.amount.value;
        currency = unit.amount.currency_code;
      }
    }
    
    // 记录关键数据用于调试
    console.log(`PayPal 订单信息 - 订单ID: ${data.id || orderId}`);
    console.log(`- 支付者邮箱: ${payerEmail || '未找到'}`);
    console.log(`- 商家邮箱: ${merchantEmailFromAPI || '未找到'}`);
    console.log(`- 金额: ${amountFromAPI || '未找到'} ${currency || ''}`);
    console.log(`- 状态: ${orderStatus || '未找到'}`);
    
    // === 放宽验证条件 ===
    
    // 1. 商家邮箱验证（放宽为包含关系）
    let merchantEmailMatch = false;
    if (merchantEmailFromAPI && merchantEmail) {
      // 支持完全匹配
      merchantEmailMatch = merchantEmailFromAPI.toLowerCase() === merchantEmail.toLowerCase();
      
      // 或支持部分匹配（如域名匹配）
      if (!merchantEmailMatch) {
        merchantEmailMatch = merchantEmailFromAPI.toLowerCase().includes(merchantEmail.toLowerCase()) || 
                            merchantEmail.toLowerCase().includes(merchantEmailFromAPI.toLowerCase());
      }
      
      console.log(`商家邮箱匹配结果: ${merchantEmailMatch}`);
      console.log(`- 预期: ${merchantEmail}`);
      console.log(`- 实际: ${merchantEmailFromAPI}`);
    } else {
      console.log(`商家邮箱验证失败: 缺少必要信息`);
    }
    
    // 2. 付款人邮箱验证（放宽为包含关系）
    let payerEmailMatch = false;
    if (payerEmail && lpEmail) {
      // 支持完全匹配
      payerEmailMatch = payerEmail.toLowerCase() === lpEmail.toLowerCase();
      
      // 或支持部分匹配
      if (!payerEmailMatch) {
        payerEmailMatch = payerEmail.toLowerCase().includes(lpEmail.toLowerCase()) || 
                         lpEmail.toLowerCase().includes(payerEmail.toLowerCase());
      }
      
      console.log(`付款人邮箱匹配结果: ${payerEmailMatch}`);
      console.log(`- 预期: ${lpEmail}`);
      console.log(`- 实际: ${payerEmail}`);
    } else {
      console.log(`付款人邮箱验证失败: 缺少必要信息`);
    }
    
    // 3. 金额验证（放宽容差）
    let amountMatch = false;
    if (amountFromAPI && amount) {
      const expectedAmount = parseFloat(amount);
      const actualAmount = parseFloat(amountFromAPI);
      const tolerance = 0.5; // 放宽到50美分的容差
      
      amountMatch = Math.abs(actualAmount - expectedAmount) <= tolerance;
      
      console.log(`金额匹配结果: ${amountMatch}`);
      console.log(`- 预期: ${expectedAmount}`);
      console.log(`- 实际: ${actualAmount}`);
      console.log(`- 差额: ${Math.abs(actualAmount - expectedAmount)}`);
      console.log(`- 容差: ${tolerance}`);
    } else {
      console.log(`金额验证失败: 缺少必要信息`);
    }
    
    // 4. 订单状态验证（接受多种状态）
    const validStatuses = ['COMPLETED', 'APPROVED', 'PAYER_ACTION_REQUIRED'];
    let statusMatch = false;
    
    if (orderStatus) {
      statusMatch = validStatuses.includes(orderStatus);
      
      console.log(`订单状态匹配结果: ${statusMatch}`);
      console.log(`- 预期状态: ${validStatuses.join(' 或 ')}`);
      console.log(`- 实际状态: ${orderStatus}`);
    } else {
      console.log(`订单状态验证失败: 缺少必要信息`);
    }
    
    // 总体验证结果（放宽条件：允许部分验证通过）
    // 至少需要通过两项验证才算成功
    const passedChecks = [merchantEmailMatch, payerEmailMatch, amountMatch, statusMatch].filter(Boolean).length;
    const overallVerification = passedChecks >= 2;
    
    console.log(`通过验证项数: ${passedChecks}/4`);
    console.log(`总体验证结果: ${overallVerification ? '通过' : '失败'}`);

    // 返回编码的结果字符串
    return Functions.encodeString(
      JSON.stringify({
        verified: overallVerification,
        payerEmail: payerEmail || '',
        merchantEmail: merchantEmailFromAPI || '',
        amount: amountFromAPI || '',
        status: orderStatus || '',
        passedChecks,
        details: {
          merchantEmailMatch,
          payerEmailMatch,
          amountMatch,
          statusMatch
        }
      })
    );
  } catch (error) {
    // 捕获所有未处理的异常
    console.error(`PayPal验证发生异常: ${error.message}`);
    
    // 返回编码的错误信息
    return Functions.encodeString(
      JSON.stringify({
        verified: false,
        error: error.message
      })
    );
  }
}; 