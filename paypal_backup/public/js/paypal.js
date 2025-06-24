// PayPal Integration
let paypalButtons = null;

// 添加API_BASE_URL常量以确保API请求路径一致
const API_BASE_URL = location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : '') + '/api';

// 获取PayPal客户端ID
async function getPayPalClientId() {
  try {
    const response = await fetch(`${API_BASE_URL}/payment/paypal/config`);
    const data = await response.json();
    return data.clientId;
  } catch (error) {
    console.error('获取PayPal配置失败:', error);
    throw error;
  }
}

// 加载PayPal SDK
async function loadPayPalSDK() {
  try {
    const clientId = await getPayPalClientId();
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
    script.async = true;
    document.body.appendChild(script);
    
    return new Promise((resolve, reject) => {
      script.onload = () => resolve(window.paypal);
      script.onerror = () => reject(new Error('加载PayPal SDK失败'));
    });
  } catch (error) {
    console.error('初始化PayPal失败:', error);
    throw error;
  }
}

// 创建PayPal订单
async function createPayPalOrder(items, amount) {
  try {
    const response = await fetch(`${API_BASE_URL}/payment/paypal/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items,
        amount
      })
    });
    
    const orderData = await response.json();
    return orderData.id;
  } catch (error) {
    console.error('创建PayPal订单失败:', error);
    throw error;
  }
}

// 捕获PayPal付款
async function capturePayPalOrder(orderId) {
  try {
    const response = await fetch(`${API_BASE_URL}/payment/paypal/capture-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orderId
      })
    });
    
    return await response.json();
  } catch (error) {
    console.error('捕获PayPal付款失败:', error);
    throw error;
  }
}

async function initializePayPal() {
    try {
        // Load PayPal SDK
        const paypal = await loadPayPalSDK();
        
        if (!paypal) {
            console.error('PayPal SDK not loaded');
            return;
        }

        renderPayPalButtons();
    } catch (error) {
        console.error('Failed to initialize PayPal:', error);
    }
}

function renderPayPalButtons() {
    if (paypalButtons) {
        paypalButtons.close();
    }

    paypalButtons = paypal.Buttons({
        style: {
            layout: 'vertical',
            color: 'blue',
            shape: 'rect',
            label: 'pay'
        },

        createOrder: async (data, actions) => {
            try {
                const response = await fetch(`${API_BASE_URL}/payment/paypal/create-order`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        amount: document.getElementById('amount').value,
                        currency: 'USD'
                    })
                });
                const order = await response.json();
                return order.id;
            } catch (error) {
                console.error('Error creating PayPal order:', error);
                throw error;
            }
        },

        onApprove: async (data, actions) => {
            try {
                const response = await fetch(`${API_BASE_URL}/payment/paypal/capture-payment`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        orderId: data.orderID
                    })
                });
                const result = await response.json();
                
                if (result.success) {
                    showSuccessMessage('Payment successful!');
                    // Update UI or redirect as needed
                } else {
                    showErrorMessage('Payment failed: ' + result.error);
                }
            } catch (error) {
                console.error('Error capturing PayPal payment:', error);
                showErrorMessage('Payment failed. Please try again.');
            }
        },

        onError: (err) => {
            console.error('PayPal error:', err);
            showErrorMessage('An error occurred with PayPal. Please try again.');
        },

        onCancel: () => {
            console.log('Payment cancelled by user');
        }
    });

    paypalButtons.render('#paypal-button-container');
}

function showSuccessMessage(message) {
    // Implement your success message UI
    alert(message);
}

function showErrorMessage(message) {
    // Implement your error message UI
    alert(message);
}

// Initialize PayPal when the page loads
document.addEventListener('DOMContentLoaded', initializePayPal); 