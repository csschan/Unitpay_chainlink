const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const PaymentIntent = sequelize.define('PaymentIntent', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        amount: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        currency: {
            type: DataTypes.STRING(10),
            allowNull: true,
            defaultValue: 'CNY'
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        platform: {
            type: DataTypes.ENUM('PayPal', 'GCash', 'Alipay', 'WeChat', 'Other'),
            allowNull: false,
            defaultValue: 'Other'
        },
        merchantInfo: {
            type: DataTypes.JSON,
            allowNull: true
        },
        userWalletAddress: {
            type: DataTypes.STRING(42),
            allowNull: false
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        lpWalletAddress: {
            type: DataTypes.STRING(42),
            allowNull: true
        },
        lpId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'lps',
                key: 'id'
            }
        },
        status: {
            type: DataTypes.ENUM(
                'created', 'claimed', 'paid', 'confirmed', 'settled',
                'cancelled', 'expired', 'failed', 'refunded', 'reversed',
                'processing', 'pending_review'
            ),
            defaultValue: 'created'
        },
        statusHistory: {
            type: DataTypes.JSON,
            allowNull: true
        },
        paymentProof: {
            type: DataTypes.JSON,
            allowNull: true
        },
        settlementTxHash: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: 'settlement_tx_hash'
        },
        blockchainPaymentId: {
            type: DataTypes.STRING(66),
            allowNull: true,
            field: 'blockchain_payment_id',
            comment: '区块链支付ID'
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        errorDetails: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: '存储详细的错误信息'
        },
        processingDetails: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: '存储处理过程中的详细信息'
        },
        merchantPaypalEmail: {
            type: DataTypes.STRING(255),
            allowNull: true,
            comment: '商家PayPal邮箱'
        },
        paymentType: {
            type: DataTypes.ENUM('DIRECT', 'ESCROW'),
            allowNull: false,
            defaultValue: 'DIRECT',
            comment: '支付类型：直接支付/托管支付'
        },
        escrowStatus: {
            type: DataTypes.ENUM('NONE', 'LOCKED', 'CONFIRMED', 'RELEASED', 'REFUNDED'),
            allowNull: false,
            defaultValue: 'NONE',
            comment: '托管状态'
        },
        lockTime: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: '锁定时间'
        },
        releaseTime: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: '释放时间'
        },
        withdrawalTime: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: '提现时间（T+1）'
        },
        txHash: {
            type: DataTypes.STRING(66),
            allowNull: true,
            comment: '交易哈希'
        },
        network: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: 'somnia',
            comment: '网络标识'
        },
        platformFee: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00,
            comment: '平台费用'
        },
        isDisputed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否存在争议'
        },
        fee_rate: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0.5
        },
        fee_amount: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0
        },
        total_amount: {
            type: DataTypes.FLOAT,
            allowNull: true,
            get() {
                const amount = this.getDataValue('amount') || 0;
                const feeAmount = this.getDataValue('fee_amount') || 0;
                return amount + feeAmount;
            }
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        tableName: 'payment_intents',
        timestamps: true
    });

    return PaymentIntent;
}; 