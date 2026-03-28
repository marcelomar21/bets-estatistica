-- Migration 062: Migrate existing bets to bet_group_assignments + dual-write trigger
-- Date: 2026-03-27
-- Purpose: Populate bet_group_assignments from existing suggested_bets that have
--          group_id set, and create a dual-write trigger that keeps suggested_bets
--          in sync when bet_group_assignments is modified.
-- Depends on: 061_bet_group_assignments.sql (GURU-40)
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_sync_bga_to_suggested_bets ON bet_group_assignments;
--   DROP FUNCTION IF EXISTS sync_bga_to_suggested_bets();
--   DELETE FROM bet_group_assignments;

BEGIN;

-- =====================================================
-- 1. BULK DATA MIGRATION: suggested_bets -> bet_group_assignments
-- =====================================================
-- Migrate all bets that have been distributed to a group.
-- Idempotent via ON CONFLICT DO NOTHING.
INSERT INTO bet_group_assignments (
  bet_id,
  group_id,
  posting_status,
  distributed_at,
  post_at,
  telegram_posted_at,
  telegram_message_id,
  odds_at_post,
  generated_copy,
  historico_postagens,
  created_at,
  updated_at
)
SELECT
  sb.id,
  sb.group_id,
  CASE WHEN sb.bet_status = 'posted' THEN 'posted' ELSE 'ready' END,
  COALESCE(sb.distributed_at, sb.created_at),
  sb.post_at,
  sb.telegram_posted_at,
  sb.telegram_message_id,
  sb.odds_at_post,
  sb.generated_copy,
  COALESCE(sb.historico_postagens, '[]'::jsonb),
  sb.created_at,
  now()
FROM suggested_bets sb
WHERE sb.group_id IS NOT NULL
ON CONFLICT (bet_id, group_id) DO NOTHING;

-- =====================================================
-- VERIFICATION (run manually after migration):
--   SELECT COUNT(*) AS sb_count FROM suggested_bets WHERE group_id IS NOT NULL;
--   SELECT COUNT(*) AS bga_count FROM bet_group_assignments;
--   -- Both counts should match
--
--   SELECT sb.id, sb.group_id, sb.bet_status, bga.group_id AS bga_group, bga.posting_status
--   FROM suggested_bets sb
--   JOIN bet_group_assignments bga ON sb.id = bga.bet_id
--   ORDER BY RANDOM()
--   LIMIT 5;
-- =====================================================

-- =====================================================
-- 2. DUAL-WRITE TRIGGER FUNCTION: sync BGA changes back to suggested_bets
-- =====================================================
-- On INSERT/UPDATE: sync posting-related fields to suggested_bets
-- On DELETE: if no assignments remain, clear suggested_bets.group_id
CREATE OR REPLACE FUNCTION sync_bga_to_suggested_bets()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE suggested_bets SET
      group_id = NEW.group_id,
      distributed_at = NEW.distributed_at,
      post_at = NEW.post_at,
      telegram_posted_at = NEW.telegram_posted_at,
      telegram_message_id = NEW.telegram_message_id,
      odds_at_post = NEW.odds_at_post,
      generated_copy = COALESCE(NEW.generated_copy, suggested_bets.generated_copy),
      historico_postagens = COALESCE(NEW.historico_postagens, suggested_bets.historico_postagens)
    WHERE id = NEW.bet_id;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE suggested_bets SET
      group_id = NEW.group_id,
      distributed_at = NEW.distributed_at,
      post_at = NEW.post_at,
      telegram_posted_at = NEW.telegram_posted_at,
      telegram_message_id = NEW.telegram_message_id,
      odds_at_post = NEW.odds_at_post,
      generated_copy = COALESCE(NEW.generated_copy, suggested_bets.generated_copy),
      historico_postagens = COALESCE(NEW.historico_postagens, suggested_bets.historico_postagens)
    WHERE id = NEW.bet_id;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- If no more assignments remain, clear group_id on suggested_bets
    IF NOT EXISTS (
      SELECT 1 FROM bet_group_assignments
      WHERE bet_id = OLD.bet_id AND id != OLD.id
    ) THEN
      UPDATE suggested_bets SET
        group_id = NULL,
        distributed_at = NULL,
        post_at = NULL,
        telegram_posted_at = NULL,
        telegram_message_id = NULL,
        odds_at_post = NULL
      WHERE id = OLD.bet_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. CREATE TRIGGER (AFTER, not BEFORE)
-- =====================================================
-- Created AFTER the bulk insert to avoid triggering during migration
-- DROP first for idempotency (CREATE OR REPLACE not available for triggers)
DROP TRIGGER IF EXISTS trg_sync_bga_to_suggested_bets ON bet_group_assignments;
CREATE TRIGGER trg_sync_bga_to_suggested_bets
  AFTER INSERT OR UPDATE OR DELETE ON bet_group_assignments
  FOR EACH ROW
  EXECUTE FUNCTION sync_bga_to_suggested_bets();

COMMIT;
