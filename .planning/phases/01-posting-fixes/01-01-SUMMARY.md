---
phase: 01-posting-fixes
plan: 01
subsystem: bot/posting
tags: [tone-enforcement, template-mode, daily-recap, routing-audit]
dependency_graph:
  requires: []
  provides: [enforceOddLabel-template-mode, fresh-toneConfig-dailyWinsRecap]
  affects: [bot/jobs/postBets.js, bot/jobs/dailyWinsRecap.js]
tech_stack:
  added: []
  patterns: [db-fresh-load-over-cache]
key_files:
  created:
    - bot/jobs/__tests__/dailyWinsRecap.test.js
  modified:
    - bot/jobs/postBets.js
    - bot/jobs/dailyWinsRecap.js
    - bot/jobs/__tests__/postBets.test.js
decisions:
  - "enforceOddLabel applied after parts.join and before sanitizeTelegramMarkdown in template mode"
  - "dailyWinsRecap loads toneConfig via supabase.from('groups') matching postBets.js pattern"
  - "POST-02 routing audit confirmed all call sites correct — no code changes needed"
metrics:
  duration: 4m
  completed: 2026-04-08T01:04:21Z
  tasks_completed: 2
  tasks_total: 2
---

# Phase 01 Plan 01: Tone Enforcement & Confirmation Routing Summary

Fix enforceOddLabel missing in template mode output and dailyWinsRecap using stale cached toneConfig instead of fresh DB query.

## What Was Done

### Task 1: Apply enforceOddLabel in template mode (POST-01a)

**Problem:** `formatBetMessage()` in template mode returned `sanitizeTelegramMarkdown(parts.join('\n'))` without calling `enforceOddLabel` first. LLM-generated bullets containing "Odd:" would not be replaced with the configured oddLabel (e.g., "Cotacao").

**Fix:** Changed line 235 of `bot/jobs/postBets.js` from:
```javascript
return sanitizeTelegramMarkdown(parts.join('\n'));
```
to:
```javascript
let finalMessage = parts.join('\n');
finalMessage = enforceOddLabel(finalMessage, toneConfig?.oddLabel);
return sanitizeTelegramMarkdown(finalMessage);
```

The `enforceOddLabel` import was already present (line 22). Full-message mode (line 200) already called it -- only template mode was missing.

**Tests added:** 3 new tests in `bot/jobs/__tests__/postBets.test.js`:
- Template mode replaces "Odd:" with configured oddLabel in LLM bullets
- Template mode leaves "Odd:" unchanged when oddLabel is null
- Full-message mode regression check (still works)

**Commits:** f97158b (test RED), d0d9b4e (implementation GREEN)

### Task 2: Fix dailyWinsRecap DB toneConfig + routing audit (POST-01b, POST-02)

**Problem:** `dailyWinsRecap.js` line 53 read toneConfig from `botCtx.groupConfig?.copyToneConfig`, which is a cached value from bot startup. If an admin changes tone config via the admin panel, the recap would still use the old config until bot restart.

**Fix:** Added `supabase` import and replaced the cached read with a fresh DB query:
```javascript
const { data: groupData, error: toneError } = await supabase
  .from('groups')
  .select('copy_tone_config')
  .eq('id', groupId)
  .single();
```
With graceful fallback to `null` on DB error (no crash).

**Routing Audit (POST-02):** Audited all `sendToPublic`/`sendToAdmin` call sites:
- `postBets.js`: sendToPublic for bet content, sendToAdmin for confirmations/errors
- `dailyWinsRecap.js`: sendToPublic for recaps (correct -- recaps are public-facing)
- `telegram.js`: alertAdmin uses sendToAdmin (line 441), safely fails without botCtx
- `jobWarn.js`: sendPostWarn uses sendToAdmin for warnings

All routing is correct. No confirmation/preview/error messages leak to public groups.

**Tests added:** 4 new tests in `bot/jobs/__tests__/dailyWinsRecap.test.js`:
- Queries groups table for copy_tone_config using groupId
- Passes DB-loaded toneConfig to generateWinsRecapCopy (not cached)
- Falls back to null on DB error (no crash)
- Sends recap to public group via sendToPublic (correct routing)

**Commits:** c538513 (test RED), 4c923f5 (implementation GREEN)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `npx jest --testPathPattern="(postBets|dailyWinsRecap).test"` -- 57 tests pass
2. `grep enforceOddLabel postBets.js` -- appears in template mode (line 236) and full-message mode (line 200)
3. `grep botCtx.groupConfig?.copyToneConfig dailyWinsRecap.js` -- NOT found (replaced)
4. `grep supabase.*copy_tone_config dailyWinsRecap.js` -- found (new DB query)

## Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1 | f97158b | test | Add failing test for enforceOddLabel in template mode |
| 1 | d0d9b4e | feat | Apply enforceOddLabel in template mode output |
| 2 | c538513 | test | Add failing tests for dailyWinsRecap DB toneConfig loading |
| 2 | 4c923f5 | feat | Load toneConfig from DB in dailyWinsRecap + routing audit |
