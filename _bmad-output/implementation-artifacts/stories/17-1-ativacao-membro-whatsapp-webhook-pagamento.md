# Story 17-1: Ativacao de Membro WhatsApp via Webhook de Pagamento

Status: done

## Story

As a **membro pagante**,
I want receber acesso automatico ao grupo WhatsApp apos confirmar pagamento,
So that eu comece a receber apostas no WhatsApp sem acao manual.

## Acceptance Criteria

1. **AC1: Ativacao multi-canal**
   - Given webhook Mercado Pago confirma pagamento de um membro
   - When sistema processa o webhook
   - Then membro e ativado em TODOS os canais que o grupo oferece (Telegram e/ou WhatsApp)

2. **AC2: Envio de invite WhatsApp apos pagamento**
   - Given grupo tem canal WhatsApp ativo e membro acabou de pagar
   - When ativacao WhatsApp e processada
   - Then invite link do grupo WhatsApp e enviado via DM para o telefone do membro

3. **AC3: Membro ja no grupo WhatsApp**
   - Given membro ja esta no grupo WhatsApp (ex: veio do trial)
   - When pagamento e confirmado
   - Then status muda diretamente para active sem necessidade de novo invite

4. **AC4: Retrocompatibilidade**
   - Given grupo tem apenas canal Telegram (sem WhatsApp)
   - When pagamento e confirmado
   - Then comportamento atual e mantido sem alteracoes

## Existing Infrastructure

- **webhookProcessors.js**: Already handles payment webhooks with multi-status member processing. Story 15-5 added WhatsApp reactivation for `status === 'removido'` case.
- **channelAdapter.js**: `sendDM` dispatches to telegram or whatsapp based on channel param.
- **inviteLinkService.js**: `generateInviteLink(groupId)` creates WhatsApp invite links.
- **groups table**: Has `whatsapp_group_jid` column — non-null means group has WhatsApp channel.
- **members table**: Has `channel` column ('telegram' | 'whatsapp') — each channel is a separate row.

## Tasks

### Task 1: Add WhatsApp DM confirmation for trial → active conversion
- In `handlePaymentApproved`, after trial activation succeeds:
  - Check if member.channel === 'whatsapp'
  - If WhatsApp: member is already in the group (came from trial), just send confirmation DM via WhatsApp
  - If Telegram: existing DM flow unchanged

### Task 2: Add WhatsApp DM for new member creation
- When a brand-new member is created from payment (no prior member found):
  - Currently only sends Telegram DM
  - Add: if group has WhatsApp, also create WhatsApp member row and send invite link
  - Note: new member won't have `channel_user_id` yet since they haven't joined WhatsApp

### Task 3: Add WhatsApp DM for inadimplente recovery
- In the `inadimplente → ativo` recovery path:
  - Check if member.channel === 'whatsapp'
  - If WhatsApp and member is already in group: send confirmation DM
  - If WhatsApp and member was kicked: send invite link

### Task 4: Tests
- Test trial WhatsApp member activation sends WhatsApp DM
- Test new member creation for group with WhatsApp creates WhatsApp row
- Test retrocompatibility: telegram-only group unchanged
- Test inadimplente WhatsApp recovery

## Dev Notes

- Story 15-5 already added the WhatsApp reactivation flow for `removido` status — reuse that pattern
- For trial→active, member is already in the WhatsApp group, so just send a confirmation DM (no invite link needed)
- For inadimplente recovery, member was NOT kicked from WhatsApp (they're just marked inadimplente in DB), so send confirmation DM only
- The key insight: `member.channel` tells us which channel this specific member row represents
- All DM sends are non-blocking (try/catch, best effort)
