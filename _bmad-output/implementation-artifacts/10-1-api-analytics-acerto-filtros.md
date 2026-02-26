# Story 10.1: API de Analytics de Acerto com Filtros

Status: ready-for-dev

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

- [ ] Task 1: Criar `admin-panel/src/app/api/analytics/accuracy/route.ts`
  - [ ] 1.1 Implementar GET handler com createApiHandler
  - [ ] 1.2 Parse query params: group_id, market, championship, date_from, date_to
  - [ ] 1.3 Buscar apostas com JOIN league_matches -> league_seasons
  - [ ] 1.4 Calcular total (rate, wins, losses, total)
  - [ ] 1.5 Calcular byGroup (com nome do grupo via JOIN)
  - [ ] 1.6 Calcular byMarket usando categorizeMarket()
  - [ ] 1.7 Calcular byChampionship via league_seasons
  - [ ] 1.8 Calcular periods (last7d, last30d, allTime)
  - [ ] 1.9 Aplicar RLS (groupFilter para Group Admin)

- [ ] Task 2: Testes unitarios
  - [ ] 2.1 Testes para filtros individuais
  - [ ] 2.2 Teste para RLS enforcement
  - [ ] 2.3 `cd admin-panel && npm test` — todos passando

- [ ] Task 3: Validacao
  - [ ] 3.1 `cd admin-panel && npm run build` — build OK

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

### Completion Notes List

### File List
