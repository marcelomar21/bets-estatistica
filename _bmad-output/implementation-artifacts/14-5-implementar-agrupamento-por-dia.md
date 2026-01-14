# Story 14.5: Implementar Agrupamento por Dia

Status: review

## Story

As a operador,
I want ver apostas agrupadas visualmente por dia,
so that seja fácil identificar jogos de hoje vs amanhã.

## Acceptance Criteria

1. **Given** lista de apostas retornada
   **When** formatar para exibição
   **Then** agrupa apostas por dia com separador visual

2. **Given** apostas agrupadas
   **When** formatar header de dia
   **Then** mostra "HOJE - DD/MM" ou "AMANHÃ - DD/MM" ou "DD/MM (dia da semana)"

3. **Given** múltiplos dias com apostas
   **When** formatar lista
   **Then** usa separador `━━━━` entre dias

4. **Given** comando /apostas
   **When** formatar resposta
   **Then** apostas aparecem agrupadas por dia

5. **Given** comando /filtrar
   **When** formatar resposta
   **Then** apostas aparecem agrupadas por dia

6. **Given** comando /fila
   **When** formatar resposta
   **Then** apostas aparecem agrupadas por dia

## Tasks / Subtasks

- [x] Task 1: Criar helper formatBetListWithDays (AC: #1, #2, #3)
  - [x] 1.1: Criar arquivo bot/utils/formatters.js (ou adicionar se existir)
  - [x] 1.2: Implementar função `formatBetListWithDays(bets, formatBetFn)`
  - [x] 1.3: Implementar helper `getDayLabel(date)` - retorna "HOJE", "AMANHÃ" ou data
  - [x] 1.4: Implementar separador visual entre dias

- [x] Task 2: Implementar groupBetsByDay helper (AC: #1)
  - [x] 2.1: Criar função `groupBetsByDay(bets)`
  - [x] 2.2: Usar date key no formato YYYY-MM-DD
  - [x] 2.3: Retornar objeto { 'YYYY-MM-DD': [bets] } ordenado por data

- [x] Task 3: Integrar em handleApostasCommand (AC: #4)
  - [x] 3.1: Importar formatBetListWithDays
  - [x] 3.2: Substituir formatação manual por helper
  - [x] 3.3: Preservar informações exibidas (ID, jogo, odds, status)

- [x] Task 4: Integrar em handleFiltrarCommand (AC: #5)
  - [x] 4.1: Importar formatBetListWithDays
  - [x] 4.2: Aplicar agrupamento por dia

- [x] Task 5: Integrar em handleFilaCommand (AC: #6)
  - [x] 5.1: Importar formatBetListWithDays
  - [x] 5.2: Aplicar agrupamento por dia

- [x] Task 6: Testar formatação (AC: #1-6)
  - [x] 6.1: Verificação de sintaxe - node --check OK
  - [x] 6.2: Testes unitários - 129 testes passaram (11 novos)
  - [x] 6.3: Labels de dia corretos (HOJE/AMANHA/dd/mm)

## Dev Notes

### Helper formatBetListWithDays

```javascript
/**
 * Format bet list with day grouping
 * @param {Array} bets - Array of bet objects (must have kickoffTime)
 * @param {Function} formatBetFn - Function to format single bet line
 * @returns {string} Formatted message with day headers
 */
function formatBetListWithDays(bets, formatBetFn) {
  if (!bets || bets.length === 0) {
    return 'Nenhuma aposta encontrada.';
  }

  const grouped = groupBetsByDay(bets);
  const lines = [];

  for (const [dateKey, dayBets] of Object.entries(grouped)) {
    const dayLabel = getDayLabel(dateKey);
    lines.push(`━━━━ *${dayLabel}* ━━━━`);
    lines.push('');

    for (const bet of dayBets) {
      lines.push(formatBetFn(bet));
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
```

### Helper getDayLabel

```javascript
function getDayLabel(dateKey) {
  const date = new Date(dateKey + 'T12:00:00'); // Avoid timezone issues
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const formatted = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });

  if (isToday) return `HOJE - ${formatted}`;
  if (isTomorrow) return `AMANHÃ - ${formatted}`;

  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' });
  return `${formatted} (${weekday})`;
}
```

### Helper groupBetsByDay

```javascript
function groupBetsByDay(bets) {
  const grouped = {};

  for (const bet of bets) {
    const kickoff = new Date(bet.kickoffTime);
    const dateKey = kickoff.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(bet);
  }

  return grouped;
}
```

### Exemplo de Output

```
━━━━ *HOJE - 14/01* ━━━━

🆔 #45 │ Liverpool vs Arsenal
   📊 Over 2.5 │ 💰 1.85 │ ✅ Pronta

🆔 #52 │ Man City vs Chelsea
   📊 BTTS │ 💰 1.72 │ ⚠️ Sem link

━━━━ *AMANHÃ - 15/01* ━━━━

🆔 #61 │ PSG vs Marseille
   📊 Under 3.5 │ 💰 1.68 │ ✅ Pronta
```

### Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/utils/formatters.js` | CRIAR | Helpers de formatação |
| `bot/handlers/adminGroup.js` | MODIFICAR | Usar formatters em handlers |

### Dependência

Esta story se beneficia da Story 14.4 (ordenação padronizada) estar completa, mas pode ser implementada independentemente.

### Project Structure Notes

- Criar novo arquivo em `bot/utils/` para helpers
- Manter compatibilidade com paginação (Story 14.6)
- Timezone: usar America/Sao_Paulo

### References

- [Source: bot/handlers/adminGroup.js:155-266] - handleApostasCommand atual
- [Source: _bmad-output/planning-artifacts/epics.md#story-14.5] - Definição original

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Verificação de sintaxe: `node --check bot/utils/formatters.js` - OK
- Verificação de sintaxe: `node --check bot/handlers/adminGroup.js` - OK
- Testes unitários: `npm test` - 129 testes passaram (6 suites, 11 novos testes para formatters)

### Completion Notes List

1. ✅ Criado novo módulo `bot/utils/formatters.js` com funções de formatação
2. ✅ Implementado `getDayLabel(dateKey)` - retorna HOJE/AMANHA/DD/MM (dia)
3. ✅ Implementado `groupBetsByDay(bets)` - agrupa por YYYY-MM-DD ordenado
4. ✅ Implementado `formatBetListWithDays(bets, formatBetFn)` - formatação genérica
5. ✅ Integrado em `handleApostasCommand` com `formatBetForList` callback
6. ✅ Integrado em `handleFiltrarCommand` com `formatBetForFilter` callback
7. ✅ Integrado em `handleFilaCommand` com `formatBetForQueue` callback
8. ✅ Todos os handlers usam separador visual `━━━━ *LABEL* ━━━━` entre dias
9. ✅ Preservada paginação existente em /apostas
10. ✅ Preservados limites de display em /filtrar
11. ✅ Criados 11 testes unitários para formatters.js

### Change Log

- 2026-01-14: Implementado agrupamento por dia para /apostas, /filtrar e /fila

### File List

- bot/utils/formatters.js (criado) - módulo de formatação com agrupamento por dia
- bot/handlers/adminGroup.js (modificado) - integração nos 3 handlers
- __tests__/utils/formatters.test.js (criado) - 11 testes unitários
