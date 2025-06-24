'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.addColumn('payment_intents', 'blockchain_payment_id', {
      type: Sequelize.STRING(66),
      allowNull: true,
      comment: '区块链支付ID'
    });
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('payment_intents', 'blockchain_payment_id');
  }
}; 