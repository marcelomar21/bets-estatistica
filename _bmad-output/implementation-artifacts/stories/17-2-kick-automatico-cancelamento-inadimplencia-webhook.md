# Story 17-2: Kick Automatico por Cancelamento/Inadimplencia via Webhook

Status: done

## Story

As a **sistema**,
I want remover automaticamente membros do grupo WhatsApp quando a assinatura e cancelada,
So that apenas membros pagantes tenham acesso ao grupo em todos os canais.

## Acceptance Criteria

1. **AC1: Kick multi-canal no cancelamento**
   - Given webhook Mercado Pago notifica cancelamento de assinatura
   - When sistema processa o webhook (`handleSubscriptionCancelled`)
   - Then membro e removido do grupo WhatsApp via Baileys (kick)
   - And membro e removido do grupo Telegram (comportamento existente mantido)

2. **AC2: Revogacao de invite apos kick WhatsApp**
   - Given membro e kickado do WhatsApp por cancelamento
   - When kick e executado
   - Then invite link atual e revogado
   - And novo invite link e gerado para futuros membros

3. **AC3: Retrocompatibilidade Telegram-only**
   - Given membro inadimplente esta apenas no Telegram (sem WhatsApp)
   - When cancelamento e processado
   - Then apenas kick do Telegram e executado, sem erro no processamento WhatsApp

4. **AC4: Farewell DM via WhatsApp**
   - Given membro WhatsApp tem assinatura cancelada
   - When cancelamento e processado
   - Then mensagem de despedida com link checkout e enviada via WhatsApp DM

## Existing Infrastructure

- **webhookProcessors.js:handleSubscriptionCancelled**: Already handles Telegram farewell DM and kick. Need to add WhatsApp kick.
- **baileyClient.js**: `removeGroupParticipant(groupJid, participantJid)` kicks a member.
- **inviteLinkService.js**: `revokeAndRegenerate(groupId)` revokes old link and creates new one.
- **channelAdapter.js**: `sendDM` dispatches to whatsapp based on channel param.
- **clientRegistry.js**: `getClientForGroup(groupId)` returns the active BaileyClient for a group.
- **members table**: WhatsApp members have `channel='whatsapp'`, `channel_user_id=phone`.
- **groups table**: `whatsapp_group_jid` non-null means group has WhatsApp channel.

## Tasks

### Task 1: Add WhatsApp farewell DM in handleSubscriptionCancelled
- After the Telegram farewell DM block (lines 1250-1256):
  - Check if group has WhatsApp (`group?.whatsapp_group_jid`)
  - Query for WhatsApp member(s) in the same group by looking up members with `group_id` and `channel='whatsapp'` and same email
  - If found with `channel_user_id`, send farewell DM via WhatsApp channelAdapter

### Task 2: Add WhatsApp kick in handleSubscriptionCancelled
- After the Telegram kick block (lines 1258-1273):
  - If group has WhatsApp and WhatsApp member was found:
    - Get BaileyClient via clientRegistry
    - Kick from WhatsApp group using `removeGroupParticipant`
    - Revoke and regenerate invite link using inviteLinkService
    - Mark WhatsApp member row as removed

### Task 3: Tests
- Test subscription cancelled kicks WhatsApp member and revokes invite
- Test subscription cancelled for telegram-only group unchanged
- Test WhatsApp kick failure is non-blocking (Telegram flow still executes)
- Test farewell DM sent via WhatsApp for WhatsApp member

## Dev Notes

- The subscription cancellation finds the PRIMARY member (Telegram) by subscription_id. The WhatsApp member is a separate row with no subscription_id.
- To find the WhatsApp counterpart: query members by `group_id` + `channel='whatsapp'` + same `email` (if available)
- If no WhatsApp member found, skip silently — group may not have WhatsApp channel
- WhatsApp kick is non-blocking — if it fails, Telegram processing and DB update continue
- Reuse existing `markMemberAsRemoved` for the WhatsApp member row
- `removeGroupParticipant` needs the participant JID format: `phone@s.whatsapp.net`
