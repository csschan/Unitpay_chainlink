// 获取商家PayPal邮箱
async function fetchMerchantInfo(paymentIntentId) {
  try {
    console.log(`获取商家信息 - PaymentIntentID: ${paymentIntentId}`);
    showSpinner('正在获取商家信息...');
    
    const response = await fetch(`${API_BASE_URL}/payment/paypal/merchant-info/${paymentIntentId}`);
    const data = await response.json();
    
    if (!response.ok) {
      hideSpinner();
      console.error('获取商家信息失败:', data);
      showError(`获取商家信息失败: ${data.message || '未知错误'}`);
      return null;
    }
    
    hideSpinner();
    console.log('商家信息获取成功:', data);
    
    if (!data.data || !data.data.email) {
      showError('无法获取有效的商家邮箱');
      return null;
    }
    
    return data.data.email;
  } catch (error) {
    hideSpinner();
    console.error('获取商家信息发生错误:', error);
    showError(`获取商家信息发生错误: ${error.message}`);
    return null;
  }
} 