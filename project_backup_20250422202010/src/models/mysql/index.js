const User = require('./User');
const LP = require('./LP');
const PaymentIntent = require('./PaymentIntent');
const Task = require('./Task');

// 设置模型关联关系
User.hasMany(PaymentIntent, { foreignKey: 'userId' });
PaymentIntent.belongsTo(User, { foreignKey: 'userId' });

LP.hasMany(PaymentIntent, { foreignKey: 'lpId' });
PaymentIntent.belongsTo(LP, { foreignKey: 'lpId' });

module.exports = {
  User,
  LP,
  PaymentIntent,
  Task
};