const { ethers } = require('ethers');
const { PaymentIntent } = require('../models');
const contractConfig = require('../config/contract.config');
const config = require('../config/config');
const logger = require('../utils/logger');
const unitpayEnhancedAbi = require('../contracts/UnitpayEnhanced.json').abi;

// Add dynamic network selection between 'somnia' and 'sepolia'
const DEFAULT_NETWORK = process.env.BLOCKCHAIN_NETWORK || 'somnia';
const netConfig = contractConfig.networkConfig[DEFAULT_NETWORK] || contractConfig.networkConfig.somnia;

class ContractService {
    constructor() {
        this.initialized = false;
        // Promise to track ongoing initialization
        this.initPromise = null;
        this.provider = null;
        this.contract = null;
        this.usdtContract = null;
        this.escrowContract = null;
        this.adminWallet = null;
        this.unitpayEnhanced = null;
        this.signer = null;
    }

    async initialize() {
        // If already initialized, skip
        if (this.initialized) {
            return true;
        }
        // If initialization is in progress, wait for it
        if (this.initPromise) {
            return this.initPromise;
        }
        // Begin initialization
        this.initPromise = (async () => {
            try {
                logger.info('正在初始化合约服务...');
                // Initialize provider
                this.provider = new ethers.providers.JsonRpcProvider(config.blockchain.rpcUrl);
                // Initialize main contract
                this.contract = new ethers.Contract(
                    netConfig.contractAddress,
                    contractConfig.contractABI,
                    this.provider
                );
                // Initialize USDT contract
                this.usdtContract = new ethers.Contract(
                    netConfig.usdtAddress,
                    contractConfig.usdtABI,
                    this.provider
                );
                // Initialize escrow contract
                this.escrowContract = new ethers.Contract(
                    netConfig.escrowAddress,
                    contractConfig.escrowABI,
                    this.provider
                );
                // Initialize UnitpayEnhanced contract
                try {
                    const privateKey = config.blockchain.privateKey;
                    if (privateKey && ethers.utils.isHexString(privateKey)) {
                        this.signer = new ethers.Wallet(privateKey, this.provider);
                        logger.info(`使用钱包地址: ${this.signer.address}`);
                        const unitpayEnhancedAddress = config.blockchain.unitpayEnhancedAddress;
                        if (unitpayEnhancedAddress) {
                            this.unitpayEnhanced = new ethers.Contract(
                                unitpayEnhancedAddress,
                                unitpayEnhancedAbi,
                                this.signer
                            );
                            logger.info(`已连接到UnitpayEnhanced合约: ${unitpayEnhancedAddress}`);
                        } else {
                            logger.warn('未配置 UnitpayEnhanced 合约地址，跳过合约连接');
                        }
                    } else {
                        logger.info('未配置或无效的 BLOCKCHAIN_PRIVATE_KEY，跳过 UnitpayEnhanced 合约初始化');
                    }
                } catch (err) {
                    logger.warn('UnitpayEnhanced 合约初始化遇到错误，已忽略:', err.message);
                }
                this.initialized = true;
                console.log('ContractService initialized successfully');
                return true;
            } catch (error) {
                console.error('Failed to initialize ContractService:', error);
                // Reset promise to allow retry
                this.initPromise = null;
                throw error;
            }
        })();
        return this.initPromise;
    }

    async ensureInitialized() {
        // 延迟初始化：如果未初始化，则执行初始化
        if (!this.initialized) {
            await this.initialize();
        }
    }

    // 检查USDT授权
    async checkAllowance(userAddress) {
        await this.ensureInitialized();
        
        if (!ethers.utils.isAddress(userAddress)) {
            throw new Error('Invalid user address');
        }

        try {
            const allowance = await this.usdtContract.allowance(
                userAddress,
                netConfig.contractAddress
            );
            return allowance;
        } catch (error) {
            console.error('Failed to check allowance:', error);
            throw error;
        }
    }

    // 处理直接支付
    async handleDirectPayment(paymentIntentId, userAddress, lpAddress, amount) {
        await this.ensureInitialized();
        
        if (!ethers.utils.isAddress(userAddress) || !ethers.utils.isAddress(lpAddress)) {
            throw new Error('Invalid address provided');
        }

        try {
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
            if (!paymentIntent) {
                throw new Error('Payment intent not found');
            }

            // 检查USDT余额
            const balance = await this.usdtContract.balanceOf(userAddress);
            if (balance.lt(amount)) {
                throw new Error('Insufficient USDT balance');
            }

            // 检查授权额度
            const allowance = await this.checkAllowance(userAddress);
            if (allowance.lt(amount)) {
                throw new Error('Insufficient USDT allowance');
            }

            // 调用合约
            const tx = await this.contract.connect(this.provider.getSigner(userAddress))
                .settlePayment(
                    lpAddress,
                    netConfig.usdtAddress,
                    amount,
                    DEFAULT_NETWORK,
                    paymentIntentId
                );

            // 更新支付记录
            await paymentIntent.update({
                status: 'PROCESSING',
                txHash: tx.hash,
                network: DEFAULT_NETWORK
            });

            return tx;
        } catch (error) {
            console.error('Direct payment failed:', error);
            throw error;
        }
    }

    // 处理托管支付
    async handleEscrowPayment(paymentIntentId, userAddress, lpAddress, amount) {
        // 确保合约服务已初始化
        await this.ensureInitialized();
        try {
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
            if (!paymentIntent) {
                throw new Error('Payment intent not found');
            }

            // 计算平台费用并换算为最小单位（含平台费率）
            const platformFee = amount * 0.005; // 0.5%
            const totalAmount = amount + platformFee;
            // 获取USDT精度，若调用 decimals() 失败则使用默认小数位
            let decimals;
            try {
                decimals = await this.usdtContract.decimals();
            } catch (err) {
                logger.warn('===DEBUG=== 获取USDT精度失败，使用网络默认值:', err);
                // Sepolia USDT通常6位，Somnia USDT通常18位
                decimals = DEFAULT_NETWORK === 'sepolia' ? 6 : 18;
            }
            // 格式化为指定小数位字符串
            const totalAmountStr = totalAmount.toFixed(decimals);
            // 转换为链上最小单位
            const payAmount = ethers.utils.parseUnits(totalAmountStr, decimals);

            // 检查USDT余额
            const balance = await this.usdtContract.balanceOf(userAddress);
            if (balance.lt(payAmount)) {
                throw new Error(`Insufficient USDT balance: ${balance.toString()} < required ${payAmount.toString()}`);
            }

            // 使用服务器私钥钱包进行锁定，确保使用 eth_sendRawTransaction
            const contractWithSigner = this.contract.connect(this.signer);
            let gasLimit;
            try {
                gasLimit = await contractWithSigner.estimateGas.lockPayment(
                    lpAddress,
                    netConfig.usdtAddress,
                    payAmount,
                    DEFAULT_NETWORK,
                    paymentIntent.blockchainPaymentId
                );
                // 增加 10% gas 缓冲
                gasLimit = gasLimit.mul(110).div(100);
            } catch (gasError) {
                // gas 估算失败，使用默认 gasLimit 并继续执行
                logger.warn('===DEBUG=== gas 估算失败，使用默认 gasLimit:', config.blockchain.gasLimit, gasError.message);
                gasLimit = ethers.BigNumber.from(config.blockchain.gasLimit);
            }

            // 发起锁定交易，使用区块链支付ID
            const tx = await contractWithSigner.lockPayment(
                lpAddress,
                netConfig.usdtAddress,
                payAmount,
                DEFAULT_NETWORK,
                paymentIntent.blockchainPaymentId,
                { gasLimit }
            );

            // 更新支付记录，仅更新状态和交易哈希
            await paymentIntent.update({
                status: 'PROCESSING',
                transactionHash: tx.hash
            });

            return tx;
        } catch (error) {
            console.error('Escrow payment failed:', error);
            // 如果是 USDT 授权不足错误，提示用户进行授权
            const msg = error.message || '';
            if (msg.includes('insufficient allowance')) {
                throw new Error('Insufficient USDT allowance: 请先在钱包中授权足够的 USDT 后重试');
            }
            throw error;
        }
    }

    // 确认托管支付
    async confirmEscrowPayment(paymentIntentId, userAddress) {
        try {
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
            if (!paymentIntent) {
                throw new Error('Payment intent not found');
            }

            // 调用合约
            const tx = await this.contract.connect(this.provider.getSigner(userAddress))
                .confirmPayment(paymentIntentId);

            // 更新支付记录
            await paymentIntent.update({
                escrowStatus: 'CONFIRMED',
                releaseTime: new Date()
            });

            return tx;
        } catch (error) {
            console.error('Confirm escrow payment failed:', error);
            throw error;
        }
    }

    // LP提现
    async handleWithdrawal(paymentIntentId, lpAddress) {
        try {
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
            if (!paymentIntent) {
                throw new Error('Payment intent not found');
            }

            // 检查是否可以提现
            if (paymentIntent.escrowStatus !== 'CONFIRMED') {
                throw new Error('Payment not confirmed');
            }

            // 检查是否到达T+1时间
            const now = new Date();
            if (now < paymentIntent.withdrawalTime) {
                throw new Error('Not reached withdrawal time');
            }

            // 调用合约
            const tx = await this.contract.connect(this.provider.getSigner(lpAddress))
                .withdrawPayment(paymentIntentId);

            // 更新支付记录
            await paymentIntent.update({
                escrowStatus: 'RELEASED',
                status: 'COMPLETED'
            });

            return tx;
        } catch (error) {
            console.error('Withdrawal failed:', error);
            throw error;
        }
    }

    // 退款托管金额到用户（用户取回过期订单资金）
    async refundPayment(paymentIntentId) {
        await this.ensureInitialized();
        try {
            const tx = await this.contract.connect(this.signer).refundPayment(paymentIntentId);
            return tx;
        } catch (error) {
            console.error('Refund payment failed:', error);
            throw error;
        }
    }

    // 同步交易状态
    async syncTransactionStatus(paymentIntentId) {
        await this.ensureInitialized();
        
        try {
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
            if (!paymentIntent || !paymentIntent.txHash) {
                return;
            }

            const receipt = await this.provider.getTransactionReceipt(paymentIntent.txHash);
            if (!receipt) {
                return; // 交易尚未被确认
            }

            const currentBlock = await this.provider.getBlockNumber();
            const confirmations = currentBlock - receipt.blockNumber;

            if (receipt.status === 1 && confirmations >= 12) { // 等待12个区块确认
                // 交易成功
                if (paymentIntent.paymentType === 'DIRECT') {
                    await paymentIntent.update({
                        status: 'COMPLETED'
                    });
                }
            } else if (receipt.status === 0) {
                // 交易失败
                await paymentIntent.update({
                    status: 'FAILED',
                    failureReason: 'Transaction reverted'
                });
            }
        } catch (error) {
            console.error('Sync transaction status failed:', error);
            throw error;
        }
    }

    /**
     * 检查LP是否已注册PayPal邮箱
     * @param {string} lpWalletAddress - LP的钱包地址
     * @returns {Promise<string>} - 返回注册的PayPal邮箱，如果未注册返回空字符串
     */
    async getLpPaypalEmail(lpWalletAddress) {
        try {
            await this.initialize();
            const email = await this.unitpayEnhanced.lpPaypalEmail(lpWalletAddress);
            return email;
        } catch (error) {
            logger.error(`获取LP PayPal邮箱失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * LP注册PayPal邮箱
     * @param {string} paypalEmail - PayPal邮箱
     * @returns {Promise<Object>} - 交易结果
     */
    async registerLpPaypal(paypalEmail) {
        try {
            await this.initialize();
            
            // 估算Gas费用
            const gasEstimate = await this.unitpayEnhanced.estimateGas.registerLp(paypalEmail);
            
            // 增加20%的Gas作为安全边际
            const adjustedGas = gasEstimate.mul(120).div(100);
            
            // 发送交易
            const tx = await this.unitpayEnhanced.registerLp(paypalEmail, {
                gasLimit: adjustedGas
            });
            
            logger.info(`LP注册PayPal邮箱交易已提交: ${tx.hash}`);
            
            // 等待交易确认
            const receipt = await tx.wait();
            
            logger.info(`LP注册PayPal邮箱交易已确认: ${receipt.transactionHash}`);
            return { 
                success: true, 
                transactionHash: receipt.transactionHash 
            };
        } catch (error) {
            logger.error(`LP注册PayPal邮箱失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 创建支付订单并锁定资金
     * @param {Object} orderData - 订单数据
     * @param {string} orderData.lpAddress - LP地址
     * @param {string} orderData.tokenAddress - 代币地址
     * @param {string} orderData.amount - 金额
     * @param {string} orderData.network - 网络
     * @param {string} orderData.merchantEmail - 商家邮箱
     * @returns {Promise<Object>} - 包含支付ID的结果
     */
    async createOrder(orderData) {
        try {
            await this.initialize();
            
            const { lpAddress, tokenAddress, amount, network, merchantEmail } = orderData;
            
            // 首先批准代币转账
            const tokenContract = new ethers.Contract(
                tokenAddress,
                ['function approve(address spender, uint256 amount) returns (bool)'],
                this.signer
            );
            
            const approveTx = await tokenContract.approve(
                this.unitpayEnhanced.address,
                amount,
                { gasLimit: 100000 }
            );
            
            logger.info(`代币批准交易已提交: ${approveTx.hash}`);
            await approveTx.wait();
            
            // 使用模式二：直接调用锁定支付，将 paymentIntentId 作为链上 paymentId
            const tx = await this.unitpayEnhanced.lockPayment(
                lpAddress,
                tokenAddress,
                amount,
                network,
                orderData.paymentIntentId, // 直接使用数据库里的 payment intent ID
                { gasLimit: 300000 }
            );
            
            logger.info(`支付锁定交易已提交: ${tx.hash}`);
            
            // 等待交易确认
            const receipt = await tx.wait();
            
            logger.info(`支付锁定交易已确认: ${receipt.transactionHash}, paymentId: ${orderData.paymentIntentId}`);
            // 直接返回原始 paymentIntentId 作为链上 paymentId
            return {
                success: receipt.status === 1,
                transactionHash: receipt.transactionHash,
                paymentId: orderData.paymentIntentId
            };
        } catch (error) {
            logger.error(`创建订单失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 提交PayPal订单ID
     * @param {string} paymentId - 支付ID
     * @param {string} paypalOrderId - PayPal订单ID
     * @returns {Promise<Object>} - 交易结果
     */
    async submitPaypalOrderId(paymentId, paypalOrderId) {
        try {
            await this.initialize();
            
            // 发送交易
            const tx = await this.unitpayEnhanced.submitOrderId(
                paymentId, 
                paypalOrderId,
                { 
                    gasLimit: 1000000,
                    maxPriorityFeePerGas: ethers.utils.parseUnits("1.0", "gwei"),
                    maxFeePerGas: ethers.utils.parseUnits("10", "gwei")
                }
            );
            
            logger.info(`提交PayPal订单ID交易已提交: ${tx.hash}`);
            
            // 等待交易确认
            const receipt = await tx.wait();
            
            logger.info(`提交PayPal订单ID交易已确认: ${receipt.transactionHash}`);
            
            return { 
                success: receipt.status === 1, 
                transactionHash: receipt.transactionHash 
            };
        } catch (error) {
            logger.error(`提交PayPal订单ID失败: ${error.message}, ${error.stack}`);
            throw error;
        }
    }

    /**
     * 获取支付的验证状态
     * @param {string} paymentId - 支付ID
     * @returns {Promise<number>} - 验证状态 (0=NONE, 1=PENDING, 2=VERIFIED, 3=FAILED)
     */
    async getVerificationStatus(paymentId) {
        try {
            await this.initialize();
            const status = await this.unitpayEnhanced.verificationStatus(paymentId);
            return status;
        } catch (error) {
            logger.error(`获取验证状态失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取支付详情
     * @param {string} paymentId - 支付ID
     * @returns {Promise<Object>} - 支付详情
     */
    async getPaymentDetails(paymentId) {
        try {
            await this.initialize();
            const payment = await this.unitpayEnhanced.getPaymentByPaymentId(paymentId);
            
            return {
                user: payment.user,
                lp: payment.lp,
                token: payment.token,
                amount: payment.amount.toString(),
                timestamp: new Date(payment.timestamp.toNumber() * 1000),
                lockTime: payment.lockTime.toNumber(),
                releaseTime: payment.releaseTime.toNumber(),
                platformFee: payment.platformFee.toString(),
                paymentId: payment.paymentId,
                network: payment.network,
                paymentType: payment.paymentType,
                escrowStatus: payment.escrowStatus,
                isDisputed: payment.isDisputed
            };
        } catch (error) {
            logger.error(`获取支付详情失败: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new ContractService(); 