-- ================================================
-- Migration: 016_add_result_reason_and_unknown.sql
-- Adiciona coluna result_reason e estado 'unknown' para avaliacao LLM
-- Data: 2026-01-22
-- ================================================

-- F7 FIX: Wrap em transaction para rollback se falhar
BEGIN;

-- 1. Adicionar coluna result_reason
ALTER TABLE suggested_bets
  ADD COLUMN IF NOT EXISTS result_reason TEXT;

COMMENT ON COLUMN suggested_bets.result_reason IS 'Justificativa da LLM para o resultado da aposta';

-- 2. Remover constraint antiga de bet_result
ALTER TABLE suggested_bets
  DROP CONSTRAINT IF EXISTS suggested_bets_result_check;

-- 3. Adicionar nova constraint COM 'unknown'
ALTER TABLE suggested_bets
  ADD CONSTRAINT suggested_bets_result_check
  CHECK (bet_result IN ('pending', 'success', 'failure', 'cancelled', 'unknown'));

-- F8 FIX: Removido indice em coluna TEXT - nao sera usado para lookup
-- Queries de auditoria vao filtrar por bet_result ou bet_id, nao pelo texto do reason

COMMIT;
