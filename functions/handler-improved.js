// PayPal verification script for Chainlink Functions - Improved version
// This handler will be executed by Chainlink Functions DON to verify PayPal orders
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
    
    // 验证关键字段是否存在
    if (!data.payer || !data.payer.email_address) {
      console.error(`缺少付款人邮箱地址: ${JSON.stringify(data)}`);
      throw Error("PayPal API响应缺少付款人邮箱地址");
    }
    
    if (!data.purchase_units || !data.purchase_units[0] || !data.purchase_units[0].payee || !data.purchase_units[0].payee.email_address) {
      console.error(`缺少商家邮箱地址: ${JSON.stringify(data)}`);
      throw Error("PayPal API响应缺少商家邮箱地址");
    }
    
    if (!data.purchase_units[0].amount || !data.purchase_units[0].amount.value) {
      console.error(`缺少金额: ${JSON.stringify(data)}`);
      throw Error("PayPal API响应缺少金额");
    }
    
    if (!data.status) {
      console.error(`缺少状态: ${JSON.stringify(data)}`);
      throw Error("PayPal API响应缺少状态");
    }
    
    // 记录关键数据用于调试
    console.log(`PayPal 验证成功 - 订单: ${orderId}`);
    console.log(`- 支付者邮箱: ${data.payer.email_address}`);
    console.log(`- 商家邮箱: ${data.purchase_units[0].payee.email_address}`);
    console.log(`- 金额: ${data.purchase_units[0].amount.value} ${data.purchase_units[0].amount.currency_code}`);
    console.log(`- 状态: ${data.status}`);
    
    // 验证商家邮箱是否匹配
    if (data.purchase_units[0].payee.email_address.toLowerCase() !== merchantEmail.toLowerCase()) {
      console.log(`商家邮箱不匹配: 预期=${merchantEmail}, 实际=${data.purchase_units[0].payee.email_address}`);
      
      // 创建Uint8Array的辅助函数
      function stringToUint8Array(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
      }
      
      return stringToUint8Array(JSON.stringify({
        verified: false,
        error: "商家邮箱不匹配"
      }));
    }
    
    // 验证付款人邮箱是否匹配
    if (data.payer.email_address.toLowerCase() !== lpEmail.toLowerCase()) {
      console.log(`付款人邮箱不匹配: 预期=${lpEmail}, 实际=${data.payer.email_address}`);
      
      // 创建Uint8Array的辅助函数
      function stringToUint8Array(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
      }
      
      return stringToUint8Array(JSON.stringify({
        verified: false,
        error: "付款人邮箱不匹配"
      }));
    }
    
    // 验证金额是否匹配
    // 注意: 这里需要比较浮点数，可能存在精度问题
    const apiAmount = parseFloat(data.purchase_units[0].amount.value);
    const expectedAmount = parseFloat(amount);
    const tolerance = 0.01; // 1美分的容差
    
    if (Math.abs(apiAmount - expectedAmount) > tolerance) {
      console.log(`金额不匹配: 预期=${expectedAmount}, 实际=${apiAmount}`);
      
      // 创建Uint8Array的辅助函数
      function stringToUint8Array(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
      }
      
      return stringToUint8Array(JSON.stringify({
        verified: false,
        error: "金额不匹配"
      }));
    }
    
    // 验证订单状态
    if (data.status !== 'COMPLETED') {
      console.log(`订单状态不是COMPLETED: ${data.status}`);
      
      // 创建Uint8Array的辅助函数
      function stringToUint8Array(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
      }
      
      return stringToUint8Array(JSON.stringify({
        verified: false,
        error: `订单状态为${data.status}，而不是COMPLETED`
      }));
    }

    // 返回编码的结果字符串
    console.log("所有验证通过，返回结果");
    
    // 创建Uint8Array的辅助函数
    function stringToUint8Array(str) {
      const encoder = new TextEncoder();
      return encoder.encode(str);
    }
    
    return stringToUint8Array(JSON.stringify({
      payerEmail: data.payer.email_address,
      merchantEmail: data.purchase_units[0].payee.email_address,
      amount: data.purchase_units[0].amount.value,
      status: data.status
    }));
    
  } catch (error) {
    // 捕获所有未处理的异常
    console.error(`PayPal验证发生异常: ${error.message}`);
    
    // 创建Uint8Array的辅助函数
    function stringToUint8Array(str) {
      const encoder = new TextEncoder();
      return encoder.encode(str);
    }
    
    // 返回编码的错误信息
    return stringToUint8Array(JSON.stringify({
      verified: false,
      error: error.message
    }));
  }
}; 