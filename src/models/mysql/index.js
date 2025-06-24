const User = require('./User');
const LP = require('./LP');
const PaymentIntent = require('./PaymentIntent');
const Task = require('./Task');
const TaskPool = require('./TaskPool');

// 设置模型关联关系
User.hasMany(PaymentIntent, { foreignKey: 'userId' });
PaymentIntent.belongsTo(User, { foreignKey: 'userId' });

LP.hasMany(PaymentIntent, { foreignKey: 'lpId' });
PaymentIntent.belongsTo(LP, { foreignKey: 'lpId' });

// TaskPool关联关系
PaymentIntent.hasOne(TaskPool, { foreignKey: 'paymentIntentId' });
TaskPool.belongsTo(PaymentIntent, { foreignKey: 'paymentIntentId' });

module.exports = {
  User,
  LP,
  PaymentIntent,
  Task,
  TaskPool
};