// 验证数据库表是否已成功创建
require('dotenv').config();
const { Sequelize } = require('sequelize');

async function checkTables() {
  const sequelize = new Sequelize({
    dialect: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Css537048',
    database: process.env.DB_NAME || 'unitpay',
    logging: false
  });

  try {
    await sequelize.authenticate();
    console.log('成功连接到数据库');
    
    const [tables] = await sequelize.query("SHOW TABLES;");
    console.log('数据库中的表:');
    tables.forEach(table => {
      console.log(`- ${Object.values(table)[0]}`);
    });

    // 检查每个表的结构
    for (const tableName of ['users', 'lps', 'payment_intents']) {
      const [columns] = await sequelize.query(`DESCRIBE ${tableName};`);
      console.log(`\n表 ${tableName} 的结构:`);
      columns.forEach(column => {
        console.log(`- ${column.Field}: ${column.Type} ${column.Null === 'YES' ? '可为空' : '不可为空'} ${column.Key === 'PRI' ? '(主键)' : ''}`);
      });
    }
  } catch (error) {
    console.error('无法连接到数据库:', error);
  } finally {
    await sequelize.close();
  }
}

checkTables();