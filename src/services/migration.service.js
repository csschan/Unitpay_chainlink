const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

class MigrationService {
  /**
   * 执行数据库迁移
   * @param {string} scriptName - 可选，指定要执行的特定迁移脚本
   * @returns {Promise<void>}
   */
  async executeMigrations(scriptName = null) {
    try {
      // 迁移脚本目录
      const migrationsDir = path.join(__dirname, '../../migrations');
      
      // 读取迁移脚本文件
      let migrationFiles = [];
      
      if (scriptName) {
        // 如果指定了特定脚本，只执行该脚本
        const scriptPath = path.join(migrationsDir, scriptName);
        if (fs.existsSync(scriptPath)) {
          migrationFiles = [scriptName];
        } else {
          throw new Error(`迁移脚本 ${scriptName} 不存在`);
        }
      } else {
        // 否则执行所有.sql脚本
        migrationFiles = fs.readdirSync(migrationsDir)
          .filter(file => file.endsWith('.sql'))
          .sort(); // 按字母顺序排序，确保按顺序执行
      }
      
      logger.info(`准备执行 ${migrationFiles.length} 个迁移脚本`);
      
      // 依次执行每个迁移脚本
      for (const file of migrationFiles) {
        logger.info(`执行迁移脚本: ${file}`);
        
        const scriptPath = path.join(migrationsDir, file);
        const sqlScript = fs.readFileSync(scriptPath, 'utf8');
        
        // 分割SQL语句（简单按分号分割）
        const statements = sqlScript.split(';')
          .map(statement => statement.trim())
          .filter(statement => statement.length > 0);
        
        // 执行每个SQL语句
        for (const statement of statements) {
          try {
            if (statement.includes('DELIMITER')) {
              // 处理包含DELIMITER的特殊情况（如触发器）
              // 这里简化处理，实际可能需要更复杂的解析
              const delimiterParts = sqlScript.split('DELIMITER //');
              
              for (let i = 1; i < delimiterParts.length; i++) {
                const triggerPart = delimiterParts[i].split('//')[0];
                if (triggerPart.trim().length > 0) {
                  await sequelize.query(triggerPart);
                  logger.info('已执行触发器语句');
                }
              }
            } else {
              // 执行普通SQL语句
              await sequelize.query(statement);
            }
          } catch (statementError) {
            // 记录语句执行错误，但继续执行其他语句
            logger.error(`执行语句失败: ${statement}`);
            logger.error(statementError);
          }
        }
        
        logger.info(`迁移脚本 ${file} 执行完成`);
      }
      
      logger.info('所有迁移脚本执行完成');
    } catch (error) {
      logger.error('执行迁移脚本时出错:', error);
      throw error;
    }
  }
}

module.exports = new MigrationService(); 