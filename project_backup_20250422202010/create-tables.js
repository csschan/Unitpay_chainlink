// 创建数据库表的脚本
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

// 读取SQL文件
const sqlFilePath = path.join(__dirname, 'init_mysql.sql');
const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

// 创建Sequelize实例
const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Css537048',
  logging: console.log
});

// 创建数据库
async function createDatabase() {
  try {
    await sequelize.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'unitpay'} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`数据库 ${process.env.DB_NAME || 'unitpay'} 创建成功`);
  } catch (error) {
    console.error('创建数据库失败:', error);
    process.exit(1);
  }
}

// 连接到指定数据库并执行SQL语句
async function createTables() {
  // 先关闭之前的连接
  await sequelize.close();
  
  // 创建新的连接，指定数据库
  const dbSequelize = new Sequelize({
    dialect: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Css537048',
    database: process.env.DB_NAME || 'unitpay',
    logging: console.log
  });

  try {
    // 将SQL文件拆分为单独的语句
    const statements = sqlContent
      .replace(/--.*\n/g, '') // 移除注释
      .split(';')
      .filter(statement => statement.trim() !== '');

    // 逐个执行SQL语句
    for (const statement of statements) {
      if (statement.includes('CREATE DATABASE') || statement.includes('USE')) {
        // 跳过创建数据库和USE语句，因为我们已经连接到指定数据库
        continue;
      }
      await dbSequelize.query(statement + ';');
    }

    console.log('所有数据表创建成功');
  } catch (error) {
    console.error('创建数据表失败:', error);
  } finally {
    await dbSequelize.close();
  }
}

// 执行创建数据库和表的操作
async function main() {
  try {
    await createDatabase();
    await createTables();
    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}

main();