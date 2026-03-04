-- Migration 049: Group League Preferences
-- Epic 19: Campeonato por Cliente na Distribuição
-- Allows each group to configure which leagues/championships they want in distribution

CREATE TABLE IF NOT EXISTS group_league_preferences (
  id SERIAL PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  league_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, league_name)
);

CREATE INDEX idx_group_league_prefs_group ON group_league_preferences(group_id);
CREATE INDEX idx_group_league_prefs_league ON group_league_preferences(league_name);
CREATE INDEX idx_group_league_prefs_enabled ON group_league_preferences(group_id, enabled);

ALTER TABLE group_league_preferences ENABLE ROW LEVEL SECURITY;

-- super_admin: full access to all preferences
CREATE POLICY group_league_prefs_super_admin ON group_league_preferences
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- group_admin: own group only
CREATE POLICY group_league_prefs_group_admin ON group_league_preferences
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'group_admin' AND group_id = group_league_preferences.group_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'group_admin' AND group_id = group_league_preferences.group_id)
  );
