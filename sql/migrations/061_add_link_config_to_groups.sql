-- Migration 061: Add link_config JSONB column to groups table
-- Purpose: Store auto-link configuration per group for GURU-4 (automatic deep link generation)
-- Rollback: ALTER TABLE groups DROP COLUMN IF EXISTS link_config;

BEGIN;

ALTER TABLE groups ADD COLUMN IF NOT EXISTS link_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN groups.link_config IS 'Auto-link config: {enabled, templateUrl, templateType, searchUrl, bookmakerName, affiliateTag, overrideManual}';

COMMIT;
