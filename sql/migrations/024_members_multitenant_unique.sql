-- Migration 024: Multi-tenant unique constraint for members
-- Story 3.1: Adaptar Registro de Membros para Multi-tenant
--
-- Allows the same telegram_id to exist in different groups.
-- Preserves backward compat: telegram_id is still unique when group_id IS NULL.

-- Remove existing unique constraint on telegram_id
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_telegram_id_key;

-- Drop old index if exists (some setups use index instead of constraint)
DROP INDEX IF EXISTS idx_members_telegram_id;

-- Create composite unique index for multi-tenant (telegram_id + group_id)
-- Only applies when group_id is set (multi-tenant members)
CREATE UNIQUE INDEX idx_members_telegram_group
  ON members (telegram_id, group_id)
  WHERE group_id IS NOT NULL;

-- Preserve uniqueness for single-tenant members (group_id IS NULL)
-- Backward compatible: telegram_id alone must be unique when no group
CREATE UNIQUE INDEX idx_members_telegram_null_group
  ON members (telegram_id)
  WHERE group_id IS NULL;
