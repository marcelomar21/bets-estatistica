---
phase: 02-queue-selection
verified: 2026-04-07T22:41:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open /postagem with at least one ready bet in the queue. Verify checkboxes appear next to each bet and all are checked by default."
    expected: "Each row in the postable bets table has a checked checkbox; header checkbox is also checked (all-selected state)"
    why_human: "Visual rendering and initial state require a live browser with real queue data; cannot verify DOM state from static analysis alone"
  - test: "Deselect one or two bets, then click Preparar Postagem. Inspect the POST payload to /api/bets/post-now/preview and confirm bet_ids contains only the selected bet IDs."
    expected: "Preview request payload contains only the IDs of checked bets; deselected bets are absent"
    why_human: "Requires live interaction with the postagem page and network inspection to confirm filtered IDs reach the API"
  - test: "Deselect all bets using the header checkbox. Confirm the Preparar Postagem button becomes disabled."
    expected: "Button has disabled attribute and cursor-not-allowed styling when zero bets are selected"
    why_human: "UI disabled state and cursor style require browser rendering to confirm"
---

# Phase 2: Queue Selection Verification Report

**Phase Goal:** Super admin has granular control over which bets get posted from the queue
**Verified:** 2026-04-07T22:41:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Super admin sees checkboxes next to each bet in the posting queue table | VERIFIED | `PostingQueueTable.tsx:215-225` — checkbox `th` rendered when `hasSelection` is true; `aria-label="Selecionar todas"` and per-row `aria-label="Selecionar aposta {id}"` present |
| 2 | All bets are selected by default when the queue loads | VERIFIED | `postagem/page.tsx:636-640` — `useEffect` sets `selectedIds` to `new Set(postableBets.map(b => b.id))` on `queueData` change |
| 3 | Super admin can toggle individual bet selection on/off | VERIFIED | `PostingQueueTable.tsx:144-153` — `toggleOne()` implemented; test 5 confirms toggle behavior |
| 4 | Super admin can toggle all bets at once via header checkbox | VERIFIED | `PostingQueueTable.tsx:135-142` — `toggleAll()` implemented; tests 3 and 4 confirm select-all and deselect-all |
| 5 | Counter shows X de Y selecionadas next to the Preparar Postagem button | VERIFIED | `postagem/page.tsx:1043-1045` — renders `{selectedCount} de {postableBets.length} selecionada{...}` |
| 6 | Gerar Preview sends only the IDs of selected bets, not all postable bets | VERIFIED | `postagem/page.tsx:375` — batch mode uses `selectedBets.map(b => b.id)` instead of `postableBets.map(b => b.id)` |
| 7 | Deselected bets remain in the queue with status ready | VERIFIED | Selection is pure client-side state (`useState<Set<number>>`); no mutation of bet status occurs; pendentes table at line 1081 omits selection props and remains unchanged |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `admin-panel/src/components/features/posting/PostingQueueTable.tsx` | Checkbox column with select-all header and per-row toggle | VERIFIED | Contains `selectedIds` (7 occurrences), `onSelectionChange` (4 occurrences), `toggleAll`, `toggleOne`, header checkbox with `aria-label="Selecionar todas"`, row checkbox, `bg-blue-50` highlight |
| `admin-panel/src/app/(auth)/postagem/page.tsx` | Selection state management and filtered bet IDs for preview/post | VERIFIED | Contains `selectedIds` state declaration, `useEffect` reset, `selectedBets` derived array, `selectedCount`, counter display, disabled button guard, filtered IDs in `handlePreparePreview` and `handleBulkSchedule` |
| `admin-panel/src/components/features/posting/__tests__/PostingQueueTable.test.tsx` | Tests for checkbox selection behavior | VERIFIED | 7 test cases covering all selection behaviors; all 7 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `postagem/page.tsx` | `PostingQueueTable` | `selectedIds` prop and `onSelectionChange` callback | WIRED | Line 1059-1060: `selectedIds={selectedIds}` and `onSelectionChange={setSelectedIds}` passed to postable table |
| `postagem/page.tsx` | `/api/bets/post-now/preview` | filtered `bet_ids` from `selectedBets.map(b => b.id)` | WIRED | Line 375: `const queueBetIds = selectedBets.map(b => b.id)` — uses filtered set, not all postable bets |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `postagem/page.tsx` | `selectedIds` | `useEffect` reading `postableBets` from `queueData` API response | Yes — populated from live queue data | FLOWING |
| `postagem/page.tsx` | `selectedBets` | `postableBets.filter(b => selectedIds.has(b.id))` derived from selection state | Yes — intersection of real queue data and selection | FLOWING |

### Behavioral Spot-Checks

Selection logic is pure UI state — no server-side runnable entry point to test in isolation. Tests substitute for spot-checks here.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 7 selection tests pass | `npx vitest run ...PostingQueueTable.test.tsx` | 7 passed (1 file) | PASS |
| No TS errors in phase files | `npx tsc --noEmit` filtered to postagem/PostingQueueTable | 0 errors | PASS |

Note: `npx tsc --noEmit` produces errors in pre-existing unrelated test files (`GroupSummaryCard.test.tsx`, `GroupCard.test.tsx`, `MemberList.test.tsx`, `database.test.ts`). These are not introduced by this phase — all errors reference schema fields (`channels`, `is_test`, `is_admin`) that are absent in older test fixtures. No errors in phase-modified files.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| QUEUE-01 | 02-01-PLAN.md | Super admin pode selecionar individualmente quais apostas da fila quer postar (default = todas selecionadas) | SATISFIED | Checkboxes in `PostingQueueTable`, default-all-selected `useEffect`, counter display, filtered `selectedBets` sent to preview API |

### Anti-Patterns Found

None. No TODOs, FIXMEs, stubs, or placeholder implementations found in modified files.

### Human Verification Required

#### 1. Checkbox rendering with live queue data

**Test:** Open `/postagem` in the browser with at least one bet in the ready queue. Observe the postable bets table.
**Expected:** Each bet row shows a checked checkbox. The header row shows a checked header checkbox (all-selected state). Counter reads "X de Y selecionadas".
**Why human:** Initial render with real queue data and visual checkbox state cannot be confirmed from static code analysis.

#### 2. Preview filtered to selected bets only

**Test:** Deselect one or two bets by clicking their checkboxes. Click "Preparar Postagem". Open browser DevTools Network tab and inspect the POST to `/api/bets/post-now/preview`.
**Expected:** The request body `bet_ids` array contains only the IDs of checked bets. Deselected bet IDs are absent from the payload.
**Why human:** Requires live browser interaction and network inspection to confirm the filtered payload reaches the API.

#### 3. Button disabled when zero selected

**Test:** Click the header checkbox when all bets are selected (to deselect all). Observe the "Preparar Postagem" button.
**Expected:** The button becomes visually disabled (grayed out, cursor-not-allowed). Clicking it does nothing. Counter shows "0 de Y selecionadas".
**Why human:** Requires browser rendering to confirm disabled state, cursor styling, and click-no-op behavior.

### Gaps Summary

No gaps. All 7 must-have truths are verified against the codebase. Implementation is substantive, wired, and data-flowing. Human verification items cover visual/interactive behaviors that require a live browser but do not indicate missing code.

---

_Verified: 2026-04-07T22:41:00Z_
_Verifier: Claude (gsd-verifier)_
