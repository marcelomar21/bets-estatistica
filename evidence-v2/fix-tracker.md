# Audit v2 Fix Tracker

## Status: COMPLETE

| # | ID | Severity | Status | Description |
|---|-----|----------|--------|-------------|
| 1 | CRASH-001 | critical | DONE | Dashboard crash - members.vencimento_at column does not exist |
| 2 | AUTH-001 | critical | DONE | /settings/telegram acessivel para group_admin |
| 3 | AUTH-002 | high | DONE | /admin-users acessivel para group_admin |
| 4 | AUTH-003 | high | DONE | /job-executions acessivel para group_admin |
| 5 | TONE-001 | high | DONE | /tone sidebar dead-end para group_admin |
| 6 | API-001 | medium | DONE | /api/groups 403 em todas as paginas para group_admin |
| 7 | SEC-001 | medium | DONE | Botao Excluir grupo visivel para group_admin |
| 8 | SEC-002 | medium | DONE | Botao Novo Grupo visivel para group_admin |
| 9 | DATA-001 | medium | DONE | Historico mostra aposta nao-postada |
| 10 | UI-001 | low | SKIP | Telegram Group ID e Admin Group ID identicos - dados do grupo, nao e bug de codigo |
| 11 | UI-002 | low | SKIP | Vencimento mostra dash - depende do webhook Mercado Pago, nao e bug de codigo |
| 12 | UI-003 | low | DONE | Bots page renderiza UI com 403 para group_admin |

## Fixes Applied

### CRASH-001: Fixed `members.vencimento_at` → `members.subscription_ends_at`
- File: `admin-panel/src/app/api/dashboard/stats/route.ts`
- File: `admin-panel/src/app/api/__tests__/dashboard.test.ts`

### AUTH-001, AUTH-002, AUTH-003, UI-003: SuperAdminGuard
- Created: `admin-panel/src/contexts/RoleContext.tsx`
- Created: `admin-panel/src/components/guards/SuperAdminGuard.tsx`
- Updated: `admin-panel/src/components/layout/LayoutShell.tsx` (wraps children in RoleProvider)
- Guarded: `/settings/telegram`, `/admin-users`, `/job-executions`, `/bots`, `/whatsapp-pool`

### TONE-001: Auto-redirect group_admin from /tone to /groups/:id/tone
- File: `admin-panel/src/app/(auth)/tone/page.tsx`

### API-001: Allow group_admin to call /api/groups (filtered to their group)
- File: `admin-panel/src/app/api/groups/route.ts`

### SEC-001: Hide Excluir/CreateWhatsApp buttons for group_admin
- File: `admin-panel/src/app/(auth)/groups/[groupId]/page.tsx`

### SEC-002: Hide Novo Grupo button for group_admin
- File: `admin-panel/src/app/(auth)/groups/page.tsx`

### DATA-001: Posting history only shows posted bets
- File: `admin-panel/src/app/api/bets/posting-history/route.ts`

## Evidence
- fix-01-dashboard-fixed.png — Dashboard loads correctly for group_admin
- fix-02-group-detail-no-delete.png — No Excluir button visible
- fix-03-posting-history-clean.png — Clean posting history, no phantom bets
