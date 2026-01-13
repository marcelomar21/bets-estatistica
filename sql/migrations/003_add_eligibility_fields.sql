-- Migration: 003_add_eligibility_fields.sql
-- Description: Adiciona campos de elegibilidade para gestão do ciclo de postagem
-- Story: 13-1 - Atualizar Modelo de Dados com Campos de Elegibilidade
-- Epic: 13 - Gestão de Elegibilidade de Apostas
-- Date: 2026-01-12

-- 1. Adicionar coluna elegibilidade com CHECK constraint
-- Valores: 'elegivel' (pode ser postada), 'removida' (retirada manualmente), 'expirada' (passou do tempo)
ALTER TABLE suggested_bets
ADD COLUMN IF NOT EXISTS elegibilidade TEXT DEFAULT 'elegivel'
CONSTRAINT suggested_bets_elegibilidade_check CHECK (elegibilidade IN ('elegivel', 'removida', 'expirada'));

-- 2. Adicionar coluna promovida_manual
-- Quando true, ignora o filtro de odds >= 1.60 na seleção
ALTER TABLE suggested_bets
ADD COLUMN IF NOT EXISTS promovida_manual BOOLEAN DEFAULT false;

-- 3. Adicionar coluna historico_postagens
-- Array JSONB que registra cada vez que a aposta foi incluída em um job de postagem
-- Formato: [{"timestamp": "2026-01-12T10:00:00Z", "job_type": "10h"}]
ALTER TABLE suggested_bets
ADD COLUMN IF NOT EXISTS historico_postagens JSONB DEFAULT '[]'::jsonb;

-- 4. Criar índice para performance de queries por elegibilidade
CREATE INDEX IF NOT EXISTS idx_suggested_bets_elegibilidade
ON suggested_bets(elegibilidade);

-- 5. Verificar resultado da migration
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'suggested_bets'
AND column_name IN ('elegibilidade', 'promovida_manual', 'historico_postagens');
