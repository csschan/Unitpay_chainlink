/**
 * 合约控制器
 * 提供合约相关的API
 */

const contractService = require('../services/contract.service');
const { PaymentIntent } = require('../models/mysql');
const { contracts } = require('../config/contracts.config');
const networkConfig = require('../../public/js/network.config');
const { validateUSDTContract } = require('../utils/contract.validator');
const { ethers } = require('ethers');

const contractController = {
    // 获取USDT授权额度
    async getAllowance(req, res) {
        try {
            const { address } = req.params;
            const allowance = await contractService.checkAllowance(address);
            res.json({ allowance: allowance.toString() });
        } catch (error) {
            console.error('获取授权额度失败:', error);
            res.status(500).json({ error: '获取授权额度失败' });
        }
    },

    // 处理直接支付
    async handleDirectPayment(req, res) {
        try {
            const { paymentIntentId, userAddress, lpAddress, amount } = req.body;
            
            // 验证支付意向
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
            if (!paymentIntent) {
                return res.status(404).json({ error: '支付意向不存在' });
            }

            // 调用合约服务
            const tx = await contractService.handleDirectPayment(
                paymentIntentId,
                userAddress,
                lpAddress,
                amount
            );

            res.json({
                success: true,
                txHash: tx.hash,
                message: '支付交易已提交'
            });
        } catch (error) {
            console.error('直接支付失败:', error);
            res.status(500).json({ error: '直接支付失败' });
        }
    },

    // 获取合约信息
    async getContractInfo(req, res) {
        try {
            const config = networkConfig.getNetworkConfig();
            
            return res.status(200).json({
                success: true,
                data: {
                    contractAddress: config.contractAddress,
                    usdtAddress: config.usdtAddress
                }
            });
        } catch (error) {
            console.error('获取合约信息失败:', error);
            return res.status(500).json({
                success: false,
                message: '获取合约信息失败',
                error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
            });
        }
    },

    // 获取结算合约信息
    async getSettlementContractInfo(req, res) {
        try {
            // 根据NETWORK环境变量动态选择网络
            const network = process.env.NETWORK || 'somnia';
            const settlementContractAddress = network === 'sepolia'
                ? process.env.SEPOLIA_SETTLEMENT_CONTRACT_ADDRESS
                : process.env.CONTRACT_ADDRESS;
            const usdtAddress = network === 'sepolia'
                ? process.env.SEPOLIA_USDT_ADDRESS
                : process.env.USDT_ADDRESS;
            const networkInfo = network === 'sepolia'
                ? {
                    name: 'Sepolia Testnet',
                    chainId: '0xaa36a7',
                    rpcUrl: process.env.ALCHEMY_SEPOLIA_RPC_URL || process.env.SEPOLIA_RPC_URL,
                    blockExplorer: process.env.SEPOLIA_EXPLORER_URL || 'https://sepolia.etherscan.io'
                  }
                : {
                    name: 'Somnia Shannon Testnet',
                    chainId: '0xC498',
                    rpcUrl: process.env.SOMNIA_RPC_URL,
                    blockExplorer: process.env.SOMNIA_EXPLORER_URL || 'https://shannon-explorer.somnia.network'
                  };
            return res.status(200).json({
                success: true,
                data: {
                    settlementContractAddress,
                    usdtAddress,
                    network,
                    networkInfo
                }
            });
        } catch (error) {
            console.error('获取结算合约信息失败:', error);
            return res.status(500).json({
                success: false,
                message: '获取结算合约信息失败',
                error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
            });
        }
    },

    // 获取托管合约信息
    async getEscrowContractInfo(req, res) {
        try {
            const info = await contractService.getEscrowContractInfo();
            res.json({ success: true, data: info });
        } catch (error) {
            console.error('获取托管合约信息失败:', error);
            res.status(500).json({ error: '获取托管合约信息失败' });
        }
    },

    // 处理托管支付
    async handleEscrowPayment(req, res) {
        try {
            const { paymentIntentId, userAddress, lpAddress, amount } = req.body;
            
            // 验证支付意向
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
            if (!paymentIntent) {
                return res.status(404).json({ error: '支付意向不存在' });
            }

            // 调用合约服务
            const tx = await contractService.handleEscrowPayment(
                paymentIntentId,
                userAddress,
                lpAddress,
                amount
            );

            res.json({
                success: true,
                txHash: tx.hash,
                message: '托管支付已锁定'
            });
        } catch (error) {
            console.error('托管支付失败:', error);
            res.status(500).json({ error: '托管支付失败' });
        }
    },

    // 确认托管支付
    async confirmEscrowPayment(req, res) {
        try {
            const { paymentIntentId, userAddress } = req.body;
            
            // 验证支付意向
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
            if (!paymentIntent) {
                return res.status(404).json({ error: '支付意向不存在' });
            }

            if (paymentIntent.escrowStatus !== 'LOCKED') {
                return res.status(400).json({ error: '支付状态不正确' });
            }

            // 调用合约服务
            const tx = await contractService.confirmEscrowPayment(
                paymentIntentId,
                userAddress
            );

            res.json({
                success: true,
                txHash: tx.hash,
                message: '托管支付已确认'
            });
        } catch (error) {
            console.error('确认托管支付失败:', error);
            res.status(500).json({ error: '确认托管支付失败' });
        }
    },

    // 处理LP提现
    async handleWithdrawal(req, res) {
        try {
            const { paymentIntentId, lpAddress } = req.body;
            
            // 验证支付意向
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
            if (!paymentIntent) {
                return res.status(404).json({ error: '支付意向不存在' });
            }

            if (paymentIntent.escrowStatus !== 'CONFIRMED') {
                return res.status(400).json({ error: '支付状态不正确' });
            }

            // 检查是否到达提现时间
            if (new Date() < new Date(paymentIntent.withdrawalTime)) {
                return res.status(400).json({ error: '尚未到达提现时间' });
            }

            // 调用合约服务
            const tx = await contractService.handleWithdrawal(
                paymentIntentId,
                lpAddress
            );

            res.json({
                success: true,
                txHash: tx.hash,
                message: '提现交易已提交'
            });
        } catch (error) {
            console.error('提现失败:', error);
            res.status(500).json({ error: '提现失败' });
        }
    },

    // 退款托管金额到用户（用户取回过期订单资金）
    async refundEscrow(req, res) {
        try {
            const { paymentIntentId } = req.body;
            if (!paymentIntentId) {
                return res.status(400).json({ success: false, message: 'paymentIntentId 不能为空' });
            }
            const tx = await contractService.refundPayment(paymentIntentId);
            return res.json({ success: true, txHash: tx.hash });
        } catch (error) {
            console.error('退款失败:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    // 标记订单为已过期并记录链上取回交易哈希
    async expireEscrow(req, res) {
        try {
            const { id } = req.params;
            const { txHash, blockchainPaymentId } = req.body;
            const paymentIntent = await PaymentIntent.findByPk(id);
            if (!paymentIntent) {
                return res.status(404).json({ success: false, message: '支付意向不存在' });
            }
            // 构建新的状态历史
            const newHistory = paymentIntent.addStatusHistory('refunded', '用户取回过期订单资金', { txHash });
            // 更新数据库状态和历史
            await paymentIntent.update({
                status: 'refunded',
                statusHistory: newHistory,
                transactionHash: txHash,
                blockchainPaymentId: blockchainPaymentId
            });
            // 查询并序列化最新记录，避免 reload 引入多余字段
            const refreshed = await PaymentIntent.findByPk(id);
            let serialized;
            try {
                const { serializeModel } = require('../utils/serialization.utils');
                serialized = serializeModel(refreshed);
            } catch (e) {
                serialized = refreshed.toJSON();
            }
            return res.json({ success: true, data: serialized });
        } catch (error) {
            console.error('标记过期订单失败:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    },

    // 获取交易状态
    async getTransactionStatus(req, res) {
        try {
            const { paymentIntentId } = req.params;
            
            const paymentIntent = await PaymentIntent.findByPk(paymentIntentId);
            if (!paymentIntent) {
                return res.status(404).json({ error: '支付意向不存在' });
            }

            // 同步交易状态
            await contractService.syncTransactionStatus(paymentIntentId);

            // 返回最新状态
            res.json({
                status: paymentIntent.status,
                escrowStatus: paymentIntent.escrowStatus,
                txHash: paymentIntent.txHash
            });
        } catch (error) {
            console.error('获取交易状态失败:', error);
            res.status(500).json({ error: '获取交易状态失败' });
        }
    }
};

module.exports = contractController;
