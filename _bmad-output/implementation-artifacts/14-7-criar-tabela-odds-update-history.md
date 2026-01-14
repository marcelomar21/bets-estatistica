# Story 14.7: Criar Tabela odds_update_history

Status: ready-for-dev

## Story

As a sistema,
I want registrar historico de atualizacoes de odds,
so that operador possa consultar o que mudou.

## Acceptance Criteria

1. **Given** migration executada
   **When** tabela criada
   **Then** estrutura contem:
   - `id` SERIAL PRIMARY KEY
   - `bet_id` BIGINT REFERENCES suggested_bets(id)
   - `update_type` TEXT ('odds_change', 'new_analysis')
   - `old_value` NUMERIC (pode ser null para new_analysis)
   - `new_value` NUMERIC
   - `job_name` TEXT (ex: 'enrichOdds_13h', 'manual_admin')
   - `created_at` TIMESTAMPTZ DEFAULT NOW()

2. **Given** tabela criada
   **When** consultar historico
   **Then** indices existem para:
   - `bet_id` (busca por aposta)
   - `created_at` (busca por periodo)

3. **Given** tabela criada
   **When** inserir registro de atualizacao
   **Then** operacao completa sem erro
   **And** registro contem todos os campos necessarios

4. **Given** registros antigos (> 48h)
   **When** consultar historico
   **Then** registros antigos ainda existem
   **Note** Limpeza automatica pode ser implementada depois

## Tasks / Subtasks

- [ ] Task 1: Criar migration SQL para nova tabela (AC: #1)
  - [ ] 1.1: Definir estrutura da tabela odds_update_history
  - [ ] 1.2: Adicionar foreign key para suggested_bets
  - [ ] 1.3: Adicionar constraint para update_type

- [ ] Task 2: Criar indices para performance (AC: #2)
  - [ ] 2.1: Indice em bet_id para busca por aposta
  - [ ] 2.2: Indice em created_at para busca por periodo
  - [ ] 2.3: Indice composto (bet_id, created_at) para consultas combinadas

- [ ] Task 3: Executar migration no Supabase (AC: #1, #3)
  - [ ] 3.1: Testar migration em ambiente local/staging
  - [ ] 3.2: Aplicar migration no Supabase
  - [ ] 3.3: Verificar criacao da tabela e indices

- [ ] Task 4: Documentar schema (AC: #1)
  - [ ] 4.1: Atualizar docs/data-models.md com nova tabela
  - [ ] 4.2: Documentar proposito e uso da tabela

## Dev Notes

### Schema SQL Completo

```sql
-- Story 14.7: Tabela de historico de atualizacoes de odds
-- Permite rastrear todas as mudancas de odds das apostas

CREATE TABLE IF NOT EXISTS odds_update_history (
  id SERIAL PRIMARY KEY,
  bet_id BIGINT REFERENCES suggested_bets(id) ON DELETE CASCADE,
  update_type TEXT NOT NULL CHECK (update_type IN ('odds_change', 'new_analysis', 'manual_update')),
  old_value NUMERIC(10, 2),  -- Pode ser NULL para new_analysis
  new_value NUMERIC(10, 2) NOT NULL,
  job_name TEXT NOT NULL,    -- 'enrichOdds_08h', 'manual_admin', 'scraping_09h30', etc.
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Comentario da tabela
COMMENT ON TABLE odds_update_history IS 'Historico de todas as atualizacoes de odds nas apostas';
COMMENT ON COLUMN odds_update_history.update_type IS 'Tipo: odds_change (atualizacao), new_analysis (nova aposta), manual_update (admin)';
COMMENT ON COLUMN odds_update_history.job_name IS 'Nome do job ou fonte que atualizou: enrichOdds_08h, manual_admin, scraping_09h30';

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_odds_history_bet_id
ON odds_update_history(bet_id);

CREATE INDEX IF NOT EXISTS idx_odds_history_created
ON odds_update_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_odds_history_bet_created
ON odds_update_history(bet_id, created_at DESC);

-- Indice parcial para atualizacoes recentes (ultimas 48h)
CREATE INDEX IF NOT EXISTS idx_odds_history_recent
ON odds_update_history(created_at DESC)
WHERE created_at > NOW() - INTERVAL '48 hours';
```

### Tipos de Atualizacao (update_type)

| Tipo | Descricao | Exemplo job_name |
|------|-----------|------------------|
| `odds_change` | Odds atualizada via API ou scraping | `enrichOdds_08h`, `scraping_09h30` |
| `new_analysis` | Nova aposta gerada pela IA | `analysis_pipeline` |
| `manual_update` | Atualizacao manual pelo admin | `manual_admin_/odds` |

### Exemplos de Uso

```javascript
// Inserir registro de atualizacao de odds
const { data, error } = await supabase
  .from('odds_update_history')
  .insert({
    bet_id: 45,
    update_type: 'odds_change',
    old_value: 1.85,
    new_value: 1.92,
    job_name: 'enrichOdds_13h'
  });

// Buscar historico de uma aposta
const { data: history } = await supabase
  .from('odds_update_history')
  .select('*')
  .eq('bet_id', 45)
  .order('created_at', { ascending: false });

// Buscar atualizacoes das ultimas 48h
const { data: recent } = await supabase
  .from('odds_update_history')
  .select('*')
  .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
  .order('created_at', { ascending: false });
```

### Localizacao do Arquivo de Migration

```
sql/migrations/
  014_add_odds_update_history.sql
```

**Nota:** O numero do arquivo segue a sequencia existente de migrations.

### Consideracoes de Armazenamento

- **Volume estimado:** ~100-500 registros/dia
- **Retencao:** Todos os registros sao mantidos (pode implementar cleanup depois)
- **Impacto:** Baixo - tabela auxiliar para consulta

### Dependencias para Proximas Stories

Esta tabela e pre-requisito para:
- **Story 14.8:** Registrar mudancas de odds no historico
- **Story 14.9:** Implementar comando /atualizados

### Project Structure Notes

- Migration em `sql/migrations/`
- Segue padrao snake_case para tabelas/colunas
- Foreign key com ON DELETE CASCADE para limpeza automatica
- Indices otimizados para consultas frequentes

### References

- [Source: _bmad-output/planning-artifacts/epics.md#story-14.7] - Definicao original
- [Source: _bmad-output/planning-artifacts/architecture.md] - Padrao de migrations
- [Source: docs/data-models.md] - Schema existente

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- sql/migrations/014_add_odds_update_history.sql (criar)
- docs/data-models.md (atualizar - opcional)
