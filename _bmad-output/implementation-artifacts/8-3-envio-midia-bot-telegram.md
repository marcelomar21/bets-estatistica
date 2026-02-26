# Story 8.3: Envio de Midia pelo Bot no Telegram

Status: ready-for-dev

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

- [ ] Task 1: Adicionar `sendMediaToPublic` em `telegram.js`
- [ ] Task 2: Modificar `sendScheduledMessages.js` para gerar signed URL e enviar midia
- [ ] Task 3: Testes e validacao
  - [ ] 3.1 `cd admin-panel && npm test` — testes do admin panel passando
  - [ ] 3.2 `cd admin-panel && npm run build` — build OK

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
