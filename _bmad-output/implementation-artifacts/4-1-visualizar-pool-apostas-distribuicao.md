# Story 4.1: Visualizar Pool de Apostas e Distribuição por Grupo

Status: done

## Story

As a **Super Admin**,
I want ver quais apostas estão no pool (não distribuídas) e para qual grupo cada aposta foi enviada,
So that eu tenha visibilidade total da distribuição antes de tomar decisões.

## Acceptance Criteria

1. **Given** Super Admin está logado no painel admin
   **When** acessa a seção de apostas
   **Then** vê lista de apostas não distribuídas (pool): apostas com `group_id = null` ou sem grupo atribuído (FR19)
   **And** cada aposta mostra: jogo, odds, data, status

2. **Given** existem apostas distribuídas para grupos
   **When** Super Admin visualiza a lista de apostas
   **Then** vê para qual grupo cada aposta foi distribuída (FR20)
   **And** pode distinguir visualmente apostas no pool vs distribuídas (ex: badge com nome do grupo)

3. **Given** existem apostas em múltiplos grupos
   **When** Super Admin filtra por grupo
   **Then** vê apenas apostas daquele grupo

4. **Given** existem apostas no pool e em grupos
   **When** Super Admin filtra por "Não distribuídas"
   **Then** vê apenas apostas do pool sem grupo atribuído

## Tasks / Subtasks

- [ ] Task 1: Melhorar exibição de distribuição na BetTable (AC: #1, #2)
  - [ ] 1.1 No `BetTable.tsx`, substituir o badge atual simples ("Distribuída" / "Não distribuída") por badge com nome do grupo (ex: "Guru da Bet") ou "Pool" para não distribuídas
  - [ ] 1.2 Estilizar badges: cor diferente para "Pool" (cinza/neutral) vs grupo (cor por grupo ou azul padrão)
  - [ ] 1.3 Garantir que a coluna de distribuição mostra corretamente quando `groups` join retorna `null` (pool) vs nome do grupo

- [ ] Task 2: Adicionar filtro "Não distribuídas" no BetFilters (AC: #3, #4)
  - [ ] 2.1 No `BetFilters.tsx`, adicionar opção "Não distribuídas (Pool)" ao seletor de grupo existente (super_admin only)
  - [ ] 2.2 Usar valor especial `__pool__` para representar `group_id IS NULL` no filtro
  - [ ] 2.3 Na API `GET /api/bets` (`route.ts`), tratar `group_id=__pool__` como filtro `group_id IS NULL`

- [ ] Task 3: Adicionar contadores de distribuição no BetStatsBar (AC: #1, #2)
  - [ ] 3.1 Na API `GET /api/bets` (`route.ts`), adicionar contador `pool` (count de bets com group_id IS NULL e elegibilidade='elegivel') e `distributed` (count de bets com group_id IS NOT NULL e elegibilidade='elegivel')
  - [ ] 3.2 No `BetStatsBar.tsx`, adicionar cards para "Pool" (não distribuídas) e "Distribuídas"
  - [ ] 3.3 Atualizar tipo `BetCounters` em `database.ts` com novos campos `pool` e `distributed`

- [ ] Task 4: Escrever testes unitários (AC: #1-#4)
  - [ ] 4.1 Testar: API retorna contador pool e distributed corretamente
  - [ ] 4.2 Testar: API filtra por group_id=__pool__ → retorna apenas bets com group_id IS NULL
  - [ ] 4.3 Testar: API filtra por group_id=<uuid> → retorna apenas bets daquele grupo
  - [ ] 4.4 Testar: BetTable renderiza nome do grupo no badge (não apenas "Distribuída")

- [ ] Task 5: Validação completa
  - [ ] 5.1 `cd admin-panel && npm test` — todos os testes passam
  - [ ] 5.2 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### O que JÁ existe (NÃO reimplementar)

| Item | Localização | Estado |
|------|-------------|--------|
| Página de apostas com lista + filtros + paginação | `admin-panel/src/app/(auth)/bets/page.tsx` | Completo |
| API GET /api/bets com filtros avançados | `admin-panel/src/app/api/bets/route.ts` | Completo |
| BetTable com colunas, sort, seleção | `admin-panel/src/components/features/bets/BetTable.tsx` | Completo |
| BetFilters com filtro por grupo (super_admin) | `admin-panel/src/components/features/bets/BetFilters.tsx` | Completo |
| BetStatsBar com contadores | `admin-panel/src/components/features/bets/BetStatsBar.tsx` | Completo |
| BetStatusBadge | `admin-panel/src/components/features/bets/BetStatusBadge.tsx` | Completo |
| Coluna `group_id` e `distributed_at` na `suggested_bets` | Migration 019 | Aplicada |
| Join com `groups` na API (retorna `groups: { name }`) | API route.ts | Já faz o join |
| Tabela `audit_log` | Migration 021 | Aplicada |
| RLS em suggested_bets para multi-tenant | Migration 019 | Aplicada |
| Tipos `SuggestedBetListItem`, `BetCounters` | `src/types/database.ts` | Definidos |

### Badge atual de distribuição (a melhorar)

Em `BetTable.tsx` (~linha 65-70), o badge atual mostra apenas "Distribuída" ou "Não distribuída". Story 4-1 precisa melhorar para mostrar o **nome do grupo**.

O join com `groups` já é feito na API (`groups: { name } | null`). O campo `bet.groups?.name` já está disponível no frontend — só precisa usar no badge.

### Filtro __pool__ na API

A API `GET /api/bets` já aceita `group_id` como query param e aplica `.eq('group_id', groupId)`. Para o filtro de pool, adicionar:

```typescript
if (group_id === '__pool__') {
  query = query.is('group_id', null);
} else if (group_id) {
  query = query.eq('group_id', group_id);
}
```

### Contadores pool/distributed

A API já calcula contadores via queries separadas. Adicionar:

```typescript
// Pool count (undistributed)
const { count: poolCount } = await supabase
  .from('suggested_bets')
  .select('*', { count: 'exact', head: true })
  .is('group_id', null)
  .eq('elegibilidade', 'elegivel');

// Distributed count
const { count: distributedCount } = await supabase
  .from('suggested_bets')
  .select('*', { count: 'exact', head: true })
  .not('group_id', 'is', null)
  .eq('elegibilidade', 'elegivel');
```

### Padrão createApiHandler (P7)

```typescript
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(async (req, context) => {
  const { groupFilter, supabase, role } = context;
  // groupFilter = null para super_admin, UUID para group_admin
  // Usar .eq('group_id', groupFilter) quando não é super_admin
  return NextResponse.json({ success: true, data: ... });
});
```

### Padrão de resposta

Sempre retornar `{ success: true/false, data/error }`.

### Project Structure Notes

- Bets page: `admin-panel/src/app/(auth)/bets/page.tsx`
- API: `admin-panel/src/app/api/bets/route.ts`
- Components: `admin-panel/src/components/features/bets/`
- Types: `admin-panel/src/types/database.ts`
- NÃO criar novos arquivos — modificar os existentes

### Previous Story Learnings (Story 3-2, Epic 3)

- termsService funciona com padrão `{ success, data/error }`
- getConfig com defaults funciona bem para feature flags
- Testes mock pattern: jest.mock com mockResolvedValue
- Callback routing em server.js funciona com chatType + data prefix check

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1] — AC
- [Source: _bmad-output/planning-artifacts/architecture.md#D4] — Redistribuição decision
- [Source: _bmad-output/planning-artifacts/architecture.md#P5] — Redistribuição pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#P7] — API route checklist
- [Source: admin-panel/src/app/api/bets/route.ts] — Existing bets API
- [Source: admin-panel/src/components/features/bets/BetTable.tsx:65-70] — Current distribution badge
- [Source: admin-panel/src/components/features/bets/BetFilters.tsx] — Existing group filter
- [Source: admin-panel/src/components/features/bets/BetStatsBar.tsx] — Existing counters
- [Source: admin-panel/src/types/database.ts] — BetCounters, SuggestedBetListItem types
- [Source: sql/migrations/019_multitenant.sql] — group_id column
- [Source: sql/migrations/021_audit_log.sql] — audit_log table

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Task 1: Distribution badge now shows group name or "Pool" instead of generic "Distribuida"/"Nao distribuida"
- Task 2: Added "__pool__" option to group filter in BetFilters (Nao distribuidas/Pool)
- Task 3: Added pool/distributed counters to API, BetStatsBar (7 columns), and BetCounters type
- Task 4: Added 3 API tests (pool/distributed counters, __pool__ filter, UUID group filter) + updated component tests
- Task 5: All 536 admin-panel tests pass, build OK, 868 bot tests pass

### File List
- admin-panel/src/app/api/bets/route.ts (MODIFIED — __pool__ filter + pool/distributed counters)
- admin-panel/src/components/features/bets/BetTable.tsx (MODIFIED — badge shows group name, merged Grupo+Distribuicao columns)
- admin-panel/src/components/features/bets/BetFilters.tsx (MODIFIED — added Pool option to group filter)
- admin-panel/src/components/features/bets/BetStatsBar.tsx (MODIFIED — added Pool+Distribuidas counters)
- admin-panel/src/types/database.ts (MODIFIED — added pool/distributed to BetCounters)
- admin-panel/src/app/(auth)/bets/page.tsx (MODIFIED — updated DEFAULT_COUNTERS)
- admin-panel/src/app/api/__tests__/bets.test.ts (MODIFIED — 3 new tests for Story 4-1)
- admin-panel/src/components/features/bets/__tests__/BetComponents.test.tsx (MODIFIED — updated for new badge behavior)
