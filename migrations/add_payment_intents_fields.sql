-- Migration: add missing columns to payment_intents to support escrow and blockchain fields
ALTER TABLE `payment_intents`
  ADD COLUMN `paymentType` ENUM('DIRECT','ESCROW') NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN `escrowStatus` ENUM('NONE','LOCKED','CONFIRMED','RELEASED','REFUNDED') NOT NULL DEFAULT 'NONE',
  ADD COLUMN `lockTime` DATETIME NULL,
  ADD COLUMN `releaseTime` DATETIME NULL,
  ADD COLUMN `withdrawalTime` DATETIME NULL,
  ADD COLUMN `txHash` VARCHAR(66) NULL,
  ADD COLUMN `network` VARCHAR(255) NOT NULL DEFAULT 'somnia',
  ADD COLUMN `platformFee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `fee_rate` FLOAT NOT NULL DEFAULT 0.5,
  ADD COLUMN `fee_amount` FLOAT NOT NULL DEFAULT 0.00,
  ADD COLUMN `blockchain_payment_id` VARCHAR(66) NULL;

-- Ensure the table uses the correct engine/charset for JSON support (if needed)
ALTER TABLE `payment_intents` ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 