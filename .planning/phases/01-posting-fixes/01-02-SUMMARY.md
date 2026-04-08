---
phase: 01-posting-fixes
plan: 02
subsystem: bot/copy-generation
tags: [llm-prompt, cta-sanitization, odds-reading, post-processing]
dependency_graph:
  requires: []
  provides: [sanitized-cta-prompts, correct-odds-source, odds-formatting]
  affects: [bot/services/copyService.js]
tech_stack:
  added: []
  patterns: [regex-post-processing, nullish-coalescing-fallback]
key_files:
  created:
    - bot/services/__tests__/copyService.test.js
  modified:
    - bot/services/copyService.js
decisions:
  - Use regex post-processing as safety net to strip CTA labels from LLM output
  - Nullish coalescing chain for odds fallback (bet_group_assignments -> suggested_bets.odds -> null)
  - Omit odds segment entirely when null rather than showing N/A
metrics:
  duration: 4m
  completed: 2026-04-08T00:58:48Z
  tasks_completed: 2
  tasks_total: 2
  tests_added: 9
  tests_total: 21
requirements: [POST-03, POST-04]
---

# Phase 01 Plan 02: Fix CTA Label and Odds Reading in Victory Recap Summary

Fixed CTA label leaking into client-facing victory recap messages by replacing technical "CTA" label with natural language "chamado para acao" in all LLM prompts, adding regex post-processing as safety net, and fixing odds reading to use bet_group_assignments.odds_at_post (per-group posting snapshot) with fallback to suggested_bets.odds.

## What Was Done

### Task 1: Fix CTA label in LLM prompts and add post-processing sanitization
**Commit:** `36fba77` (RED), `3a0d483` (GREEN)
**Files:** `bot/services/copyService.js`, `bot/services/__tests__/copyService.test.js`

- Replaced `CTAs disponiveis` with `Chamados para acao disponiveis` in all 3 functions (generateBetCopy full-message, generateBetCopy template, generateWinsRecapCopy)
- Replaced `CTA padrao` with `Chamado para acao padrao` in all 3 functions
- Replaced `Inclua um CTA no final` with `Inclua um chamado para acao no final convidando o leitor a continuar acompanhando ou apostar`
- Added regex post-processing to strip any remaining `CTA:`, `CTA -`, or standalone `CTA` labels from LLM output before returning to caller
- 4 tests added covering prompt sanitization and output post-processing

### Task 2: Fix victory post odds reading from bet_group_assignments
**Commit:** `ce859ad` (RED), `212f98e` (GREEN)
**Files:** `bot/services/copyService.js`, `bot/services/__tests__/copyService.test.js`

- Changed odds source from `w.odds_at_post` (top-level suggested_bets, may be null/stale) to `w.bet_group_assignments?.[0]?.odds_at_post` (per-group posting snapshot)
- Added fallback to `w.odds` (original analysis odds from suggested_bets table)
- Omit odds segment entirely when both sources are null (no more "N/A" for missing odds)
- Format odds with 2 decimal places using `parseFloat(rawOdds).toFixed(2)`
- 5 tests added covering primary source, fallback, null omission, decimal formatting, and oddLabel usage

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `36fba77` | test | Add failing tests for CTA label sanitization |
| `3a0d483` | fix | Sanitize CTA labels in LLM prompts and post-processing |
| `ce859ad` | test | Add failing tests for odds reading from bet_group_assignments |
| `212f98e` | fix | Read odds from bet_group_assignments and omit when null |

## Verification Results

1. `npx jest --testPathPattern="copyService.test"` -- 21/21 tests pass (9 new + 12 existing)
2. No literal "CTA" in any prompt string in copyService.js (only in regex sanitization pattern)
3. No `w.odds_at_post` usage in winsList builder (replaced with bet_group_assignments path)
4. No "N/A" for odds in winsList section (only for bet_pick which is expected)
5. `bet_group_assignments.*odds_at_post` present in copyService.js as primary odds source

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-01-04 | Removed "CTA" from all prompts, replaced with natural language; added regex post-processing safety net |
| T-01-05 | Changed odds source to bet_group_assignments (per-group snapshot set at posting time) |
| T-01-06 | Null odds handled by omitting field entirely; no crash path |

## Self-Check: PASSED

- All 3 files verified present on disk
- All 4 commit hashes verified in git history
