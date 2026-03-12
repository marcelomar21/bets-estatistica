-- Migration 053: Atualizar CHECK constraint da tabela notifications
-- Adiciona 6 novos tipos que o TypeScript ja define mas o DB rejeitava
-- Tipos novos: telegram_group_created, telegram_group_failed,
--   telegram_notification_failed, mtproto_session_expired, new_trial, payment_received

BEGIN;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'bot_offline',
    'group_failed',
    'onboarding_completed',
    'group_paused',
    'integration_error',
    'telegram_group_created',
    'telegram_group_failed',
    'telegram_notification_failed',
    'mtproto_session_expired',
    'new_trial',
    'payment_received'
  ));

COMMIT;
