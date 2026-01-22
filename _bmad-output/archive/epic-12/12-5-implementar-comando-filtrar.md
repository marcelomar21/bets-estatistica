# Story 12.5: Implementar Comando /filtrar

Status: done

## Story

As a operador,
I want filtrar apostas por critérios específicos,
so that tenha visibilidade rápida do status de diferentes grupos de apostas.

## Requisitos

**Filtros disponíveis:**
- `/filtrar sem_odds` - apostas sem odds definida
- `/filtrar sem_link` - apostas sem link (exceto posted/success/failure)
- `/filtrar com_link` - apostas com link
- `/filtrar com_odds` - apostas com odds
- `/filtrar prontas` - apostas com status 'ready'

## Acceptance Criteria

1. **AC1:** Comando `/filtrar sem_odds` lista apostas onde odds é NULL ou 0
2. **AC2:** Comando `/filtrar sem_link` lista apostas sem deep_link
3. **AC3:** Comando `/filtrar com_link` lista apostas com deep_link
4. **AC4:** Comando `/filtrar com_odds` lista apostas com odds > 0
5. **AC5:** Comando `/filtrar prontas` lista apostas com status 'ready'
6. **AC6:** `/filtrar` sem argumento mostra ajuda com filtros disponíveis
7. **AC7:** Lista ordenada por data do jogo (mais próximo primeiro)

## Tasks / Subtasks

- [ ] Task 1: Adicionar regex e handler (AC: 1-7)
  - [ ] 1.1 Criar regex `FILTRAR_PATTERN`
  - [ ] 1.2 Criar função `handleFiltrarCommand()`
  - [ ] 1.3 Adicionar no dispatcher `handleAdminMessage()`
  - [ ] 1.4 Atualizar ajuda em `handleHelpCommand()`

## Dev Notes

### Arquivo Principal

`bot/handlers/adminGroup.js`

### Regex

```javascript
// Regex to match "/filtrar [tipo]" command (Story 12.5)
const FILTRAR_PATTERN = /^\/filtrar(?:\s+(sem_odds|sem_link|com_link|com_odds|prontas))?$/i;
```

### Função Handler

```javascript
/**
 * Handle /filtrar command - Filter bets by criteria (Story 12.5)
 */
async function handleFiltrarCommand(bot, msg, filterType) {
  // Se não passou filtro, mostrar ajuda
  if (!filterType) {
    // mostrar filtros disponíveis
  }
  
  // Buscar apostas disponíveis
  const result = await getAvailableBets();
  
  // Aplicar filtro
  let filtered = [];
  switch (filterType.toLowerCase()) {
    case 'sem_odds':
      filtered = bets.filter(b => !b.odds || b.odds === 0);
      break;
    case 'sem_link':
      filtered = bets.filter(b => !b.deepLink);
      break;
    // ... outros filtros
  }
  
  // Formatar e enviar
}
```

### Formato de Saída

```
📋 *APOSTAS SEM ODDS* (5)

━━━━━━━━━━━━━━━━━━
#45 Liverpool vs Arsenal
🎯 Over 2.5 gols
📅 15/01 17:00
⚠️ SEM ODD │ ❌ SEM LINK

━━━━━━━━━━━━━━━━━━
#47 Real Madrid vs Barcelona
🎯 Ambas marcam
📅 16/01 21:00
⚠️ SEM ODD │ 🔗 Com link

💡 Use `/odd ID valor` para definir odds
```

### References

- [Source: prd-addendum-v3.md#FEAT-008]
- [Source: bot/handlers/adminGroup.js]
- [Source: bot/services/betService.js#getAvailableBets]

## Dev Agent Record

### Agent Model Used

_Preencher após implementação_

### Completion Notes List

### File List

- `bot/handlers/adminGroup.js` (modificado)
