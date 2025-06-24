/**
 * Database configuration file
 */

const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// MySQL Configuration
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Css537048',
  database: process.env.DB_NAME || 'unitpay_evm',
  dialect: 'mysql'
};

console.log(`===DEBUG=== Connecting to MySQL database: ${config.database}`);

// Create MySQL connection with Sequelize
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: false
    },
    dialectOptions: {
      dateStrings: true,
      typeCast: true
    },
    timezone: '+08:00'
  }
);

// Test MySQL connection
async function testMySQLConnection() {
  try {
    await sequelize.authenticate();
    console.log('MySQL connection has been established successfully.');
    return true;
  } catch (error) {
    console.error('Unable to connect to MySQL database:', error);
    throw error;
  }
}

// Initialize database
async function initDatabase() {
  await testMySQLConnection();
}

// 为了向后兼容
const initDatabases = initDatabase;

module.exports = {
  ...config,
  sequelize,
  initDatabase,
  initDatabases,
  Sequelize
};
