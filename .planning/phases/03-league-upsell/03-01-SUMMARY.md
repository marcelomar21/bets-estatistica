---
phase: 03-league-upsell
plan: 01
subsystem: league-upsell
tags: [database, api, schema, rls, league-tiers, pricing, discounts]
dependency_graph:
  requires: []
  provides: [league_seasons.tier, league_pricing, group_league_subscriptions, league_discounts, tiers-api, pricing-api, discounts-api]
  affects: [league_seasons]
tech_stack:
  added: []
  patterns: [supabase-rls, zod-validation, createApiHandler]
key_files:
  created:
    - sql/migrations/066_league_tiers_and_subscriptions.sql
    - admin-panel/src/app/api/leagues/tiers/route.ts
    - admin-panel/src/app/api/leagues/pricing/route.ts
    - admin-panel/src/app/api/groups/[groupId]/league-discounts/route.ts
  modified: []
decisions:
  - RLS for league_pricing gives group_admin SELECT-only access (read prices, cannot modify)
  - RLS for league_discounts gives group_admin SELECT on own group only
  - group_league_subscriptions RLS gives group_admin full access to own group subscriptions
  - Update count uses .update({}, { count: 'exact' }) pattern matching existing codebase conventions
metrics:
  duration: 4m
  completed: "2026-04-08T02:35:34Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
---

# Phase 03 Plan 01: League Upsell Schema and Admin APIs Summary

Database schema and admin APIs for league tier classification, pricing, subscriptions, and per-group discounts with full RLS enforcement.

## What Was Done

### Task 1: Database Migration (066_league_tiers_and_subscriptions.sql)

Created and applied migration with:
- **tier column** on `league_seasons`: TEXT NOT NULL DEFAULT 'standard' with CHECK constraint ('standard' | 'extra')
- **league_pricing** table: per-league monthly price with NUMERIC(10,2) defaulting to R$200.00
- **group_league_subscriptions** table: tracks group subscriptions to extra leagues with status lifecycle (pending/active/cancelled/expired), Mercado Pago integration fields
- **league_discounts** table: per-group per-league percentage discount (1-100)
- **6 RLS policies**: super_admin full access on all tables, group_admin scoped access (SELECT-only on pricing/discounts, full on own subscriptions)
- **7 indexes**: covering group_id, status, mp_plan_id, and league_name lookups

Migration applied to production Supabase via Management API. Verified: tier column exists, all 3 tables created, all 6 policies active.

**Commit:** `64a7064`

### Task 2: Admin API Routes

Created three API route files following established patterns (createApiHandler, zod validation, standard response format):

**`/api/leagues/tiers` (GET, PUT):**
- GET returns all active leagues deduplicated by league_name with tier classification
- PUT updates tier for specified leagues using zod enum validation ('standard' | 'extra')

**`/api/leagues/pricing` (GET, PUT):**
- GET returns pricing for extra leagues, defaulting to R$200 when no league_pricing row exists
- PUT upserts pricing with positive number validation

**`/api/groups/[groupId]/league-discounts` (GET, PUT, DELETE):**
- GET returns all discounts for a specific group
- PUT upserts discount with integer validation (1-100)
- DELETE removes a discount by league_name
- PUT verifies group exists before upserting

All endpoints restricted to super_admin via `allowedRoles: ['super_admin']`. TypeScript compiles cleanly (zero errors from new files).

**Commit:** `12a2d13`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error in tiers PUT .select() call**
- **Found during:** Task 2
- **Issue:** Used `.select('id', { count: 'exact', head: true })` after `.update()` which is not valid in this Supabase client version
- **Fix:** Changed to `.update({ tier: league.tier }, { count: 'exact' })` pattern matching existing codebase conventions (e.g., notifications/mark-all-read/route.ts)
- **Files modified:** admin-panel/src/app/api/leagues/tiers/route.ts
- **Commit:** included in `12a2d13`

## Known Stubs

None - all endpoints are fully functional with real database queries.

## Threat Surface Scan

No new threat surfaces beyond what is documented in the plan's threat model. All mutation endpoints are super_admin-only, RLS enforces tenant isolation, and zod validates all inputs.

## Verification Results

| Check | Result |
|-------|--------|
| Migration file CREATE TABLE count | 3 (league_pricing, group_league_subscriptions, league_discounts) |
| Migration file ALTER TABLE + CREATE POLICY + CREATE INDEX count | 19 total DDL statements |
| tier column exists on league_seasons | Confirmed (text, default 'standard') |
| New tables exist in Supabase | Confirmed (3/3) |
| RLS policies active | Confirmed (6/6) |
| TypeScript errors from new files | 0 |
| All routes use createApiHandler | Confirmed |
| All routes restricted to super_admin | Confirmed |
