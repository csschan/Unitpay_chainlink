const { Sequelize } = require('sequelize');
require('dotenv').config();

// 创建数据库
const createDatabase = async () => {
  try {
    console.log('尝试创建数据库...');
    const tempSequelize = new Sequelize({
      dialect: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Css537048'
    });

    await tempSequelize.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'unitpay'};`);
    await tempSequelize.close();
    console.log('数据库创建成功');
  } catch (error) {
    console.error('创建数据库失败:', error);
    throw error; // 抛出错误以便上层捕获
  }
};

// 创建Sequelize实例
const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Css537048',
  database: process.env.DB_NAME || 'unitpay',
  logging: (msg) => console.log('SQL:', msg),
  define: {
    timestamps: true,
    underscored: false,
  },
  // 为云数据库添加SSL配置
  dialectOptions: process.env.DB_SSL === 'true' ? {
    ssl: {
      rejectUnauthorized: true
    }
  } : {},
  // 添加连接池配置
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  retry: {
    match: [
      /Deadlock/i,
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
      /TimeoutError/
    ],
    max: 3
  }
});

// 测试数据库连接并同步模型
const testConnection = async () => {
  try {
    console.log('测试数据库连接...');
    await sequelize.authenticate();
    console.log('数据库连接成功');
    
    // 同步所有模型 - 禁用 alter 选项，避免自动修改表结构
    console.log('开始同步数据库模型...');
    await sequelize.sync({ alter: false }).catch(error => {
      console.error('数据库模型同步失败，详细错误:', error.message);
      if (error.parent) {
        console.error('原始SQL错误:', error.parent.message);
        console.error('SQL状态码:', error.parent.sqlState);
        console.error('错误码:', error.parent.errno);
        console.error('SQL查询:', error.sql);
      }
      if (error.errors) {
        error.errors.forEach(err => {
          console.error('验证错误:', err.message);
          console.error('验证类型:', err.type);
          console.error('验证路径:', err.path);
          console.error('验证值:', err.value);
        });
      }
      throw error;
    });
    console.log('数据库模型同步成功');
    
    return true;
  } catch (error) {
    console.error('数据库连接或同步失败:', error);
    throw error; // 抛出错误以便上层捕获
  }
};

// 初始化数据库
const initDatabase = async () => {
  try {
    console.log('开始初始化数据库...');
    await createDatabase();
    await testConnection();
    console.log('数据库初始化完成');
    return true;
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  initDatabase
};