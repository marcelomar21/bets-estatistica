# Story 8.1: Comando /apostas - Listar Apostas Disponíveis

Status: done

## Story

As a operador,
I want listar todas as apostas disponíveis,
So that possa ver o que está na fila.

## Acceptance Criteria

1. **Given** operador envia `/apostas` no grupo admin
   **When** bot processa comando
   **Then** lista apostas com jogos futuros

2. **Given** lista de apostas
   **When** exibir cada aposta
   **Then** mostra: ID, times, data/hora, mercado, odd

3. **Given** lista de apostas
   **When** ordenar
   **Then** ordena por data do jogo (mais próximo primeiro)

4. **Given** cada aposta na lista
   **When** exibir status de link
   **Then** indica quais já têm link (✅) ou não (❌)

5. **Given** não existem apostas disponíveis
   **When** operador envia `/apostas`
   **Then** exibe mensagem "Nenhuma aposta disponível no momento"

## Tasks / Subtasks

- [ ] **Task 1: Criar função `getAvailableBets()` em betService.js** (AC: #1, #3)
  - [ ] 1.1 Buscar apostas com status in ('generated', 'pending_link', 'ready', 'posted')
  - [ ] 1.2 Filtrar apenas jogos futuros (kickoff_time > now)
  - [ ] 1.3 Ordenar por kickoff_time ASC

- [ ] **Task 2: Criar handler para comando /apostas** (AC: #1, #2, #4, #5)
  - [ ] 2.1 Adicionar regex pattern para `/apostas`
  - [ ] 2.2 Chamar `getAvailableBets()`
  - [ ] 2.3 Formatar mensagem com lista de apostas
  - [ ] 2.4 Indicar status de link (✅/❌)
  - [ ] 2.5 Tratar caso de lista vazia

- [ ] **Task 3: Registrar comando no bot** (AC: #1)
  - [ ] 3.1 Adicionar handler no fluxo de mensagens admin

## Dev Notes

### Formato de Saída Esperado

```
📋 APOSTAS DISPONÍVEIS (3)

1️⃣ [ID:45] Liverpool vs Arsenal
   📅 15/01 às 17:00
   🎯 Over 2.5 gols
   📊 Odd: 1.85 | 🔗 ✅

2️⃣ [ID:46] Real Madrid vs Barcelona
   📅 16/01 às 21:00
   🎯 Ambas marcam
   📊 Odd: 1.72 | 🔗 ❌

3️⃣ [ID:47] PSG vs Lyon
   📅 17/01 às 16:00
   🎯 Under 3.5 gols
   📊 Odd: 1.65 | 🔗 ❌

💡 Para adicionar link: ID: URL
💡 Para ajustar odd: /odds ID valor
```

### Código de Referência

**betService.js - Nova função:**

```javascript
async function getAvailableBets() {
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`
      id, bet_market, bet_pick, odds, bet_status, deep_link,
      league_matches!inner (
        home_team_name, away_team_name, kickoff_time
      )
    `)
    .in('bet_status', ['generated', 'pending_link', 'ready', 'posted'])
    .gte('league_matches.kickoff_time', new Date().toISOString())
    .order('league_matches(kickoff_time)', { ascending: true });
  
  // Flatten and return...
}
```

**adminGroup.js - Novo handler:**

```javascript
const APOSTAS_PATTERN = /^\/apostas$/i;

async function handleApostasCommand(bot, msg) {
  const result = await getAvailableBets();
  
  if (!result.success || result.data.length === 0) {
    await bot.sendMessage(msg.chat.id, '📋 Nenhuma aposta disponível no momento.');
    return;
  }
  
  // Format message...
}
```

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `bot/services/betService.js` | Adicionar `getAvailableBets()` |
| `bot/handlers/adminGroup.js` | Adicionar handler para `/apostas` |

### References

- [Source: bot/handlers/adminGroup.js] - Handler existente de mensagens admin
- [Source: bot/services/betService.js] - Funções de acesso ao BD
- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.1] - Especificação

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (2026-01-11)

### Debug Log References

N/A

### Completion Notes List

1. ✅ Criada função `getAvailableBets()` em betService.js
2. ✅ Criado handler `handleApostasCommand()` em adminGroup.js
3. ✅ Registrado pattern `/apostas` no fluxo de mensagens
4. ✅ Formatação rica com emojis de status e link
5. ✅ Helper functions: `getStatusEmoji()`, `getNumberEmoji()`

### File List

| Arquivo | Modificação |
|---------|-------------|
| `bot/services/betService.js` | +55 linhas - `getAvailableBets()` |
| `bot/handlers/adminGroup.js` | +80 linhas - handler e helpers |
