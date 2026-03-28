-- Migration 061: Add link_config JSONB to groups for auto deep link generation (GURU-4)
-- Rollback: ALTER TABLE groups DROP COLUMN IF EXISTS link_config;

ALTER TABLE groups ADD COLUMN IF NOT EXISTS link_config JSONB DEFAULT '{}';

COMMENT ON COLUMN groups.link_config IS 'Auto-link config: {enabled, templateUrl, templateType, searchUrl, bookmakerName, affiliateTag, overrideManual}';
