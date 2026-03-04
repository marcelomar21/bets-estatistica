-- Migration 050: Add post_now_bet_ids column to groups
-- Date: 2026-03-04
-- Purpose: Store specific bet IDs to post when admin triggers "Post Now",
--          so only the previewed/approved bets are posted instead of ALL eligible bets.

ALTER TABLE groups ADD COLUMN IF NOT EXISTS post_now_bet_ids JSONB;

COMMENT ON COLUMN groups.post_now_bet_ids IS 'Array of bet IDs to post when post_now_requested_at is set. NULL means post all eligible bets (backward compat).';
