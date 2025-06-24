ALTER TABLE lps
RENAME COLUMN walletAddress TO wallet_address;

-- 更新其他相关表中的字段名
ALTER TABLE payment_intents
RENAME COLUMN lpWalletAddress TO lp_wallet_address,
RENAME COLUMN userWalletAddress TO user_wallet_address;