-- Migration 032: Partial index for tracking recovery sweep
-- Date: 2026-02-25
-- Purpose: Optimize the recovery sweep query that finds abandoned bets
--          (posted + pending result + old kickoff)

BEGIN;

CREATE INDEX IF NOT EXISTS idx_bets_tracking_recovery
  ON suggested_bets (bet_status, bet_result)
  WHERE bet_status = 'posted' AND bet_result = 'pending';

COMMENT ON INDEX idx_bets_tracking_recovery IS 'Partial index for recovery sweep: finds posted bets with pending results past the tracking window';

COMMIT;
