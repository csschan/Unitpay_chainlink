-- 向LP表添加PayPal邮箱字段
ALTER TABLE lps ADD COLUMN paypalEmail VARCHAR(255) DEFAULT ''; 