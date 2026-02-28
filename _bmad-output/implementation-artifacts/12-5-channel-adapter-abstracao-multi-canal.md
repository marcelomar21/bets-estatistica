# Story 12.5: Channel Adapter — Abstração Multi-Canal

Status: done

## Story

As a sistema,
I want uma abstração uniforme para enviar mensagens em qualquer canal (Telegram ou WhatsApp),
So that toda a lógica de negócio seja agnóstica de canal e novos canais possam ser adicionados sem alterar services existentes.

## Acceptance Criteria

1. **Given** `channelAdapter.js` é criado em `lib/`
   **When** qualquer serviço precisa enviar mensagem para um grupo
   **Then** usa `channelAdapter.sendMessage(groupId, content, channel)` com interface uniforme
   **And** nunca envia diretamente via Baileys ou Telegram Bot API

2. **Given** uma mensagem formatada para Telegram (Markdown)
   **When** channel adapter processa para o canal WhatsApp
   **Then** formatação é convertida para WhatsApp (bold com `*`, italic com `_`, monospace com `` ` ``)
   **And** emojis e estrutura visual são preservados
   **And** links são mantidos como texto clicável

3. **Given** serviço precisa enviar DM a um membro
   **When** `channelAdapter.sendDM(userId, message, channel)` é chamado
   **Then** mensagem é enviada via Baileys (WhatsApp) ou Bot API (Telegram) conforme o canal
   **And** rate limit de 10 msg/min por número é respeitado

4. **Given** mensagem contém imagem (ex: banner de aposta)
   **When** channel adapter envia para WhatsApp
   **Then** usa `channelAdapter.sendPhoto(groupId, image, caption, channel)` com caption formatada

## Tasks

- [ ] Task 1: Create `lib/channelAdapter.js` with unified interface (AC: #1)
  - [ ] 1.1: `sendMessage(groupId, text, options)` — routes to telegram or whatsapp sender
  - [ ] 1.2: `sendPhoto(groupId, imageUrl, caption, options)` — routes media
  - [ ] 1.3: `sendDM(userId, message, options)` — routes to private message for correct channel
  - [ ] 1.4: `resolveChannel(groupId)` — looks up group's active channels from DB
- [ ] Task 2: Create `lib/formatConverter.js` with Telegram→WhatsApp conversion (AC: #2)
  - [ ] 2.1: Convert Telegram Markdown bold (`*text*` → `*text*` — same in WhatsApp)
  - [ ] 2.2: Convert Telegram Markdown italic (`_text_` → `_text_`)
  - [ ] 2.3: Handle monospace (`` `code` `` → `` `code` ``)
  - [ ] 2.4: Handle links `[text](url)` → plain `text url` for WhatsApp (no inline links)
  - [ ] 2.5: Preserve emojis and visual structure
- [ ] Task 3: Add `sendMessage()` method to BaileyClient (AC: #1)
  - [ ] 3.1: Send text messages via Baileys socket
  - [ ] 3.2: Send image messages with caption
  - [ ] 3.3: Integrate rate limiter
- [ ] Task 4: Create `whatsapp/services/whatsappSender.js` (AC: #1, #3, #4)
  - [ ] 4.1: `sendToGroup(groupJid, text)` — sends via active number's BaileyClient
  - [ ] 4.2: `sendMedia(groupJid, mediaUrl, caption)` — sends image/PDF
  - [ ] 4.3: `sendDM(phoneE164, message)` — sends private message via WhatsApp
  - [ ] 4.4: Resolve active number for group from pool
- [ ] Task 5: Write comprehensive tests (AC: all)
- [ ] Task 6: Validation (tests + build)

## Dev Notes

- Telegram messages use `Markdown` parse mode (bold: `*`, italic: `_`, links: `[text](url)`)
- WhatsApp uses similar but slightly different formatting; links don't support inline format
- The channelAdapter sits in `lib/` because it's shared across bot/ and whatsapp/
- `bot/telegram.js` has `sendToPublic()`, `sendMediaToPublic()`, `sendPrivateMessage()` (via notificationService)
- BaileyClient currently has NO sendMessage — needs to be added
- Rate limiter already exists at `whatsapp/utils/rateLimiter.js`
- The server.js has a `clients` Map with all active BaileyClient instances

### Project Structure Notes

- `lib/channelAdapter.js` — new, shared module
- `lib/formatConverter.js` — new, Telegram↔WhatsApp format conversion
- `whatsapp/services/whatsappSender.js` — new, WhatsApp sending service
- `whatsapp/client/baileyClient.js` — add sendMessage/sendImage methods

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Channel Adapter]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5]
- [Source: bot/telegram.js — sendToPublic, sendMediaToPublic]
- [Source: whatsapp/client/baileyClient.js — BaileyClient class]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

### File List
