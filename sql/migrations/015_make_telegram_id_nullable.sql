-- Migration 015: Make telegram_id nullable
-- Reason: MP flow allows payment before Telegram /start
-- Members can pay via MP checkout before connecting to the bot

ALTER TABLE members ALTER COLUMN telegram_id DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN members.telegram_id IS 'Telegram user ID. Nullable because MP payments can happen before user connects to bot via /start';
