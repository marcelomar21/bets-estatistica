-- Migration 033: Post previews table for message preview/edit before sending
-- Date: 2026-02-25
-- Purpose: Store generated message previews so admins can review/edit before posting

BEGIN;

CREATE TABLE IF NOT EXISTS post_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_id TEXT NOT NULL UNIQUE,
  group_id UUID NOT NULL REFERENCES groups(id),
  user_id UUID NOT NULL,
  bets JSONB NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX IF NOT EXISTS idx_post_previews_lookup ON post_previews (preview_id) WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_post_previews_group ON post_previews (group_id, status);

-- RLS
ALTER TABLE post_previews ENABLE ROW LEVEL SECURITY;

-- Super admin can see all previews
CREATE POLICY "post_previews_super_admin_all" ON post_previews
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Group admin can see own group's previews
CREATE POLICY "post_previews_group_admin_own" ON post_previews
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND role = 'group_admin'
      AND group_id = post_previews.group_id
    )
  );

COMMENT ON TABLE post_previews IS 'Stores generated message previews for review before posting to Telegram. TTL 30 minutes.';

COMMIT;
