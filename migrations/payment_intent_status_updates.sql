-- 更新payment_intents表的status字段类型，增加新的状态值
ALTER TABLE payment_intents 
MODIFY COLUMN status ENUM(
  'created', 
  'claimed', 
  'paid', 
  'confirmed', 
  'settled', 
  'cancelled', 
  'expired', 
  'failed',
  'refunded',
  'reversed',
  'processing',
  'pending_review'
) DEFAULT 'created';

-- 添加新的字段用于错误和处理详情
ALTER TABLE payment_intents 
ADD COLUMN errorDetails JSON DEFAULT NULL COMMENT '存储详细的错误信息',
ADD COLUMN processingDetails JSON DEFAULT NULL COMMENT '存储处理过程中的详细信息'; 