'use strict';

/**
 * Migration: change status column length from 7 to 20 to allow values like 'refunded'
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('payment_intents', 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'created'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('payment_intents', 'status', {
      type: Sequelize.STRING(7),
      allowNull: false,
      defaultValue: 'created'
    });
  }
}; 