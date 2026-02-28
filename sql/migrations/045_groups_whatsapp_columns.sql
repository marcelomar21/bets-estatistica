-- Migration 045: Add WhatsApp columns to groups table (Epic 13, Story 13-1)
-- Enables multi-channel support: groups can have Telegram, WhatsApp, or both.

BEGIN;

-- WhatsApp group JID (e.g. 120363xxxxx@g.us)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS whatsapp_group_jid TEXT;

-- Channels array — default to ['telegram'] for all existing groups
ALTER TABLE groups ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT ARRAY['telegram']::TEXT[];

COMMIT;
