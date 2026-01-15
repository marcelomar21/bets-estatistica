# Story 14.4: Padronizar Ordenação (Data → Odds)

Status: done

## Story

As a operador,
I want ver apostas sempre ordenadas por data e depois por odds,
so that tenha consistência em todos os comandos.

## Acceptance Criteria

1. **Given** qualquer comando de listagem (/apostas, /filtrar, /fila)
   **When** bot retorna lista de apostas
   **Then** ordenação é: `kickoff_time ASC, odds DESC`

2. **Given** lista ordenada
   **When** operador visualiza
   **Then** jogos mais próximos aparecem primeiro
   **And** dentro do mesmo dia, maior odd primeiro

3. **Given** query `getAvailableBets()`
   **When** retorna apostas
   **Then** ordenação é `kickoff_time ASC, odds DESC`

4. **Given** query `getEligibleBets()`
   **When** retorna apostas
   **Then** ordenação é `kickoff_time ASC, odds DESC`

5. **Given** query `getFilaStatus()`
   **When** retorna apostas
   **Then** ordenação é `kickoff_time ASC, odds DESC`

## Tasks / Subtasks

- [x] Task 1: Atualizar getAvailableBets() (AC: #1, #3)
  - [x] 1.1: Localizar função (linha ~334)
  - [x] 1.2: Alterar `.order('league_matches(kickoff_time)', { ascending: true })`
  - [x] 1.3: Adicionar segundo `.order('odds', { ascending: false })`

- [x] Task 2: Atualizar getEligibleBets() (AC: #1, #4)
  - [x] 2.1: Localizar função (linha ~13)
  - [x] 2.2: Alterar de `.order('odds', { ascending: false })`
  - [x] 2.3: Para `.order('kickoff_time', { ascending: true }).order('odds', { ascending: false })`

- [x] Task 3: Atualizar getFilaStatus() (AC: #1, #5)
  - [x] 3.1: Localizar função (linha ~997)
  - [x] 3.2: Verificar ordenação atual
  - [x] 3.3: Padronizar para `kickoff_time ASC, odds DESC`

- [x] Task 4: Verificar outras queries de listagem (AC: #1)
  - [x] 4.1: getBetsReadyForPosting() - padronizar
  - [x] 4.2: getBetsPendingLinks() - padronizar
  - [x] 4.3: getActiveBetsForRepost() - padronizar

- [x] Task 5: Testar consistência (AC: #2)
  - [x] 5.1: Verificação de sintaxe - node --check OK
  - [x] 5.2: Testes unitários - 118 testes passaram
  - [x] 5.3: Queries usam ordenação padronizada

## Dev Notes

### Ordenação Atual (Inconsistente)

Analisando o código atual:

| Função | Ordenação Atual | Linha |
|--------|-----------------|-------|
| `getEligibleBets()` | `odds DESC` | 43 |
| `getBetsReadyForPosting()` | `promovida_manual DESC, odds DESC` | 119-120 |
| `getAvailableBets()` | `kickoff_time ASC` | 361 |
| `getFilaStatus()` | `kickoff_time ASC` (ativas), `promovida_manual DESC, odds DESC` (novas) | 1026, 1074-1075 |

### Ordenação Alvo (Padronizada)

```javascript
.order('kickoff_time', { ascending: true })   // Data mais próxima primeiro
.order('odds', { ascending: false })           // Maior odd primeiro (mesmo dia)
```

### Supabase Order Syntax

```javascript
// Para campos da tabela atual
.order('odds', { ascending: false })

// Para campos de tabela relacionada
.order('league_matches(kickoff_time)', { ascending: true })

// Múltiplas ordenações (encadeadas)
.order('kickoff_time', { ascending: true })
.order('odds', { ascending: false })
```

### Consideração: promovida_manual

Algumas queries ordenam `promovida_manual DESC` primeiro para garantir que apostas promovidas manualmente apareçam antes.

**Decisão:** Manter `promovida_manual` como critério adicional onde faz sentido (postagem), mas **data** deve ser sempre o critério primário para listagens.

### Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/services/betService.js` | MODIFICAR | Padronizar ORDER BY em múltiplas funções |

### Project Structure Notes

- Todas as queries usam Supabase client
- Algumas queries usam foreign key reference `league_matches(kickoff_time)`
- Manter compatibilidade com paginação existente

### References

- [Source: bot/services/betService.js:43] - getEligibleBets order
- [Source: bot/services/betService.js:361] - getAvailableBets order
- [Source: bot/services/betService.js:1026] - getFilaStatus order
- [Source: _bmad-output/planning-artifacts/epics.md#story-14.4] - Definição original

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Verificação de sintaxe: `node --check bot/services/betService.js` - OK
- Testes unitários: `npm test` - 118 testes passaram (5 suites)

### Completion Notes List

1. ✅ Padronizado `getEligibleBets()` - adicionado `kickoff_time ASC` antes de `odds DESC` (linha 43-44)
2. ✅ Padronizado `getBetsReadyForPosting()` - adicionado `kickoff_time ASC` como primeiro critério (linha 120-122)
3. ✅ Padronizado `getBetsPendingLinks()` - adicionado `kickoff_time ASC` antes de `odds DESC` (linha 190-191)
4. ✅ Padronizado `getActiveBetsForRepost()` - adicionado `odds DESC` após `kickoff_time ASC` (linha 304-305)
5. ✅ Padronizado `getAvailableBets()` - adicionado `odds DESC` após `kickoff_time ASC` (linha 361-362)
6. ✅ Padronizado query em `getOverviewStats()` - adicionado `odds DESC` após `kickoff_time ASC` (linha 880-881)
7. ✅ Padronizado `getFilaStatus()` - ambas queries (ativas e novas) usam `kickoff_time ASC, odds DESC`
8. ✅ Mantido `promovida_manual DESC` onde relevante (getBetsReadyForPosting, getFilaStatus novas)
9. ✅ Todas as 7 queries de listagem agora usam ordenação consistente

### Change Log

- 2026-01-14: Padronizado ordenação para `kickoff_time ASC, odds DESC` em 7 queries de betService.js
- 2026-01-14: Code Review Approved (0 issues found)

### File List

- bot/services/betService.js (modificado) - 7 queries padronizadas
