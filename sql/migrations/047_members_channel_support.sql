-- Story 15-1: Multi-channel member support
-- Add channel and channel_user_id columns to members table
-- channel: identifies which platform the member joined from (telegram, whatsapp)
-- channel_user_id: platform-specific identifier (telegram_id for TG, phone E.164 for WA)

-- Add channel column with default 'telegram' for backward compatibility
ALTER TABLE members ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'telegram';

-- Add channel_user_id for platform-specific identifiers
ALTER TABLE members ADD COLUMN IF NOT EXISTS channel_user_id TEXT;

-- Backfill channel_user_id for existing Telegram members
UPDATE members SET channel_user_id = telegram_id::TEXT WHERE channel_user_id IS NULL AND telegram_id IS NOT NULL;

-- Make telegram_id nullable (WhatsApp members won't have one)
ALTER TABLE members ALTER COLUMN telegram_id DROP NOT NULL;

-- Unique constraint: one member per channel per group
-- (allows same person in both telegram and whatsapp for same group)
-- Also serves as the lookup index for getMemberByChannelUserId queries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_unique_channel_group
  ON members (channel_user_id, group_id, channel)
  WHERE channel_user_id IS NOT NULL AND group_id IS NOT NULL;
