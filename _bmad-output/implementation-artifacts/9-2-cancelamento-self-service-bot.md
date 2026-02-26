# Story 9.2: Cancelamento Self-Service pelo Membro via Bot

Status: ready-for-dev

## Story

As a **membro do grupo**,
I want poder cancelar minha assinatura via comando no bot,
So that eu tenha autonomia para sair sem precisar falar com ninguem.

## Acceptance Criteria

1. **Given** membro esta no chat privado com o bot e tem status `trial` ou `ativo`
   **When** envia o comando `/cancelar`
   **Then** bot responde com mensagem de confirmacao com botoes inline [Confirmar Cancelamento] e [Voltar]

2. **Given** membro clica [Voltar]
   **When** callback e processado
   **Then** bot responde "Cancelamento abortado. Voce continua no grupo!"

3. **Given** membro clica [Confirmar Cancelamento]
   **When** callback e processado
   **Then** sistema atualiza `status = 'cancelado'`, `kicked_at = now()`, `cancellation_reason = 'self_cancel'`, `cancelled_by = null`

4. **Given** cancelamento confirmado
   **When** processamento concluido
   **Then** bot envia mensagem de despedida com link de checkout e remove membro via `banChatMember`

5. **Given** membro nao tem status `trial` ou `ativo`
   **When** envia `/cancelar`
   **Then** bot responde "Voce nao tem assinatura ativa para cancelar."

6. **Given** comando `/cancelar` enviado em grupo (nao privado)
   **When** bot recebe a mensagem
   **Then** ignora o comando (so funciona em chat privado)

## Tasks / Subtasks

- [ ] Task 1: Criar handler `cancelCommand.js`
  - [ ] 1.1 `handleCancelCommand(msg, botCtx)` — verifica chat privado, busca membro, valida status
  - [ ] 1.2 Envia mensagem com inline keyboard [Confirmar Cancelamento] / [Voltar]
  - [ ] 1.3 `handleCancelCallback(bot, callbackQuery, botCtx)` — processa confirmacao ou cancelamento

- [ ] Task 2: Registrar comando no server.js e index.js
  - [ ] 2.1 Adicionar rota `/cancelar` em `server.js` (webhook mode)
  - [ ] 2.2 Adicionar rota `/cancelar` em `index.js` (polling mode)
  - [ ] 2.3 Adicionar callback handler para `cancel_membership_*`

- [ ] Task 3: Testes e validacao
  - [ ] 3.1 `cd admin-panel && npm test` — todos os testes passando
  - [ ] 3.2 `cd admin-panel && npm run build` — build OK

## Dev Notes

### Command Registration Pattern

Em `server.js` (webhook), comandos privados sao verificados em `processWebhookUpdate`:
```javascript
if (chatType === 'private') {
  if (text === '/cancelar') {
    await handleCancelCommand(msg, botCtx);
    return;
  }
}
```

Em `index.js` (polling), adicionar no `bot.on('message')` handler.

### Callback Pattern

Seguir padrao de `callbackHandlers.js` para removal:
- `cancel_membership_confirm_{memberId}` → processa cancelamento
- `cancel_membership_abort_{memberId}` → aborta

### Member Lookup

Usar `memberService.getMemberByTelegramId(telegramId, groupId)` para buscar membro.

### References

- [Source: bot/server.js] Command routing (webhook)
- [Source: bot/index.js] Command routing (polling)
- [Source: bot/handlers/admin/callbackHandlers.js] Callback pattern
- [Source: bot/services/memberService.js] State machine, getMemberByTelegramId

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
