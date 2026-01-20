-- ================================================
-- Migration: 013_separate_status_result.sql
-- Separar bet_status (fluxo) de bet_result (resultado)
-- Data: 2026-01-20
-- ================================================

-- 1. Remover constraint antiga de status
ALTER TABLE suggested_bets
  DROP CONSTRAINT IF EXISTS suggested_bets_status_check;

-- 2. Adicionar coluna bet_result com default 'pending'
ALTER TABLE suggested_bets
  ADD COLUMN IF NOT EXISTS bet_result TEXT NOT NULL DEFAULT 'pending';

-- 3. Migrar dados existentes (success/failure/cancelled -> bet_result)
-- IMPORTANTE: Fazer ANTES de adicionar nova constraint

-- Apostas que ganharam
UPDATE suggested_bets
  SET bet_result = 'success', bet_status = 'posted'
  WHERE bet_status = 'success';

-- Apostas que perderam
UPDATE suggested_bets
  SET bet_result = 'failure', bet_status = 'posted'
  WHERE bet_status = 'failure';

-- Apostas canceladas (status final = ready, pois nunca foram postadas)
UPDATE suggested_bets
  SET bet_result = 'cancelled', bet_status = 'ready'
  WHERE bet_status = 'cancelled'
    AND telegram_posted_at IS NULL;

-- Apostas canceladas que foram postadas
UPDATE suggested_bets
  SET bet_result = 'cancelled', bet_status = 'posted'
  WHERE bet_status = 'cancelled'
    AND telegram_posted_at IS NOT NULL;

-- 4. Corrigir apostas inconsistentes (telegram_posted_at mas status errado)
UPDATE suggested_bets
  SET bet_status = 'posted'
  WHERE telegram_posted_at IS NOT NULL
    AND bet_status NOT IN ('posted');

-- 5. Adicionar nova constraint de status (com pending_odds)
ALTER TABLE suggested_bets
  ADD CONSTRAINT suggested_bets_status_check
  CHECK (bet_status IN ('generated', 'pending_link', 'pending_odds', 'ready', 'posted'));

-- 6. Adicionar constraint de result
ALTER TABLE suggested_bets
  ADD CONSTRAINT suggested_bets_result_check
  CHECK (bet_result IN ('pending', 'success', 'failure', 'cancelled'));

-- 7. Criar indice para bet_result
CREATE INDEX IF NOT EXISTS idx_suggested_bets_result
  ON suggested_bets (bet_result);

-- 8. Recriar indice de status (caso tenha mudado)
DROP INDEX IF EXISTS idx_suggested_bets_status;
CREATE INDEX idx_suggested_bets_status
  ON suggested_bets (bet_status);

-- ================================================
-- Verificacao pos-migration
-- ================================================
-- SELECT bet_status, bet_result, COUNT(*)
-- FROM suggested_bets
-- GROUP BY bet_status, bet_result
-- ORDER BY bet_status, bet_result;
