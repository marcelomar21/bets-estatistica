-- Migration 035: terms_acceptance table with immutability (D2)
-- Story 3.1: Tabela terms_acceptance com Imutabilidade
-- NFR-S1: Registro de aceite do termo imutável (append-only, sem UPDATE/DELETE)
--
-- Defense in depth: RLS policies block UPDATE/DELETE for dashboard users,
-- and triggers block UPDATE/DELETE even for service_role (bot backend).

BEGIN;

-- =====================================================
-- 1. CREATE TABLE: terms_acceptance
-- =====================================================
CREATE TABLE IF NOT EXISTS terms_acceptance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  group_id UUID REFERENCES groups(id),
  terms_version VARCHAR NOT NULL,
  terms_url TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_metadata JSONB DEFAULT '{}'::jsonb
);

-- =====================================================
-- 2. INDEXES
-- =====================================================
CREATE INDEX idx_terms_acceptance_telegram_group
  ON terms_acceptance(telegram_id, group_id);

-- =====================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE terms_acceptance ENABLE ROW LEVEL SECURITY;

-- Super admin: pode consultar todos os aceites (auditoria)
CREATE POLICY "terms_acceptance_super_admin_select" ON terms_acceptance
  FOR SELECT USING (public.get_my_role() = 'super_admin');

-- Group admin: pode consultar aceites do seu grupo
CREATE POLICY "terms_acceptance_group_admin_select" ON terms_acceptance
  FOR SELECT USING (group_id = public.get_my_group_id());

-- Authenticated users: podem inserir aceites (bot via service_role bypassa RLS,
-- mas esta policy permite INSERT via authenticated key se necessário)
CREATE POLICY "terms_acceptance_authenticated_insert" ON terms_acceptance
  FOR INSERT WITH CHECK (true);

-- NINGUÉM pode atualizar (append-only) — RLS layer
CREATE POLICY "terms_acceptance_no_update" ON terms_acceptance
  FOR UPDATE USING (false);

-- NINGUÉM pode deletar (append-only) — RLS layer
CREATE POLICY "terms_acceptance_no_delete" ON terms_acceptance
  FOR DELETE USING (false);

-- =====================================================
-- 4. IMMUTABILITY TRIGGER (blocks even service_role)
-- =====================================================
CREATE OR REPLACE FUNCTION fn_terms_acceptance_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'terms_acceptance records are immutable — UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_terms_acceptance_no_update
  BEFORE UPDATE ON terms_acceptance
  FOR EACH ROW
  EXECUTE FUNCTION fn_terms_acceptance_immutable();

CREATE TRIGGER trg_terms_acceptance_no_delete
  BEFORE DELETE ON terms_acceptance
  FOR EACH ROW
  EXECUTE FUNCTION fn_terms_acceptance_immutable();

COMMIT;
