-- Migration 022: Notifications
-- Story 2.5: Notificacoes e Alertas no Painel
-- Description: Create notifications table for persistent alert system
-- NFR-S5: Retencao de 90 dias via cleanup function

BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR NOT NULL CHECK (type IN ('bot_offline','group_failed','onboarding_completed','group_paused','integration_error')),
  severity VARCHAR NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'success')),
  title VARCHAR NOT NULL,
  message TEXT NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices para queries frequentes
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_read ON notifications(read) WHERE read = false;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_group_id ON notifications(group_id);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- super_admin: full access
CREATE POLICY "notifications_super_admin_all" ON notifications
  FOR ALL USING (
    public.get_my_role() = 'super_admin'
  );

-- group_admin: SELECT only for their group
CREATE POLICY "notifications_group_admin_select" ON notifications
  FOR SELECT USING (
    group_id = public.get_my_group_id()
  );

-- group_admin: UPDATE (mark as read) for their group
CREATE POLICY "notifications_group_admin_update" ON notifications
  FOR UPDATE USING (
    group_id = public.get_my_group_id()
  );

-- Cleanup function for 90-day retention (NFR-S5)
CREATE OR REPLACE FUNCTION cleanup_old_notifications() RETURNS void AS $$
BEGIN
  DELETE FROM notifications WHERE created_at < now() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

COMMIT;
