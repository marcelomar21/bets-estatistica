-- Story 14.7: Tabela de historico de atualizacoes de odds
-- Permite rastrear todas as mudancas de odds das apostas
-- Pre-requisito para Stories 14.8 e 14.9

-- ============================================
-- TABELA: odds_update_history
-- ============================================

CREATE TABLE IF NOT EXISTS odds_update_history (
  id SERIAL PRIMARY KEY,
  bet_id BIGINT REFERENCES suggested_bets(id) ON DELETE CASCADE,
  update_type TEXT NOT NULL CHECK (update_type IN ('odds_change', 'new_analysis', 'manual_update')),
  old_value NUMERIC(10, 2),  -- Pode ser NULL para new_analysis
  new_value NUMERIC(10, 2) NOT NULL,
  job_name TEXT NOT NULL,    -- 'enrichOdds_08h', 'manual_admin', 'scraping_09h30', etc.
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Comentarios da tabela
COMMENT ON TABLE odds_update_history IS 'Historico de todas as atualizacoes de odds nas apostas';
COMMENT ON COLUMN odds_update_history.bet_id IS 'FK para suggested_bets - aposta que foi atualizada';
COMMENT ON COLUMN odds_update_history.update_type IS 'Tipo: odds_change (atualizacao), new_analysis (nova aposta), manual_update (admin)';
COMMENT ON COLUMN odds_update_history.old_value IS 'Valor anterior da odd (NULL para new_analysis)';
COMMENT ON COLUMN odds_update_history.new_value IS 'Novo valor da odd';
COMMENT ON COLUMN odds_update_history.job_name IS 'Nome do job ou fonte que atualizou: enrichOdds_08h, manual_admin, scraping_09h30';
COMMENT ON COLUMN odds_update_history.created_at IS 'Data/hora da atualizacao';

-- ============================================
-- INDICES PARA PERFORMANCE
-- ============================================

-- Indice para busca por aposta especifica
CREATE INDEX IF NOT EXISTS idx_odds_history_bet_id
ON odds_update_history(bet_id);

-- Indice para busca por periodo (mais recentes primeiro)
CREATE INDEX IF NOT EXISTS idx_odds_history_created
ON odds_update_history(created_at DESC);

-- Indice composto para consultas combinadas (aposta + periodo)
CREATE INDEX IF NOT EXISTS idx_odds_history_bet_created
ON odds_update_history(bet_id, created_at DESC);

-- NOTA: Indice parcial removido pois NOW() nao e IMMUTABLE
-- O indice idx_odds_history_created ja cobre consultas por periodo
