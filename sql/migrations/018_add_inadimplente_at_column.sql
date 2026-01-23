-- Migration 018: Add inadimplente_at column and kick_warning notification type
-- Story 16.6: Track when member became inadimplente to implement grace period before kicking

-- Add inadimplente_at column to members table
ALTER TABLE members
ADD COLUMN IF NOT EXISTS inadimplente_at TIMESTAMPTZ;

-- Comment
COMMENT ON COLUMN members.inadimplente_at IS 'Data em que o membro entrou em inadimplencia (para calculo do grace period)';

-- Index for efficient grace period queries
CREATE INDEX IF NOT EXISTS idx_members_inadimplente_at
ON members(inadimplente_at)
WHERE status = 'inadimplente';

-- Backfill: Set inadimplente_at = updated_at for existing inadimplente members
-- (best approximation since we don't have historical data)
UPDATE members
SET inadimplente_at = updated_at
WHERE status = 'inadimplente' AND inadimplente_at IS NULL;

-- Add kick_warning notification type for daily inadimplente warnings
ALTER TABLE member_notifications
DROP CONSTRAINT IF EXISTS member_notifications_type_check;

ALTER TABLE member_notifications
ADD CONSTRAINT member_notifications_type_check
CHECK (type IN (
  'trial_reminder',
  'renewal_reminder',
  'farewell',
  'welcome',
  'reactivation',
  'payment_rejected',
  'kick_warning'
));
