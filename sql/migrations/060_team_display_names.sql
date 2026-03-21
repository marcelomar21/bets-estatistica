-- Migration 060: team_display_names
-- Override de nomes de times para exibição (api_name → display_name)
-- Tabela global (sem group_id)
-- NOTA: Novos times adicionados pelo pipeline diário não entram automaticamente.
--       Re-rodar o seed SQL ou criar um cron/trigger para inserir novos times.

BEGIN;

CREATE TABLE IF NOT EXISTS team_display_names (
  id BIGSERIAL PRIMARY KEY,
  api_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) <= 200),
  is_override BOOLEAN GENERATED ALWAYS AS (api_name IS DISTINCT FROM display_name) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index para queries filtradas por is_override
CREATE INDEX IF NOT EXISTS idx_team_display_names_is_override
  ON team_display_names (is_override) WHERE is_override = true;

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_team_display_names_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_team_display_names_updated_at
  BEFORE UPDATE ON team_display_names
  FOR EACH ROW
  EXECUTE FUNCTION update_team_display_names_updated_at();

-- RLS: proteger acesso direto via PostgREST (F2)
ALTER TABLE team_display_names ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer usuario autenticado pode ler (team names exibidos para todos os admins)
CREATE POLICY team_display_names_select ON team_display_names
  FOR SELECT TO authenticated
  USING (true);

-- INSERT/UPDATE: apenas super_admin pode escrever
CREATE POLICY team_display_names_write ON team_display_names
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Seed: popular com todos os nomes distintos de times existentes
-- display_name começa igual ao api_name; admin edita os que precisam de correção
INSERT INTO team_display_names (api_name, display_name)
SELECT DISTINCT name, name FROM (
  SELECT home_team_name AS name FROM league_matches WHERE home_team_name IS NOT NULL
  UNION
  SELECT away_team_name AS name FROM league_matches WHERE away_team_name IS NOT NULL
) t
ON CONFLICT (api_name) DO NOTHING;

COMMIT;
