const { sequelize } = require('../config/database');

const PaymentIntent = require('./payment_intent')(sequelize);

module.exports = {
    sequelize,
    PaymentIntent
}; 