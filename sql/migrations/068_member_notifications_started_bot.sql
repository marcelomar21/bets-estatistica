-- Migration 068: add 'started_bot' + 'payment_required' to member_notifications.type CHECK
-- Story: fix(membership) — track /start interactions from existing active/trial members
-- so mass-eviction script can distinguish ghosts (never interacted with bot) from
-- real-but-silent members.
--
-- Also adds 'payment_required' which is already emitted by the /start handler
-- (bot/handlers/startCommand.js:976) but was silently rejected by the old CHECK.
--
-- Additive migration: expands the CHECK domain. No data in existing rows changes.

BEGIN;

ALTER TABLE member_notifications DROP CONSTRAINT IF EXISTS member_notifications_type_check;

ALTER TABLE member_notifications
  ADD CONSTRAINT member_notifications_type_check
  CHECK (type IN (
    'trial_reminder',
    'renewal_reminder',
    'farewell',
    'welcome',
    'reactivation',
    'payment_rejected',
    'kick_warning',
    'started_bot',        -- 068: /start received from existing active/trial member
    'payment_required'    -- 068: already emitted by sendPaymentRequired (previously rejected silently)
  ));

COMMENT ON COLUMN member_notifications.type IS
  'Notification type: trial_reminder, renewal_reminder, welcome, farewell, '
  'reactivation, payment_rejected, kick_warning, started_bot, payment_required.';

COMMIT;

-- Rollback (manual — do not run automatically):
--
-- BEGIN;
--   -- Remove rows using the new types before tightening the CHECK, otherwise the
--   -- constraint re-add will fail.
--   DELETE FROM member_notifications WHERE type IN ('started_bot', 'payment_required');
--
--   ALTER TABLE member_notifications DROP CONSTRAINT IF EXISTS member_notifications_type_check;
--   ALTER TABLE member_notifications
--     ADD CONSTRAINT member_notifications_type_check
--     CHECK (type IN (
--       'trial_reminder',
--       'renewal_reminder',
--       'farewell',
--       'welcome',
--       'reactivation',
--       'payment_rejected',
--       'kick_warning'
--     ));
-- COMMIT;
