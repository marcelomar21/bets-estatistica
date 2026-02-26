# Story 8.3: Envio de Midia pelo Bot no Telegram

Status: done

## Story

As a **sistema (job de envio)**,
I want que o bot envie PDF ou imagem junto com a mensagem agendada,
So that membros do grupo recebam o conteudo rico no Telegram.

## Acceptance Criteria

1. **Given** mensagem agendada com `media_type = 'image'`
   **When** job processa a mensagem
   **Then** bot usa `sendPhoto` com signed URL do Supabase Storage e `caption` com texto (FR61)

2. **Given** mensagem agendada com `media_type = 'pdf'`
   **When** job processa a mensagem
   **Then** bot usa `sendDocument` com signed URL e `caption` com texto (FR61)

3. **Given** mensagem agendada sem midia (`media_type = null`)
   **When** job processa a mensagem
   **Then** bot usa `sendMessage` (comportamento atual mantido)

4. **Given** falha no envio de midia
   **When** tentativas < 3
   **Then** retry no proximo ciclo com backoff

5. **Given** envio bem-sucedido
   **When** mensagem e enviada
   **Then** atualiza `status = 'sent'`, `sent_at`, `telegram_message_id`

## Tasks / Subtasks

- [x] Task 1: Adicionar `sendMediaToPublic` em `telegram.js`
- [x] Task 2: Modificar `sendScheduledMessages.js` para gerar signed URL e enviar midia
- [x] Task 3: Testes e validacao
  - [x] 3.1 `cd admin-panel && npm test` — 639 tests pass
  - [x] 3.2 `cd admin-panel && npm run build` — build OK

## Dev Agent Record

### Agent Model Used
claude-opus-4-6

### Completion Notes List
- Added `sendMediaToPublic()` to `bot/telegram.js` with botCtx/mediaType validation
- Modified `sendScheduledMessages.js` to generate signed URL (5-min expiry) and dispatch via `sendMediaToPublic` for image/pdf, `sendToPublic` for text-only
- Code review: added null guards on botCtx and mediaType validation
- All 639 tests pass, build clean

### File List
- `bot/telegram.js` — added `sendMediaToPublic()` function
- `bot/jobs/sendScheduledMessages.js` — media dispatch with signed URL generation
