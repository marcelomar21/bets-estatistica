# Quick Task 260410-eqt: Fix RECAP copy pick/market dedup + GREEN/RED results

**Created:** 2026-04-10
**Status:** Completed

## Problem

1. RECAP posts show identical text for "Mercado" and "Pick" when `bet_market === bet_pick`
2. RECAP only shows winning bets — doesn't show which bets were GREEN (won) or RED (lost)

## Tasks

### Task 1: Return all bets from getYesterdayWins
- **File:** `bot/services/metricsService.js`
- **Action:** Add `allBets` to return data (both success and failure bets)
- **Done:** ✅

### Task 2: Fix recap copy generation
- **File:** `bot/services/copyService.js`
- **Action:** Use `allBets` instead of just `wins`, add GREEN/RED result indicators, skip Pick when identical to Market, update LLM prompt
- **Done:** ✅

### Task 3: Update tests
- **Files:** `bot/services/__tests__/copyService.test.js`, `bot/services/__tests__/metricsService.test.js`
- **Action:** Add `allBets` to test fixtures, add tests for pick/market dedup and GREEN/RED display
- **Done:** ✅
