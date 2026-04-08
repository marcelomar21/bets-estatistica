---
phase: 03-league-upsell
plan: 02
subsystem: admin-panel
tags: [ui, league-management, tier-classification, pricing, discounts]
dependency_graph:
  requires: [03-01]
  provides: [league-management-ui, tier-badges]
  affects: [admin-panel/leagues, admin-panel/groups/leagues]
tech_stack:
  added: []
  patterns: [tabbed-ui, segment-control, inline-toast, group-selector]
key_files:
  created:
    - admin-panel/src/app/(auth)/leagues/page.tsx
  modified:
    - admin-panel/src/app/(auth)/groups/[groupId]/leagues/page.tsx
    - admin-panel/src/app/api/groups/[groupId]/leagues/route.ts
    - admin-panel/src/components/layout/Sidebar.tsx
decisions:
  - Used React state tabs instead of URL routing for three-tab league management page
  - Reused existing toast pattern from group leagues page for consistency
  - Added Ligas nav item under SuperAdmin module in Sidebar
metrics:
  duration: 232s
  completed: 2026-04-08T02:41:54Z
  tasks: 2/2
  files: 4
---

# Phase 03 Plan 02: League Management UI Summary

Super admin league management page with three tabs (tier classification, pricing, per-group discounts) and enhanced group leagues page with Extra badges and prices.

## What Was Done

### Task 1: Create super admin league management page (693431c)

Created `admin-panel/src/app/(auth)/leagues/page.tsx` with three tabs:

- **Classificacao tab**: Displays all leagues grouped by country with a Padrao/Extra segment control per league. Blue highlight for standard, orange for extra. Tracks dirty state and saves only changed leagues via `PUT /api/leagues/tiers`.
- **Precos tab**: Shows only extra-tier leagues with editable monthly price inputs (default R$200.00). Validates prices > 0 before submit. Saves via `PUT /api/leagues/pricing`.
- **Descontos tab**: Group selector dropdown that fetches groups from `/api/groups`. When a group is selected, loads extra leagues with prices and existing discounts. Each row shows league name, price, percentage input (1-100), calculated discounted price, Apply button, and Remove link. Uses `PUT` and `DELETE` on `/api/groups/{groupId}/league-discounts`.

Also added "Ligas" navigation item under SuperAdmin module in Sidebar.

### Task 2: Enhance group league preferences page with tier badges (ed59de8)

**API changes** (`admin-panel/src/app/api/groups/[groupId]/leagues/route.ts`):
- Updated `league_seasons` query to include `tier` field
- Added query to `league_pricing` table for monthly prices
- Response now includes `tier` (standard/extra) and `monthly_price` per league

**UI changes** (`admin-panel/src/app/(auth)/groups/[groupId]/leagues/page.tsx`):
- Extended `LeaguePreference` interface with `tier` and `monthly_price` fields
- Added orange "Extra R$X/mes" badge next to extra league names
- Summary bar shows extra leagues count when present
- All existing toggle/save functionality preserved

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- TypeScript compiles without errors for all modified/created files
- `grep "Extra"` in group leagues page confirms badge present
- `grep "tier"` in API route confirms tier data returned
- `grep "league_pricing"` in API route confirms pricing query present
- Super admin page exists at expected path

## Self-Check: PASSED
