// PayPal Integration
let paypalButtons = null;

async function initializePayPal() {
    try {
        // Get PayPal configuration
        const response = await fetch('/api/payment/paypal/config');
        const result = await response.json();
        const config = result.data || result;
        
        if (!config.clientId) {
            console.error('PayPal client ID not found');
            return;
        }

        // Load PayPal SDK
        const script = document.createElement('script');
        script.src = `https://www.paypal.com/sdk/js?client-id=${config.clientId}&merchant-id=${config.merchantId}&currency=USD`;
        script.async = true;
        script.onload = () => {
            renderPayPalButtons();
        };
        document.body.appendChild(script);
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
            console.log('PayPal createOrder called, data:', data);
            try {
                // Use stored payment data amount instead of DOM element
                const amountValue = window.paymentData?.amount;
                if (!amountValue) {
                    console.error('Missing paymentData.amount, cannot create PayPal order');
                    throw new Error('缺少支付金额');
                }
                console.log('Requesting PayPal order creation with amount:', amountValue, 'currency: USD');
                const response = await fetch('/api/payment/paypal/create-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        paymentIntentId: window.paymentData.paymentIntentId || window.paymentData.id,
                        userWalletAddress: window.paymentData.userWalletAddress || window.paymentData.walletAddress,
                        merchantPaypalEmail: window.paymentData.merchantPaypalEmail || window.paymentData.merchantEmail,
                        amount: amountValue,
                        currency: 'USD'
                    })
                });
                const order = await response.json();
                console.log('create-order API response:', order);
                if (!order.success) {
                    console.error('create-order API returned error:', order);
                    throw new Error(order.message || 'create-order API returned failure');
                }
                if (!order.data || !order.data.paypalOrderId) {
                    console.error('Missing paypalOrderId in create-order response:', order);
                    throw new Error('Missing paypalOrderId');
                }
                return order.data.paypalOrderId;
            } catch (error) {
                console.error('Error in createOrder:', error);
                throw error;
            }
        },

        onApprove: async (data, actions) => {
            console.log('PayPal onApprove called, data:', data);
            try {
                const response = await fetch('/api/payment/paypal/capture-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        orderId: data.orderID,
                        paymentIntentId: window.paymentData?.paymentIntentId || window.paymentData?.id
                    })
                });
                const result = await response.json();
                console.log('capture-order API response:', result);
                if (result.success) {
                    console.log('Payment captured successfully, result:', result);
                    showSuccessMessage('Payment successful!');
                } else {
                    console.error('capture-order API returned error:', result);
                    showErrorMessage('Payment failed: ' + (result.message || result.error));
                }
            } catch (error) {
                console.error('Error in onApprove:', error);
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

// Initialize PayPal when the page loads, but only on LP page after chain order created
document.addEventListener('DOMContentLoaded', () => {
  if (window.paymentData && window.paymentData.blockchainPaymentId) {
    initializePayPal();
  }
}); 