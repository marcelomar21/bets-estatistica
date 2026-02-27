-- Migration 040: Add result_source to suggested_bets
-- Date: 2026-02-27
-- Purpose: Track how bet results were determined (deterministic, llm, consensus, manual)

BEGIN;

ALTER TABLE suggested_bets ADD COLUMN IF NOT EXISTS result_source TEXT;

ALTER TABLE suggested_bets ADD CONSTRAINT check_result_source
  CHECK (result_source IS NULL OR result_source IN ('deterministic', 'llm', 'consensus', 'manual'));

COMMENT ON COLUMN suggested_bets.result_source IS 'How the result was determined: deterministic (score-based), llm (single model), consensus (multi-LLM), manual (admin override)';

-- Backfill from existing result_reason text
UPDATE suggested_bets
SET result_source = CASE
  WHEN result_reason ILIKE '%deterministic%' OR result_reason ILIKE '%score%' THEN 'deterministic'
  WHEN result_reason ILIKE '%consensus%' OR result_reason ILIKE '%multi%' THEN 'consensus'
  WHEN result_reason ILIKE '%manual%' THEN 'manual'
  WHEN result_reason IS NOT NULL AND result_reason != '' THEN 'llm'
  ELSE NULL
END
WHERE bet_result IS NOT NULL AND result_source IS NULL;

COMMIT;
