-- Migration 021: Audit Log
-- Story 2.1: Editar e Gerenciar Status de Grupos
-- NFR-S5: Audit log de acoes criticas com retencao de 90 dias
--
-- Esta tabela e generica e sera reutilizada por futuras stories (2.2, 2.3, etc.)
-- Retencao de 90 dias deve ser aplicada via job agendado ou policy de banco.

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES admin_users(id),
  changes JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices para queries frequentes
CREATE INDEX idx_audit_log_table_name ON audit_log (table_name);
CREATE INDEX idx_audit_log_record_id ON audit_log (record_id);
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at);

-- RLS: super_admin pode ver todos os registros de audit
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_super_admin_select" ON audit_log
  FOR SELECT USING (
    public.get_my_role() = 'super_admin'
  );

-- super_admin pode inserir registros de audit
CREATE POLICY "audit_log_super_admin_insert" ON audit_log
  FOR INSERT WITH CHECK (
    public.get_my_role() = 'super_admin'
  );

-- Nota: Retencao de 90 dias (NFR-S5) deve ser implementada via:
-- DELETE FROM audit_log WHERE created_at < now() - INTERVAL '90 days';
-- Executar periodicamente via cron job ou Supabase Edge Function.
