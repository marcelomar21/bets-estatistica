---
phase: 03-league-upsell
verified: 2026-04-07T12:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Super admin classifies a league as 'Extra' and the badge appears for group admin"
    expected: "After setting a league to extra tier in /leagues (Classificacao tab) and saving, a group admin navigating to /groups/{id}/leagues should see the 'Extra R$X/mes' orange badge next to that league"
    why_human: "Visual rendering, cross-role flow, and DB persistence across two different pages cannot be verified programmatically"
  - test: "Group admin completes checkout and subscription becomes active after MP payment"
    expected: "Group admin selects extra leagues in /groups/{id}/league-checkout, clicks 'Ir para Checkout', is redirected to Mercado Pago, completes payment, webhook fires, and subscription status transitions to 'active' in group_league_subscriptions"
    why_human: "End-to-end payment flow requires Mercado Pago sandbox interaction and live webhook delivery — cannot be verified without a running environment"
  - test: "Distribution job blocks extra league bets for groups without active subscription"
    expected: "When the distribution job runs, a bet from an 'extra' tier league is NOT sent to a group that has no active subscription in group_league_subscriptions"
    why_human: "Requires running the bot distribution job against real DB state with controlled extra-tier bets — cannot verify live distribution behavior statically"
---

# Phase 03: League Upsell Verification Report

**Phase Goal:** Influencers can monetize extra leagues as paid add-ons, with flexible pricing and per-client discounts
**Verified:** 2026-04-07T12:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Super admin can classify each league as standard (included) or extra (upsell) in the admin panel | VERIFIED | `/leagues` page (736 lines) has Classificacao tab with Padrao/Extra segment controls; `PUT /api/leagues/tiers` updates `league_seasons.tier` column via zod-validated `enum(['standard','extra'])` |
| 2 | Clients can purchase extra leagues through a checkout flow at the configured price (default R$200/month) | VERIFIED | `/groups/[groupId]/league-checkout` page (431 lines) + `POST /api/groups/[groupId]/league-checkout` (240 lines) calculates server-side price from `league_pricing` (default 200.00), calls `createSubscriptionPlan()`, upserts pending records in `group_league_subscriptions` |
| 3 | Super admin can change the price of any individual extra league | VERIFIED | `/leagues` page Precos tab fetches `GET /api/leagues/pricing`; editable price input saves via `PUT /api/leagues/pricing` which upserts into `league_pricing` table with `monthly_price` validated as `z.number().positive()` |
| 4 | Super admin can apply a discount on extra leagues for a specific client | VERIFIED | `/leagues` page Descontos tab with group selector; `PUT /api/groups/[groupId]/league-discounts` upserts into `league_discounts` with `discount_percent` validated as integer 1-100; checkout API reads discounts and applies them server-side to total price calculation |

**Score:** 4/4 truths verified

### Additional Must-Haves from Plan Frontmatter

All plan-level must_haves were verified as part of artifact and key link checks below.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sql/migrations/066_league_tiers_and_subscriptions.sql` | DB schema for tier, pricing, subscriptions, discounts | VERIFIED | 125 lines; contains `ALTER TABLE league_seasons ADD COLUMN tier`, `CREATE TABLE league_pricing`, `CREATE TABLE group_league_subscriptions`, `CREATE TABLE league_discounts`, 6 RLS policies, 4 indexes; wrapped in BEGIN/COMMIT |
| `admin-panel/src/app/api/leagues/tiers/route.ts` | GET and PUT for tier management | VERIFIED | 114 lines; exports `GET` and `PUT` via `createApiHandler({ allowedRoles: ['super_admin'] })`; zod enum validation for tier values |
| `admin-panel/src/app/api/leagues/pricing/route.ts` | GET and PUT for league pricing | VERIFIED | 137 lines; queries `league_pricing` table; defaults to 200.00; upserts via `onConflict: 'league_name'` |
| `admin-panel/src/app/api/groups/[groupId]/league-discounts/route.ts` | GET, PUT, DELETE for per-group discounts | VERIFIED | 168 lines; exports all three handlers; validates discount_percent 1-100; verifies group exists before upsert |
| `admin-panel/src/app/(auth)/leagues/page.tsx` | Super admin league management page | VERIFIED | 736 lines; `'use client'`; three tabs (classificacao/precos/descontos); dirty-state tracking; toast notifications |
| `admin-panel/src/app/(auth)/groups/[groupId]/leagues/page.tsx` | Enhanced leagues page with tier badges | VERIFIED | 239 lines; `LeaguePreference` interface includes `tier` and `monthly_price`; orange `bg-orange-100` Extra badge renders when `tier === 'extra'` |
| `admin-panel/src/app/api/groups/[groupId]/league-checkout/route.ts` | POST checkout endpoint | VERIFIED | 240 lines; validates leagues are tier='extra'; calculates total price server-side; calls `createSubscriptionPlan()`; upserts `group_league_subscriptions` with status='pending' |
| `admin-panel/src/app/api/groups/[groupId]/league-subscriptions/route.ts` | GET subscriptions, DELETE cancel | VERIFIED | 193 lines; GET returns enriched subscription data; DELETE calls `deactivateSubscriptionPlan()` then sets status='cancelled' |
| `admin-panel/src/app/(auth)/groups/[groupId]/league-checkout/page.tsx` | Group admin checkout UI | VERIFIED | 431 lines; `'use client'`; checkbox selection with Set<string>; price calculation with discount display; `window.open(checkoutUrl)` on success; `window.confirm` before cancel |
| `bot/services/webhookProcessors.js` | Extended webhook for league subscription lifecycle | VERIFIED | Contains `checkLeagueSubscription`, `handleLeagueSubscriptionActivated`, `handleLeagueSubscriptionCancelled`; early-return interception in `processWebhookEvent` before existing handlers |
| `bot/jobs/distributeBets.js` | Distribution enforcement with subscription check | VERIFIED | Contains `getLeagueTiers()`, `getActiveLeagueSubscriptions()`; `isGroupEligibleForBet` updated with `leagueTier` and `activeLeagueSubs` params; `distributeRoundRobin` passes tier/subs data |
| `bot/jobs/__tests__/distributeBets.test.js` | Tests for subscription enforcement | VERIFIED | 760 lines; 29 tier/subscription-related assertions confirmed; all 69 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `leagues/page.tsx` | `/api/leagues/tiers` | fetch GET/PUT | WIRED | Lines 118, 159 confirmed |
| `leagues/page.tsx` | `/api/leagues/pricing` | fetch GET/PUT | WIRED | Lines 297, 342 confirmed |
| `leagues/page.tsx` | `/api/groups/*/league-discounts` | fetch GET/PUT/DELETE | WIRED | Lines 491-492, 553, 578 confirmed |
| `api/leagues/tiers/route.ts` | `league_seasons` | supabase update on `tier` column | WIRED | `.update({ tier: league.tier })` line 95 |
| `api/leagues/pricing/route.ts` | `league_pricing` | supabase upsert on `league_name` | WIRED | `.upsert(rows, { onConflict: 'league_name' })` line 122 |
| `api/groups/[groupId]/league-discounts/route.ts` | `league_discounts` | supabase CRUD | WIRED | SELECT/upsert/delete all confirmed |
| `api/groups/[groupId]/leagues/route.ts` | `league_pricing` + `league_seasons.tier` | query and merge | WIRED | Lines 37, 57, 87-88 confirmed |
| `groups/[groupId]/leagues/page.tsx` | `tier === 'extra'` → badge | conditional render | WIRED | Line 175, orange badge renders |
| `api/groups/[groupId]/league-checkout/route.ts` | `createSubscriptionPlan` | mercadopago.ts | WIRED | Import line 4; called at line 192 |
| `api/groups/[groupId]/league-checkout/route.ts` | `group_league_subscriptions` | supabase upsert status='pending' | WIRED | Lines 154, 184, 220 |
| `league-checkout/page.tsx` | `/api/groups/${groupId}/league-checkout` | fetch POST | WIRED | Line 149 |
| `api/groups/[groupId]/league-subscriptions/route.ts` | `deactivateSubscriptionPlan` | mercadopago.ts | WIRED | Import line 4; called at line 160 |
| `bot/services/webhookProcessors.js` | `group_league_subscriptions` | update status='active'/'cancelled' | WIRED | Lines 1482-1516; 6 total references |
| `bot/jobs/distributeBets.js` | `group_league_subscriptions` | status='active' subscription check | WIRED | Lines 231-249; `getActiveLeagueSubscriptions` |
| `bot/jobs/distributeBets.js` | `league_seasons.tier` | `getLeagueTiers()` query | WIRED | Lines 191-218; column `tier` fetched |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `leagues/page.tsx` TierClassificationTab | `leagues` (LeagueTier[]) | `GET /api/leagues/tiers` → `league_seasons` table | Yes — real DB query | FLOWING |
| `leagues/page.tsx` PricingTab | `pricingLeagues` (LeaguePricing[]) | `GET /api/leagues/pricing` → `league_seasons` + `league_pricing` tables | Yes — real DB query with default fallback | FLOWING |
| `groups/[groupId]/leagues/page.tsx` | `leagues` with tier/monthly_price | `GET /api/groups/[groupId]/leagues` → `league_seasons`, `league_pricing` | Yes — tier and price returned alongside existing enabled state | FLOWING |
| `league-checkout/page.tsx` | `availableLeagues`, `subscriptions` | `/api/.../league-subscriptions` + `/api/.../leagues` | Yes — real DB queries; MP checkout URL from real MP API call | FLOWING |
| `distributeBets.js` | `leagueTiers`, `leagueSubs` | `league_seasons.tier` + `group_league_subscriptions.status='active'` | Yes — both queries produce real DB data; passed to eligibility check | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| distributeBets tier enforcement tests | `npx jest --testPathPattern=distributeBets --no-coverage` | 69 tests passed (2 suites) | PASS |
| `isGroupEligibleForBet` blocks extra tier without subscription | Test output line: "blocks extra tier league without active subscription ✓" | Pass | PASS |
| `isGroupEligibleForBet` allows extra tier with subscription | Test output line: "allows extra tier league with active subscription ✓" | Pass | PASS |
| `isGroupEligibleForBet` backward compat — standard tier | Test output line: "allows standard tier league for all groups (no subscription check) ✓" | Pass | PASS |
| TypeScript in phase 3 source files | `npx tsc --noEmit` (new files only) | 0 errors in leagues/*, league-checkout/*, league-subscriptions/*, league-discounts/* | PASS |

Note: `npx tsc --noEmit` reports 71 errors in pre-existing test files (`*.test.ts`, `database.test.ts`) that predate Phase 3 — none of these errors are in Phase 3 files.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LEAGUE-01 | 03-01, 03-02 | Super admin can define which leagues are standard and which are extra | SATISFIED | `tier` column in `league_seasons`, `/api/leagues/tiers` GET/PUT, super admin `/leagues` Classificacao tab |
| LEAGUE-02 | 03-03, 03-04 | Client can purchase extra leagues via checkout (default R$200/month) | SATISFIED | Checkout API + UI + webhook activation + distribution enforcement all implemented and tested |
| LEAGUE-03 | 03-01, 03-02 | Super admin can modify the price of each extra league individually | SATISFIED | `league_pricing` table, `/api/leagues/pricing` GET/PUT, Precos tab in super admin UI |
| LEAGUE-04 | 03-01, 03-02 | Super admin can grant discounts on extra leagues for specific clients | SATISFIED | `league_discounts` table, `/api/groups/[groupId]/league-discounts` GET/PUT/DELETE, Descontos tab with group selector |

All 4 phase 3 requirements (LEAGUE-01 through LEAGUE-04) are fully covered.

### Anti-Patterns Found

No blocking anti-patterns found. Scanned all 11 new/modified files for TODO, FIXME, PLACEHOLDER, empty return values, console.log-only handlers, and hardcoded empty arrays. All clean.

### Human Verification Required

#### 1. Tier Classification UI → Group Admin Badge Flow

**Test:** As super_admin, navigate to `/leagues`, switch to Classificacao tab, set a league to "Extra" and save. Then log in as group_admin and navigate to `/groups/{id}/leagues`.
**Expected:** The league appears with the orange "Extra R$X/mes" badge in the group admin leagues list.
**Why human:** Cross-role session flow, visual rendering of the badge, and DB persistence across two role contexts cannot be verified programmatically.

#### 2. End-to-End Checkout Flow (Mercado Pago)

**Test:** As group_admin, navigate to `/groups/{id}/league-checkout`. Select an extra league and click "Ir para Checkout". Complete payment in Mercado Pago sandbox. Verify subscription status transitions to 'active'.
**Expected:** `group_league_subscriptions` record status changes from 'pending' to 'active'; group admin sees the subscription as active on next page load.
**Why human:** Requires Mercado Pago sandbox interaction, live webhook delivery, and network round-trip — cannot be replicated statically.

#### 3. Distribution Enforcement (Live Run)

**Test:** Configure a bet from an 'extra' tier league in the distribution queue. Ensure a test group has no active subscription for that league. Run or trigger the distribution job.
**Expected:** The extra league bet is NOT assigned to groups without active subscriptions for that league; groups WITH active subscriptions DO receive it.
**Why human:** Requires running the bot distribution job against real DB state with controlled data — live bot behavior cannot be verified without execution.

### Gaps Summary

No gaps found. All 4 roadmap success criteria are verified. All 11 artifacts exist, are substantive, and are fully wired. All key data flows are connected to real database queries. Automated tests (69 distributeBets tests + 11 webhook processor tests) confirm correct subscription enforcement behavior.

Three items require human verification: visual UI flows across roles, the end-to-end Mercado Pago payment loop, and live distribution enforcement — none of these are blockers for code quality but require manual testing before production deployment.

---

_Verified: 2026-04-07T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
