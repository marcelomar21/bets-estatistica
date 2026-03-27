# Story 14-2: Dashboard e Métricas Agnósticos de Canal

## Status: ready-for-dev

## Story
As a super admin,
I want que o dashboard e métricas funcionem de forma agnóstica de canal,
So that eu veja dados consolidados independente de onde os membros estão.

## Acceptance Criteria
1. Dashboard mostra dados consolidados entre Telegram e WhatsApp
2. Filtro por canal disponível ("Todos", "Telegram", "WhatsApp")
3. Grupo com ambos os canais mostra badge de canais no card
4. Métricas recalculadas ao selecionar filtro de canal

## Tasks

### Task 1: API — Add channel filter to /api/dashboard/stats
- Accept `channel` query param (optional: 'telegram' | 'whatsapp')
- Filter groups by channel using SQL `cs` (contains) operator
- When no filter: show all groups (consolidated view)
- Include `channels` field in group response

### Task 2: Dashboard UI — Channel filter dropdown
- Add channel filter select at top of dashboard
- Options: "Todos os Canais", "Telegram", "WhatsApp"
- Pass selected channel to API
- Show channel badges on group cards

### Task 3: Group cards — Show channel badges
- Update GroupSummaryCard to show channel indicators
- Include `channels` in DashboardGroupCard type

### Task 4: Tests + build validation
