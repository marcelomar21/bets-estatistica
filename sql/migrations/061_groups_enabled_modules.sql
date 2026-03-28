-- Migration 061: Add enabled_modules column to groups
-- GURU-16: Modularizar funcionalidades por grupo com feature flags
--
-- Modules: analytics, distribution, posting, members, tone
-- Default: all enabled (backwards-compatible)
-- Rollback: ALTER TABLE groups DROP COLUMN enabled_modules;

-- 1. Add column with default (all modules enabled)
ALTER TABLE groups
ADD COLUMN enabled_modules TEXT[] NOT NULL
DEFAULT ARRAY['analytics','distribution','posting','members','tone'];

-- 2. Backfill: groups with is_test=true get limited modules
UPDATE groups
SET enabled_modules = ARRAY['analytics', 'members']
WHERE is_test = true;
