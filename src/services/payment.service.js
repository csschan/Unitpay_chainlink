const { sequelize } = require('../models');
const { PaymentIntent } = require('../models');
const { Op } = require('sequelize');
const { getWeb3 } = require('../utils/web3');
const { USDT_ABI, USDT_ADDRESS } = require('../config/contract.config');

// 添加托管相关的服务方法
class PaymentService {
    // ... existing methods ...

    // 检查用户USDT余额
    async checkUserBalance(userWalletAddress, amount) {
        try {
            const web3 = await getWeb3();
            const usdtContract = new web3.eth.Contract(USDT_ABI, USDT_ADDRESS);
            const balance = await usdtContract.methods.balanceOf(userWalletAddress).call();
            const balanceInEther = web3.utils.fromWei(balance, 'ether');
            return parseFloat(balanceInEther) >= parseFloat(amount);
        } catch (error) {
            console.error('检查用户余额失败:', error);
            throw new Error('检查用户余额失败');
        }
    }

    // 处理资金锁定
    async handleFundsLock(paymentIntentId, amount, userWalletAddress) {
        const transaction = await sequelize.transaction();
        try {
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId, { transaction });
            if (!paymentIntent) {
                throw new Error('支付意向不存在');
            }

            // 检查余额
            const hasEnoughBalance = await this.checkUserBalance(userWalletAddress, amount);
            if (!hasEnoughBalance) {
                throw new Error('用户USDT余额不足');
            }

            // 更新支付意向状态
            await paymentIntent.update({
                lockedAmount: amount,
                lockTime: new Date(),
                autoReleaseTime: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3小时后
                escrowStatus: 'locked'
            }, { transaction });

            // 添加状态历史记录
            await this.addStatusHistory(paymentIntentId, 'funds_locked', {
                amount: amount,
                lockTime: new Date(),
                autoReleaseTime: new Date(Date.now() + 3 * 60 * 60 * 1000)
            }, transaction);

            await transaction.commit();
            return paymentIntent;
        } catch (error) {
            await transaction.rollback();
            console.error('处理资金锁定失败:', error);
            throw error;
        }
    }

    // 处理资金释放
    async handleFundsRelease(paymentIntentId, isAutoRelease = false) {
        const transaction = await sequelize.transaction();
        try {
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId, { transaction });
            if (!paymentIntent) {
                throw new Error('支付意向不存在');
            }

            if (paymentIntent.escrowStatus !== 'locked') {
                throw new Error('资金状态不正确');
            }

            // 更新支付意向状态
            await paymentIntent.update({
                escrowStatus: 'released',
                withdrawalTime: new Date(Date.now() + 24 * 60 * 60 * 1000) // T+1
            }, { transaction });

            // 添加状态历史记录
            await this.addStatusHistory(paymentIntentId, 'funds_released', {
                isAutoRelease,
                releaseTime: new Date(),
                withdrawalTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }, transaction);

            await transaction.commit();
            return paymentIntent;
        } catch (error) {
            await transaction.rollback();
            console.error('处理资金释放失败:', error);
            throw error;
        }
    }

    // 检查并处理自动释放
    async checkAndHandleAutoRelease() {
        try {
            const lockedPayments = await PaymentIntent.findAll({
                where: {
                    escrowStatus: 'locked',
                    autoReleaseTime: {
                        [Op.lte]: new Date()
                    }
                }
            });

            for (const payment of lockedPayments) {
                await this.handleFundsRelease(payment.id, true);
            }
        } catch (error) {
            console.error('处理自动释放失败:', error);
            throw error;
        }
    }

    // 处理LP提币
    async handleLPWithdrawal(paymentIntentId) {
        const transaction = await sequelize.transaction();
        try {
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId, { transaction });
            if (!paymentIntent) {
                throw new Error('支付意向不存在');
            }

            if (paymentIntent.escrowStatus !== 'released') {
                throw new Error('资金未释放');
            }

            const now = new Date();
            if (now < paymentIntent.withdrawalTime) {
                throw new Error('尚未到达提币时间');
            }

            // 更新支付意向状态
            await paymentIntent.update({
                escrowStatus: 'withdrawn'
            }, { transaction });

            // 添加状态历史记录
            await this.addStatusHistory(paymentIntentId, 'funds_withdrawn', {
                withdrawalTime: new Date()
            }, transaction);

            await transaction.commit();
            return paymentIntent;
        } catch (error) {
            await transaction.rollback();
            console.error('处理LP提币失败:', error);
            throw error;
        }
    }
}

// 创建服务实例
const paymentService = new PaymentService();
module.exports = { paymentService }; 