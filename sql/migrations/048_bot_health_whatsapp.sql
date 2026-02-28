-- Migration 048: Extend bot_health for WhatsApp heartbeat
-- Adds channel, number_id columns. Changes PK from group_id to UUID id.
-- Architecture decision: reuse bot_health for WhatsApp monitoring (no new table).

BEGIN;

-- 1. Add id column (will become new PK)
ALTER TABLE bot_health ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- 2. Drop existing primary key on group_id
ALTER TABLE bot_health DROP CONSTRAINT IF EXISTS bot_health_pkey;

-- 3. Make id the new primary key
ALTER TABLE bot_health ADD PRIMARY KEY (id);

-- 4. Add channel column (telegram or whatsapp)
ALTER TABLE bot_health ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'telegram';

-- 5. Add number_id for WhatsApp entries (FK to whatsapp_numbers)
ALTER TABLE bot_health ADD COLUMN IF NOT EXISTS number_id UUID REFERENCES whatsapp_numbers(id);

-- 6. Make group_id nullable (WhatsApp pool numbers may have no group)
ALTER TABLE bot_health ALTER COLUMN group_id DROP NOT NULL;

-- 7. Add unique constraint to prevent duplicate entries
-- For telegram: one entry per group (number_id is NULL)
-- For whatsapp: one entry per number_id
CREATE UNIQUE INDEX IF NOT EXISTS bot_health_unique_entry
  ON bot_health (group_id, channel, COALESCE(number_id, '00000000-0000-0000-0000-000000000000'));

-- 8. Add index for querying by channel
CREATE INDEX IF NOT EXISTS bot_health_channel_idx ON bot_health (channel);

-- 9. Add index for querying by number_id
CREATE INDEX IF NOT EXISTS bot_health_number_id_idx ON bot_health (number_id) WHERE number_id IS NOT NULL;

COMMIT;
