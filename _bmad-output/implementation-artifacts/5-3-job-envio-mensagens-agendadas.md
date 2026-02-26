# Story 5.3: Job de Envio de Mensagens Agendadas

Status: done

## Story

As a **sistema**,
I want enviar mensagens agendadas automaticamente no horário programado,
So that admins possam contar com entrega pontual sem intervenção manual.

## Acceptance Criteria

1. **Given** existem mensagens com `status = 'pending'` e `scheduled_at <= NOW()`
   **When** o job `sendScheduledMessages` executa (a cada 30s)
   **Then** busca todas as mensagens pendentes cuja hora chegou
   **And** envia cada mensagem no grupo público via API Telegram Bot (FR25, NFR-I3)
   **And** usa `parse_mode: 'Markdown'` para formatação Telegram

2. **Given** uma mensagem é enviada com sucesso
   **When** o Telegram retorna message_id
   **Then** atualiza: `status = 'sent'`, `sent_at = NOW()`, `telegram_message_id` (FR28)

3. **Given** o envio de uma mensagem falha (timeout, erro Telegram)
   **When** `attempts < 3`
   **Then** incrementa `attempts` e mantém `status = 'pending'` para retry na próxima execução (NFR-R3)

4. **Given** o envio falha e `attempts >= 3`
   **When** o limite de retries é atingido
   **Then** atualiza `status = 'failed'`
   **And** registra erro detalhado no log via `lib/logger.js`

5. **Given** o job é executado
   **When** existem múltiplas mensagens pendentes
   **Then** processa sequencialmente
   **And** falha em uma mensagem não impede processamento das demais

## Tasks / Subtasks

- [ ] Task 1: Criar bot/jobs/sendScheduledMessages.js (AC: #1, #2, #3, #4, #5)
  - [ ] 1.1 Buscar mensagens pending com scheduled_at <= now via supabase
  - [ ] 1.2 Para cada mensagem, obter botCtx via getBotForGroup(group_id)
  - [ ] 1.3 Enviar via sendToPublic(message_text, botCtx) com parse_mode Markdown
  - [ ] 1.4 Sucesso: update status='sent', sent_at=now, telegram_message_id
  - [ ] 1.5 Falha com attempts < 3: increment attempts, keep pending
  - [ ] 1.6 Falha com attempts >= 3: update status='failed'
  - [ ] 1.7 Return { sent, failed, retried } counts

- [ ] Task 2: Registrar job no server.js scheduler (AC: #1)
  - [ ] 2.1 Adicionar setInterval de 30s no bloco GROUP JOBS
  - [ ] 2.2 Wrappear com withExecutionLogging('send-scheduled-messages', ...)
  - [ ] 2.3 Adicionar log no console.log do scheduler summary

- [ ] Task 3: Adicionar formatResult para send-scheduled-messages
  - [ ] 3.1 No jobExecutionService.js, adicionar case no switch formatResult

- [ ] Task 4: Escrever testes
  - [ ] 4.1 Testar: busca mensagens pending com scheduled_at <= now
  - [ ] 4.2 Testar: envio com sucesso atualiza status/sent_at/telegram_message_id
  - [ ] 4.3 Testar: falha com attempts < 3 incrementa attempts
  - [ ] 4.4 Testar: falha com attempts >= 3 marca failed
  - [ ] 4.5 Testar: falha em uma mensagem nao impede processamento das demais
  - [ ] 4.6 Testar: sem bot para grupo loga warning e marca failed

- [ ] Task 5: Validacao completa
  - [ ] 5.1 `cd admin-panel && npm test` — todos os testes passam
  - [ ] 5.2 `cd admin-panel && npm run build` — TypeScript strict OK
  - [ ] 5.3 Testes bot: `node bot/jobs/sendScheduledMessages.js` (dry-run check)

## Dev Notes

### Job pattern

Seguir exatamente o pattern de `postBets.js` / `distributeBets.js`:
- require dotenv, logger, config, supabase, telegram
- Funcao principal `runSendScheduledMessages(options = {})`
- CLI runner no final (`require.main === module`)
- Sequential processing com for...of
- Return object com contadores

### Multi-bot support

Mensagens agendadas sao por grupo. Cada mensagem tem `group_id` que mapeia para um bot via `getBotForGroup(groupId)`. Se nao houver bot registrado para o grupo, logar warning e marcar como failed.

### sendToPublic ja usa parse_mode Markdown

A funcao `sendToPublic(text, botCtx)` em `bot/telegram.js` ja aplica `parse_mode: 'Markdown'` por padrao. Nao precisa passar explicitamente.

### Scheduler registration

O job roda como GROUP job (mode group ou mixed) ja que envia mensagens por grupo. Usar `setInterval` de 30s (mesmo pattern de checkPostNow e processWebhooks).

### formatResult pattern

Adicionar ao switch em `jobExecutionService.js`:
```javascript
case 'send-scheduled-messages': {
  const sent = result.sent || 0;
  const failed = result.failed || 0;
  if (sent > 0 || failed > 0) {
    return `${sent} sent, ${failed} failed`;
  }
  return 'nenhuma';
}
```

### Existing Files (context)

| File | Purpose |
|------|---------|
| `bot/jobs/postBets.js` | Job pattern reference |
| `bot/jobs/distributeBets.js` | Job pattern reference |
| `bot/server.js` | Scheduler registration |
| `bot/services/jobExecutionService.js` | withExecutionLogging + formatResult |
| `bot/telegram.js` | sendToPublic, getBotForGroup |
| `lib/supabase.js` | Supabase client |
| `lib/logger.js` | Logger |
| `sql/migrations/034_scheduled_messages.sql` | Table schema |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3] — AC
- [Source: _bmad-output/planning-artifacts/architecture.md#P6] — Job pattern
- [Source: bot/server.js] — Scheduler
- [Source: bot/telegram.js] — Telegram messaging

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Task 1: Created sendScheduledMessages.js — fetch pending, send via sendToPublic, retry logic (3 attempts max)
- Task 2: Registered as GROUP job in server.js with 30s setInterval + withExecutionLogging
- Task 3: Added formatResult case for send-scheduled-messages
- Task 4: 7 tests — zero messages, DB error, sent success, retry, failed after 3, no bot, multi-message isolation
- Task 5: 572 admin-panel tests pass, 39 bot tests pass, build OK

### File List
- bot/jobs/sendScheduledMessages.js (NEW — send scheduled messages job)
- bot/jobs/__tests__/sendScheduledMessages.test.js (NEW — 7 tests)
- bot/server.js (MODIFIED — registered 30s interval in GROUP block)
- bot/services/jobExecutionService.js (MODIFIED — added formatResult case)
