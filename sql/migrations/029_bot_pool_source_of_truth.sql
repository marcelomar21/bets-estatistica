-- Migration 029: Make bot_pool the source of truth for Telegram chat IDs
-- Date: 2026-02-25
-- Purpose: Add admin_group_id and public_group_id to bot_pool so it becomes
--          the single source of truth for tokens and chat IDs.
--          groups.bot_token is deprecated in favor of bot_pool.

BEGIN;

ALTER TABLE bot_pool ADD COLUMN IF NOT EXISTS admin_group_id BIGINT;
ALTER TABLE bot_pool ADD COLUMN IF NOT EXISTS public_group_id BIGINT;
ALTER TABLE bot_pool ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Backfill from groups table where possible
UPDATE bot_pool bp
SET admin_group_id = g.telegram_admin_group_id,
    public_group_id = g.telegram_group_id
FROM groups g
WHERE bp.group_id = g.id
  AND bp.admin_group_id IS NULL;

COMMENT ON TABLE bot_pool IS 'Source of truth for Telegram bot tokens and chat IDs. groups.bot_token is deprecated.';
COMMENT ON COLUMN bot_pool.admin_group_id IS 'Telegram chat ID for the admin group';
COMMENT ON COLUMN bot_pool.public_group_id IS 'Telegram chat ID for the public group';

COMMIT;
