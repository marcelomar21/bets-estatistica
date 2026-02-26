-- Migration 037: Add operator_username and subscription_price to groups table
--
-- Multi-tenant: each group can have its own operator contact and price.
-- Used by notification messages (trial reminders, kick warnings, farewell).

ALTER TABLE groups ADD COLUMN IF NOT EXISTS operator_username VARCHAR;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS subscription_price VARCHAR;

COMMENT ON COLUMN groups.operator_username IS 'Username Telegram do operador do grupo (sem @)';
COMMENT ON COLUMN groups.subscription_price IS 'Texto do preco da assinatura (ex: R$50/mes)';
