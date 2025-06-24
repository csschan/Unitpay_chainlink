const cron = require('node-cron');
const { PaymentIntent } = require('../models/mysql');
const { Op } = require('sequelize');
const contractService = require('./contract.service');

class SchedulerService {
    constructor() {
        this.tasks = [];
    }

    // 启动所有定时任务
    startAllSchedulers() {
        this.startAutoReleaseCheck();
        this.startT1Check();
        this.startStatusSync();
    }

    // 停止所有定时任务
    stopAllSchedulers() {
        this.tasks.forEach(task => task.stop());
        this.tasks = [];
    }

    // 3小时自动释放检查
    startAutoReleaseCheck() {
        const task = cron.schedule('*/10 * * * *', async () => {
            try {
                console.log('开始检查自动释放条件...');
                const lockedPayments = await PaymentIntent.findAll({
                    where: {
                        paymentType: 'ESCROW',
                        escrowStatus: 'LOCKED',
                        lockTime: {
                            [Op.lte]: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3小时前
                        },
                        isDisputed: false
                    }
                });

                console.log(`找到 ${lockedPayments.length} 个需要自动释放的支付`);
                for (const payment of lockedPayments) {
                    try {
                        await contractService.confirmEscrowPayment(
                            payment.id,
                            payment.userId
                        );
                        console.log(`支付 ${payment.id} 已自动释放`);
                    } catch (error) {
                        console.error(`自动释放支付 ${payment.id} 失败:`, error);
                    }
                }
            } catch (error) {
                console.error('自动释放检查失败:', error);
            }
        });

        this.tasks.push(task);
    }

    // T+1时间检查
    startT1Check() {
        const task = cron.schedule('*/5 * * * *', async () => {
            try {
                console.log('开始检查T+1提现条件...');
                const confirmedPayments = await PaymentIntent.findAll({
                    where: {
                        paymentType: 'ESCROW',
                        escrowStatus: 'CONFIRMED',
                        releaseTime: {
                            [Op.lte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24小时前
                        },
                        isDisputed: false
                    }
                });

                console.log(`找到 ${confirmedPayments.length} 个可提现的支付`);
                for (const payment of confirmedPayments) {
                    try {
                        await payment.update({
                            withdrawalTime: new Date()
                        });
                        console.log(`支付 ${payment.id} 已更新为可提现状态`);
                    } catch (error) {
                        console.error(`更新支付 ${payment.id} 提现状态失败:`, error);
                    }
                }
            } catch (error) {
                console.error('T+1检查失败:', error);
            }
        });

        this.tasks.push(task);
    }

    // 交易状态同步
    startStatusSync() {
        const task = cron.schedule('*/1 * * * *', async () => {
            try {
                console.log('开始同步交易状态...');
                const pendingPayments = await PaymentIntent.findAll({
                    where: {
                        status: 'PROCESSING',
                        txHash: {
                            [Op.not]: null
                        }
                    }
                });

                console.log(`找到 ${pendingPayments.length} 个待同步的交易`);
                for (const payment of pendingPayments) {
                    try {
                        await contractService.syncTransactionStatus(payment.id);
                        console.log(`交易 ${payment.txHash} 状态已同步`);
                    } catch (error) {
                        console.error(`同步交易 ${payment.txHash} 状态失败:`, error);
                    }
                }
            } catch (error) {
                console.error('交易状态同步失败:', error);
            }
        });

        this.tasks.push(task);
    }
}

module.exports = new SchedulerService(); 