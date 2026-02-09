-- Migration 023: MTProto Sessions, Super Admin Bot Config, and Group Invite Fields
-- Story 2.6: Automação de Grupo Telegram e Convites via MTProto
-- Description: Add tables for MTProto session management, Super Admin Bot configuration,
--              and additional invite fields on groups table. Also expand notification types.

BEGIN;

-- =====================================================
-- 1. NEW TABLE: mtproto_sessions
-- =====================================================
-- Stores encrypted MTProto sessions for founder accounts.
-- Used to create Telegram supergroups and manage invites.
-- Only one active session per phone number.

CREATE TABLE mtproto_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR NOT NULL,
  session_string TEXT NOT NULL,          -- encrypted AES-256-GCM (format: version:iv:authTag:ciphertext)
  key_version INT NOT NULL DEFAULT 1,    -- encryption key version (lazy rotation)
  label VARCHAR NOT NULL,                -- e.g. "founder_marcelo"
  is_active BOOLEAN DEFAULT true,
  requires_reauth BOOLEAN DEFAULT false, -- true when session expired/invalidated
  locked_at TIMESTAMPTZ,                 -- mutex for concurrency (NULL = available)
  locked_by VARCHAR,                     -- identifier of process holding the lock
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                -- estimated session expiration
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(phone_number)                   -- only one session per phone
);

-- =====================================================
-- 2. NEW TABLE: super_admin_bot_config
-- =====================================================
-- Configuration for the dedicated Super Admin notification bot.
-- Separate from pool bots — used to notify founders about new groups/events.

CREATE TABLE super_admin_bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token TEXT NOT NULL,               -- encrypted AES-256-GCM
  bot_username VARCHAR NOT NULL,
  founder_chat_ids JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 3. ALTER TABLE: groups — add invite fields
-- =====================================================

ALTER TABLE groups ADD COLUMN IF NOT EXISTS telegram_invite_link VARCHAR;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS additional_invitee_ids JSONB DEFAULT '[]';
-- additional_invitee_ids: array of {type: "telegram"|"email", value: "chatId or email"}

-- =====================================================
-- 4. RLS POLICIES — super_admin only access
-- =====================================================

ALTER TABLE mtproto_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all_mtproto" ON mtproto_sessions
  FOR ALL USING (public.get_my_role() = 'super_admin');

ALTER TABLE super_admin_bot_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all_bot_config" ON super_admin_bot_config
  FOR ALL USING (public.get_my_role() = 'super_admin');

-- =====================================================
-- 5. INDEXES
-- =====================================================

CREATE INDEX idx_mtproto_sessions_active ON mtproto_sessions(is_active) WHERE is_active = true;
CREATE INDEX idx_mtproto_sessions_locked ON mtproto_sessions(locked_at) WHERE locked_at IS NOT NULL;
CREATE INDEX idx_mtproto_sessions_reauth ON mtproto_sessions(requires_reauth) WHERE requires_reauth = true;

-- =====================================================
-- 6. UPDATE notifications CHECK CONSTRAINT
-- =====================================================
-- Expand accepted notification types to include Telegram-related events.
-- Drop the existing constraint and recreate with new types.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'bot_offline',
    'group_failed',
    'onboarding_completed',
    'group_paused',
    'integration_error',
    'telegram_group_created',
    'telegram_group_failed',
    'telegram_notification_failed',
    'mtproto_session_expired'
  )
);

COMMIT;
