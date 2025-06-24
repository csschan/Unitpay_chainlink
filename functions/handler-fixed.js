// PayPal verification script for Chainlink Functions
// This handler will be executed by Chainlink Functions DON to verify PayPal orders
module.exports = async function (request) {
  // 智能提取参数，支持多种参数形式
  let orderId, merchantEmail, amount, lpEmail;
  
  // 检查请求参数类型
  if (Array.isArray(request.args)) {
    // 如果是数组，使用索引访问
    [orderId, merchantEmail, amount, lpEmail] = request.args;
  } else if (request.args && typeof request.args === 'object') {
    // 如果是对象，先尝试使用命名属性
    if ('orderId' in request.args && 'merchantEmail' in request.args && 
        'amount' in request.args && 'lpEmail' in request.args) {
      orderId = request.args.orderId;
      merchantEmail = request.args.merchantEmail;
      amount = request.args.amount;
      lpEmail = request.args.lpEmail;
    } 
    // 再尝试使用数字索引属性（类数组对象）
    else if ('0' in request.args && '1' in request.args && 
             '2' in request.args && '3' in request.args) {
      orderId = request.args[0];
      merchantEmail = request.args[1];
      amount = request.args[2];
      lpEmail = request.args[3];
    }
    else {
      throw Error("Invalid arguments format: Could not extract required parameters");
    }
  } else {
    throw Error("Invalid arguments: Expected array or object");
  }
  
  // 验证所有必需参数都已提供
  if (!orderId || !merchantEmail || !amount || !lpEmail) {
    throw Error("Missing required parameters");
  }
  
  const { PAYPAL_CLIENT_ID, PAYPAL_SECRET } = request.secrets;
  
  // Make HTTP GET request to PayPal Orders API
  const res = await Functions.makeHttpRequest({
    url: `${request.env.API_BASE_URL}/v2/checkout/orders/${orderId}`,
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64"),
    },
  });

  // Handle errors
  if (res.error || res.status !== 200) {
    throw Error("PayPal API request failed: " + JSON.stringify(res.error || res.data));
  }

  const data = res.data;

  // Return encoded result as string: payerEmail, merchantEmail, amount, status
  return Functions.encodeString(
    JSON.stringify({
      payerEmail:    data.payer.email_address,
      merchantEmail: data.purchase_units[0].payee.email_address,
      amount:        data.purchase_units[0].amount.value,
      status:        data.status,
    })
  );
}; 
// This handler will be executed by Chainlink Functions DON to verify PayPal orders
module.exports = async function (request) {
  // 智能提取参数，支持多种参数形式
  let orderId, merchantEmail, amount, lpEmail;
  
  // 检查请求参数类型
  if (Array.isArray(request.args)) {
    // 如果是数组，使用索引访问
    [orderId, merchantEmail, amount, lpEmail] = request.args;
  } else if (request.args && typeof request.args === 'object') {
    // 如果是对象，先尝试使用命名属性
    if ('orderId' in request.args && 'merchantEmail' in request.args && 
        'amount' in request.args && 'lpEmail' in request.args) {
      orderId = request.args.orderId;
      merchantEmail = request.args.merchantEmail;
      amount = request.args.amount;
      lpEmail = request.args.lpEmail;
    } 
    // 再尝试使用数字索引属性（类数组对象）
    else if ('0' in request.args && '1' in request.args && 
             '2' in request.args && '3' in request.args) {
      orderId = request.args[0];
      merchantEmail = request.args[1];
      amount = request.args[2];
      lpEmail = request.args[3];
    }
    else {
      throw Error("Invalid arguments format: Could not extract required parameters");
    }
  } else {
    throw Error("Invalid arguments: Expected array or object");
  }
  
  // 验证所有必需参数都已提供
  if (!orderId || !merchantEmail || !amount || !lpEmail) {
    throw Error("Missing required parameters");
  }
  
  const { PAYPAL_CLIENT_ID, PAYPAL_SECRET } = request.secrets;
  
  // Make HTTP GET request to PayPal Orders API
  const res = await Functions.makeHttpRequest({
    url: `${request.env.API_BASE_URL}/v2/checkout/orders/${orderId}`,
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64"),
    },
  });

  // Handle errors
  if (res.error || res.status !== 200) {
    throw Error("PayPal API request failed: " + JSON.stringify(res.error || res.data));
  }

  const data = res.data;

  // Return encoded result as string: payerEmail, merchantEmail, amount, status
  return Functions.encodeString(
    JSON.stringify({
      payerEmail:    data.payer.email_address,
      merchantEmail: data.purchase_units[0].payee.email_address,
      amount:        data.purchase_units[0].amount.value,
      status:        data.status,
    })
  );
}; 
 
 
 