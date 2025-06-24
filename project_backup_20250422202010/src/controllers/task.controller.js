const Task = require('../models/mysql/Task');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

class TaskController {
  // 创建新任务
  async createTask(type, data, timeout = 300000) {
    try {
      const task = await Task.create({
        type,
        data,
        processingTimeout: timeout
      });
      logger.info(`Created new task: ${task.id} of type: ${type}`);
      return task;
    } catch (error) {
      logger.error('Error creating task:', error);
      throw error;
    }
  }

  // 更新任务状态
  async updateTaskStatus(taskId, status, result = null, error = null) {
    try {
      const task = await Task.findByPk(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      const updates = {
        status,
        result,
        error
      };

      if (status === 'processing') {
        updates.startTime = new Date();
      } else if (['completed', 'failed'].includes(status)) {
        updates.endTime = new Date();
      }

      await task.update(updates);
      logger.info(`Updated task ${taskId} status to ${status}`);
      return task;
    } catch (error) {
      logger.error(`Error updating task ${taskId} status:`, error);
      throw error;
    }
  }

  // 检查并处理超时任务
  async handleTimeoutTasks() {
    try {
      const now = new Date();
      const timeoutTasks = await Task.findAll({
        where: {
          status: 'processing',
          startTime: {
            [Op.lt]: new Date(now - 0) // 将在下面动态计算
          }
        }
      });

      for (const task of timeoutTasks) {
        // 使用任务自身的processingTimeout
        const processingTimeout = task.processingTimeout || 300000; // 默认5分钟
        const timeoutDate = new Date(task.startTime.getTime() + processingTimeout);
        
        // 检查是否真的超时
        if (now >= timeoutDate) {
          if (task.retryCount < task.maxRetries) {
            // 重试任务
            await task.update({
              status: 'pending',
              retryCount: task.retryCount + 1,
              startTime: null,
              endTime: null
            });
            logger.info(`Task ${task.id} timed out, retrying (attempt ${task.retryCount + 1})`);
          } else {
            // 超过最大重试次数，标记为失败
            await task.update({
              status: 'failed',
              error: 'Maximum retry attempts exceeded',
              endTime: new Date()
            });
            logger.warn(`Task ${task.id} failed after ${task.maxRetries} retry attempts`);
          }
        }
      }
    } catch (error) {
      logger.error('Error handling timeout tasks:', error);
      throw error;
    }
  }

  // 获取任务状态
  async getTaskStatus(taskId) {
    try {
      const task = await Task.findByPk(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      return {
        id: task.id,
        status: task.status,
        result: task.result,
        error: task.error,
        retryCount: task.retryCount
      };
    } catch (error) {
      logger.error(`Error getting task ${taskId} status:`, error);
      throw error;
    }
  }
}

module.exports = new TaskController(); 