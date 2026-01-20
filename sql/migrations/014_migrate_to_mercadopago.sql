-- Migration 014: Migração Cakto → Mercado Pago
-- Tech-Spec: Migração de gateway de pagamento
--
-- Mudanças:
-- 1. Renomear colunas cakto_* para mp_*
-- 2. Remover colunas de afiliado antigas (substituídas por cupom)
-- 3. Remover trial_ends_at (MP gerencia trial agora)
-- 4. Adicionar affiliate_coupon
-- 5. Atualizar índices

-- ============================================
-- 1. RENOMEAR COLUNAS CAKTO → MP
-- ============================================

-- Renomear subscription_id
ALTER TABLE members
  RENAME COLUMN cakto_subscription_id TO mp_subscription_id;

-- Renomear customer_id
ALTER TABLE members
  RENAME COLUMN cakto_customer_id TO mp_payer_id;

-- ============================================
-- 2. REMOVER COLUNAS DE AFILIADO ANTIGAS
-- ============================================

-- Remover índices antigos de afiliado primeiro
DROP INDEX IF EXISTS idx_members_affiliate_code;
DROP INDEX IF EXISTS idx_members_affiliate_expiration;

-- Remover colunas (affiliate_coupon substituirá affiliate_code)
ALTER TABLE members DROP COLUMN IF EXISTS affiliate_code;
ALTER TABLE members DROP COLUMN IF EXISTS affiliate_clicked_at;
ALTER TABLE members DROP COLUMN IF EXISTS affiliate_history;

-- ============================================
-- 3. REMOVER TRIAL_ENDS_AT (MP GERENCIA)
-- ============================================

-- MP controla o período de trial e cobrança automática
-- Nosso sistema apenas marca status='trial' para visibilidade
ALTER TABLE members DROP COLUMN IF EXISTS trial_ends_at;

-- ============================================
-- 4. ADICIONAR COLUNA DE CUPOM AFILIADO
-- ============================================

-- Cupom usado no checkout MP (ex: "JOAO10")
ALTER TABLE members ADD COLUMN IF NOT EXISTS affiliate_coupon TEXT;

-- Comentário para documentação
COMMENT ON COLUMN members.affiliate_coupon IS 'Código de cupom de afiliado usado no checkout do Mercado Pago. Capturado do webhook.';

-- ============================================
-- 5. ATUALIZAR ÍNDICES
-- ============================================

-- Índice para relatório de vendas por afiliado (cupom)
CREATE INDEX IF NOT EXISTS idx_members_affiliate_coupon
  ON members(affiliate_coupon)
  WHERE affiliate_coupon IS NOT NULL;

-- Índice para buscar por subscription MP
CREATE INDEX IF NOT EXISTS idx_members_mp_subscription
  ON members(mp_subscription_id)
  WHERE mp_subscription_id IS NOT NULL;

-- ============================================
-- 6. MIGRAR MEMBROS ATIVOS (PRECISARÃO RE-ASSINAR)
-- ============================================

-- Membros ativos do Cakto precisarão fazer nova assinatura no MP
-- Mantém status mas limpa IDs (não são válidos no MP)
UPDATE members
SET
  mp_subscription_id = NULL,
  mp_payer_id = NULL,
  notes = COALESCE(notes, '') || E'\n' || '[' || NOW()::date || '] Sistema: Migrado de Cakto para Mercado Pago'
WHERE status IN ('ativo', 'trial')
  AND mp_subscription_id IS NOT NULL;

-- ============================================
-- 7. ATUALIZAR COMENTÁRIOS
-- ============================================

COMMENT ON COLUMN members.mp_subscription_id IS 'ID da assinatura (preapproval) no Mercado Pago';
COMMENT ON COLUMN members.mp_payer_id IS 'ID do pagador no Mercado Pago';
