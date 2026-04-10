# Quick Task 260410-eqt: Summary

## Changes

### bot/services/metricsService.js
- `getYesterdayWins()` now returns `allBets` array (both success + failure) alongside `wins` (success only)
- Backwards compatible: `wins`, `winCount`, `totalCount`, `rate` unchanged

### bot/services/copyService.js
- `generateWinsRecapCopy()` now uses `allBets` (falls back to `wins` for backwards compat)
- Each bet shows GREEN (✅) or RED (❌) result indicator
- When `bet_pick === bet_market`, Pick is omitted to avoid redundancy
- LLM prompt updated: shows ALL bets with results, instructs LLM to display GREEN/RED for each

### bot/services/__tests__/copyService.test.js
- Added test suite "RECAP: GREEN/RED result display and pick/market dedup" with 3 tests
- Updated odds test fixtures to include `allBets` and `bet_result`

### bot/services/__tests__/metricsService.test.js
- Added assertion for `allBets` in mixed results test

## Test Results
- 24/24 tests passing (copyService: 13, metricsService: 11)
