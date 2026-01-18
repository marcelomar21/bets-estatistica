-- Migration 010: Add reactivation notification types
-- Story 16.10: Reativar Membro Removido Após Pagamento
-- Adds 'reactivation' and 'reactivation_join' types to member_notifications constraint

-- Drop existing constraint
ALTER TABLE member_notifications DROP CONSTRAINT IF EXISTS member_notifications_type_check;

-- Add new constraint with reactivation types
ALTER TABLE member_notifications ADD CONSTRAINT member_notifications_type_check
  CHECK (type IN (
    'trial_reminder',
    'renewal_reminder',
    'welcome',
    'farewell',
    'payment_received',
    'reactivation',        -- Story 16.10: Sent when removed member pays and is reactivated
    'reactivation_join'    -- Story 16.10: Logged when reactivated member joins group
  ));

-- Add comments for new types
COMMENT ON COLUMN member_notifications.type IS 'Notification type: trial_reminder, renewal_reminder, welcome, farewell, payment_received, reactivation, reactivation_join';
