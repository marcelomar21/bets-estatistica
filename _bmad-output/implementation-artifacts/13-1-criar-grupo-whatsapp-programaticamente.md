# Story 13.1: Criar Grupo WhatsApp Programaticamente

Status: ready-for-dev

## Story

As a super admin,
I want criar um grupo WhatsApp para um influencer com 1-click no admin panel,
So that o influencer tenha um grupo WhatsApp pronto com os numeros da plataforma como admins.

## Acceptance Criteria

1. **Given** super admin acessa a pagina de um grupo/influencer no admin panel
   **When** clica em "Criar Grupo WhatsApp"
   **Then** sistema cria grupo WhatsApp via Baileys usando o numero `active` alocado ao grupo
   **And** os 3 numeros alocados (1 ativo + 2 backup) sao adicionados como admins do grupo
   **And** grupo e configurado como "so admins enviam" (announce mode)

2. **Given** grupo WhatsApp foi criado com sucesso
   **When** criacao e confirmada pelo Baileys
   **Then** `whatsapp_group_jid` e salvo na tabela `groups` no banco
   **And** status e exibido no admin panel como "WhatsApp ativo"

3. **Given** grupo nao tem numeros suficientes alocados
   **When** super admin tenta criar grupo WhatsApp
   **Then** sistema exibe erro explicativo e sugere alocar numeros primeiro

## Tasks

- [ ] Task 1: Migration — add `whatsapp_group_jid` and `channels` columns to `groups` table (AC: #2)
  - [ ] 1.1: ALTER TABLE groups ADD whatsapp_group_jid TEXT
  - [ ] 1.2: ALTER TABLE groups ADD channels TEXT[] DEFAULT ARRAY['telegram']
  - [ ] 1.3: Create migration file `sql/migrations/045_groups_whatsapp_columns.sql`
- [ ] Task 2: Add `createGroup()` method to BaileyClient (AC: #1)
  - [ ] 2.1: Create WhatsApp group via socket.groupCreate(name, participants)
  - [ ] 2.2: Set group to announce mode (only admins can post)
  - [ ] 2.3: Return group JID
- [ ] Task 3: Create `whatsapp/services/groupService.js` (AC: #1, #2, #3)
  - [ ] 3.1: `createWhatsAppGroup(groupId, groupName)` — orchestrates group creation
  - [ ] 3.2: Validates group has allocated numbers (active + backup)
  - [ ] 3.3: Creates group via BaileyClient, adds all numbers as admins
  - [ ] 3.4: Saves whatsapp_group_jid to groups table, updates channels array
- [ ] Task 4: API route in WhatsApp server `POST /api/whatsapp/groups/:groupId/create` (AC: #1, #3)
- [ ] Task 5: Admin panel — "Criar Grupo WhatsApp" button on group detail page (AC: #1, #2, #3)
  - [ ] 5.1: Button on group detail page with confirmation dialog
  - [ ] 5.2: API call to admin panel route that proxies to WhatsApp server
  - [ ] 5.3: Status indicator for WhatsApp channel
- [ ] Task 6: Admin panel API route `POST /api/groups/[groupId]/whatsapp` (AC: #1)
- [ ] Task 7: Write tests (all ACs)
- [ ] Task 8: Validation (tests + build + Playwright)

## Dev Notes

- BaileyClient needs `createGroup()` that wraps `socket.groupCreate(name, participants)` and `socket.groupSettingUpdate(jid, 'announcement')`
- The `participants` array should include the JIDs of all 3 allocated numbers
- The active number's client is used to create the group
- After creation, all 3 numbers become group admins automatically (they created it)
- The `groups` table needs 2 new columns: `whatsapp_group_jid` (TEXT) and `channels` (TEXT[] with default `['telegram']`)
- When WhatsApp is added, channels becomes `['telegram', 'whatsapp']`
- The admin panel group detail page needs a button and status indicator
- WhatsApp server API route handles the actual Baileys interaction
- Admin panel route proxies to the WhatsApp server

### Project Structure Notes

- `sql/migrations/045_groups_whatsapp_columns.sql` — new migration
- `whatsapp/client/baileyClient.js` — add createGroup method
- `whatsapp/services/groupService.js` — new service
- `whatsapp/server.js` — new API route
- `admin-panel/src/app/api/groups/[groupId]/whatsapp/route.ts` — new API route
- `admin-panel/src/app/(auth)/groups/[groupId]/page.tsx` — add WhatsApp button

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Channel Adapter]
- [Source: whatsapp/client/baileyClient.js — BaileyClient class]
- [Source: whatsapp/server.js — Express API routes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

### File List
