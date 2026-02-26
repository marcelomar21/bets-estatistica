-- Migration 039: Member Cancellation Support (Epic 9, Story 9-1)
-- Adds 'cancelado' status and cancellation tracking fields

-- 1. Drop old CHECK constraint and recreate with 'cancelado'
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check;
ALTER TABLE members ADD CONSTRAINT members_status_check
  CHECK (status IN ('trial', 'ativo', 'inadimplente', 'removido', 'cancelado'));

-- 2. Add cancellation tracking fields
ALTER TABLE members ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES admin_users(id);
