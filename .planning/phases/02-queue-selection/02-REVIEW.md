---
phase: 02-queue-selection
reviewed: 2026-04-07T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - admin-panel/src/components/features/posting/PostingQueueTable.tsx
  - admin-panel/src/app/(auth)/postagem/page.tsx
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-07
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the checkbox selection feature added in Phase 02. The selection state wiring in `page.tsx` and the `PostingQueueTable` component are generally well-structured. Three issues require attention before merging:

1. A `useEffect` dependency bug causes selection to be fully reset on every optimistic queue update, undoing partial deselections made by the user.
2. The `<input type="time">` is bound to a field (`post_at`) whose interface type allows full ISO timestamp strings — if the API returns a full datetime, the input will silently show blank.
3. Already-posted bets (`bet_status === 'posted'`) are classified as postable and therefore selectable for re-posting, which is likely unintentional.

---

## Warnings

### WR-01: Selection reset on every optimistic update

**File:** `admin-panel/src/app/(auth)/postagem/page.tsx:637`

**Issue:** The effect that initialises `selectedIds` fires whenever `queueData` changes — including optimistic local updates triggered by `handleScheduleBet` (line 231) and `handleBulkSchedule` (line 264). Any time the user schedules a bet, all previously deselected bets become re-selected, discarding the user's manual selection.

```tsx
// Current — fires on every queueData mutation
useEffect(() => {
  setSelectedIds(new Set(postableBets.map(b => b.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [queueData]);
```

**Fix:** Only reset selection when the set of available bet IDs changes (i.e., bets are added or removed), not on every data mutation. Track the previous bet IDs and skip the reset when the identity of the IDs hasn't changed.

```tsx
const prevBetIdsRef = useRef<string>('');

useEffect(() => {
  const currentIds = postableBets.map(b => b.id).sort().join(',');
  if (currentIds !== prevBetIdsRef.current) {
    prevBetIdsRef.current = currentIds;
    setSelectedIds(new Set(postableBets.map(b => b.id)));
  }
}, [queueData]); // eslint-disable-line react-hooks/exhaustive-deps
```

---

### WR-02: `post_at` ISO string bound directly to `<input type="time">`

**File:** `admin-panel/src/components/features/posting/PostingQueueTable.tsx:331`

**Issue:** The `QueueBet` interface declares `post_at?: string | null` (line 19), which is broad enough to hold a full ISO timestamp (e.g. `"2024-01-15T10:00:00Z"`). The `<input type="time">` element requires exactly `"HH:MM"` format. If the API ever returns a full datetime string, the browser silently ignores the value and the input shows blank, giving no feedback to the user. The `onChange` handler then sends the new value back via `onScheduleBet`, but the displayed initial value is wrong.

```tsx
// Current — may silently fail if post_at is a full datetime
<input
  type="time"
  value={bet.post_at ?? ''}
  onChange={(e) => onScheduleBet(bet.id, e.target.value || null)}
  ...
/>
```

**Fix:** Extract only the time portion before binding, and do the same symmetrically when reading back:

```tsx
const timeValue = bet.post_at
  ? bet.post_at.length > 5
    ? bet.post_at.slice(11, 16) // "2024-01-15T10:00:00Z" → "10:00"
    : bet.post_at               // already "HH:MM"
  : '';

<input
  type="time"
  value={timeValue}
  onChange={(e) => onScheduleBet(bet.id, e.target.value || null)}
  ...
/>
```

Alternatively, normalise `post_at` to `HH:MM` on the API side before sending it to the client.

---

### WR-03: Already-posted bets are classified as postable and remain selectable

**File:** `admin-panel/src/app/(auth)/postagem/page.tsx:628-631`

**Issue:** `isPostable` returns `true` for bets whose `bet_status === 'posted'` (line 629). This means posted bets appear in the "Fila de Postagem" table, are auto-selected (via the reset effect), and are included in the preview/send payload if the user clicks "Preparar Postagem". This could cause bets to be posted to Telegram a second time.

```ts
// Current
function isPostable(b: QueueBet): boolean {
  if (b.elegibilidade === 'removida') return false;
  if (b.bet_status === 'posted') return true;  // ← includes posted bets as postable
  if (!b.has_link) return false;
  return b.promovida_manual || (b.odds !== null && b.odds >= MIN_ODDS);
}
```

**Fix:** Exclude already-posted bets from the postable set. They can still be displayed in a read-only section if needed.

```ts
function isPostable(b: QueueBet): boolean {
  if (b.elegibilidade === 'removida') return false;
  if (b.bet_status === 'posted') return false; // already posted — exclude
  if (b.posting_status === 'posted') return false;
  if (!b.has_link) return false;
  return b.promovida_manual || (b.odds !== null && b.odds >= MIN_ODDS);
}
```

---

## Info

### IN-01: Non-null assertions on `selectedIds` inside guarded blocks

**File:** `admin-panel/src/components/features/posting/PostingQueueTable.tsx:249,254`

**Issue:** `selectedIds!.has(bet.id)` uses the non-null assertion operator inside a block already guarded by `hasSelection` (which checks `!!selectedIds`). The assertions are safe at runtime but bypass TypeScript's type safety and are unnecessary.

**Fix:** Narrow the type through an explicit guard or a local variable:

```tsx
// At the top of the map callback:
const isSelected = hasSelection && selectedIds!.has(bet.id);
// Then use `isSelected` in both the `<tr>` className and the `<td>` checkbox.
```

---

### IN-02: Hardcoded fallback schedule in `scheduleForGroup`

**File:** `admin-panel/src/app/(auth)/postagem/page.tsx:623`

**Issue:** When neither `currentGroup?.posting_schedule` nor `queueData?.postingSchedule` is defined, the UI falls back to a hardcoded schedule `{ enabled: true, times: ['10:00', '15:00', '22:00'] }`. A user viewing a group whose schedule hasn't been configured yet will see fabricated times displayed as if they were real, which is misleading.

**Fix:** Replace the magic fallback with an explicit "not configured" state:

```tsx
const scheduleForGroup = currentGroup?.posting_schedule
  ?? queueData?.postingSchedule
  ?? { enabled: false, times: [] as string[] };
```

---

_Reviewed: 2026-04-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
