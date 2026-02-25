-- Migration 031: Add result_confidence to suggested_bets
-- Date: 2026-02-25
-- Purpose: Track confidence level of bet result evaluations (high/medium/low)
--          Used by multi-LLM consensus in Phase 3

BEGIN;

ALTER TABLE suggested_bets ADD COLUMN IF NOT EXISTS result_confidence TEXT;

ALTER TABLE suggested_bets ADD CONSTRAINT check_result_confidence
  CHECK (result_confidence IS NULL OR result_confidence IN ('high', 'medium', 'low'));

COMMENT ON COLUMN suggested_bets.result_confidence IS 'Confidence of result evaluation: high (3/3 LLMs agree), medium (2/3), low (divergent/single)';

COMMIT;
