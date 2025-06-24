/**
 * 二维码解析和支付平台识别工具
 */

/**
 * 解析二维码内容
 * @param {string} qrCodeContent - 二维码内容
 * @returns {Promise<Object>} - 解析结果
 */
exports.parseQRCode = async (qrCodeContent) => {
  try {
    if (!qrCodeContent || typeof qrCodeContent !== 'string') {
      return {
        success: false,
        error: '无效的二维码内容'
      };
    }
    
    // 尝试解析 JSON 格式
    try {
      const jsonData = JSON.parse(qrCodeContent);
      console.log('Successfully parsed JSON data:', jsonData);
      return {
        success: true,
        data: jsonData
      };
    } catch (error) {
      console.log('Not a valid JSON, trying URL format');
      // 如果不是 JSON 格式，尝试解析 URL
      if (qrCodeContent.startsWith('http')) {
        try {
          const url = new URL(qrCodeContent);
          const data = {
            url: qrCodeContent,
            host: url.hostname,
            path: url.pathname,
            params: Object.fromEntries(url.searchParams)
          };
          console.log('Successfully parsed URL data:', data);
          return {
            success: true,
            data
          };
        } catch (urlError) {
          console.log('Not a valid URL, using raw content');
          // 如果不是有效URL，返回原始内容
          return {
            success: true,
            data: qrCodeContent
          };
        }
      }
      
      // 如果既不是 JSON 也不是 URL，返回原始内容
      return {
        success: true,
        data: qrCodeContent
      };
    }
  } catch (error) {
    console.error('解析二维码失败:', error);
    return {
      success: false,
      error: '解析二维码失败: ' + error.message
    };
  }
};

/**
 * 识别支付平台类型
 * @param {Object|string} data - 解析后的二维码数据
 * @returns {Object} - 支付平台信息
 */
exports.identifyPaymentPlatform = (data) => {
  try {
    // 如果是JSON格式
    if (typeof data === 'object') {
      // 检查是否包含完整的支付数据
      if (data.p && data.m && data.n && data.a && data.v) {
        // 验证支付平台
        const platformMap = {
          'W': 'WeChat',
          'A': 'Alipay',
          'G': 'GCash',
          'P': 'PayPal'
        };
        
        const platform = platformMap[data.p] || 'Other';
        
        // 验证金额
        const amount = parseFloat(data.v);
        if (isNaN(amount) || amount <= 0) {
          return {
            success: false,
            message: '无效的支付金额'
          };
        }
        
        return {
          success: true,
          platform,
          data: {
            merchantId: data.m,
            merchantName: data.n,
            accountId: data.a,
            amount: amount
          }
        };
      }
    }
    
    // 如果是URL格式
    if (typeof data === 'string' && data.startsWith('http')) {
      const url = new URL(data);
      
      // 微信支付
      if (url.hostname.includes('wx.qq.com') || url.hostname.includes('weixin.qq.com')) {
        return {
          success: true,
          platform: 'WeChat',
          data: {
            url: data
          }
        };
      }
      
      // 支付宝
      if (url.hostname.includes('alipay.com')) {
        return {
          success: true,
          platform: 'Alipay',
          data: {
            url: data
          }
        };
      }
      
      // GCash
      if (url.hostname.includes('gcash.com')) {
        return {
          success: true,
          platform: 'GCash',
          data: {
            url: data
          }
        };
      }
      
      // PayPal
      if (url.hostname.includes('paypal.com')) {
        return {
          success: true,
          platform: 'PayPal',
          data: {
            url: data
          }
        };
      }
    }
    
    // 如果无法识别，返回Other
    return {
      success: true,
      platform: 'Other',
      data: {
        rawContent: data
      }
    };
  } catch (error) {
    console.error('识别支付平台失败:', error);
    return {
      success: false,
      message: '识别支付平台失败: ' + error.message
    };
  }
};

/**
 * 从二维码内容中提取商户信息
 * @private
 * @param {string} content - 二维码内容
 * @param {string} platform - 支付平台
 * @returns {string} - 商户ID
 */
function extractMerchantInfo(content, platform) {
  // 简化实现，实际项目中需要根据各平台的二维码格式进行更精确的提取
  switch (platform) {
    case 'paypal':
      // 尝试匹配PayPal商户ID格式
      const paypalMatch = content.match(/business=([^&]+)/) || content.match(/receiver=([^&]+)/);
      return paypalMatch ? paypalMatch[1] : '';
      
    case 'gcash':
      // 尝试匹配GCash商户ID格式
      const gcashMatch = content.match(/account=([^&]+)/) || content.match(/id=([^&]+)/);
      return gcashMatch ? gcashMatch[1] : '';
      
    case 'alipay':
      // 尝试匹配支付宝商户ID格式
      const alipayMatch = content.match(/uid=([^&]+)/) || content.match(/user_id=([^&]+)/);
      return alipayMatch ? alipayMatch[1] : '';
      
    case 'wechat':
      // 尝试匹配微信支付商户ID格式
      const wechatMatch = content.match(/u=([^&]+)/) || content.match(/uid=([^&]+)/);
      return wechatMatch ? wechatMatch[1] : '';
      
    default:
      return '';
  }
}