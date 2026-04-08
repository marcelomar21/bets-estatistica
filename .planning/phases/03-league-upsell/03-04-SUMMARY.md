---
phase: 03-league-upsell
plan: 04
subsystem: bot/webhook-distribution
tags: [webhook, distribution, league-subscription, mercado-pago, upsell]
dependency_graph:
  requires: [03-01, 03-03]
  provides: [league-subscription-lifecycle, distribution-subscription-enforcement]
  affects: [bot/services/webhookProcessors.js, bot/jobs/distributeBets.js]
tech_stack:
  added: []
  patterns: [early-return-interception, tier-based-access-control]
key_files:
  created:
    - bot/services/__tests__/webhookProcessors.league.test.js
  modified:
    - bot/services/webhookProcessors.js
    - bot/jobs/distributeBets.js
    - bot/jobs/__tests__/distributeBets.test.js
decisions:
  - League subscription check intercepts before regular handler routing via early return
  - Extra tier blocking uses null-as-no-access semantics (null activeLeagueSubs = blocked for extra)
  - Standard tier leagues skip subscription check entirely for backward compatibility
metrics:
  duration: 7m 13s
  completed: 2026-04-08T02:52:53Z
  tasks_completed: 2
  tasks_total: 2
  tests_added: 20
  tests_passing: 80
---

# Phase 03 Plan 04: League Subscription Webhook and Distribution Enforcement Summary

Webhook processor extended with league subscription lifecycle (activation on MP payment confirmation, cancellation on MP subscription cancel/expire) and distribution job enforces subscription checks so extra league bets are only distributed to groups with active subscriptions.

## What Was Done

### Task 1: Extend webhook processor for league subscription lifecycle (TDD)

**RED:** Created `bot/services/__tests__/webhookProcessors.league.test.js` with 11 tests covering:
- `checkLeagueSubscription` -- queries `group_league_subscriptions` by `mp_plan_id`, returns league/group info
- `handleLeagueSubscriptionActivated` -- updates status to `active` with `activated_at` timestamp
- `handleLeagueSubscriptionCancelled` -- updates status to `cancelled` with `cancelled_at` timestamp
- `processWebhookEvent` routing -- intercepts league subscriptions before regular handlers

**GREEN:** Implemented three new functions in `bot/services/webhookProcessors.js`:
- `checkLeagueSubscription(planId)` -- queries `group_league_subscriptions` by `mp_plan_id` to detect league extras
- `handleLeagueSubscriptionActivated(planId, groupId, leagues)` -- sets `status='active'`, `activated_at`
- `handleLeagueSubscriptionCancelled(planId, groupId)` -- sets `status='cancelled'`, `cancelled_at`
- Modified `processWebhookEvent` to check for league subscriptions after `getSubscription` but BEFORE existing `handleSubscriptionCreated`/`handleSubscriptionCancelled` handlers, using early return pattern

**Commit (RED):** `330bead`
**Commit (GREEN):** `40550d7`

### Task 2: Enforce league subscription check in distribution job (TDD)

**RED:** Added 12 new tests to `bot/jobs/__tests__/distributeBets.test.js` covering:
- `isGroupEligibleForBet` with `leagueTier` and `activeLeagueSubs` parameters
- `distributeRoundRobin` with `leagueTiers` and `leagueSubs` parameters
- Backward compatibility when tier/subscription params are null

**GREEN:** Implemented in `bot/jobs/distributeBets.js`:
- `getLeagueTiers()` -- loads tier classification from `league_seasons` table (`Map<league_name, tier>`)
- `getActiveLeagueSubscriptions(groupIds)` -- loads active subscriptions from `group_league_subscriptions` (`Map<groupId, Set<league_name>>`)
- Updated `isGroupEligibleForBet` signature to accept `leagueTier` and `activeLeagueSubs`, blocks extra tier without active subscription
- Updated `distributeRoundRobin` signature to accept `leagueTiers` and `leagueSubs`, passes to eligibility check
- Updated `_runDistributeBetsInternal` to load league tiers and subscriptions, pass to `distributeRoundRobin`

**Commit (RED):** `38b419f`
**Commit (GREEN):** `7092deb`

## Decisions Made

1. **Early return interception pattern**: League subscription check in `processWebhookEvent` intercepts BEFORE existing handlers, returning early if the subscription is a league subscription. This keeps regular subscription flow completely unchanged.

2. **Null-as-no-access for extra tiers**: When `activeLeagueSubs` is `null` (not loaded) or empty, extra tier bets are blocked. This is the safer default -- groups must explicitly have an active subscription to receive extra league bets.

3. **Backward compatible parameter extension**: `isGroupEligibleForBet` and `distributeRoundRobin` accept new optional parameters with defaults that preserve existing behavior (`leagueTier='standard'`, `activeLeagueSubs=null`).

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

- 11 webhook processor league tests: all passing
- 69 distributeBets tests (57 existing + 12 new): all passing
- 80 total plan-related tests: all passing
- 2 pre-existing test suite failures (`schema-validation-multitenant`, `copyService`) are unrelated to this plan (DB connection issues and pre-existing model config)

## Verification

```
grep -c "group_league_subscriptions" bot/services/webhookProcessors.js → 6
grep "getLeagueTiers" bot/jobs/distributeBets.js → exists (3 references)
grep "getActiveLeagueSubscriptions" bot/jobs/distributeBets.js → exists (3 references)
grep "checkLeagueSubscription" bot/services/webhookProcessors.js → exists (3 references)
grep "handleLeagueSubscriptionActivated" bot/services/webhookProcessors.js → exists (3 references)
```

## Self-Check: PASSED

All 4 key files verified present. All 4 commits verified in git log.
