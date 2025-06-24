/**
 * 添加fee_rate字段到lps表
 */
const { sequelize } = require('../config/database');

async function up() {
  try {
    // 检查字段是否已存在
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'lps' 
      AND COLUMN_NAME = 'fee_rate'
    `);
    
    if (results.length === 0) {
      // 字段不存在，添加fee_rate字段
      await sequelize.query(`
        ALTER TABLE lps 
        ADD COLUMN fee_rate FLOAT DEFAULT 0.5
      `);
      console.log('成功添加fee_rate字段到lps表');
    } else {
      console.log('fee_rate字段已存在，无需添加');
    }
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

async function down() {
  try {
    // 检查字段是否存在
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'lps' 
      AND COLUMN_NAME = 'fee_rate'
    `);
    
    if (results.length > 0) {
      // 字段存在，删除fee_rate字段
      await sequelize.query(`
        ALTER TABLE lps 
        DROP COLUMN fee_rate
      `);
      console.log('成功删除fee_rate字段');
    } else {
      console.log('fee_rate字段不存在，无需删除');
    }
  } catch (error) {
    console.error('回滚迁移失败:', error);
    throw error;
  }
}

module.exports = {
  up,
  down
}; 