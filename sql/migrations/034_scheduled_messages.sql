BEGIN;

-- Story 5.1: Tabela scheduled_messages para mensagens avulsas
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  message_text TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  telegram_message_id BIGINT,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for job queries: find pending messages due for sending
CREATE INDEX idx_scheduled_messages_status_scheduled
  ON scheduled_messages (status, scheduled_at)
  WHERE status = 'pending';

-- Index for filtering by group
CREATE INDEX idx_scheduled_messages_group_id
  ON scheduled_messages (group_id);

-- RLS
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY scheduled_messages_super_admin_all ON scheduled_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'super_admin'
    )
  );

-- Group Admin: access own group only
CREATE POLICY scheduled_messages_group_admin ON scheduled_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'group_admin'
      AND admin_users.group_id = scheduled_messages.group_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'group_admin'
      AND admin_users.group_id = scheduled_messages.group_id
    )
  );

COMMIT;
