-- Story 18.1: Tracking de Afiliados e Entrada
-- Sistema de Afiliados - Campos para rastreamento de atribuição
--
-- Adiciona campos para:
-- - affiliate_code: código do afiliado atual (último clique)
-- - affiliate_history: histórico de todos os cliques (append-only)
-- - affiliate_clicked_at: timestamp do último clique (para expiração de 14 dias)

-- ============================================
-- ADICIONAR CAMPOS DE AFILIADO NA TABELA MEMBERS
-- ============================================

ALTER TABLE members
ADD COLUMN IF NOT EXISTS affiliate_code TEXT,
ADD COLUMN IF NOT EXISTS affiliate_history JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS affiliate_clicked_at TIMESTAMPTZ;

-- ============================================
-- ÍNDICE PARA CONSULTAS POR AFILIADO
-- ============================================

-- Índice parcial para afiliados ativos (consultas de relatório)
CREATE INDEX IF NOT EXISTS idx_members_affiliate_code
ON members(affiliate_code)
WHERE affiliate_code IS NOT NULL;

-- Índice para job de expiração (Story 18.2)
-- Busca membros com atribuição expirando
CREATE INDEX IF NOT EXISTS idx_members_affiliate_expiration
ON members(affiliate_clicked_at)
WHERE affiliate_code IS NOT NULL AND affiliate_clicked_at IS NOT NULL;

-- ============================================
-- COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ============================================

COMMENT ON COLUMN members.affiliate_code IS 'Código do afiliado atual (último clique). Formato: string alfanumérica do Cakto.';
COMMENT ON COLUMN members.affiliate_history IS 'Array JSONB com histórico de todos os cliques: [{code, clicked_at}]. Append-only, nunca deletar.';
COMMENT ON COLUMN members.affiliate_clicked_at IS 'Timestamp do último clique em link de afiliado. Usado para calcular expiração de 14 dias.';
