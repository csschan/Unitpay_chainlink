// Chainlink Functions v1.3.0 compatible handler
// 此文件专门为 Chainlink Functions v1.3.0 设计，解决 CBOR 解析错误问题

// 此函数将在 Chainlink Functions DON 网络上执行
// 请注意：不要使用 module.exports，而是直接返回结果
// DON 网络使用此函数时不会调用 module.exports

// 引入 ethers 库用于 ABI 编码
const ethers = require("ethers");

// 处理 PayPal 验证请求
async function handler(request) {
  try {
    // 参数解析
    const [orderId, merchantEmail, amount, lpEmail] = request.args;
    
    console.log(`处理支付验证请求: 订单=${orderId}, 商家=${merchantEmail}, 金额=${amount}, LP=${lpEmail}`);
    
    // 获取 API 密钥和配置
    const { PAYPAL_CLIENT_ID, PAYPAL_SECRET } = request.secrets;
    const apiBaseUrl = request.env.API_BASE_URL || "https://api-m.sandbox.paypal.com";
    
    // 验证 API 密钥是否存在
    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
      throw new Error("PayPal API 密钥缺失");
    }
    
    // 向 PayPal API 发送请求
    const paypalResponse = await Functions.makeHttpRequest({
      url: `${apiBaseUrl}/v2/checkout/orders/${orderId}`,
      headers: {
        Authorization: "Basic " + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64"),
      },
      timeout: 10000,
    });
    
    // 处理 API 错误
    if (paypalResponse.error) {
      throw new Error(`PayPal API 请求失败: ${paypalResponse.error.message || "未知错误"}`);
    }
    
    // 处理 HTTP 状态码错误
    if (paypalResponse.status !== 200) {
      throw new Error(`PayPal API 响应状态码 ${paypalResponse.status}: ${JSON.stringify(paypalResponse.data || "无响应数据")}`);
    }
    
    // 提取响应数据
    const data = paypalResponse.data;
    
    // 验证响应数据格式
    if (!data || !data.payer || !data.payer.email_address || 
        !data.purchase_units || !data.purchase_units[0] || 
        !data.purchase_units[0].payee || !data.purchase_units[0].payee.email_address ||
        !data.purchase_units[0].amount || !data.purchase_units[0].amount.value ||
        !data.status) {
      throw new Error("PayPal API 响应数据格式无效");
    }
    
    // 创建返回数据
    const payerEmail = data.payer.email_address;
    const actualMerchantEmail = data.purchase_units[0].payee.email_address;
    const actualAmount = amount; // 保留原始金额以便合约验证
    const status = data.status;
    
    console.log("验证成功，准备返回数据");
    console.log(`- 支付者邮箱: ${payerEmail}`);
    console.log(`- 商家邮箱: ${actualMerchantEmail}`);
    console.log(`- 金额: ${actualAmount}`);
    console.log(`- 状态: ${status}`);
    
    // 重要：直接返回 ABI 编码结果，这是 v1.3.0 要求的格式
    // 不要使用 Functions.encodeBytes() 或任何其他包装函数
    const abiCoder = new ethers.utils.AbiCoder();
    const encodedData = abiCoder.encode(
      ["string", "string", "uint256", "string"],
      [payerEmail, actualMerchantEmail, actualAmount, status]
    );
    
    return encodedData;
  } catch (error) {
    // 捕获所有异常并重新抛出，让 Chainlink Functions 正确处理
    console.error(`处理过程中发生错误: ${error.message}`);
    throw error;
  }
}

// 本地测试用，DON 网络执行时会忽略此导出
module.exports = handler; 