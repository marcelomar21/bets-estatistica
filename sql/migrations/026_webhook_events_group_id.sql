-- Migration 026: Add group_id to webhook_events for multi-tenant tracking
-- Story 4.3: Webhook Mercado Pago Multi-tenant
-- Non-breaking: group_id is nullable for backward compatibility with pre-existing events

BEGIN;

-- Add group_id column (nullable - existing rows won't have it)
ALTER TABLE webhook_events
  ADD COLUMN group_id UUID REFERENCES groups(id);

-- Index for filtering/querying events by group
CREATE INDEX idx_webhook_events_group_id
  ON webhook_events(group_id);

COMMIT;
