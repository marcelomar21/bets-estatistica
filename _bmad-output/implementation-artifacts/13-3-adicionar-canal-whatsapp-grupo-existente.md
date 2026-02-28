# Story 13-3: Adicionar Canal WhatsApp a Grupo Existente

## Status: ready-for-dev

## Story
As a super admin,
I want adicionar WhatsApp como canal a um grupo que já existe no Telegram,
So that o grupo passe a operar em ambos os canais sem recriar nada.

## Acceptance Criteria
1. Grupo com canal Telegram ativo → super admin clica "Adicionar WhatsApp" → sistema aloca números, cria grupo WhatsApp, atualiza channels
2. Influencer solicita → super admin executa com 1-click
3. Novo grupo em onboarding → WhatsApp disponível como opção de canal

## Analysis
This story is largely an orchestration of existing capabilities:
- Number allocation: `allocateToGroup()` from `numberPoolService.js` (Story 12-3)
- Group creation: `createWhatsAppGroup()` from `groupService.js` (Story 13-1)
- Invite link: `generateInviteLink()` from `inviteLinkService.js` (Story 13-2)

The main new work is a single "1-click" endpoint and button that chains:
allocate → create group → generate invite link.

## Tasks

### Task 1: addWhatsAppChannel service
- Create `whatsapp/services/addChannelService.js`
- `addWhatsAppChannel(groupId)` orchestrates:
  1. Validate group exists and doesn't have WhatsApp yet
  2. Call `allocateToGroup(groupId)` to allocate numbers from pool
  3. Call `createWhatsAppGroup(groupId)` to create the group
  4. Call `generateInviteLink(groupId)` to get invite link
  5. Return combined result

### Task 2: WhatsApp server route
- `POST /api/whatsapp/groups/:groupId/add-channel` — calls addWhatsAppChannel

### Task 3: Admin panel API route
- `POST /api/groups/[groupId]/add-whatsapp` — proxy to WhatsApp server

### Task 4: Admin panel UI
- "Adicionar WhatsApp" button on group detail page (visible when group has no WhatsApp)
- Confirmation modal with progress feedback
- On success, refresh page to show updated channels

### Task 5: Tests
- addChannelService unit tests
- Build validation
