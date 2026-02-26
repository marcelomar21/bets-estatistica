# Story 10.1: API de Analytics de Acerto com Filtros

Status: done

## Story

As a **sistema (backend)**,
I want ter API routes que calculem taxa de acerto com multiplos filtros,
So that o frontend possa exibir analytics detalhados.

## Acceptance Criteria

1. **Given** existem apostas com `bet_result` IN ('success', 'failure') na tabela `suggested_bets`
   **When** API `GET /api/analytics/accuracy` e chamada
   **Then** retorna objeto com: total, byGroup, byMarket, byChampionship, periods

2. **Given** query params `group_id`, `market`, `championship`, `date_from`, `date_to` sao opcionais
   **When** fornecidos
   **Then** filtram os resultados correspondentes

3. **Given** `date_from` e `date_to` fornecidos
   **When** API processa
   **Then** filtra por `result_updated_at` BETWEEN

4. **Given** apenas apostas com `bet_status = 'posted'` e `bet_result IN ('success', 'failure')` sao consideradas
   **When** API calcula
   **Then** ignora apostas pending, cancelled, unknown

5. **Given** Group Admin chama a API
   **When** processa
   **Then** so retorna dados do proprio grupo (RLS)

6. **Given** resposta
   **When** retorna
   **Then** segue pattern `{ success: true, data: { ... } }` e performance < 2s para 10k apostas

## Tasks / Subtasks

- [x] Task 1: Criar `admin-panel/src/app/api/analytics/accuracy/route.ts`
  - [x] 1.1 Implementar GET handler com createApiHandler
  - [x] 1.2 Parse query params: group_id, market, championship, date_from, date_to
  - [x] 1.3 Buscar apostas com LEFT JOIN league_matches -> league_seasons
  - [x] 1.4 Calcular total (rate, wins, losses, total)
  - [x] 1.5 Calcular byGroup (com nome do grupo via JOIN)
  - [x] 1.6 Calcular byMarket usando categorizeMarket()
  - [x] 1.7 Calcular byChampionship via league_seasons
  - [x] 1.8 Calcular periods (last7d, last30d, allTime)
  - [x] 1.9 Aplicar RLS (groupFilter para Group Admin)

- [x] Task 2: Testes unitarios (8 tests)
  - [x] 2.1 Testes para filtros individuais
  - [x] 2.2 Teste para RLS enforcement
  - [x] 2.3 Teste para UUID validation
  - [x] 2.4 Teste para bets without league data
  - [x] 2.5 `cd admin-panel && npm test` — 663 passed (58 files)

- [x] Task 3: Validacao
  - [x] 3.1 `cd admin-panel && npm run build` — build OK

- [x] Task 4: Code Review (adversarial)
  - [x] 4.1 Added UUID validation for group_id param (MEDIUM)
  - [x] 4.2 Changed !inner JOIN to left JOIN to include bets without league data (MEDIUM)
  - [x] 4.3 Added 2 new tests covering review fixes

## Dev Notes

### Response Structure

```typescript
{
  success: true,
  data: {
    total: { rate: number, wins: number, losses: number, total: number },
    byGroup: Array<{ group_id: string, group_name: string, rate: number, wins: number, losses: number, total: number }>,
    byMarket: Array<{ market: string, category: string, rate: number, wins: number, losses: number, total: number }>,
    byChampionship: Array<{ league_name: string, country: string, rate: number, wins: number, losses: number, total: number }>,
    periods: {
      last7d: { rate: number, wins: number, total: number },
      last30d: { rate: number, wins: number, total: number },
      allTime: { rate: number, wins: number, total: number }
    }
  }
}
```

### Key Patterns

- Use `categorizeMarket()` from `@/lib/bet-categories` for market grouping
- Use `fetchPairStats()` pattern from `@/lib/pair-stats.ts` for query structure
- Only `bet_status = 'posted'` AND `bet_result IN ('success', 'failure')`
- Date filtering on `result_updated_at`

### References

- [Source: admin-panel/src/lib/pair-stats.ts] Existing hit rate calculation
- [Source: admin-panel/src/lib/bet-categories.ts] categorizeMarket function
- [Source: admin-panel/src/app/api/bets/route.ts] Bets API pattern
- [Source: _bmad-output/planning-artifacts/epics.md] Epic 10 spec

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Implemented GET /api/analytics/accuracy with full breakdown (total, byGroup, byMarket, byChampionship, periods)
- Adversarial review: added UUID validation for group_id param, changed inner join to left join
- 8 unit tests covering all breakdowns, RLS, edge cases, and review fixes

### File List
- admin-panel/src/app/api/analytics/accuracy/route.ts (NEW)
- admin-panel/src/app/api/__tests__/analytics-accuracy.test.ts (NEW)
