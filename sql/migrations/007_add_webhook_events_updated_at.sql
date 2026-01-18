-- Migration 007: Add updated_at column to webhook_events
-- Fix: Column was missing but code in process-webhooks.js expects it
-- for detecting stuck events in 'processing' status

-- Add the missing updated_at column
ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;

-- Create trigger to auto-update updated_at on row changes
DROP TRIGGER IF EXISTS trigger_webhook_events_updated_at ON webhook_events;
CREATE TRIGGER trigger_webhook_events_updated_at
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create index for stuck event detection (status = 'processing' and old updated_at)
CREATE INDEX IF NOT EXISTS idx_webhook_processing_updated
ON webhook_events(status, updated_at)
WHERE status = 'processing';

-- Backfill: Set updated_at = created_at for existing rows
UPDATE webhook_events
SET updated_at = COALESCE(processed_at, created_at)
WHERE updated_at IS NULL OR updated_at = NOW();
