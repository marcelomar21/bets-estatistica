-- Add 'deleted' to groups status check constraint (soft delete support)
ALTER TABLE groups DROP CONSTRAINT groups_status_check;
ALTER TABLE groups ADD CONSTRAINT groups_status_check
  CHECK (status IN ('creating', 'active', 'paused', 'inactive', 'failed', 'deleted'));
