-- Migration 061: bet_group_assignments (junction table for multi-group distribution)
-- Date: 2026-03-27
-- Purpose: Create junction table that maps suggested_bets to groups, enabling
--          a single bet to be distributed to multiple groups independently.
--          Each assignment tracks its own posting lifecycle (ready/posted/cancelled).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_bet_group_assignments_updated_at ON bet_group_assignments;
--   DROP FUNCTION IF EXISTS update_bet_group_assignments_updated_at();
--   DROP TABLE IF EXISTS bet_group_assignments CASCADE;

BEGIN;

-- =====================================================
-- 1. CREATE TABLE: bet_group_assignments
-- =====================================================
CREATE TABLE bet_group_assignments (
  id BIGSERIAL PRIMARY KEY,
  bet_id BIGINT NOT NULL REFERENCES suggested_bets(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  posting_status TEXT NOT NULL DEFAULT 'ready' CHECK (posting_status IN ('ready', 'posted', 'cancelled')),
  distributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  distributed_by UUID REFERENCES admin_users(id),
  post_at TEXT,
  telegram_posted_at TIMESTAMPTZ,
  telegram_message_id BIGINT,
  odds_at_post NUMERIC(6,2),
  generated_copy TEXT,
  historico_postagens JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. UNIQUE CONSTRAINT: one assignment per bet+group
-- =====================================================
ALTER TABLE bet_group_assignments
  ADD CONSTRAINT uq_bet_group UNIQUE (bet_id, group_id);

-- =====================================================
-- 3. INDEXES
-- =====================================================
CREATE INDEX idx_bga_bet_id ON bet_group_assignments(bet_id);
CREATE INDEX idx_bga_group_id ON bet_group_assignments(group_id);
CREATE INDEX idx_bga_posting_status ON bet_group_assignments(posting_status);

-- =====================================================
-- 4. TRIGGER: auto-update updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_bet_group_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bet_group_assignments_updated_at
  BEFORE UPDATE ON bet_group_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_bet_group_assignments_updated_at();

-- =====================================================
-- 5. ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE bet_group_assignments ENABLE ROW LEVEL SECURITY;

-- super_admin: full CRUD on all assignments
CREATE POLICY "bga_super_admin_all" ON bet_group_assignments
  FOR ALL USING (
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
  );

-- group_admin: SELECT assignments for their group
CREATE POLICY "bga_group_admin_select" ON bet_group_assignments
  FOR SELECT USING (
    group_id = (SELECT group_id FROM admin_users WHERE id = auth.uid())
  );

-- group_admin: UPDATE assignments for their group (e.g. cancel posting)
CREATE POLICY "bga_group_admin_update" ON bet_group_assignments
  FOR UPDATE USING (
    group_id = (SELECT group_id FROM admin_users WHERE id = auth.uid())
  )
  WITH CHECK (
    group_id = (SELECT group_id FROM admin_users WHERE id = auth.uid())
  );

COMMIT;
