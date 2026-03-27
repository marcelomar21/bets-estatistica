---
number: 26
status: planned
phase: 2
tags:
- migration
permalink: guru/database/migrations/032-tracking-recovery-index
---

# Migration 032: Tracking Recovery Index

## Rationale

The tracking recovery sweep (spec Task 1.5) queries bets that escaped the normal 2-4h tracking window:

```sql
WHERE bet_status = 'posted'
  AND bet_result = 'pending'
  AND kickoff_time < NOW() - INTERVAL '8 hours'
```

Without an index, this query scans the entire `suggested_bets` table. A **partial index** dramatically improves performance by only indexing the subset of rows that match the `WHERE` clause.

This is particularly important because:
- The recovery sweep runs every hour (13h-23h) as part of `runTrackResults()`
- Most bets transition out of `posted + pending` quickly, so the index stays small
- The `kickoff_time` column in the index enables efficient range scans

## SQL

```sql
-- Migration 032: Partial index for tracking recovery sweep
-- Phase 2, Task 2.3

CREATE INDEX IF NOT EXISTS idx_bets_tracking_recovery
ON suggested_bets (bet_status, bet_result)
WHERE bet_status = 'posted' AND bet_result = 'pending';

COMMENT ON INDEX idx_bets_tracking_recovery IS 'Partial index for tracking recovery sweep query. Only indexes posted+pending bets.';
```

Note: The index includes `bet_status` and `bet_result` as indexed columns (not just in the WHERE clause) because PostgreSQL can use these for equality checks. The `kickoff_time` column is intentionally omitted from the index because:
1. It lives on the `league_matches` table (JOIN required)
2. The partial index already narrows the set to only posted+pending bets
3. The JOIN with `league_matches` handles the time filter efficiently on the small result set

## Alternative Considered

A composite index including `kickoff_time` via a materialized column on `suggested_bets`:
```sql
-- NOT CHOSEN: would require denormalizing kickoff_time onto suggested_bets
CREATE INDEX idx_bets_tracking_recovery_v2
ON suggested_bets (kickoff_time)
WHERE bet_status = 'posted' AND bet_result = 'pending';
```

This was rejected to avoid denormalization. The partial index on `(bet_status, bet_result)` is sufficient given the small number of rows that match at any time.

## Verification

```sql
-- Check index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'suggested_bets'
  AND indexname = 'idx_bets_tracking_recovery';

-- Check index is being used (after running the recovery query)
EXPLAIN ANALYZE
SELECT sb.id, sb.match_id, sb.bet_market
FROM suggested_bets sb
JOIN league_matches lm ON sb.match_id = lm.match_id
WHERE sb.bet_status = 'posted'
  AND sb.bet_result = 'pending'
  AND lm.kickoff_time < NOW() - INTERVAL '8 hours';
```

## Impact

- `bot/jobs/trackResults.js`: recovery sweep query (planned addition) uses this index
- No code changes required -- the index is transparent to the application

## Related

- [[Tracking]] -- the flow that uses recovery sweep
- [[031 bet result confidence]] -- previous migration
- [[033 post_previews]] -- next migration