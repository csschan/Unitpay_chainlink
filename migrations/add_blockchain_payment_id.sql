-- 添加blockchain_payment_id字段到payment_intents表
ALTER TABLE payment_intents ADD COLUMN blockchain_payment_id VARCHAR(64) COMMENT '区块链上使用的支付ID，与数据库ID可能不同';

-- 创建一个触发器，在插入新记录后更新blockchain_payment_id
DELIMITER //
CREATE TRIGGER IF NOT EXISTS update_blockchain_payment_id_after_insert
AFTER INSERT ON payment_intents
FOR EACH ROW
BEGIN
    -- 立即为新记录设置默认blockchain_payment_id
    -- 格式: p{id}_{timestamp}
    UPDATE payment_intents
    SET blockchain_payment_id = CONCAT('p', NEW.id, '_', UNIX_TIMESTAMP())
    WHERE id = NEW.id AND (blockchain_payment_id IS NULL OR blockchain_payment_id = '');
END;
//
DELIMITER ;

-- 更新现有记录的blockchain_payment_id（对于未设置的记录）
UPDATE payment_intents
SET blockchain_payment_id = CONCAT('p', id, '_', UNIX_TIMESTAMP())
WHERE blockchain_payment_id IS NULL OR blockchain_payment_id = '';

-- 创建索引以便快速查询
CREATE INDEX idx_blockchain_payment_id ON payment_intents(blockchain_payment_id); 