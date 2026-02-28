# Story 13-2: Gestão de Invite Links do Grupo WhatsApp

## Status: ready-for-dev

## Story
As a super admin,
I want gerar e revogar links de convite do grupo WhatsApp,
So that eu possa controlar o acesso ao grupo e invalidar links antigos quando necessário.

## Acceptance Criteria
1. Grupo WhatsApp existe e está ativo → super admin pode gerar invite link via Baileys, link é armazenado no banco
2. Existe um invite link ativo → super admin pode revogar o link, novo link pode ser gerado
3. Sistema precisa revogar link (ex: após kick) → link antigo para de funcionar, novo link gerado automaticamente

## Tasks

### Task 1: BaileyClient.getGroupInviteLink & revokeGroupInviteLink
- Add `getGroupInviteLink(groupJid)` method to BaileyClient
  - Uses `socket.groupInviteCode(groupJid)` to get code
  - Returns `{ success, data: { inviteLink: 'https://chat.whatsapp.com/CODE' } }`
  - 30s timeout via Promise.race
- Add `revokeGroupInviteLink(groupJid)` method
  - Uses `socket.groupRevokeInvite(groupJid)` to revoke + get new code
  - Returns `{ success, data: { inviteLink: 'https://chat.whatsapp.com/NEW_CODE' } }`
  - 30s timeout
- Add unit tests

### Task 2: inviteLinkService.js
- Create `whatsapp/services/inviteLinkService.js`
- `generateInviteLink(groupId)` — looks up group, finds active number client, calls getGroupInviteLink, saves to DB
- `revokeInviteLink(groupId)` — revokes current link, generates new one, saves to DB
- Migration: add `whatsapp_invite_link TEXT` column to groups table

### Task 3: WhatsApp server routes
- `POST /api/whatsapp/groups/:groupId/invite-link` — generate invite link
- `DELETE /api/whatsapp/groups/:groupId/invite-link` — revoke invite link

### Task 4: Admin panel API route
- `POST /api/groups/[groupId]/whatsapp-invite` — proxy to WhatsApp server to generate
- `DELETE /api/groups/[groupId]/whatsapp-invite` — proxy to revoke

### Task 5: Admin panel UI
- Show invite link on group detail page when available
- "Gerar Invite Link" button (visible when group has WhatsApp but no invite link)
- "Revogar e Regenerar" button (visible when invite link exists)
- Copy-to-clipboard for the invite link

### Task 6: Tests
- BaileyClient unit tests for getGroupInviteLink/revokeGroupInviteLink
- inviteLinkService unit tests
- Admin panel build validation
