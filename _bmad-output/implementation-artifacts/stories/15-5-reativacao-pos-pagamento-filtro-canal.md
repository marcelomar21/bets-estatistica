# Story 15-5: Reativacao Pos-Pagamento e Filtro por Canal

Status: ready-for-dev

## Story

As a **sistema / super admin**,
I want reativar membros WhatsApp apos pagamento enviando novo invite link e filtrar membros por canal no admin,
So that membros pagantes voltem ao grupo automaticamente e a gestao seja organizada por canal.

## Acceptance Criteria

1. **AC1: Reativacao via webhook de pagamento (WhatsApp)**
   - Given membro WhatsApp foi kickado por inadimplencia e depois efetuou pagamento
   - When pagamento e confirmado (webhook)
   - Then novo invite link WhatsApp e gerado via inviteLinkService
   - And invite link e enviado via DM WhatsApp
   - And status do membro muda para `ativo`

2. **AC2: Reentrada detectada apos reativacao**
   - Given membro reativado reentrou no grupo via invite link
   - When sistema detecta reentrada (evento `add` em memberEvents)
   - Then status muda para `ativo` (ja cobre este caso no handleMemberJoin — membro em status `removido` volta para `trial`)
   - And evento `reactivation_join` e registrado

3. **AC3: Filtro por canal no admin panel**
   - Given super admin acessa gestao de membros no admin panel
   - When visualiza a lista de membros de um grupo
   - Then pode filtrar por canal: "Todos", "Telegram", "WhatsApp"

## Tasks

### Task 1: Extend webhookProcessors for WhatsApp reactivation
- In `handlePaymentApproved`, when member has `channel === 'whatsapp'`:
  - After `reactivateRemovedMember`, generate WhatsApp invite link
  - Send invite link via `channelAdapter.sendDM(phone, message, { channel: 'whatsapp', groupId })`
  - Skip Telegram-specific `bot.unbanChatMember` and `sendReactivationNotification`

### Task 2: Add channel filter to members API
- Modify `admin-panel/src/app/api/members/route.ts` to accept `channel` query param
- Filter members by channel when param is provided
- Values: `telegram`, `whatsapp`, or omit for all

### Task 3: Add channel filter UI in admin panel
- Add a filter dropdown/tabs on the members list page
- Options: "Todos", "Telegram", "WhatsApp"
- Pass `channel` param to the API

### Task 4: Tests
- Test WhatsApp reactivation path in webhookProcessors
- Test channel filter in members API
- Test that Telegram reactivation path remains unchanged

## Dev Notes

- `reactivateRemovedMember` already handles status change to `ativo` — no changes needed there
- `handleMemberJoin` in `whatsapp/handlers/memberEvents.js` already handles rejoining removed members by changing status to `trial` — this is fine for now (they get a new trial period)
- The WhatsApp invite link generation uses `inviteLinkService.generateInviteLink(groupId)` which already persists to DB
- For AC3, the members API route needs to add `.eq('channel', channel)` when the param is present
