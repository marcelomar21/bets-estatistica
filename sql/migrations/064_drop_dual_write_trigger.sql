-- Migration 064: Drop dual-write trigger and deprecate suggested_bets.group_id
-- Date: 2026-03-29
-- Story: GURU-49 (Phase 3.1)
-- Purpose: bet_group_assignments is now the sole source of truth for distribution.
--          Remove the sync trigger, null out group_id values, drop the legacy index,
--          and mark the column as deprecated.
--
-- Rollback:
--   -- Re-create the trigger and function from migration 062
--   -- Re-populate group_id from bet_group_assignments:
--   --   UPDATE suggested_bets sb
--   --     SET group_id = bga.group_id
--   --     FROM bet_group_assignments bga
--   --     WHERE sb.id = bga.bet_id;
--   -- Re-create the index:
--   --   CREATE INDEX idx_suggested_bets_group_id ON suggested_bets(group_id);
--   -- Remove deprecation comment:
--   --   COMMENT ON COLUMN suggested_bets.group_id IS NULL;

BEGIN;

-- 1. Drop the dual-write trigger
DROP TRIGGER IF EXISTS trg_sync_bga_to_suggested_bets ON bet_group_assignments;

-- 2. Drop the trigger function
DROP FUNCTION IF EXISTS sync_bga_to_suggested_bets();

-- 3. Null out all group_id values (junction table is now the source of truth)
UPDATE suggested_bets SET group_id = NULL WHERE group_id IS NOT NULL;

-- 4. Drop the legacy index (no longer needed since group_id is always NULL)
DROP INDEX IF EXISTS idx_suggested_bets_group_id;

-- 5. Mark column as deprecated
COMMENT ON COLUMN suggested_bets.group_id IS 'DEPRECATED since 2026-03-29. Use bet_group_assignments table. Will be dropped in Phase 4.';

COMMIT;
