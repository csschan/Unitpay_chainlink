'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /*
    await queryInterface.addColumn('payment_intents', 'lpAddress', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'LP钱包地址'
    });

    await queryInterface.addColumn('payment_intents', 'paymentType', {
      type: Sequelize.ENUM('DIRECT', 'ESCROW'),
      allowNull: false,
      defaultValue: 'DIRECT',
      comment: '支付类型：直接支付/托管支付'
    });

    await queryInterface.addColumn('payment_intents', 'escrowStatus', {
      type: Sequelize.ENUM('NONE', 'LOCKED', 'CONFIRMED', 'RELEASED', 'REFUNDED'),
      allowNull: false,
      defaultValue: 'NONE',
      comment: '托管状态'
    });

    await queryInterface.addColumn('payment_intents', 'lockTime', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '锁定时间'
    });

    await queryInterface.addColumn('payment_intents', 'releaseTime', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '释放时间'
    });

    await queryInterface.addColumn('payment_intents', 'withdrawalTime', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '提现时间（T+1）'
    });

    await queryInterface.addColumn('payment_intents', 'txHash', {
      type: Sequelize.STRING(66),
      allowNull: true,
      comment: '交易哈希'
    });

    await queryInterface.addColumn('payment_intents', 'network', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'somnia',
      comment: '网络标识'
    });

    await queryInterface.addColumn('payment_intents', 'platformFee', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: '平台费用'
    });

    await queryInterface.addColumn('payment_intents', 'isDisputed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否存在争议'
    });

    // 添加索引
    await queryInterface.addIndex('payment_intents', ['lpAddress']);
    await queryInterface.addIndex('payment_intents', ['escrowStatus']);
    await queryInterface.addIndex('payment_intents', ['txHash']);
    */
    
    // 暂时只返回成功，不执行任何操作
    return Promise.resolve();
  },

  down: async (queryInterface, Sequelize) => {
    /*
    // 删除索引
    await queryInterface.removeIndex('payment_intents', ['lpAddress']);
    await queryInterface.removeIndex('payment_intents', ['escrowStatus']);
    await queryInterface.removeIndex('payment_intents', ['txHash']);

    // 删除字段
    await queryInterface.removeColumn('payment_intents', 'lpAddress');
    await queryInterface.removeColumn('payment_intents', 'paymentType');
    await queryInterface.removeColumn('payment_intents', 'escrowStatus');
    await queryInterface.removeColumn('payment_intents', 'lockTime');
    await queryInterface.removeColumn('payment_intents', 'releaseTime');
    await queryInterface.removeColumn('payment_intents', 'withdrawalTime');
    await queryInterface.removeColumn('payment_intents', 'txHash');
    await queryInterface.removeColumn('payment_intents', 'network');
    await queryInterface.removeColumn('payment_intents', 'platformFee');
    await queryInterface.removeColumn('payment_intents', 'isDisputed');
    */
    
    // 暂时只返回成功，不执行任何操作
    return Promise.resolve();
  }
}; 