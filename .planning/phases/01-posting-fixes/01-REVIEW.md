---
phase: 01-posting-fixes
reviewed: 2026-04-07T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - bot/jobs/postBets.js
  - bot/jobs/dailyWinsRecap.js
  - bot/services/copyService.js
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-07
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files were reviewed as changed during Phase 01 (Posting Fixes):
- `bot/jobs/postBets.js` — `enforceOddLabel` applied in template mode after `parts.join`
- `bot/jobs/dailyWinsRecap.js` — toneConfig now loaded fresh from DB instead of cached BotContext
- `bot/services/copyService.js` — CTA label sanitization added and odds reading fixed to use `bet_group_assignments`

The core fixes are correct and well-targeted. Three warnings were found: one violates the project's mandatory no-truncation rule, one is an overly broad regex that can corrupt legitimate content, and one is a missing defensive guard that can crash the recap job at runtime.

## Warnings

### WR-01: Hard bullet truncation violates mandatory no-truncation rule

**File:** `bot/services/copyService.js:222`
**Issue:** `.slice(0, 5)` silently drops LLM-generated bullets beyond index 4. The project's `CLAUDE.md` rule states: **"NUNCA truncar, cortar ou limitar conteudo por contagem de caracteres"** and explicitly lists `.slice()` as prohibited. Even though the LLM prompt also says "Maximo 4-5 bullets", having a hard code cap in addition doubles down on truncation and violates the rule regardless of how the LLM behaves.

**Fix:** Remove the `.slice(0, 5)` call. Trust the LLM to honour the prompt's bullet count instruction. If excess bullets are genuinely a problem, log a warning and let the full output through:

```javascript
// Before (violates no-truncation rule):
const bullets = copy
  .split('\n')
  .filter(line => line.trim().startsWith('•'))
  .slice(0, 5)
  .join('\n');

// After:
const bullets = copy
  .split('\n')
  .filter(line => line.trim().startsWith('•'))
  .join('\n');
```

---

### WR-02: CTA sanitization regex is too broad — can corrupt legitimate content

**File:** `bot/services/copyService.js:332`
**Issue:** The third regex replacement `\bCTA\b\s*` with the `gi` flag matches any standalone word "CTA" anywhere in the LLM output — including inside legitimate content that might use "CTA" as an abbreviation in club names (e.g. "CTA Cuiabá"), acronyms in market analysis, or any other context. The first two patterns (`CTA:` and `CTA -`) are surgical and targeted. The third is a catch-all that can silently strip words from the final user-facing message.

```javascript
// Current — third pattern is overly aggressive:
const sanitizedCopy = copy
  .replace(/\bCTA\s*:\s*/gi, '')
  .replace(/\bCTA\s*-\s*/gi, '')
  .replace(/\bCTA\b\s*/gi, '');   // ← removes "CTA" anywhere, including legitimate use
```

**Fix:** Remove the third pattern. The first two cover `CTA:` and `CTA -` which are the structural label forms. A bare `CTA` without a following delimiter is unlikely to appear as a label, and removing it blindly risks data loss:

```javascript
const sanitizedCopy = copy
  .replace(/\bCTA\s*:\s*/gi, '')
  .replace(/\bCTA\s*-\s*/gi, '');
```

If the bare-word case is still required, narrow it to line-start position only:

```javascript
const sanitizedCopy = copy
  .replace(/\bCTA\s*:\s*/gi, '')
  .replace(/\bCTA\s*-\s*/gi, '')
  .replace(/^CTA\b\s*/gim, '');  // only at start of line, not mid-sentence
```

---

### WR-03: `winsData.wins` used without null guard — crash path in generateWinsRecapCopy

**File:** `bot/services/copyService.js:289`
**Issue:** `winsData.wins.map(...)` is called unconditionally. The guard at line 253 checks `winsData.winCount === 0` but does not verify that `winsData.wins` is a non-null array. If `getYesterdayWins` ever returns `{ winCount: 2, totalCount: 3, rate: 66.7 }` without the `wins` property (e.g. a schema change, DB query selecting only aggregate columns, or partial data), this throws `TypeError: Cannot read properties of undefined (reading 'map')`, crashing the daily recap job for that group. The outer `try/catch` in `dailyWinsRecap.js:93` catches it and logs `failed++`, but the crash is silent from the copy service's perspective.

```javascript
// Line 289 — no guard on winsData.wins:
const winsList = winsData.wins.map(w => {
```

**Fix:** Add a defensive guard before the map, falling back to an empty list:

```javascript
const winsList = (winsData.wins || []).map(w => {
  const home = w.league_matches?.home_team_name || '?';
  const away = w.league_matches?.away_team_name || '?';
  const rawOdds = w.bet_group_assignments?.[0]?.odds_at_post ?? w.odds ?? null;
  const oddsSegment = rawOdds != null
    ? ` | ${toneConfig?.oddLabel || 'Odd'}: ${parseFloat(rawOdds).toFixed(2)}`
    : '';
  return `- ${home} x ${away} | Mercado: ${w.bet_market} | Pick: ${w.bet_pick || 'N/A'}${oddsSegment}`;
}).join('\n');
```

## Info

### IN-01: Template (bullet) mode LLM prompt instructs "Maximo 4-5 bullets" — soft limit in prompt

**File:** `bot/services/copyService.js:182`
**Issue:** The human message prompt for bullet-extraction mode contains the rule `- Maximo 4-5 bullets`. This is a soft content instruction passed to the LLM, which is acceptable (the LLM decides). However, in combination with the hard `.slice(0, 5)` (WR-01), it creates redundant double-capping. Once WR-01 is fixed by removing `.slice()`, this prompt instruction remains as the only control, which is the correct approach per the project rules. No code change needed here beyond fixing WR-01.

---

_Reviewed: 2026-04-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
