-- Migration 030: Add per-group config columns
-- Date: 2026-02-25
-- Purpose: Support configurable max active bets and copy tone per group

BEGIN;

ALTER TABLE groups ADD COLUMN IF NOT EXISTS max_active_bets INTEGER DEFAULT NULL;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS copy_tone_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN groups.max_active_bets IS 'Max active bets for this group. NULL = use global default (50).';
COMMENT ON COLUMN groups.copy_tone_config IS 'Copy tone/voice config for this group: {tone, persona, forbiddenWords, ctaText, customRules, rawDescription}';

COMMIT;
