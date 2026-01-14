# Story 14.1: Corrigir Bug /link Duplicado

Status: ready-for-dev

## Story

As a operador,
I want receber apenas 1 mensagem quando cadastro um link,
so that não seja confundido com mensagens duplicadas.

## Acceptance Criteria

1. **Given** operador envia `/link 45 https://betano.com/...`
   **When** bot processa e salva o link
   **Then** envia APENAS 1 mensagem de confirmação
   **And** não chama `confirmLinkReceived()` separadamente

2. **Given** link foi salvo com sucesso
   **When** confirmação é enviada
   **Then** mensagem contém: match, mercado e status da aposta

3. **Given** link já existia e foi atualizado
   **When** confirmação é enviada
   **Then** mostra apenas a mensagem de atualização (já existente)
   **And** não duplica confirmações

## Tasks / Subtasks

- [ ] Task 1: Remover chamada duplicada de confirmLinkReceived (AC: #1)
  - [ ] 1.1: Localizar função handleLinkUpdate em bot/handlers/adminGroup.js
  - [ ] 1.2: Remover linhas 1279-1284 (chamada confirmLinkReceived)
  - [ ] 1.3: Manter apenas bot.sendMessage das linhas 1272-1276

- [ ] Task 2: Verificar outros usos de confirmLinkReceived (AC: #1)
  - [ ] 2.1: Buscar outras chamadas de confirmLinkReceived no código
  - [ ] 2.2: Avaliar se devem ser mantidas ou removidas

- [ ] Task 3: Testar correção (AC: #1, #2, #3)
  - [ ] 3.1: Testar /link ID URL - deve enviar 1 mensagem
  - [ ] 3.2: Testar ID: URL (formato legado) - deve enviar 1 mensagem
  - [ ] 3.3: Testar atualização de link existente - deve enviar mensagem de aviso + confirmação (2 mensagens OK)

## Dev Notes

### Análise do Bug

O bug ocorre porque `handleLinkUpdate()` envia DUAS mensagens para o mesmo evento:

1. **Linha 1272-1276:** `bot.sendMessage()` com confirmação completa
2. **Linha 1279-1284:** `confirmLinkReceived()` que também envia mensagem via `sendToAdmin()`

**Resultado:** Operador recebe 2 mensagens praticamente idênticas.

### Código Atual (Problemático)

```javascript
// bot/handlers/adminGroup.js - handleLinkUpdate()

// PRIMEIRA MENSAGEM (correta)
await bot.sendMessage(
  msg.chat.id,
  `✅ *Link salvo!*\n\n🏟️ ${match}\n🎯 ${bet.betMarket}\n${statusMsg}`,
  { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
);

// SEGUNDA MENSAGEM (REMOVER)
await confirmLinkReceived({
  homeTeamName: bet.homeTeamName,
  awayTeamName: bet.awayTeamName,
  betMarket: bet.betMarket,
  betPick: bet.betPick,
});
```

### Solução

Remover a chamada `confirmLinkReceived()` nas linhas 1279-1284. A mensagem das linhas 1272-1276 já contém todas as informações necessárias.

### Arquivos Afetados

| Arquivo | Ação | Linhas |
|---------|------|--------|
| `bot/handlers/adminGroup.js` | Remover código | 1279-1284 |

### Impacto da Mudança

- **Baixo risco:** Apenas remove chamada duplicada
- **Nenhuma regressão:** A confirmação principal é mantida
- **Melhoria UX:** Operador não fica confuso com mensagens duplicadas

### Project Structure Notes

- Alinhado com padrão de handlers em `bot/handlers/`
- Segue convenção de logging existente
- Mantém pattern de response `{ success, data/error }`

### References

- [Source: bot/handlers/adminGroup.js:1206-1287] - Função handleLinkUpdate
- [Source: bot/services/alertService.js:94-104] - Função confirmLinkReceived
- [Source: _bmad-output/planning-artifacts/epics.md#story-14.1] - Definição original

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/handlers/adminGroup.js (modificar)
