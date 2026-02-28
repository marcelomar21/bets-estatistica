# Story 15-4: Kick Inadimplentes e Revogacao de Invite WhatsApp

Status: in-progress

## Story

As a **sistema**,
I want remover membros inadimplentes ou com trial expirado do grupo WhatsApp e revogar o invite link,
So that apenas membros pagantes tenham acesso ao grupo.

## Acceptance Criteria

1. **AC1: Kick de trial expirado**
   - Given trial de um membro expirou sem pagamento
   - When job de kick executa
   - Then membro e removido do grupo WhatsApp via Baileys removeGroupParticipant
   - And status do membro muda para `removido`

2. **AC2: Revogacao de invite link apos kick**
   - Given membro e removido por inadimplencia
   - When kick e executado
   - Then invite link atual do grupo e revogado via inviteLinkService
   - And novo invite link e gerado automaticamente
   - And link antigo para de funcionar imediatamente

3. **AC3: Reativacao manual**
   - Given membro tem assinatura ativa mas foi kickado por erro
   - When super admin identifica o problema
   - Then pode reativar manualmente via admin panel (ja existe)

## Tasks

### Task 1: Extend kick-expired.js for WhatsApp channel
- In `processMemberKick`, branch on `member.channel`:
  - `telegram`: keep existing flow unchanged
  - `whatsapp`: use WhatsApp-specific kick flow
- WhatsApp kick flow:
  1. Send farewell DM via `channelAdapter.sendDM(phone, message, { channel: 'whatsapp', groupId })`
  2. Remove from group via `BaileyClient.removeGroupParticipant(groupJid, participantJid)`
  3. Mark as `removido` in DB
  4. Revoke invite link via `inviteLinkService.revokeInviteLink(groupId)`
  5. Register audit event

### Task 2: Resolve WhatsApp group JID and client for kick
- Need to look up `whatsapp_group_jid` from groups table
- Need to resolve the active BaileyClient for the group
- Convert member's `channel_user_id` (E.164 phone) to JID for removeGroupParticipant

### Task 3: Tests
- Add tests for WhatsApp kick path in kick-expired
- Test farewell DM, group removal, invite revocation, audit logging
- Test that Telegram path remains unchanged

## Dev Notes

- `processMemberKick` currently assumes Telegram — needs channel-aware branching
- WhatsApp members have `telegram_id: null` — the existing "skip if no telegram_id" path already marks them as removed, but doesn't actually kick from WhatsApp group
- `inviteLinkService.revokeInviteLink(groupId)` already handles the full revoke+save flow
- Farewell message format can reuse `formatFarewellMessage` (Telegram format → channelAdapter converts)
