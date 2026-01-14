# Story 14.4: Padronizar Ordenação (Data → Odds)

Status: ready-for-dev

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

- [ ] Task 1: Atualizar getAvailableBets() (AC: #1, #3)
  - [ ] 1.1: Localizar função (linha ~334)
  - [ ] 1.2: Alterar `.order('league_matches(kickoff_time)', { ascending: true })`
  - [ ] 1.3: Adicionar segundo `.order('odds', { ascending: false })`

- [ ] Task 2: Atualizar getEligibleBets() (AC: #1, #4)
  - [ ] 2.1: Localizar função (linha ~13)
  - [ ] 2.2: Alterar de `.order('odds', { ascending: false })`
  - [ ] 2.3: Para `.order('kickoff_time', { ascending: true }).order('odds', { ascending: false })`

- [ ] Task 3: Atualizar getFilaStatus() (AC: #1, #5)
  - [ ] 3.1: Localizar função (linha ~997)
  - [ ] 3.2: Verificar ordenação atual
  - [ ] 3.3: Padronizar para `kickoff_time ASC, odds DESC`

- [ ] Task 4: Verificar outras queries de listagem (AC: #1)
  - [ ] 4.1: getBetsReadyForPosting() - padronizar
  - [ ] 4.2: getBetsPendingLinks() - padronizar
  - [ ] 4.3: getActivePostedBets() - padronizar

- [ ] Task 5: Testar consistência (AC: #2)
  - [ ] 5.1: /apostas - verificar ordem
  - [ ] 5.2: /filtrar - verificar ordem
  - [ ] 5.3: /fila - verificar ordem

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/services/betService.js (modificar)
