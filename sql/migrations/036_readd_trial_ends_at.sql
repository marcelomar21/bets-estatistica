-- Migration 036: Re-add trial_ends_at to members table
--
-- Migration 014 removed this column when MP managed trials,
-- but PRD v2 reintroduced internal trial logic (TRIAL_MODE=internal)
-- that needs trial_ends_at to track trial expiration.

ALTER TABLE members ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN members.trial_ends_at IS 'Data de término do trial (trial_started_at + TRIAL_DAYS)';
