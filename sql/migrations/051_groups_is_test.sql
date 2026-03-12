-- Migration 051: Add is_test flag to groups table
-- Prevents test groups from receiving automatic bet distribution

ALTER TABLE groups ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN groups.is_test IS 'When true, group is excluded from automatic bet distribution';
