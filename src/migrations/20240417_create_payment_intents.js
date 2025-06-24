const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        /*
        await queryInterface.createTable('payment_intents', {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            amount: {
                type: DataTypes.DECIMAL(20, 8),
                allowNull: false
            },
            currency: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'USD'
            },
            platform: {
                type: DataTypes.STRING,
                allowNull: false
            },
            userWalletAddress: {
                type: DataTypes.STRING,
                allowNull: false
            },
            merchantPaypalEmail: {
                type: DataTypes.STRING,
                allowNull: true
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            status: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'created'
            },
            statusHistory: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: []
            },
            expiresAt: {
                type: DataTypes.DATE,
                allowNull: false
            },
            lpAddress: {
                type: DataTypes.STRING,
                allowNull: true
            },
            lockedAmount: {
                type: DataTypes.DECIMAL(20, 8),
                allowNull: true
            },
            lockTime: {
                type: DataTypes.DATE,
                allowNull: true
            },
            autoReleaseTime: {
                type: DataTypes.DATE,
                allowNull: true
            },
            withdrawalTime: {
                type: DataTypes.DATE,
                allowNull: true
            },
            escrowStatus: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: null
            },
            escrowTxHash: {
                type: DataTypes.STRING,
                allowNull: true
            },
            createdAt: {
                type: DataTypes.DATE,
                allowNull: false
            },
            updatedAt: {
                type: DataTypes.DATE,
                allowNull: false
            }
        });

        // 添加索引
        await queryInterface.addIndex('payment_intents', ['userWalletAddress']);
        await queryInterface.addIndex('payment_intents', ['lpAddress']);
        await queryInterface.addIndex('payment_intents', ['status']);
        */
        
        // 暂时只返回成功，不执行任何操作
        return Promise.resolve();
    },

    down: async (queryInterface, Sequelize) => {
        /*
        await queryInterface.dropTable('payment_intents');
        */
        
        // 暂时只返回成功，不执行任何操作
        return Promise.resolve();
    }
}; 