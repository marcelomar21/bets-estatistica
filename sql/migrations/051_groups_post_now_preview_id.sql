-- Migration 051: Add post_now_preview_id column to groups
-- Date: 2026-03-12
-- Purpose: Store the preview ID when admin triggers "Post Now" via preview flow,
--          so the bot can read saved preview messages instead of regenerating via LLM.

ALTER TABLE groups ADD COLUMN IF NOT EXISTS post_now_preview_id TEXT;

COMMENT ON COLUMN groups.post_now_preview_id IS 'Preview ID linking to post_previews.preview_id. When set with post_now_requested_at, bot uses saved preview text instead of LLM. Cleared after posting.';
