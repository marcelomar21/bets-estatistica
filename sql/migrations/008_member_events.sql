-- Migration 008: Create member_events table for audit logging
-- Fix: Code in memberEvents.js expects this table but it was never created
-- Issue: "Could not find the table 'public.member_events' in the schema cache"
-- Sprint Change Proposal: 2026-01-18

CREATE TABLE IF NOT EXISTS member_events (
  id SERIAL PRIMARY KEY,
  member_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('join', 'leave', 'kick', 'payment', 'trial_start', 'trial_end', 'reactivate')),
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for querying events by member
CREATE INDEX IF NOT EXISTS idx_member_events_member_id
ON member_events(member_id);

-- Index for querying events by type and date (for analytics)
CREATE INDEX IF NOT EXISTS idx_member_events_type
ON member_events(event_type, created_at DESC);

-- Comments
COMMENT ON TABLE member_events IS 'Audit log de eventos de membros (entrada, saida, pagamento, etc)';
COMMENT ON COLUMN member_events.id IS 'ID do evento';
COMMENT ON COLUMN member_events.member_id IS 'FK para members - membro relacionado ao evento';
COMMENT ON COLUMN member_events.event_type IS 'Tipo: join, leave, kick, payment, trial_start, trial_end, reactivate';
COMMENT ON COLUMN member_events.payload IS 'Dados adicionais do evento em JSON';
COMMENT ON COLUMN member_events.created_at IS 'Data/hora do evento';
