---
phase: 03-league-upsell
plan: 03
subsystem: league-checkout
tags: [api, ui, checkout, mercado-pago, subscriptions, pricing]
dependency_graph:
  requires: [league_seasons.tier, league_pricing, group_league_subscriptions, league_discounts]
  provides: [league-checkout-api, league-subscriptions-api, league-checkout-ui]
  affects: [group_league_subscriptions]
tech_stack:
  added: []
  patterns: [createApiHandler, zod-validation, mercadopago-integration, client-component]
key_files:
  created:
    - admin-panel/src/app/api/groups/[groupId]/league-checkout/route.ts
    - admin-panel/src/app/api/groups/[groupId]/league-subscriptions/route.ts
    - admin-panel/src/app/(auth)/groups/[groupId]/league-checkout/page.tsx
  modified: []
decisions:
  - Server-side price calculation prevents client-side price tampering (T-03-09 mitigation)
  - Existing active MP plan gets price updated rather than creating duplicate plans
  - Subscription records upserted on group_id+league_name to prevent duplicates (T-03-12 mitigation)
  - group_admin access enforced via groupFilter check on all endpoints (T-03-08 mitigation)
metrics:
  duration: 5m
  completed: "2026-04-08T02:43:40Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 03 Plan 03: League Checkout Flow Summary

Group admin self-service checkout for extra leagues via Mercado Pago preapproval plans with pricing, discounts, subscription management, and cancellation.

## What Was Done

### Task 1: League Checkout and Subscriptions API Routes

Created two API route files following established patterns (createApiHandler, zod validation, groupFilter access control).

**`POST /api/groups/[groupId]/league-checkout` (240 lines):**
- Validates `league_names` array with zod schema
- Verifies group_admin can only checkout for their own group (groupFilter check)
- Fetches group name for MP plan description
- Validates all requested leagues are tier='extra' and active via league_seasons query
- Fetches pricing from league_pricing (defaults to R$200 if no row)
- Fetches group-specific discounts from league_discounts
- Calculates total price server-side (sum of prices minus discounts, rounded to 2 decimals)
- Checks for existing active MP plan; updates price if exists, creates new plan if not
- Upserts pending subscription records in group_league_subscriptions
- Returns checkout URL, total price, and league list

**`GET /api/groups/[groupId]/league-subscriptions` (193 lines):**
- Returns all subscriptions for the group enriched with monthly_price and discount_percent
- Fetches from league_pricing and league_discounts for context

**`DELETE /api/groups/[groupId]/league-subscriptions`:**
- Validates league_name via zod
- Fetches subscription record, verifies it exists
- If active with MP plan, calls deactivateSubscriptionPlan from mercadopago.ts
- Updates status to 'cancelled' with timestamp

**Commit:** `d25e94a`

### Task 2: Group Admin League Checkout UI Page

Created `admin-panel/src/app/(auth)/groups/[groupId]/league-checkout/page.tsx` (431 lines) as a 'use client' component.

**Active Subscriptions Section:**
- Displays active league subscriptions with green status indicator
- Shows price with discount strikethrough when applicable
- Cancel button with `window.confirm` dialog before DELETE call

**Pending Subscriptions Section:**
- Amber-themed card for awaiting payment status
- "Completar pagamento" link to MP checkout URL
- Cancel option available for pending subscriptions

**Available Extra Leagues Section:**
- Checkbox selection for unsubscribed extra leagues
- Price display with line-through for original price and discounted price
- Country label for each league

**Order Summary:**
- Dynamically calculated subtotal, discount amount, and total
- "Ir para Checkout" button disabled when no leagues selected
- Opens MP checkout URL via `window.open` on success
- Toast notification for success/error feedback
- Reloads data after checkout to reflect new pending subscriptions

**Commit:** `19a30ac`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript implicit any types in API routes**
- **Found during:** Task 1 verification
- **Issue:** Supabase query results returned as `unknown` causing TS7006 errors on map callbacks
- **Fix:** Added explicit type annotations (`string[]` for validLeagueNames, `SubscriptionRecord` interface for subscriptions cast)
- **Files modified:** league-checkout/route.ts, league-subscriptions/route.ts
- **Commit:** included in `d25e94a`

## Known Stubs

None - all endpoints are fully functional with real database queries and Mercado Pago integration.

## Threat Surface Scan

All threat mitigations from the plan's threat model are implemented:

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-03-08 | groupFilter check on all endpoints | Implemented |
| T-03-09 | Server-side price calculation from DB | Implemented |
| T-03-10 | Status transitions only via webhook (Plan 04) | By design - POST only creates 'pending' |
| T-03-11 | Subscription records with timestamps and MP plan ID | Implemented |
| T-03-12 | Upsert prevents duplicate subscription records | Implemented |

No new threat surfaces introduced beyond the plan's threat model.

## Verification Results

| Check | Result |
|-------|--------|
| createSubscriptionPlan in checkout route | Present |
| league-checkout API call in UI page | Present |
| deactivateSubscriptionPlan in subscriptions route | Present |
| Checkout UI file exists | Confirmed (431 lines) |
| TypeScript non-baseline errors | 0 |
| All routes use createApiHandler | Confirmed |
| All routes enforce group_admin access | Confirmed |

## Self-Check: PASSED

All 3 created files verified on disk. Both commit hashes (d25e94a, 19a30ac) confirmed in git log.
