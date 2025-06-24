require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { sequelize, PaymentIntent } = require('../models');
const { initDatabase } = require('../config/database');

async function migrateData() {
    try {
        // 读取MongoDB导出的JSON文件
        const dataPath = path.join(__dirname, '../../data/payment_intents.json');
        const jsonData = await fs.readFile(dataPath, 'utf8');
        const mongoPaymentIntents = JSON.parse(jsonData);
        
        console.log(`找到 ${mongoPaymentIntents.length} 条支付意图记录`);

        // 初始化MySQL数据库
        await initDatabase();
        console.log('已连接到MySQL');

        // 迁移数据到MySQL
        for (const mongoIntent of mongoPaymentIntents) {
            await PaymentIntent.create({
                amount: mongoIntent.amount,
                currency: mongoIntent.currency || 'USD',
                platform: mongoIntent.platform,
                userWalletAddress: mongoIntent.user?.walletAddress || mongoIntent.userWalletAddress,
                merchantPaypalEmail: mongoIntent.merchantInfo?.email || mongoIntent.merchantPaypalEmail,
                description: mongoIntent.description || '',
                status: mongoIntent.status || 'created',
                statusHistory: mongoIntent.statusHistory || [],
                expiresAt: mongoIntent.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
                lpAddress: mongoIntent.lp?.walletAddress || mongoIntent.lpAddress,
                createdAt: mongoIntent.createdAt || new Date(),
                updatedAt: mongoIntent.updatedAt || new Date()
            });
        }

        console.log('数据迁移完成');
        process.exit(0);
    } catch (error) {
        console.error('迁移失败:', error);
        process.exit(1);
    }
}

migrateData(); 