---
phase: 01-posting-fixes
verified: 2026-04-08T01:14:39Z
status: gaps_found
score: 9/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Victory recap output is post-processed to strip any literal 'CTA' occurrences"
    status: partial
    reason: "Only 2 of 3 planned regex replaces are implemented. The third pattern `.replace(/\\bCTA\\b\\s*/gi, '')` for standalone 'CTA' (without colon or dash) is missing. If LLM returns 'CTA Aposte agora!' the label survives. Plan acceptance criterion required this third replace but it was not implemented and no test covers this case."
    artifacts:
      - path: "bot/services/copyService.js"
        issue: "Line 328-330: only 2 replace calls present, missing .replace(/\\bCTA\\b\\s*/gi, '')"
    missing:
      - "Add third regex: .replace(/\\bCTA\\b\\s*/gi, '') after existing two replaces in generateWinsRecapCopy"
      - "Add test: LLM returns 'CTA Aposte agora!' (no colon/dash), assert output does not contain 'CTA'"
---

# Phase 1: Posting Fixes Verification Report

**Phase Goal:** Posting pipeline delivers correct, well-formatted messages to the right channels with the right tone
**Verified:** 2026-04-08T01:14:39Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Template mode output applies enforceOddLabel before sanitizeTelegramMarkdown | VERIFIED | `postBets.js` line 236: `finalMessage = enforceOddLabel(finalMessage, toneConfig?.oddLabel)` called before `return sanitizeTelegramMarkdown(finalMessage)` |
| 2 | dailyWinsRecap loads toneConfig fresh from DB, not from cached BotContext | VERIFIED | `dailyWinsRecap.js` lines 56-66: fresh `supabase.from('groups').select('copy_tone_config').eq('id', groupId).single()` query; `botCtx.groupConfig?.copyToneConfig` not present |
| 3 | No confirmation or preview message is ever sent to public groups | VERIFIED | `postBets.js`: `sendToPublic` only for bet content (`postToAllChannels`), `sendToAdmin` for errors; `jobWarn.js`: all 3 call sites use `sendToAdmin`; routing audit documented in test file |
| 4 | alertAdmin fallback path (no botCtx) is safe — sendToAdmin rejects it | VERIFIED | `telegram.js` line 441: `sendToAdmin(text)` with no botCtx hits else branch at line 297-305, returns `{ success: false, error: { code: 'NO_BOT_CTX' } }` without sending |
| 5 | Victory recap LLM prompt does not contain the literal word 'CTA' | VERIFIED | All CTA references replaced: lines 58, 60, 162, 164, 272, 274 use "Chamados para acao"/"Chamado para acao"; line 311 uses "chamado para acao no final" |
| 6 | Victory recap output is post-processed to strip any literal 'CTA' occurrences | PARTIAL (gap) | `copyService.js` lines 328-330 have 2 of 3 required regexes. Missing: `.replace(/\bCTA\b\s*/gi, '')` for standalone "CTA" without colon or dash. |
| 7 | Victory recap reads odds from bet_group_assignments.odds_at_post (per-group snapshot) | VERIFIED | `copyService.js` line 292: `w.bet_group_assignments?.[0]?.odds_at_post ?? w.odds ?? null` — primary source is per-group snapshot, fallback is original analysis odds |
| 8 | Victory recap omits odds field entirely when null/missing (never shows 'N/A') | VERIFIED | `copyService.js` lines 293-295: `oddsSegment = rawOdds != null ? ... : ''` — empty string when null, no "N/A" in winsList builder |
| 9 | Victory recap formats odds with 2 decimal places (e.g., 2.10) | VERIFIED | `copyService.js` line 294: `parseFloat(rawOdds).toFixed(2)` |
| 10 | CTA config labels in generateBetCopy and generateWinsRecapCopy system prompts use natural language instead of 'CTA' | VERIFIED | All 3 locations (generateBetCopy full-mode, generateBetCopy template-mode, generateWinsRecapCopy) replaced with "Chamados para acao disponiveis"/"Chamado para acao padrao" |

**Score:** 9/10 truths verified (1 partial gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `bot/jobs/postBets.js` | enforceOddLabel call in template mode output | VERIFIED | Line 236: `enforceOddLabel(finalMessage, toneConfig?.oddLabel)` present |
| `bot/jobs/dailyWinsRecap.js` | Fresh toneConfig loaded from DB via supabase query | VERIFIED | Lines 11, 56-66: supabase import and `from('groups').select('copy_tone_config')` query |
| `bot/jobs/__tests__/postBets.test.js` | Test for enforceOddLabel in template mode | VERIFIED | 3 new tests added; 57 tests pass |
| `bot/jobs/__tests__/dailyWinsRecap.test.js` | Test for fresh toneConfig loading from DB | VERIFIED | Created; 4 new tests covering DB loading, fallback, routing |
| `bot/services/copyService.js` | Fixed CTA prompt and odds reading in generateWinsRecapCopy | PARTIAL | CTA prompts fixed; odds reading fixed; 3rd CTA regex missing |
| `bot/services/__tests__/copyService.test.js` | Tests for CTA label sanitization and odds reading | VERIFIED | 9 new tests; all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bot/jobs/postBets.js` | `bot/lib/telegramMarkdown.js` | enforceOddLabel import and call | VERIFIED | Line 22 imports `enforceOddLabel`; lines 200 and 236 call it |
| `bot/jobs/dailyWinsRecap.js` | `supabase.from('groups')` | DB query for copy_tone_config | VERIFIED | Line 57: `supabase.from('groups').select('copy_tone_config')` |
| `bot/services/copyService.js` | `bot/services/metricsService.js` | winsData.wins[].bet_group_assignments[].odds_at_post | VERIFIED | Line 292: `w.bet_group_assignments?.[0]?.odds_at_post` as primary source |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `dailyWinsRecap.js` | `toneConfig` | `supabase.from('groups').select('copy_tone_config')` | Yes — DB query with `.eq('id', groupId)` | FLOWING |
| `copyService.js` | `rawOdds` | `w.bet_group_assignments?.[0]?.odds_at_post` | Yes — per-group snapshot from junction table | FLOWING |
| `postBets.js` template mode | `finalMessage` | `parts.join('\n')` + `enforceOddLabel` + `sanitizeTelegramMarkdown` | Yes — LLM output processed through both functions | FLOWING |

### Behavioral Spot-Checks

Spot-checks skipped for LLM-dependent bot code — requires live LLM service. Covered by unit tests with mocked LLM instead.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| POST-01 | 01-01-PLAN.md | Postagem automática deve respeitar o tom de voz configurado | SATISFIED | enforceOddLabel in template mode + fresh DB toneConfig in dailyWinsRecap |
| POST-02 | 01-01-PLAN.md | Confirmação de envio deve ir apenas para o grupo admin | SATISFIED | Routing audit confirmed; all confirmations use sendToAdmin; sendToPublic only for bet content and recaps |
| POST-03 | 01-02-PLAN.md | Post de vitória não deve exibir label CTA quando não aplicável | PARTIAL | CTA replaced in prompts; post-processing removes "CTA:" and "CTA -" but not standalone "CTA" without punctuation |
| POST-04 | 01-02-PLAN.md | Post de vitória deve ler e exibir odds corretamente | SATISFIED | bet_group_assignments.odds_at_post as primary; fallback to w.odds; null omits field; 2 decimal places |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `bot/services/copyService.js` | 328-330 | Incomplete CTA sanitization (2 of 3 regexes) | Warning | Standalone "CTA" without colon or dash would survive post-processing |
| `__tests__/services/copyService.test.js` | 131 | Pre-existing failing test: "limita a 5 bullets no máximo" | Warning (pre-existing) | Test was failing before Phase 1; not introduced by this phase. Bullet limiting is prompt-only, not code-enforced. |

**Note on pre-existing test failure:** `__tests__/services/copyService.test.js` (old test location at project root) has 1 failing test "limita a 5 bullets no máximo" that was present before Phase 1 began (confirmed via git history). The test was in the codebase at commit `f4ded48` before any Phase 1 changes. This failure was not introduced by this phase.

### Human Verification Required

None required — all verifiable behaviors confirmed programmatically.

### Gaps Summary

**1 gap blocking complete goal achievement:**

**Incomplete CTA post-processing** (affects POST-03 partial satisfaction): The PLAN specified 3 regex replace calls to fully sanitize all possible CTA label formats from LLM output. Only 2 are implemented:
- `.replace(/\bCTA\s*:\s*/gi, '')` — handles "CTA: ..."
- `.replace(/\bCTA\s*-\s*/gi, '')` — handles "CTA - ..."
- MISSING: `.replace(/\bCTA\b\s*/gi, '')` — would handle standalone "CTA ..." without punctuation

If the LLM outputs "CTA Aposte agora!" or ends a message with "\n\nCTA", the word "CTA" would appear in the client-facing message. The PLAN acceptance criterion explicitly required this third replace, and the plan's description of the fix listed all three. It was omitted from the implementation.

**Fix:** Add `.replace(/\bCTA\b\s*/gi, '')` as the third replace in the chain at `copyService.js` lines 328-330, and add a corresponding test with LLM output `"Boa sorte CTA aposte agora"` asserting the output does not contain `"CTA"`.

---

_Verified: 2026-04-08T01:14:39Z_
_Verifier: Claude (gsd-verifier)_
