-- Migration 017: Add payment_rejected notification type
-- Adds 'payment_rejected' to the type constraint

-- Drop existing constraint
ALTER TABLE member_notifications
DROP CONSTRAINT IF EXISTS member_notifications_type_check;

-- Add updated constraint with payment_rejected
ALTER TABLE member_notifications
ADD CONSTRAINT member_notifications_type_check
CHECK (type IN (
  'trial_reminder',
  'renewal_reminder',
  'farewell',
  'welcome',
  'reactivation',
  'payment_rejected'
));
