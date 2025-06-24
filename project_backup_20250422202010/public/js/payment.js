/**
 * payment.js - 支付页面交互逻辑
 * 包含API结算和区块链结算的功能
 */

// 全局变量
let paymentData = null;
let paypalOrderCreated = false;
let paypalPopupWindow = null;  // 存储PayPal弹出窗口引用
let paypalPopupCheckInterval = null; // 用于检查PayPal窗口是否关闭的定时器
let paymentCancelled = false;
let paymentCompleted = false;  // 添加全局变量，标记支付是否已完成
let socket = null;  // Socket.io连接

// 定义 API 基础 URL
const API_BASE_URL = '/api';  // 将API基础URL设置为'/api'，并确保所有API调用都正确添加前缀

// Socket.io连接初始化
function initSocketConnection() {
    // 如果已连接，不再重复连接
    if (socket) return;
    
    try {
        console.log('初始化Socket.io连接...');
        socket = io();
        
        // 连接成功处理
        socket.on('connect', () => {
            console.log('Socket.io连接成功, socket.id:', socket.id);
            
            // 订阅当前钱包地址的消息
            const walletAddress = getUserWalletAddress();
            if (walletAddress) {
                console.log('订阅钱包地址通知:', walletAddress);
                socket.emit('subscribe', walletAddress);
            }
        });
        
        // 处理支付取消通知
        socket.on('payment_cancelled', (data) => {
            console.log('===DEBUG=== [CRITICAL] 收到支付取消通知:', JSON.stringify(data));
            
            // 检查是否为当前支付
            const currentPaymentId = document.getElementById('payment-intent-id')?.value 
                || localStorage.getItem('paymentIntentId')
                || sessionStorage.getItem('currentPaymentIntentId');
                
            if (data.paymentIntentId === currentPaymentId) {
                console.log('===DEBUG=== [CRITICAL] 收到当前支付的取消通知');
                
                // 立即设置取消标志
                paymentCancelled = true;
                localStorage.setItem('paymentCancelledAt', Date.now().toString());
                
                // 停止状态检查
                if (window.paypalStatusCheckInterval) {
                    clearInterval(window.paypalStatusCheckInterval);
                    window.paypalStatusCheckInterval = null;
                    window.paypalStatusCheckActive = false;
                }
                
                // 清除支付完成标志
                paymentCompleted = false;
                sessionStorage.removeItem('paymentCompleted');
                
                // 显示取消UI
                hidePayPalProcessingUI();
                showCancelledUI();
                
                // 刷新页面状态
                refreshPaymentDetails();
            }
        });
        
        // 处理支付状态更新
        socket.on('payment_status_update', (data) => {
            console.log('===DEBUG=== 收到支付状态更新:', JSON.stringify(data));
            
            // 检查是否为当前支付
            const currentPaymentId = document.getElementById('payment-intent-id')?.value 
                || localStorage.getItem('paymentIntentId')
                || sessionStorage.getItem('currentPaymentIntentId');
                
            if (data.paymentIntentId === currentPaymentId) {
                console.log('===DEBUG=== 刷新当前支付状态:', data.status);
                refreshPaymentDetails();
                
                // 如果状态包含取消标记，立即显示取消状态
                if (data.cancelled === true) {
                    paymentCancelled = true;
                    localStorage.setItem('paymentCancelledAt', Date.now().toString());
                    hidePayPalProcessingUI();
                    showCancelledUI();
                }
            }
        });
        
        // 连接错误处理
        socket.on('connect_error', (error) => {
            console.error('Socket.io连接失败:', error);
        });
        
        // 断开连接处理
        socket.on('disconnect', (reason) => {
            console.log('Socket.io断开连接:', reason);
        });
        
    } catch (error) {
        console.error('初始化Socket.io连接时出错:', error);
    }
}

// 添加全局事件监听器，监听PayPal窗口关闭
window.addEventListener('message', function(event) {
    // 检查消息来源和数据
    if (event.data === 'paypal_window_closed' || 
        (event.data && event.data.type === 'paypal_window_closed') ||
        (event.data && event.data.action === 'cancel')) {
        
        console.log('检测到PayPal窗口关闭事件消息:', event.data);
        handlePayPalWindowClosed();
    }
});

// 处理PayPal窗口关闭事件
function handlePayPalWindowClosed() {
    const timestamp = new Date().toISOString();
    console.log('===DEBUG=== [CRITICAL] handlePayPalWindowClosed被调用', timestamp);
    
    // 记录当前状态
    const currentState = {
        paymentCancelled,
        paymentCompleted,
        paypalOrderCreated,
        localStorageCancelled: localStorage.getItem('paymentCancelledAt'),
        sessionCompleted: sessionStorage.getItem('paymentCompleted'),
        paymentIntentId: document.getElementById('payment-intent-id')?.value || localStorage.getItem('paymentIntentId'),
        orderId: localStorage.getItem('paypalOrderId'),
        paymentProcessing: sessionStorage.getItem('paymentProcessing'),
        statusCheckActive: window.paypalStatusCheckActive,
        hasStatusCheckInterval: !!window.paypalStatusCheckInterval
    };
    console.log('===DEBUG=== [CRITICAL] 窗口关闭时状态:', JSON.stringify(currentState));
    
    // 立即停止任何状态检查 - 最高优先级操作
    if (window.paypalStatusCheckInterval) {
        console.log('===DEBUG=== [CRITICAL] 立即停止支付状态检查', window.paypalStatusCheckInterval);
        clearInterval(window.paypalStatusCheckInterval);
        window.paypalStatusCheckInterval = null;
        window.paypalStatusCheckActive = false;
    }
    
    // 检查是否存在支付完成标志，且不存在用户取消标志
    const isPaymentCompletedWithoutCancellation = 
        (paymentCompleted || sessionStorage.getItem('paymentCompleted') === 'true') && 
        !paymentCancelled && 
        !localStorage.getItem('paymentCancelledAt');
    
    if (isPaymentCompletedWithoutCancellation) {
        console.log('===DEBUG=== [CRITICAL] 检测到支付已完成且未被取消，允许完成流程继续');
        return;
    }
    
    // 达到这里意味着支付未完成或已取消 - 立即设置取消标志
    paymentCancelled = true;
    localStorage.setItem('paymentCancelledAt', Date.now().toString());
    console.log('===DEBUG=== [CRITICAL] 已设置取消标志');
    
    // 清除支付完成标志 - 确保取消状态优先
    paymentCompleted = false;
    sessionStorage.removeItem('paymentCompleted');
    console.log('===DEBUG=== [CRITICAL] 已清除支付完成标志');
    
    // 如果订单未创建，直接显示错误并返回
    if (!paypalOrderCreated) {
        console.log('===DEBUG=== [CRITICAL] PayPal订单未创建就关闭了窗口');
        showError('PayPal payment process was interrupted before order creation.');
        hidePayPalProcessingUI();
        showCancelledUI();
        return;
    }
    
    // 检查是否有存储的订单ID和支付意向ID
    const orderId = localStorage.getItem('paypalOrderId');
    const paymentIntentId = document.getElementById('payment-intent-id')?.value || localStorage.getItem('paymentIntentId');
    
    console.log('===DEBUG=== [CRITICAL] 检查存储的IDs:', {orderId, paymentIntentId});
    
    // 如果缺少必要信息，显示错误并返回
    if (!orderId || !paymentIntentId) {
        console.log('===DEBUG=== [CRITICAL] 无法找到支付订单信息');
        showError('Payment information is missing. Cannot proceed with cancellation.');
        showCancelledUI();
        return;
    }
    
    // 防止重复处理
    if (sessionStorage.getItem('handleClosedInProgress') === 'true') {
        console.log('===DEBUG=== [CRITICAL] 已有取消处理进程在运行，避免重复处理');
        return;
    }
    
    // 设置处理锁
    sessionStorage.setItem('handleClosedInProgress', 'true');
    
    // 确保UI显示取消状态
    showCancelledUI();
    
    // 确保支付处理UI隐藏
    hidePayPalProcessingUI();
    
    // 延迟调用取消API，给onApprove回调一些时间优先执行
    // 但取消标志已设置，onApprove会检测到它并中断操作
    setTimeout(async () => {
        console.log('===DEBUG=== [CRITICAL] 延迟后执行取消API调用');
        
        try {
            // 调用取消API
            await cancelPayPalPayment(true);
        } catch (error) {
            console.error('===DEBUG=== [CRITICAL] 调用取消API失败:', error);
            // 即使API调用失败，仍然保持取消状态
        } finally {
            // 确保UI显示取消状态，无论API调用成功与否
            showCancelledUI();
            
            // 刷新页面以获取最新状态
            setTimeout(() => {
                refreshPaymentDetails();
            }, 1000);
            
            // 释放处理锁
            sessionStorage.removeItem('handleClosedInProgress');
        }
    }, 500);
}

// 确保取消UI显示
function showCancelledUI() {
    console.log('===DEBUG=== [CRITICAL] 显示取消UI');
    
    // 隐藏处理中UI
    hidePayPalProcessingUI();
    
    // 显示取消消息
    showMessage('Payment was cancelled.', 'info');
    
    // 更新取消UI中的支付ID
    const paymentIntentId = document.getElementById('payment-intent-id')?.value || localStorage.getItem('paymentIntentId');
    const cancelledPaymentId = document.getElementById('cancelled-payment-id');
    
    if (cancelledPaymentId && paymentIntentId) {
        cancelledPaymentId.textContent = paymentIntentId;
    }
    
    // 显示取消UI
    const paymentCancelledElement = document.getElementById('payment-cancelled');
    if (paymentCancelledElement) {
        paymentCancelledElement.style.display = 'block';
    }
    
    // 隐藏其他状态UI
    const paymentSuccess = document.getElementById('payment-success');
    if (paymentSuccess) {
        paymentSuccess.style.display = 'none';
    }
}

// 监控PayPal弹出窗口的状态
function monitorPayPalPopupWindow(popup) {
    console.log('===DEBUG=== 开始监控PayPal弹窗', new Date().toISOString(), 'paymentCancelled=', paymentCancelled, 'paymentCompleted=', paymentCompleted);
    
    if (!popup) {
        console.error('===DEBUG=== monitorPayPalPopupWindow收到null弹窗引用');
        return;
    }
    
    // 保存弹出窗口引用
    paypalPopupWindow = popup;
    
    // 保存初始状态，用于调试
    const initialPaymentState = {
        paymentCancelled,
        paymentCompleted,
        paypalOrderCreated,
        localStorageCancelled: localStorage.getItem('paymentCancelledAt'),
        sessionCompleted: sessionStorage.getItem('paymentCompleted'),
        paymentProcessing: sessionStorage.getItem('paymentProcessing')
    };
    console.log('===DEBUG=== PayPal弹窗初始状态:', JSON.stringify(initialPaymentState));
    
    // 尝试设置beforeunload事件监听器
    try {
        console.log('===DEBUG=== 尝试为PayPal弹窗设置beforeunload事件监听');
        if (popup.addEventListener) {
            popup.addEventListener('beforeunload', function() {
                console.log('===DEBUG=== PayPal弹窗beforeunload事件触发', new Date().toISOString(), 
                           'paymentCancelled=', paymentCancelled, 
                           'paymentCompleted=', paymentCompleted);
                // 不立即执行关闭处理，留给窗口状态检查处理
            });
        }
    } catch (e) {
        console.log('===DEBUG=== 无法设置PayPal弹窗beforeunload事件:', e);
    }
    
    // 清除之前的检查定时器
    if (paypalPopupCheckInterval) {
        console.log('===DEBUG=== 清除之前的PayPal弹窗检查定时器:', paypalPopupCheckInterval);
        clearInterval(paypalPopupCheckInterval);
    }
    
    // 生成唯一的监控ID用于日志跟踪
    const monitorId = Math.random().toString(36).substring(2, 8);
    console.log(`===DEBUG=== 创建新的PayPal弹窗监控实例 ID=${monitorId}`);
    
    // 记录初始窗口状态
    try {
        console.log(`===DEBUG=== 监控器${monitorId}: 初始窗口状态 - closed=${popup.closed}`);
    } catch (e) {
        console.error(`===DEBUG=== 监控器${monitorId}: 无法获取初始窗口状态:`, e);
    }
    
    // 设置新的检查定时器
    paypalPopupCheckInterval = setInterval(() => {
        // 检查窗口是否已关闭
        try {
            if (!paypalPopupWindow) {
                console.log(`===DEBUG=== 监控器${monitorId}: PayPal弹窗引用为空`);
                clearInterval(paypalPopupCheckInterval);
                return;
            }
            
            const currentState = {
                paymentCancelled,
                paymentCompleted,
                paypalOrderCreated,
                localStorageCancelled: localStorage.getItem('paymentCancelledAt'),
                sessionCompleted: sessionStorage.getItem('paymentCompleted'),
                paymentProcessing: sessionStorage.getItem('paymentProcessing')
            };
            
            console.log(`===DEBUG=== 监控器${monitorId}: 检查窗口状态, closed=${paypalPopupWindow.closed}, paymentState=${JSON.stringify(currentState)}`);
            
            if (paypalPopupWindow.closed) {
                console.log(`===DEBUG=== 监控器${monitorId}: 检测到PayPal弹窗已关闭`, new Date().toISOString(), 
                           'paymentCancelled=', paymentCancelled, 
                           'paymentCompleted=', paymentCompleted,
                           'paypalOrderCreated=', paypalOrderCreated);
                
                clearInterval(paypalPopupCheckInterval);
                paypalPopupWindow = null;
                
                // 记录当前支付状态
                const closedState = {
                    paymentCancelled,
                    paymentCompleted,
                    paypalOrderCreated,
                    localStorageCancelled: localStorage.getItem('paymentCancelledAt'),
                    sessionCompleted: sessionStorage.getItem('paymentCompleted'),
                    paymentProcessing: sessionStorage.getItem('paymentProcessing'),
                    closedAt: new Date().toISOString()
                };
                console.log(`===DEBUG=== 监控器${monitorId}: 窗口关闭时状态:`, JSON.stringify(closedState));
                
                // 延迟处理窗口关闭事件，避免与onApprove回调竞争
                console.log(`===DEBUG=== 监控器${monitorId}: 延迟300ms调用handlePayPalWindowClosed`);
                setTimeout(() => {
                    console.log(`===DEBUG=== 监控器${monitorId}: 延迟结束，现在调用handlePayPalWindowClosed, paymentCancelled=${paymentCancelled}, paymentCompleted=${paymentCompleted}`);
                    handlePayPalWindowClosed();
                }, 300);
                return;
            }
            
            // 尝试访问窗口位置以检查窗口是否仍然可访问
            try {
                const url = paypalPopupWindow.location.href;
                console.log(`===DEBUG=== 监控器${monitorId}: PayPal弹窗当前URL: ${url}`);
                
                // 检查URL变化，可能表明用户执行了某些操作
                if (url.includes('cancel') || url.includes('Cancelled')) {
                    console.log(`===DEBUG=== 监控器${monitorId}: 检测到取消URL模式 - ${url}, paymentCancelled=${paymentCancelled}, paymentCompleted=${paymentCompleted}`);
                }
                
                if (url.includes('success') || url.includes('approved')) {
                    console.log(`===DEBUG=== 监控器${monitorId}: 检测到成功URL模式 - ${url}, paymentCancelled=${paymentCancelled}, paymentCompleted=${paymentCompleted}`);
                }
            } catch (e) {
                // 如果由于跨域而无法访问，这是正常的
                console.log(`===DEBUG=== 监控器${monitorId}: 无法访问PayPal弹窗URL (可能是跨域限制)`);
            }
        } catch (e) {
            console.error(`===DEBUG=== 监控器${monitorId}: 监控PayPal弹窗出错:`, e);
        }
    }, 500); // 每500毫秒检查一次
    
    // 设置监控超时，防止无限监控
    setTimeout(() => {
        if (paypalPopupCheckInterval) {
            console.log(`===DEBUG=== 监控器${monitorId}: 监控超时(2分钟)，清除监控器, paymentCancelled=${paymentCancelled}, paymentCompleted=${paymentCompleted}`);
            clearInterval(paypalPopupCheckInterval);
            paypalPopupCheckInterval = null;
            
            // 如果窗口仍然存在但订单状态未变，可能是用户忘记了窗口
            try {
                if (paypalPopupWindow && !paypalPopupWindow.closed && paypalOrderCreated) {
                    console.log(`===DEBUG=== 监控器${monitorId}: 检测到可能的遗忘窗口，尝试关闭`);
                    paypalPopupWindow.close();
                    paypalPopupWindow = null;
                    
                    // 处理窗口关闭
                    console.log(`===DEBUG=== 监控器${monitorId}: 调用handlePayPalWindowClosed处理遗忘窗口, paymentCancelled=${paymentCancelled}, paymentCompleted=${paymentCompleted}`);
                    handlePayPalWindowClosed();
                }
            } catch (e) {
                console.error(`===DEBUG=== 监控器${monitorId}: 关闭遗忘窗口失败:`, e);
            }
        }
    }, 120000); // 2分钟超时
}

// 初始化页面
document.addEventListener('DOMContentLoaded', () => {
    console.log('===DEBUG=== DOMContentLoaded事件触发');
    
    try {
        // 初始化Socket.io连接
        initSocketConnection();
        
        // 初始化事件监听器
        initEventListeners();
        
        // 初始化PayPal按钮
        initPayPalButton();
        
        // 设置支付详情页面
        setupPaymentDetailsPage();
        
        // 检查是否有进行中的支付
        const currentPaymentIntentId = sessionStorage.getItem('currentPaymentIntentId') || 
                                     localStorage.getItem('paymentIntentId');
        
        if (currentPaymentIntentId) {
            console.log('===DEBUG=== 检测到进行中的支付:', currentPaymentIntentId);
            checkPendingPayPalPayment(currentPaymentIntentId);
        }
        
        // 启用表单提交
        const form = document.getElementById('payment-form');
        if (form) {
            form.removeAttribute('disabled');
        }
        
        // 处理URL参数
        const urlParams = new URLSearchParams(window.location.search);
        const qrData = urlParams.get('data');
        if (qrData) {
            console.log('===DEBUG=== 检测到URL参数data:', qrData);
            handleQRCodeData(qrData);
        }
        
        // 清理过期的支付状态
        clearInactivePaymentState();
    } catch (error) {
        console.error('===DEBUG=== 初始化时发生错误:', error);
    }
});

// 加载支付详情
async function loadPaymentDetails(paymentId) {
    try {
        const response = await fetch(`/api/payment-intents/${paymentId}`);
        
        if (response.status === 404) {
            showError('找不到该支付');
            return;
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            showError(`加载支付详情失败: ${errorData.message || '未知错误'}`);
            return;
        }
        
        const data = await response.json();
        paymentData = data;
        
        // 更新UI显示支付详情
        updatePaymentDetailsUI(data);
        
        // 检查是否有未完成的PayPal支付
        checkPendingPayPalPayment(paymentId);
        
        return data; // 返回数据以便链式调用
    } catch (error) {
        console.error('加载支付详情错误:', error);
        showError(`加载支付详情失败: ${error.message}`);
    }
}

// 更新支付详情UI
function updatePaymentDetailsUI(data) {
    document.getElementById('payment-id').textContent = data.id || '-';
    document.getElementById('payment-amount').textContent = `${data.amount} ${data.currency || 'USDT'}`;
    document.getElementById('payment-status').textContent = getStatusText(data.status);
    document.getElementById('lp-address').textContent = data.lpWalletAddress || '-';
    
    // 添加商家PayPal邮箱信息（如果存在）
    const merchantEmailElement = document.getElementById('merchant-paypal-email');
    if (merchantEmailElement) {
        if (data.merchantPaypalEmail) {
            merchantEmailElement.textContent = data.merchantPaypalEmail;
            document.getElementById('merchant-email-container').style.display = 'flex';
        } else {
            document.getElementById('merchant-email-container').style.display = 'none';
        }
    }
    
    // 格式化创建时间
    const createdDate = data.createdAt ? new Date(data.createdAt) : null;
    document.getElementById('created-at').textContent = createdDate ? 
        createdDate.toLocaleString() : '-';
    
    // 添加PayPal交易详情
    const paymentProofSection = document.querySelector('.payment-info');
    if (paymentProofSection && (data.status === 'paid' || data.status === 'confirmed')) {
        let paymentProof = data.paymentProof;
        
        if (typeof paymentProof === 'string') {
            try {
                paymentProof = JSON.parse(paymentProof);
            } catch (e) {
                console.error('解析支付凭证失败:', e);
                paymentProof = {};
            }
        }
        
        // 如果已有交易详情元素，则移除它
        const existingProofDetails = document.getElementById('payment-proof-details');
        if (existingProofDetails) {
            existingProofDetails.remove();
        }
        
        // 创建交易详情元素
        const proofDetails = document.createElement('div');
        proofDetails.id = 'payment-proof-details';
        proofDetails.className = 'card mt-3';
        proofDetails.innerHTML = `
            <div class="card-body">
                <h4>交易详情</h4>
                <div class="info-row">
                    <label>支付平台:</label>
                    <span>${data.platform || '未知'}</span>
                </div>
                ${paymentProof?.paypalOrderId ? `
                <div class="info-row">
                    <label>PayPal订单ID:</label>
                    <span style="font-family: monospace;">${paymentProof.paypalOrderId}</span>
                </div>` : ''}
                ${paymentProof?.paypalCaptureId ? `
                <div class="info-row">
                    <label>PayPal交易ID:</label>
                    <span style="font-family: monospace;">${paymentProof.paypalCaptureId}</span>
                </div>` : ''}
                ${paymentProof?.captureId ? `
                <div class="info-row">
                    <label>交易ID:</label>
                    <span style="font-family: monospace;">${paymentProof.captureId}</span>
                </div>` : ''}
                ${paymentProof?.transactionId ? `
                <div class="info-row">
                    <label>交易ID:</label>
                    <span style="font-family: monospace;">${paymentProof.transactionId}</span>
                </div>` : ''}
                ${paymentProof?.transactionTime ? `
                <div class="info-row">
                    <label>支付时间:</label>
                    <span>${new Date(paymentProof.transactionTime).toLocaleString()}</span>
                </div>` : ''}
                <div class="mt-3">
                    <a href="https://sandbox.paypal.com/merchantapps/app/account/transactions" target="_blank" class="btn btn-sm btn-outline-primary">
                        PayPal商家中心
                    </a>
                </div>
            </div>
        `;
        
        // 插入到支付详情卡片中
        document.getElementById('payment-details').appendChild(proofDetails);
    }
    
    // 如果支付状态是已支付或已确认，显示退款按钮
    const refundButtonContainer = document.getElementById('refund-button-container');
    if (refundButtonContainer) {
        if (data.status === 'paid' || data.status === 'confirmed') {
            refundButtonContainer.style.display = 'block';
            document.getElementById('refund-button').onclick = () => handlePayPalRefund(data.id);
        } else if (data.status === 'refunded') {
            refundButtonContainer.style.display = 'block';
            document.getElementById('refund-button').textContent = '检查退款状态';
            document.getElementById('refund-button').onclick = () => checkPayPalRefundStatus(data.id);
        } else {
            refundButtonContainer.style.display = 'none';
        }
    }
    
    // 如果支付状态为失败，显示错误详情
    const errorDetailsContainer = document.getElementById('error-details-container');
    if (errorDetailsContainer) {
        if (data.status === 'failed' && data.errorDetails) {
            let errorDetails = data.errorDetails;
            if (typeof errorDetails === 'string') {
                try {
                    errorDetails = JSON.parse(errorDetails);
                } catch (e) {
                    errorDetails = { message: errorDetails };
                }
            }
            
            errorDetailsContainer.style.display = 'block';
            document.getElementById('error-message').textContent = errorDetails.message || '未知错误';
            document.getElementById('error-code').textContent = errorDetails.code || '无错误代码';
            document.getElementById('error-time').textContent = errorDetails.timestamp ? 
                new Date(errorDetails.timestamp).toLocaleString() : '-';
        } else {
            errorDetailsContainer.style.display = 'none';
        }
    }
}

// 获取状态文本
function getStatusText(status) {
    const statusMap = {
        'created': '已创建',
        'processing': '处理中',
        'succeeded': '已完成',
        'canceled': '已取消',
        'failed': '失败'
    };
    
    return statusMap[status] || status;
}

// 初始化事件监听器
function initEventListeners() {
    // 标签切换
    document.getElementById('tab-api').addEventListener('click', () => switchTab('api'));
    document.getElementById('tab-blockchain').addEventListener('click', () => switchTab('blockchain'));
    
    // API结算表单提交
    document.getElementById('payment-form').addEventListener('submit', handleApiSettlement);
    
    // 区块链结算按钮
    document.getElementById('approve-usdt').addEventListener('click', approveUSDT);
    document.getElementById('settle-payment').addEventListener('click', settlePaymentOnChain);
    
    // 返回仪表板按钮
    document.getElementById('back-to-dashboard').addEventListener('click', () => {
        window.location.href = '/';
    });
    
    // 支付取消UI中的按钮
    const retryPaymentBtn = document.getElementById('retry-payment');
    if (retryPaymentBtn) {
        retryPaymentBtn.addEventListener('click', () => {
            // 隐藏取消UI，显示支付选项
            document.getElementById('payment-cancelled').style.display = 'none';
            document.getElementById('payment-options').style.display = 'block';
            
            // 重置支付状态
            resetPaymentState();
            
            // 重新初始化PayPal按钮
            initPayPalButton();
        });
    }
    
    const backFromCancelBtn = document.getElementById('back-from-cancel');
    if (backFromCancelBtn) {
        backFromCancelBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }
    
    // 支付方式选择变更
    document.getElementById('payment-method').addEventListener('change', function() {
        const paymentMethod = this.value;
        const proofContainer = document.getElementById('payment-proof-container');
        const paypalButtonContainer = document.getElementById('paypal-button-container');
        
        if (paymentMethod === 'paypal') {
            // 选择PayPal支付，显示PayPal按钮
            if (proofContainer) proofContainer.style.display = 'none';
            if (paypalButtonContainer) paypalButtonContainer.style.display = 'block';
            
            // 隐藏常规提交按钮
            const submitButton = document.getElementById('submit-payment');
            if (submitButton) submitButton.style.display = 'none';
            
            // 确保PayPal按钮已初始化
            initPayPalButton();
        } else {
            // 选择其他支付方式，显示常规提交表单
            if (proofContainer) proofContainer.style.display = 'block';
            if (paypalButtonContainer) paypalButtonContainer.style.display = 'none';
            
            // 显示常规提交按钮
            const submitButton = document.getElementById('submit-payment');
            if (submitButton) submitButton.style.display = 'block';
        }
    });
}

// 切换标签
function switchTab(tabName) {
    // 更新标签按钮状态
    document.getElementById('tab-api').classList.toggle('active', tabName === 'api');
    document.getElementById('tab-blockchain').classList.toggle('active', tabName === 'blockchain');
    
    // 显示/隐藏相应的表单
    document.getElementById('api-settlement').classList.toggle('hidden', tabName !== 'api');
    document.getElementById('blockchain-settlement').classList.toggle('hidden', tabName !== 'blockchain');
}

// 处理API结算
async function handleApiSettlement(event) {
    event.preventDefault();
    
    const paymentMethod = document.getElementById('payment-method').value;
    
    // 如果是PayPal支付，不进行常规提交
    if (paymentMethod === 'paypal') {
        // PayPal支付通过PayPal按钮直接处理
        return;
    }
    
    const submitButton = document.getElementById('submit-payment');
    submitButton.disabled = true;
    submitButton.textContent = '提交中...';
    
    try {
        const paymentProof = document.getElementById('payment-proof').value;
        
        if (!paymentMethod || !paymentProof) {
            showError('请填写所有必填字段');
            submitButton.disabled = false;
            submitButton.textContent = '提交支付';
            return;
        }
        
        // 构建支付证明数据
        const proofData = {
            method: paymentMethod,
            proof: paymentProof
        };
        
        // 确认支付
        const response = await fetch(`/api/payment-intents/${paymentData.id}/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ proof: proofData })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || '支付确认失败');
        }
        
        // 显示成功信息
        const successData = await response.json();
        showSuccess('api', successData);
    } catch (error) {
        console.error('API结算错误:', error);
        showError(`支付确认失败: ${error.message}`);
        submitButton.disabled = false;
        submitButton.textContent = '提交支付';
    }
}

// 连接钱包
async function connectWallet() {
    try {
        // 初始化Web3和合约
        const walletAddress = await contractService.connectWallet();
        
        if (!walletAddress) {
            showError('连接钱包失败');
            return;
        }
        
        // 更新UI
        document.getElementById('connect-wallet').classList.add('hidden');
        document.getElementById('wallet-connected').classList.remove('hidden');
        document.getElementById('wallet-address').textContent = shortenAddress(walletAddress);
        
        // 更新区块链结算步骤状态
        document.getElementById('step1-status').textContent = '已连接';
        document.getElementById('step1-status').className = 'step-status success';
        
        // 启用"批准USDT"按钮
        document.getElementById('approve-usdt').disabled = false;
        
        // 获取并显示USDT余额
        updateUSDTBalance();
    } catch (error) {
        console.error('连接钱包错误:', error);
        showError(`连接钱包失败: ${error.message}`);
    }
}

// 批准USDT转账
async function approveUSDT() {
    const approveButton = document.getElementById('approve-usdt');
    approveButton.disabled = true;
    approveButton.textContent = '授权中...';
    
    try {
        if (!paymentData) {
            throw new Error('支付数据不可用');
        }
        
        // 获取USDT金额并增加10%作为缓冲
        const amount = parseFloat(paymentData.amount) * 1.1;
        
        // 批准USDT
        const approved = await contractService.approveUSDT(amount);
        
        if (!approved) {
            throw new Error('USDT授权失败');
        }
        
        // 更新UI
        document.getElementById('step2-status').textContent = '已授权';
        document.getElementById('step2-status').className = 'step-status success';
        
        // 启用"结算支付"按钮
        document.getElementById('settle-payment').disabled = false;
        
        // 恢复按钮状态
        approveButton.textContent = '已授权USDT';
    } catch (error) {
        console.error('USDT授权错误:', error);
        showError(`USDT授权失败: ${error.message}`);
        
        // 恢复按钮状态
        approveButton.disabled = false;
        approveButton.textContent = '授权USDT';
    }
}

// 在区块链上结算支付
async function settlePaymentOnChain() {
    const settleButton = document.getElementById('settle-payment');
    settleButton.disabled = true;
    settleButton.textContent = '结算中...';
    
    try {
        if (!paymentData) {
            throw new Error('支付数据不可用');
        }
        
        // 验证LP钱包地址
        if (!paymentData.lpWalletAddress || !/^0x[a-fA-F0-9]{40}$/.test(paymentData.lpWalletAddress)) {
            throw new Error('无效的LP钱包地址');
        }
        
        // 结算支付
        const result = await contractService.settlePayment(
            paymentData.lpWalletAddress,
            parseFloat(paymentData.amount),
            paymentData.id
        );
        
        if (!result.success) {
            throw new Error(result.error || '区块链结算失败');
        }
        
        // 更新UI
        document.getElementById('step3-status').textContent = '已结算';
        document.getElementById('step3-status').className = 'step-status success';
        
        // 显示交易结果
        document.getElementById('blockchain-result').classList.remove('hidden');
        document.getElementById('tx-hash').textContent = result.txHash;
        document.getElementById('tx-hash').href = `${contractService.networkConfig.BLOCK_EXPLORER}/tx/${result.txHash}`;
        document.getElementById('tx-status').textContent = '成功';
        
        // 向后端API报告链上结算成功
        await reportBlockchainSettlement(result.txHash);
        
        // 显示成功信息
        showSuccess('blockchain', { 
            id: paymentData.id,
            amount: paymentData.amount,
            txHash: result.txHash
        });
    } catch (error) {
        console.error('区块链结算错误:', error);
        showError(`区块链结算失败: ${error.message}`);
        
        // 恢复按钮状态
        settleButton.disabled = false;
        settleButton.textContent = '结算支付';
        
        // 显示交易结果（如果有）
        if (error.txHash) {
            document.getElementById('blockchain-result').classList.remove('hidden');
            document.getElementById('tx-hash').textContent = error.txHash;
            document.getElementById('tx-hash').href = `${contractService.networkConfig.BLOCK_EXPLORER}/tx/${error.txHash}`;
            document.getElementById('tx-status').textContent = '失败';
        }
    }
}

// 向后端API报告区块链结算
async function reportBlockchainSettlement(txHash) {
    try {
        const response = await fetch(`/api/payment-intents/${paymentData.id}/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                proof: {
                    method: 'blockchain',
                    proof: txHash,
                    blockchain: 'BSC'
                }
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('报告区块链结算到API失败:', errorData);
        }
    } catch (error) {
        console.error('报告区块链结算错误:', error);
    }
}

// 更新USDT余额
async function updateUSDTBalance() {
    try {
        const balance = await contractService.getUSDTBalance();
        document.getElementById('usdt-balance').textContent = `USDT: ${balance}`;
    } catch (error) {
        console.error('获取USDT余额错误:', error);
    }
}

/**
 * 显示支付成功UI
 * @param {string} method 支付方式
 * @param {object} data 成功数据
 */
function showSuccess(method, data) {
    // 隐藏支付选项
    const paymentOptions = document.getElementById('payment-options');
    if (paymentOptions) {
        paymentOptions.style.display = 'none';
    }
    
    // 显示成功信息
    const successElement = document.getElementById('payment-success');
    if (successElement) {
        successElement.classList.remove('hidden');
        
        // 更新成功信息详情
        document.getElementById('success-payment-id').textContent = data.id || '-';
        document.getElementById('success-amount').textContent = `${data.amount} ${data.currency || 'USD'}`;
        document.getElementById('success-method').textContent = method === 'paypal' 
            ? 'PayPal在线支付' 
            : (method === 'blockchain' ? '区块链USDT' : '手动API结算');
    }
    
    // 如果是PayPal支付，在控制台显示一些信息
    if (method === 'paypal' && data.captureId) {
        console.log('PayPal支付成功，捕获ID:', data.captureId);
    }
    
    // 3秒后刷新页面以显示最新状态
    setTimeout(() => {
        loadPaymentDetails(data.id);
    }, 3000);
}

/**
 * 显示错误信息
 * @param {string} message 错误消息
 */
function showError(message) {
    // 移除之前的错误消息
    const previousError = document.getElementById('error-message-container');
    if (previousError) {
        previousError.remove();
    }
    
    // 创建新的错误消息
    const errorDiv = document.createElement('div');
    errorDiv.id = 'error-message-container';
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    // 添加到页面
    document.getElementById('message').appendChild(errorDiv);
    
    // 5秒后自动隐藏
    setTimeout(() => {
        errorDiv.style.opacity = '0';
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 500);
    }, 5000);
}

// 缩短地址显示
function shortenAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// 处理PayPal退款
async function handlePayPalRefund(paymentIntentId) {
    try {
        if (!confirm('确定要申请退款吗？此操作不可撤销。')) {
            return;
        }
        
        // 获取当前用户钱包地址
        const userWalletAddress = getUserWalletAddress();
        if (!userWalletAddress) {
            showError('请先连接钱包');
            return;
        }
        
        // 获取退款原因（可选）
        const reason = prompt('请输入退款原因（可选）:');
        
        // 发起退款请求
        const response = await fetch('/api/payment/paypal/refund', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                paymentIntentId,
                userWalletAddress,
                reason
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || '退款请求失败');
        }
        
        const result = await response.json();
        
        // 显示成功消息
        alert('退款请求已提交，退款状态：' + result.data.status);
        
        // 刷新页面或重新加载支付详情
        await loadPaymentDetails(paymentIntentId);
        
    } catch (error) {
        console.error('PayPal退款错误:', error);
        showError(`PayPal退款失败: ${error.message}`);
    }
}

// 检查PayPal退款状态
async function checkPayPalRefundStatus(paymentIntentId) {
    try {
        const response = await fetch(`/api/payment/paypal/refund-status/${paymentIntentId}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || '获取退款状态失败');
        }
        
        const result = await response.json();
        
        // 显示退款状态
        alert(`退款状态: ${result.data.paypalRefundStatus}`);
        
    } catch (error) {
        console.error('检查PayPal退款状态错误:', error);
        showError(`获取退款状态失败: ${error.message}`);
    }
}

/**
 * 初始化PayPal按钮
 */
function initPayPalButton() {
    const paymentIntentId = document.getElementById('payment-intent-id').value;
    console.log('===DEBUG=== initPayPalButton开始，paymentIntentId:', paymentIntentId, new Date().toISOString());
    
    // 重置支付状态以确保新的支付流程是干净的
    paymentCancelled = false;
    localStorage.removeItem('paymentCancelledAt');
    paymentCompleted = false;
    sessionStorage.removeItem('paymentCompleted');
    paypalOrderCreated = false;
    console.log('===DEBUG=== 初始化PayPal按钮时重置状态变量');
    
    if (!paypal || !paypal.Buttons) {
        console.error('PayPal SDK未加载');
        showError('PayPal支付暂时不可用，请稍后再试');
        return;
    }
    
    // 清空按钮容器
    const buttonContainer = document.getElementById('paypal-button-container');
    buttonContainer.innerHTML = '';
    
    // 清除之前的检查定时器
    if (window.paypalStatusCheckInterval) {
        console.log('===DEBUG=== 初始化PayPal按钮前清除现有状态检查');
        clearInterval(window.paypalStatusCheckInterval);
        window.paypalStatusCheckInterval = null;
        window.paypalStatusCheckActive = false;
    }
    
    // 创建PayPal按钮
    paypal.Buttons({
        // 创建订单时的回调
        createOrder: function() {
            return createPayPalOrder();
        },
        
        // 用户批准支付后的回调
        onApprove: async function(data, actions) {
            console.log('===DEBUG=== [CRITICAL] PayPal支付已批准:', data);
            
            try {
                // 批准前立即检查是否已取消 - 关键修复
                if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                    console.log('===DEBUG=== [CRITICAL] onApprove检测到支付已被取消，拒绝处理支付批准');
                    hidePayPalProcessingUI();
                    const cancelledUI = document.getElementById('payment-cancelled');
                    if (cancelledUI) cancelledUI.style.display = 'block';
                    return;
                }

                // 显示处理中UI
                showPayPalProcessingUI('正在完成支付...');
                
                // 再次检查取消状态 - 双重检查
                if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                    console.log('===DEBUG=== [CRITICAL] 捕获支付前再次检测到支付已被取消，拒绝处理支付批准');
                    hidePayPalProcessingUI();
                    const cancelledUI = document.getElementById('payment-cancelled');
                    if (cancelledUI) cancelledUI.style.display = 'block';
                    return;
                }
                
                // 捕获付款
                console.log('===DEBUG=== [CRITICAL] 发送捕获支付请求, orderId:', data.orderID, 'paymentIntentId:', paymentIntentId);
                const response = await fetch(`${API_BASE_URL}/payment/paypal/capture-order`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        orderId: data.orderID,
                        paymentIntentId: paymentIntentId
                    })
                });
                
                // 收到响应后再次检查取消状态 - 三重检查
                if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                    console.log('===DEBUG=== [CRITICAL] 收到捕获响应后检测到支付已被取消，忽略响应');
                    hidePayPalProcessingUI();
                    const cancelledUI = document.getElementById('payment-cancelled');
                    if (cancelledUI) cancelledUI.style.display = 'block';
                    return;
                }
                
                if (!response.ok) {
                    throw new Error(`捕获付款失败: ${response.status}`);
                }
                
                const captureData = await response.json();
                console.log('===DEBUG=== [CRITICAL] 捕获支付响应:', JSON.stringify(captureData));
                
                // 解析响应后再次检查取消状态 - 四重检查
                if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                    console.log('===DEBUG=== [CRITICAL] 解析捕获响应后检测到支付已被取消，忽略结果');
                    hidePayPalProcessingUI();
                    const cancelledUI = document.getElementById('payment-cancelled');
                    if (cancelledUI) cancelledUI.style.display = 'block';
                    return;
                }
                
                // 重置订单创建状态
                paypalOrderCreated = false;
                
                // 移除本地存储的订单ID
                localStorage.removeItem(`paypal_order_${paymentIntentId}`);
                
                if (captureData.success) {
                    console.log('===DEBUG=== [CRITICAL] PayPal付款捕获成功:', captureData);
                    
                    // 最后一次检查取消状态 - 五重检查
                    if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                        console.log('===DEBUG=== [CRITICAL] 捕获成功但检测到支付已被取消，忽略成功结果');
                        hidePayPalProcessingUI();
                        const cancelledUI = document.getElementById('payment-cancelled');
                        if (cancelledUI) cancelledUI.style.display = 'block';
                        return;
                    }
                    
                    // 取消未被设置，安全地标记为完成
                    paymentCompleted = true;
                    sessionStorage.setItem('paymentCompleted', 'true');
                    console.log('===DEBUG=== [CRITICAL] 已标记支付为完成状态');
                    
                    // 显示成功消息
                    showInfo('支付成功处理中，请稍候...');
                    
                    // 开始检查支付状态，确保后端处理完成
                    startPayPalStatusCheck(data.orderID);
                    
                    // 1秒后刷新页面显示最新状态
                    setTimeout(() => {
                        // 最后的取消检查
                        if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                            console.log('===DEBUG=== [CRITICAL] 刷新前检测到支付已被取消，不显示支付成功');
                            return;
                        }
                        
                        loadPaymentDetails(paymentIntentId);
                    }, 1000);
                } else {
                    throw new Error(captureData.message || '捕获付款失败');
                }
            } catch (error) {
                console.error('===DEBUG=== [CRITICAL] PayPal付款捕获错误:', error);
                showError('完成支付失败: ' + error.message);
                hidePayPalProcessingUI();
            }
        },
        
        // 用户取消支付
        onCancel: function(data) {
            console.log('===DEBUG=== [CRITICAL] 用户在PayPal页面取消了支付:', data);
            
            // 设置订单为未创建状态，防止状态检查显示支付成功
            paypalOrderCreated = false;
            
            // 立即设置取消标志
            paymentCancelled = true;
            localStorage.setItem('paymentCancelledAt', Date.now().toString());
            console.log('===DEBUG=== [CRITICAL] onCancel已设置取消标志');
            
            // 当用户关闭PayPal窗口或取消时，显示处理取消中的状态
            showPayPalProcessingUI('正在处理取消...');
            
            // 使用setTimeout确保UI更新后再执行取消操作
            setTimeout(() => {
                // 显式调用取消订单API
                cancelPayPalPayment();
            }, 100);
        },
        
        // 支付过程中出现错误
        onError: function(err) {
            console.error('PayPal支付错误:', err);
            
            // 设置订单为未创建状态，防止状态检查显示支付成功
            paypalOrderCreated = false;
            
            showError('PayPal支付出错: ' + (err.message || '未知错误'));
            hidePayPalProcessingUI();
        }
    }).render('#paypal-button-container');
    
    console.log('PayPal按钮已初始化');
}

// 更新处理状态UI
function updateProcessingStatus(message) {
    const processingStatus = document.getElementById('processing-status');
    if (processingStatus) {
        processingStatus.textContent = message;
    }
}

// 显示处理中UI
function showPayPalProcessingUI() {
    // 隐藏原始按钮
    const paypalButtonContainer = document.getElementById('paypal-button-container');
    if (paypalButtonContainer) {
        paypalButtonContainer.style.display = 'none';
    }
    
    // 创建或显示处理UI
    let processingUI = document.getElementById('paypal-processing-ui');
    if (!processingUI) {
        processingUI = document.createElement('div');
        processingUI.id = 'paypal-processing-ui';
        processingUI.className = 'paypal-processing-overlay';
        processingUI.innerHTML = `
            <div class="paypal-processing-content">
                <div class="spinner"></div>
                <p id="processing-status">正在处理付款...</p>
                <button id="cancel-paypal-btn" class="btn btn-danger">取消支付</button>
            </div>
        `;
        document.body.appendChild(processingUI);
        
        // 添加取消按钮事件
        document.getElementById('cancel-paypal-btn').addEventListener('click', cancelPayPalPayment);
    } else {
        processingUI.style.display = 'flex';
    }
}

// 隐藏处理中UI并恢复按钮
function hidePayPalProcessingUI() {
    const processingUI = document.getElementById('paypal-processing-ui');
    if (processingUI) {
        processingUI.style.display = 'none';
    }
    
    // 恢复PayPal按钮
    const paypalButtonContainer = document.getElementById('paypal-button-container');
    if (paypalButtonContainer) {
        paypalButtonContainer.style.display = 'block';
        // 重新初始化PayPal按钮
        initPayPalButton();
    }
}

/**
 * 显示消息提示
 * @param {string} message 消息文本
 * @param {string} type 消息类型 ('info', 'error', 'success', 'warning')
 */
function showMessage(message, type = 'info') {
    console.log(`===DEBUG=== 显示消息: ${message}, 类型: ${type}`);
    
    // 移除之前的消息
    const previousMessage = document.getElementById('message-container');
    if (previousMessage) {
        previousMessage.remove();
    }
    
    // 创建新的消息元素
    const messageDiv = document.createElement('div');
    messageDiv.id = 'message-container';
    messageDiv.className = `message ${type}-message`;
    messageDiv.textContent = message;
    
    // 添加到页面
    const messageContainer = document.getElementById('message');
    if (messageContainer) {
        messageContainer.appendChild(messageDiv);
    } else {
        // 如果没有特定的消息容器，添加到body
        document.body.appendChild(messageDiv);
    }
    
    // 显示支付取消UI (如果是取消消息)
    if (message.toLowerCase().includes('cancel')) {
        const paymentCancelled = document.getElementById('payment-cancelled');
        if (paymentCancelled) {
            paymentCancelled.style.display = 'block';
        }
        
        // 隐藏其他支付相关UI
        const processingContainer = document.getElementById('paypal-processing-container');
        if (processingContainer) {
            processingContainer.style.display = 'none';
        }
        
        const paymentSuccess = document.getElementById('payment-success');
        if (paymentSuccess) {
            paymentSuccess.style.display = 'none';
        }
    }
    
    // 5秒后自动隐藏
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 500);
    }, 5000);
}

/**
 * 取消PayPal支付
 */
async function cancelPayPalPayment(isWindowClosing = false) {
    const timestamp = new Date().toISOString();
    console.log('===DEBUG=== 开始取消PayPal支付', timestamp, 'isWindowClosing=', isWindowClosing);
    console.log('===DEBUG=== 取消前状态:', JSON.stringify({
        paymentCancelled,
        paymentCompleted,
        paypalOrderCreated,
        localStorageCancelled: localStorage.getItem('paymentCancelledAt'),
        sessionCompleted: sessionStorage.getItem('paymentCompleted'),
        statusCheckActive: window.paypalStatusCheckActive,
        hasStatusCheckInterval: !!window.paypalStatusCheckInterval
    }));
    
    // 设置取消标志，防止状态检查误判
    window.paymentCancelled = true;
    localStorage.setItem('paymentCancelledAt', Date.now().toString());
    console.log('===DEBUG=== 已设置取消标志 paymentCancelled=true');
    
    // 立即停止任何状态检查
    if (window.paypalStatusCheckInterval) {
        console.log('===DEBUG=== 取消操作立即停止支付状态检查, intervalId=' + window.paypalStatusCheckInterval);
        clearInterval(window.paypalStatusCheckInterval);
        window.paypalStatusCheckInterval = null;
        window.paypalStatusCheckActive = false;
        console.log('===DEBUG=== 状态检查已停止');
    } else {
        console.log('===DEBUG=== 无状态检查定时器需要停止');
    }
    
    // 获取支付意向ID和订单ID
    const paymentIntentId = document.getElementById('payment-intent-id')?.value 
                           || localStorage.getItem('paymentIntentId')
                           || sessionStorage.getItem('currentPaymentIntentId');
    
    console.log('===DEBUG=== 获取的支付意向ID:', paymentIntentId, 
                '来源:', 
                document.getElementById('payment-intent-id')?.value ? 'DOM' : 
                (localStorage.getItem('paymentIntentId') ? 'localStorage' : 
                (sessionStorage.getItem('currentPaymentIntentId') ? 'sessionStorage' : '未找到')));
    
    const orderId = localStorage.getItem('paypalOrderId') 
                   || localStorage.getItem(`paypal_order_${paymentIntentId}`);
    
    console.log('===DEBUG=== 获取的订单ID:', orderId,
                '来源:', 
                localStorage.getItem('paypalOrderId') ? 'localStorage.paypalOrderId' : 
                (localStorage.getItem(`paypal_order_${paymentIntentId}`) ? `localStorage.paypal_order_${paymentIntentId}` : '未找到'));
    
    if (!paymentIntentId) {
        console.error('===DEBUG=== 取消支付失败：找不到支付意向ID');
        showCancelledUI();
        return { success: false, error: 'No payment intent ID found' };
    }
    
    console.log(`===DEBUG=== 取消支付，参数：paymentIntentId=${paymentIntentId}, orderId=${orderId || '无'}`);
    
    // 如果不是因为窗口关闭而取消，则显示处理中状态
    if (!isWindowClosing) {
        console.log('===DEBUG=== 显示取消处理中状态');
        updateProcessingStatus('Cancelling payment...');
    }
    
    // 直接显示取消UI，确保用户立即收到反馈
    const showCancelledUI = () => {
        console.log('===DEBUG=== 显示取消UI');
        hidePayPalProcessingUI();
        showMessage('Payment was cancelled.', 'info');
        const cancelledPaymentId = document.getElementById('cancelled-payment-id');
        if (cancelledPaymentId && paymentIntentId) {
            cancelledPaymentId.textContent = paymentIntentId;
            console.log('===DEBUG=== 已更新取消UI中的支付ID:', paymentIntentId);
        }
        const paymentCancelledElement = document.getElementById('payment-cancelled');
        if (paymentCancelledElement) {
            paymentCancelledElement.style.display = 'block';
            console.log('===DEBUG=== 已显示取消UI元素');
        } else {
            console.log('===DEBUG=== 警告: 未找到取消UI元素');
        }
        console.log('===DEBUG=== 取消UI显示完成');
    };
    
    // 清除支付状态但保持取消标志
    const clearPaymentState = () => {
        console.log('===DEBUG=== 清除支付状态，但保持取消标志');
        // 清除支付ID和订单ID
        localStorage.removeItem('paymentIntentId');
        localStorage.removeItem('paypalOrderId');
        localStorage.removeItem(`paypal_order_${paymentIntentId}`);
        
        // 重置支付相关标志，但保留取消标志
        paymentCompleted = false;
        paypalOrderCreated = false;
        sessionStorage.removeItem('paymentCompleted');
        
        // paymentCancelled 和 localStorage.paymentCancelledAt 保持不变
        console.log('===DEBUG=== 支付状态已清除，取消标志已保留');
    };
    
    // 强制刷新页面/重新加载任务池
    const reloadTaskPool = () => {
        console.log('===DEBUG=== 强制刷新页面，重新加载任务池');
        // 首先尝试刷新支付详情
        try {
            refreshPaymentDetails();
        } catch (e) {
            console.error('===DEBUG=== 刷新支付详情失败:', e);
        }
        
        // 如果在LP页面，重新加载任务池
        if (window.location.pathname.includes('/lp.html')) {
            console.log('===DEBUG=== 在LP页面，准备重新加载任务池');
            setTimeout(() => {
                try {
                    if (typeof loadTaskPool === 'function') {
                        console.log('===DEBUG=== 调用loadTaskPool()重新加载任务池');
                        loadTaskPool();
                    }
                } catch (e) {
                    console.error('===DEBUG=== 重新加载任务池失败:', e);
                }
            }, 500);
        }
        
        // 最后，如果需要可以强制刷新整个页面
        if (isWindowClosing) {
            console.log('===DEBUG=== 窗口关闭中，不强制刷新页面');
        } else {
            console.log('===DEBUG=== 3秒后强制刷新页面');
            setTimeout(() => {
                console.log('===DEBUG=== 执行页面刷新');
                window.location.reload();
            }, 3000);
        }
    };
    
    // 最多尝试3次
    let attempts = 0;
    const maxAttempts = 3;
    
    console.log('===DEBUG=== 开始取消API调用，最多尝试' + maxAttempts + '次');
    while (attempts < maxAttempts) {
        attempts++;
        try {
            // 调用取消API - 确保路径正确
            console.log(`===DEBUG=== 取消支付 - 尝试 ${attempts}/${maxAttempts}`);
            
            // 构建API请求体
            const requestBody = {
                paymentIntentId,
                orderId
            };
            
            // 修复API路径，去掉重复的/api前缀
            const cancelEndpoint = `${API_BASE_URL}/payment/paypal/cancel-order`;
            console.log(`===DEBUG=== 发送取消请求到 ${cancelEndpoint}，请求体:`, JSON.stringify(requestBody));
            
            const response = await fetch(cancelEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            // 记录响应状态码
            console.log(`===DEBUG=== 取消API响应状态码: ${response.status}`);
            
            // 解析响应JSON
            const data = await response.json();
            console.log('===DEBUG=== 取消支付响应:', JSON.stringify(data));
            
            if (!response.ok) {
                const errorMessage = data.message || `Failed to cancel payment: ${response.status}`;
                console.error('===DEBUG=== 取消API调用失败:', errorMessage);
                throw new Error(errorMessage);
            }
            
            // 显示取消消息
            if (!isWindowClosing) {
                console.log('===DEBUG=== 取消API成功，显示取消UI');
                showCancelledUI();
            } else {
                console.log('===DEBUG=== 取消API成功，但不显示取消UI因为isWindowClosing=true');
            }
            
            // 清除支付状态但保持取消标志
            clearPaymentState();
            
            // 强制刷新页面/重新加载任务池
            reloadTaskPool();
            
            console.log('===DEBUG=== 取消支付操作成功完成');
            return { success: true, data };
            
        } catch (error) {
            console.error(`===DEBUG=== 取消支付尝试 ${attempts} 失败:`, error);
            
            if (attempts >= maxAttempts) {
                console.log('===DEBUG=== 达到最大尝试次数，停止尝试取消');
                // 即使API调用失败，也显示取消UI
                showCancelledUI();
                
                // 清除支付状态但保持取消标志
                clearPaymentState();
                
                // 即使API调用失败，也强制刷新页面/重新加载任务池
                console.log('===DEBUG=== API取消失败，但仍会刷新页面确保状态同步');
                reloadTaskPool();
                
                return { success: false, error: error.message };
            }
            
            // 等待一段时间后重试
            console.log(`===DEBUG=== 等待1秒后重试取消操作`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

/**
 * 获取当前连接的钱包地址
 */
function getUserWalletAddress() {
    // 如果已经有获取钱包地址的方法，使用现有方法
    if (typeof contractService !== 'undefined' && contractService.getWalletAddress) {
        return contractService.getWalletAddress();
    }
    
    // 否则从UI中获取
    const walletAddressElement = document.getElementById('wallet-address');
    if (walletAddressElement && walletAddressElement.textContent) {
        const address = walletAddressElement.textContent.trim();
        // 检查是否看起来像一个有效的地址
        if (address.startsWith('0x') && address.length >= 10) {
            return address;
        }
    }
    
    return null;
}

/**
 * 检查是否有未完成的PayPal支付
 */
function checkPendingPayPalPayment(paymentId) {
    try {
        // 检查是否已取消
        const paymentCancelledAt = localStorage.getItem('paymentCancelledAt');
        if (paymentCancelledAt) {
            console.log('===DEBUG=== 检测到支付已被取消，不重启状态检查');
            return;
        }

        // 从localStorage中获取PayPal订单ID
        const paypalOrderId = localStorage.getItem('paypal_order_' + paymentId);
        
        // 如果有PayPal订单ID，表示之前的支付流程未完成
        if (paypalOrderId && paymentData && (paymentData.status === 'created' || paymentData.status === 'processing')) {
            console.log('===DEBUG=== 检测到未完成的PayPal支付，开始状态检查...');
            
            // 自动选择PayPal支付方式
            const paymentMethodSelect = document.getElementById('payment-method');
            if (paymentMethodSelect) {
                paymentMethodSelect.value = 'paypal';
                // 触发change事件以显示PayPal按钮
                paymentMethodSelect.dispatchEvent(new Event('change'));
            }
            
            // 开始检查支付状态
            startPayPalStatusCheck(paypalOrderId);
        }
    } catch (error) {
        console.error('===DEBUG=== 检查未完成PayPal支付错误:', error);
    }
}

/**
 * 检查钱包是否已连接
 */
function isWalletConnected() {
    // 如果有contractService.isConnected方法，使用它
    if (typeof contractService !== 'undefined' && typeof contractService.isConnected === 'function') {
        return contractService.isConnected();
    }
    
    // 否则检查UI元素
    const walletConnected = document.getElementById('wallet-connected');
    const walletAddress = document.getElementById('wallet-address');
    
    return walletConnected && 
           !walletConnected.classList.contains('hidden') && 
           walletAddress && 
           walletAddress.textContent && 
           walletAddress.textContent.trim().startsWith('0x');
}

async function createPaymentIntent(amount, platform, qrData) {
  try {
    // 解析二维码数据
    const qrInfo = parseQRCodeData(qrData);
    
    // 准备创建支付意图的数据
    const data = {
      amount: parseFloat(amount),
      platform: platform,
      description: `Payment to merchant ${qrInfo.merchantId || 'Unknown'}`,
      currency: 'USD'
    };

    // 如果是PayPal支付，添加商家PayPal邮箱
    if (platform === 'PayPal' && qrInfo.paypalEmail) {
      data.merchantPaypalEmail = qrInfo.paypalEmail;
    } else if (platform === 'PayPal') {
      throw new Error('PayPal支付需要商家的PayPal邮箱');
    }

    const response = await fetch('/api/payment-intents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || '创建支付意图失败');
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('创建支付意图时出错:', error);
    showError(error.message || '创建支付意图失败，请重试');
    throw error;
  }
}

// 解析二维码数据
function parseQRCodeData(qrData) {
  try {
    // 假设二维码数据是URL格式或JSON格式
    if (qrData.startsWith('http')) {
      // 解析URL参数
      const url = new URL(qrData);
      return {
        merchantId: url.searchParams.get('merchantId'),
        paypalEmail: url.searchParams.get('paypalEmail'),
        platform: url.searchParams.get('platform')
      };
    } else {
      // 尝试解析JSON
      return JSON.parse(qrData);
    }
  } catch (error) {
    console.error('解析二维码数据失败:', error);
    throw new Error('无效的二维码数据格式');
  }
}

function fetchMerchantInfo(paymentIntentId) {
  fetch(`/api/payment/paypal/merchant-info/${paymentIntentId}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch merchant info');
      }
      return response.json();
    })
    .then(data => {
      if (data.merchantPaypalEmail) {
        document.getElementById('merchant-paypal-email').textContent = data.merchantPaypalEmail;
        document.getElementById('merchant-paypal-email-container').classList.remove('d-none');
      }
    })
    .catch(error => {
      console.error('Error fetching merchant info:', error);
    });
}

function setupPaymentDetailsPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const paymentIntentId = urlParams.get('id');
  
  if (paymentIntentId) {
    fetchPaymentDetails(paymentIntentId);
    fetchMerchantInfo(paymentIntentId);
  }
  // ... existing code ...
}

/**
 * 开始自动检查PayPal支付状态
 */
function startPayPalStatusCheck(orderId, checkIntervalMs = 5000, maxCheckTimeMs = 60000) {
    const startTimestamp = new Date().toISOString();
    console.log('===DEBUG=== 开始PayPal状态检查', startTimestamp);
    
    // 首先检查是否已被取消 - 这是最高优先级检查
    const isCancelled = paymentCancelled || localStorage.getItem('paymentCancelledAt');
    console.log('===DEBUG=== 状态检查前状态: isCancelled=', isCancelled, 
                'paymentCancelled=', paymentCancelled, 
                'localStorage.paymentCancelledAt=', localStorage.getItem('paymentCancelledAt'),
                'paymentCompleted=', paymentCompleted,
                'sessionStorage.paymentCompleted=', sessionStorage.getItem('paymentCompleted'));
    
    if (isCancelled) {
        console.log('===DEBUG=== [CRITICAL] 检测到支付已被取消，拒绝启动状态检查');
        hidePayPalProcessingUI();
        const cancelledUI = document.getElementById('payment-cancelled');
        if (cancelledUI) cancelledUI.style.display = 'block';
        return;
    }
    
    // 保存支付信息到localStorage
    const paymentIntentId = document.getElementById('payment-intent-id')?.value 
        || sessionStorage.getItem('currentPaymentIntentId') 
        || localStorage.getItem('paymentIntentId');
    
    if (!paymentIntentId) {
        console.error('===DEBUG=== [CRITICAL] 无法找到支付意向ID，无法进行状态检查');
        return;
    }
    
    console.log('===DEBUG=== 使用paymentIntentId:', paymentIntentId, 'orderId:', orderId);
    
    if (orderId) {
        localStorage.setItem('paypalOrderId', orderId);
    } else {
        orderId = localStorage.getItem('paypalOrderId');
        if (!orderId) {
            console.error('===DEBUG=== [CRITICAL] 无法找到PayPal订单ID，无法进行状态检查');
            return;
        }
    }
    
    // 设置活动标志以避免重复检查
    if (window.paypalStatusCheckActive) {
        console.log('===DEBUG=== 状态检查已在运行中，不重复启动');
        return;
    }
    
    // 打印开始状态检查的关键标志
    console.log('===DEBUG=== [CRITICAL] 状态检查启动前关键状态:', 
                'paymentCancelled=', paymentCancelled,
                'localStorage.paymentCancelledAt=', localStorage.getItem('paymentCancelledAt'));
    
    // 再次检查是否被取消 (双重检查保险)
    if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
        console.log('===DEBUG=== [CRITICAL] 双重检查确认支付已被取消，拒绝启动状态检查');
        hidePayPalProcessingUI();
        const cancelledUI = document.getElementById('payment-cancelled');
        if (cancelledUI) cancelledUI.style.display = 'block';
        return;
    }
    
    window.paypalStatusCheckActive = true;
    localStorage.setItem('paymentIntentId', paymentIntentId);
    
    // 设置当前检查的ID，用于检测过时的检查
    const checkId = Date.now().toString();
    window.currentPaypalStatusCheckId = checkId;
    console.log(`===DEBUG=== [CRITICAL] 创建新的状态检查ID=${checkId}`);
    
    // 开始时间
    const startTime = Date.now();
    let checksCount = 0;
    
    // 清除任何可能存在的旧定时器
    if (window.paypalStatusCheckInterval) {
        console.log('===DEBUG=== 清除旧的状态检查定时器');
        clearInterval(window.paypalStatusCheckInterval);
        window.paypalStatusCheckInterval = null;
    }
    
    // 设置定时检查
    window.paypalStatusCheckInterval = setInterval(async () => {
        checksCount++;
        
        // 检查此检查实例是否已过时
        if (window.currentPaypalStatusCheckId !== checkId) {
            console.log(`===DEBUG=== [CRITICAL] 检测到过时的状态检查实例(${checkId})，停止检查`);
            clearInterval(window.paypalStatusCheckInterval);
            window.paypalStatusCheckInterval = null;
            window.paypalStatusCheckActive = false;
            return;
        }
        
        try {
            // 每次检查前都确认是否已被取消 - 关键点1
            console.log(`===DEBUG=== [${checksCount}] 状态检查前检查取消状态: paymentCancelled=`, paymentCancelled, 
                       'localStorage.paymentCancelledAt=', localStorage.getItem('paymentCancelledAt'));
            
            if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                console.log(`===DEBUG=== [CRITICAL] 检查#${checksCount}: 检测到支付已被取消，停止状态检查`);
                clearInterval(window.paypalStatusCheckInterval);
                window.paypalStatusCheckInterval = null;
                window.paypalStatusCheckActive = false;
                
                // 确保取消UI可见
                hidePayPalProcessingUI();
                const cancelledUI = document.getElementById('payment-cancelled');
                if (cancelledUI) cancelledUI.style.display = 'block';
                
                return;
            }
            
            // 检查是否超时
            if (Date.now() - startTime > maxCheckTimeMs) {
                console.log(`===DEBUG=== [${checksCount}] 状态检查超时 (${checksCount} 次检查后)`);
                clearInterval(window.paypalStatusCheckInterval);
                window.paypalStatusCheckInterval = null;
                window.paypalStatusCheckActive = false;
                
                // 最后再次检查取消状态
                if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                    console.log(`===DEBUG=== [CRITICAL] 超时检查发现支付已被取消`);
                    hidePayPalProcessingUI();
                    const cancelledUI = document.getElementById('payment-cancelled');
                    if (cancelledUI) cancelledUI.style.display = 'block';
                    return;
                }
                
                showError('支付状态检查超时。请检查支付历史或联系客服。');
                return;
            }
            
            console.log(`===DEBUG=== [${checksCount}] 发送API请求检查支付状态...`);
            const checkUrl = `${API_BASE_URL}/payment-intents/${paymentIntentId}/status`;
            
            // 再次检查取消状态 - 关键点2：甚至在发送请求前再次检查
            if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                console.log(`===DEBUG=== [CRITICAL] 在发送请求前再次检测到支付已被取消，停止状态检查`);
                clearInterval(window.paypalStatusCheckInterval);
                window.paypalStatusCheckInterval = null;
                window.paypalStatusCheckActive = false;
                
                // 确保取消UI可见
                hidePayPalProcessingUI();
                const cancelledUI = document.getElementById('payment-cancelled');
                if (cancelledUI) cancelledUI.style.display = 'block';
                
                return;
            }
            
            const response = await fetch(checkUrl, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                console.error(`===DEBUG=== [${checksCount}] 状态检查API响应错误:`, response.status);
                throw new Error(`HTTP error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`===DEBUG=== [${checksCount}] 状态检查API响应:`, JSON.stringify(data));
            
            // 再次确认是否已取消 - 关键点3：在处理响应前检查
            // 这里是最重要的检查点，防止响应处理期间状态变化
            if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                console.log(`===DEBUG=== [CRITICAL] 收到响应后发现支付已被取消，忽略响应并停止检查`);
                clearInterval(window.paypalStatusCheckInterval);
                window.paypalStatusCheckInterval = null;
                window.paypalStatusCheckActive = false;
                
                // 确保取消UI可见
                hidePayPalProcessingUI();
                const cancelledUI = document.getElementById('payment-cancelled');
                if (cancelledUI) cancelledUI.style.display = 'block';
                
                return;
            }
            
            // 此时已三重检查取消状态，可以相对安全地处理响应
            if (data.success) {
                const { status } = data.data;
                console.log(`===DEBUG=== [CRITICAL] API返回支付状态: ${status}`);
                
                // 根据支付状态处理
                if (status === 'completed') {
                    console.log(`===DEBUG=== [${checksCount}] 支付状态: 已完成`);
                    
                    // 最后一次检查取消状态 - 关键点4
                    if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
                        console.log(`===DEBUG=== [CRITICAL] 支付状态为已完成但检测到本地取消标志，优先采用取消状态`);
                        clearInterval(window.paypalStatusCheckInterval);
                        window.paypalStatusCheckInterval = null;
                        window.paypalStatusCheckActive = false;
                        
                        // 确保取消UI可见
                        hidePayPalProcessingUI();
                        const cancelledUI = document.getElementById('payment-cancelled');
                        if (cancelledUI) cancelledUI.style.display = 'block';
                        
                        return;
                    }
                    
                    // 达到这里表示确实完成了支付
                    clearInterval(window.paypalStatusCheckInterval);
                    window.paypalStatusCheckInterval = null;
                    window.paypalStatusCheckActive = false;
                    
                    // 设置支付完成标志
                    paymentCompleted = true;
                    sessionStorage.setItem('paymentCompleted', 'true');
                    
                    // 清除取消标志 - 确保状态一致
                    paymentCancelled = false;
                    localStorage.removeItem('paymentCancelledAt');
                    
                    // 显示成功UI
                    showPaymentSuccess();
                    
                } else if (status === 'cancelled') {
                    console.log(`===DEBUG=== [${checksCount}] 支付状态: 已取消`);
                    clearInterval(window.paypalStatusCheckInterval);
                    window.paypalStatusCheckInterval = null;
                    window.paypalStatusCheckActive = false;
                    
                    // 设置取消标志
                    paymentCancelled = true;
                    localStorage.setItem('paymentCancelledAt', Date.now().toString());
                    
                    // 确保取消UI可见
                    hidePayPalProcessingUI();
                    const cancelledUI = document.getElementById('payment-cancelled');
                    if (cancelledUI) cancelledUI.style.display = 'block';
                    
                    showMessage('支付已取消', 'info');
                    
                } else if (status === 'failed') {
                    console.log(`===DEBUG=== [${checksCount}] 支付状态: 失败`);
                    clearInterval(window.paypalStatusCheckInterval);
                    window.paypalStatusCheckInterval = null;
                    window.paypalStatusCheckActive = false;
                    
                    showError('支付失败。请重试或联系客服。');
                    
                } else if (status === 'processing') {
                    console.log(`===DEBUG=== [${checksCount}] 支付状态: 处理中，继续检查`);
                    // 继续检查
                } else {
                    console.log(`===DEBUG=== [${checksCount}] 未处理的支付状态: ${status}`);
                }
            } else {
                // 检查失败 - 继续重试直到超时
                console.error(`===DEBUG=== [${checksCount}] 支付状态检查失败:`, data.message);
            }
        } catch (error) {
            console.error(`===DEBUG=== [${checksCount}] 支付状态检查发生错误:`, error);
            // 错误情况下继续检查，直到超时
        }
    }, checkIntervalMs);
    
    console.log(`===DEBUG=== [CRITICAL] PayPal状态检查已设置, 间隔=${checkIntervalMs}ms, 最大时间=${maxCheckTimeMs}ms, 检查ID=${checkId}`);
}

// 清理非活动支付状态
function clearInactivePaymentState() {
    console.log('===DEBUG=== 开始清理非活动支付状态');
    console.log('===DEBUG=== 清理前状态:', JSON.stringify({
        paymentCancelled,
        paymentCompleted,
        paypalOrderCreated,
        localStorageCancelled: localStorage.getItem('paymentCancelledAt'),
        sessionCompleted: sessionStorage.getItem('paymentCompleted'),
        paymentIntentId: localStorage.getItem('paymentIntentId'),
        paypalOrderId: localStorage.getItem('paypalOrderId')
    }));
    
    // 保留取消状态，但清除其他状态
    const wasCancelled = paymentCancelled || localStorage.getItem('paymentCancelledAt');
    console.log('===DEBUG=== 检测到的取消状态:', wasCancelled);
    
    if (!paymentCompleted) {
        console.log('===DEBUG=== 支付未完成，清除支付相关存储项');
        localStorage.removeItem('paypalOrderId');
        localStorage.removeItem('paymentIntentId');
        sessionStorage.removeItem('currentPaymentIntentId');
        sessionStorage.removeItem('paymentProcessing');
    } else {
        console.log('===DEBUG=== 支付已完成，保留支付相关存储项');
    }
    
    if (!wasCancelled) {
        console.log('===DEBUG=== 未检测到取消状态，清除取消标记');
        localStorage.removeItem('paymentCancelledAt');
    } else {
        console.log('===DEBUG=== 检测到取消状态，保留取消标记');
    }
    
    if (!paymentCompleted) {
        console.log('===DEBUG=== 设置paypalOrderCreated=false');
        paypalOrderCreated = false;
    }
    
    console.log('===DEBUG=== 非活动支付状态清理完成');
    console.log('===DEBUG=== 清理后状态:', JSON.stringify({
        paymentCancelled,
        paymentCompleted,
        paypalOrderCreated,
        localStorageCancelled: localStorage.getItem('paymentCancelledAt'),
        sessionCompleted: sessionStorage.getItem('paymentCompleted'),
        paymentIntentId: localStorage.getItem('paymentIntentId'),
        paypalOrderId: localStorage.getItem('paypalOrderId')
    }));
}

/**
 * 重置支付状态
 */
function resetPaymentState() {
    // 重置所有支付状态变量
    paypalOrderCreated = false;
    paymentCancelled = false;
    paymentCompleted = false;
    
    // 清除会话存储
    sessionStorage.removeItem('paymentCompleted');
    sessionStorage.removeItem('paymentProcessing');
    sessionStorage.removeItem('handleClosedInProgress');
    
    // 清除本地存储
    localStorage.removeItem('paymentIntentId');
    localStorage.removeItem('paypalOrderId');
    localStorage.removeItem('paymentCancelledAt');
    
    // 清除定时器
    if (window.paypalStatusCheckInterval) {
        clearInterval(window.paypalStatusCheckInterval);
        window.paypalStatusCheckInterval = null;
    }
    
    // 更新UI状态
    hidePayPalProcessingUI();
    console.log('===DEBUG=== 支付状态已重置');
}

/**
 * 显示支付成功UI
 * @param {string} paymentId 支付ID
 */
function showPaymentSuccess(paymentId) {
    // 设置支付完成标志
    paymentCompleted = true;
    sessionStorage.setItem('paymentCompleted', 'true');
    
    // 清除取消标志
    paymentCancelled = false;
    localStorage.removeItem('paymentCancelledAt');
    
    // 显示成功消息
    showMessage('Payment completed successfully!', 'success');
    
    // 更新UI
    const paymentSuccess = document.getElementById('payment-success');
    if (paymentSuccess) {
        paymentSuccess.style.display = 'block';
    }
    
    // 隐藏其他UI元素
    const processingUI = document.getElementById('paypal-processing-ui');
    if (processingUI) {
        processingUI.style.display = 'none';
    }
    
    const paypalButtonContainer = document.getElementById('paypal-button-container');
    if (paypalButtonContainer) {
        paypalButtonContainer.style.display = 'none';
    }
    
    // 刷新支付详情
    setTimeout(() => {
        loadPaymentDetails(paymentId);
    }, 1000);
    
    console.log('===DEBUG=== 支付成功UI已显示');
}

/**
 * 创建PayPal订单
 * @returns {Promise<string>} 返回订单ID
 */
async function createPayPalOrder() {
    const paymentIntentId = document.getElementById('payment-intent-id').value;
    const timestamp = new Date().toISOString();
    console.log('===DEBUG=== createPayPalOrder开始', timestamp);
    console.log('===DEBUG=== paymentIntentId:', paymentIntentId);
    console.log('===DEBUG=== 当前状态:', JSON.stringify({
        paymentCancelled,
        paymentCompleted,
        paypalOrderCreated,
        localStorageCancelled: localStorage.getItem('paymentCancelledAt'),
        sessionCompleted: sessionStorage.getItem('paymentCompleted')
    }));
    
    try {
        // 在创建订单前确保没有被取消
        if (paymentCancelled || localStorage.getItem('paymentCancelledAt')) {
            console.log('===DEBUG=== 检测到支付已被取消，不创建订单');
            throw new Error('Payment was already cancelled');
        }
        
        // 先获取商家信息，确认是否有有效的PayPal邮箱
        console.log('===DEBUG=== 开始获取商家PayPal信息');
        // 修复API路径，确保不包含重复的/api前缀
        const merchantEndpoint = `${API_BASE_URL}/payment/paypal/merchant-info/${paymentIntentId}`;
        console.log('===DEBUG=== 请求商家信息API:', merchantEndpoint);
        const merchantResponse = await fetch(merchantEndpoint);
        if (!merchantResponse.ok) {
            console.error('===DEBUG=== 获取商家信息失败:', merchantResponse.status, merchantResponse.statusText);
            throw new Error(`获取商家信息失败: ${merchantResponse.status}`);
        }
        
        const merchantData = await merchantResponse.json();
        console.log('===DEBUG=== 商家信息响应:', JSON.stringify(merchantData));
        
        if (!merchantData.data || !merchantData.data.email) {
            console.error('===DEBUG=== 商家PayPal邮箱未设置');
            throw new Error('商家PayPal邮箱未设置，无法进行支付');
        }
        
        console.log('===DEBUG=== 获取到商家PayPal邮箱:', merchantData.data.email);
        
        // 显示处理中UI
        console.log('===DEBUG=== 显示处理中UI');
        showPayPalProcessingUI();
        
        // 创建PayPal订单
        console.log('===DEBUG=== 开始创建PayPal订单，请求参数:', JSON.stringify({paymentIntentId}));
        // 修复API路径，确保不包含重复的/api前缀
        const orderEndpoint = `${API_BASE_URL}/payment/paypal/create-order`;
        console.log('===DEBUG=== 请求创建订单API:', orderEndpoint);
        const response = await fetch(orderEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                paymentIntentId: paymentIntentId
            })
        });
        
        if (!response.ok) {
            console.error('===DEBUG=== 创建订单请求失败:', response.status, response.statusText);
            // 尝试获取错误响应的详细信息
            try {
                const errorData = await response.json();
                console.error('===DEBUG=== 服务器返回的错误详情:', errorData);
                throw new Error(`创建PayPal订单失败: ${errorData.message || response.statusText}`);
            } catch (jsonError) {
                throw new Error(`创建PayPal订单失败: ${response.status} ${response.statusText}`);
            }
        }
        
        console.log('===DEBUG=== 创建订单请求成功，解析响应');
        const orderData = await response.json();
        console.log('===DEBUG=== 订单响应数据:', JSON.stringify(orderData));
        
        if (orderData.success) {
            // 标记订单已创建
            console.log('===DEBUG=== 设置paypalOrderCreated=true');
            paypalOrderCreated = true;
            
            // 保存PayPal订单ID到本地存储
            const orderId = orderData.data.paypalOrderId || orderData.data.id;
            localStorage.setItem('paypalOrderId', orderId);
            localStorage.setItem(`paypal_order_${paymentIntentId}`, orderId);
            console.log('===DEBUG=== 已保存订单ID到localStorage:', orderId);
            
            sessionStorage.setItem('paymentProcessing', 'true');
            console.log('===DEBUG=== 已设置sessionStorage.paymentProcessing=true');
            
            return orderId;
        } else {
            console.error('===DEBUG=== PayPal订单创建失败，响应不包含success=true');
            throw new Error(orderData.message || 'PayPal订单创建失败');
        }
    } catch (error) {
        console.error('===DEBUG=== 创建PayPal订单时出错:', error);
        hidePayPalProcessingUI();
        showError('Failed to create PayPal order: ' + error.message);
        throw error;
    }
}

/**
 * 显示信息提示
 * @param {string} message 信息文本
 */
function showInfo(message) {
    showMessage(message, 'info');
}

/**
 * 刷新支付详情
 */
async function refreshPaymentDetails() {
    const timestamp = new Date().toISOString();
    console.log('===DEBUG=== 刷新支付详情开始', timestamp);
    console.log('===DEBUG=== 当前状态:', JSON.stringify({
        paymentCancelled,
        paymentCompleted,
        paypalOrderCreated,
        localStorageCancelled: localStorage.getItem('paymentCancelledAt'),
        sessionCompleted: sessionStorage.getItem('paymentCompleted')
    }));
    
    try {
        // 获取支付ID
        const paymentIntentId = document.getElementById('payment-intent-id')?.value
                                || localStorage.getItem('paymentIntentId')
                                || sessionStorage.getItem('currentPaymentIntentId');
        console.log('===DEBUG=== 用于刷新的支付ID:', paymentIntentId);
        
        if (!paymentIntentId) {
            console.error('===DEBUG=== 刷新失败：找不到支付ID');
            return;
        }
        
        // 调用API获取最新状态
        console.log(`===DEBUG=== 发送获取支付详情请求: /api/payment-intents/${paymentIntentId}`);
        const response = await fetch(`/api/payment-intents/${paymentIntentId}`);
        
        if (!response.ok) {
            console.error('===DEBUG=== 获取支付详情失败, 状态码:', response.status);
            throw new Error('Failed to refresh payment details');
        }
        
        const data = await response.json();
        console.log('===DEBUG=== 获取到最新支付状态:', data.status);
        
        // 更新全局变量
        paymentData = data;
        
        // 更新UI
        updatePaymentDetailsUI(data);
        
        // 如果支付已取消但UI未显示，强制显示取消UI
        if (data.status === 'cancelled' || data.status === 'claimed') {
            if (window.paypalStatusCheckInterval) {
                clearInterval(window.paypalStatusCheckInterval);
                window.paypalStatusCheckInterval = null;
            }
            
            hidePayPalProcessingUI();
            
            if (data.status === 'cancelled') {
                // 显示取消UI
                const paymentCancelledElement = document.getElementById('payment-cancelled');
                if (paymentCancelledElement) {
                    paymentCancelledElement.style.display = 'block';
                }
            } else if (data.status === 'claimed') {
                // 显示认领UI或重新初始化PayPal按钮
                initPayPalButton();
            }
        }
        
        return data;
    } catch (error) {
        console.error('===DEBUG=== 刷新支付详情时出错:', error);
        return null;
    }
}