---
tags: [flow]
related: [distributeBets, betService]
---

# Distribution Flow

The distribution flow assigns eligible bets to active groups using a round-robin algorithm. It runs centrally (cross-group) and must complete before the posting job fires.

## Schedule

Two trigger modes:

1. **Dynamic scheduler** (`server.scheduler.js`): runs at `T - 5 minutes` before each posting time. E.g., if posting is at 10:00, distribution runs at 09:55.
2. **Central cron** (`server.js`): runs every 15 minutes (`*/15 * * * *`) as a safety net in `central` or `mixed` mode.

Both are wrapped in `withExecutionLogging('distribute-bets', ...)`.

## Distribution Sequence

File: `bot/jobs/distributeBets.js`

### Step 1: Get Active Groups

`getActiveGroups()` queries the `groups` table:
```sql
SELECT id, name, status, created_at
FROM groups
WHERE status = 'active'
ORDER BY created_at ASC
```

Groups are ordered deterministically by `created_at ASC`. This ordering is significant because it determines which group gets which bets in the round-robin.

If no active groups exist, an admin alert is sent and the job returns early.

### Step 1.5: Rebalance if Needed

`rebalanceIfNeeded(activeGroups)` checks if all active groups have bets in the current distribution window (today + tomorrow BRT):

1. Fetches all distributed (non-posted) bets in the window
2. Computes which groups have bets vs which do not
3. If any active group has **zero bets**: undistributes ALL non-posted bets (`group_id = null, distributed_at = null`)
4. This forces redistribution in the next step

This is an **all-or-nothing** approach. It correctly excludes `bet_status='posted'` bets from being undistributed.

### Step 2: Get Undistributed Bets

`getUndistributedBets()` queries `suggested_bets`:
```sql
SELECT id, match_id, elegibilidade, group_id, distributed_at, bet_status
FROM suggested_bets
JOIN league_matches ON ...
WHERE elegibilidade = 'elegivel'
  AND group_id IS NULL
  AND distributed_at IS NULL
  AND bet_status != 'posted'
  AND kickoff_time >= startOfToday (BRT)
  AND kickoff_time <= endOfTomorrow (BRT)
ORDER BY kickoff_time ASC
```

The distribution window is calculated by `getDistributionWindow()`: from today 00:00 BRT to tomorrow 23:59:59 BRT.

### Step 3: Round-Robin Assignment

`distributeRoundRobin(bets, groups)` is a pure function:
```javascript
bets.map((bet, i) => ({
  betId: bet.id,
  groupId: groups[i % groups.length].id,
}));
```

This assigns bets in order: bet[0] -> group[0], bet[1] -> group[1], bet[2] -> group[0], etc.

### Step 4: Execute Assignments

For each assignment, `assignBetToGroup(betId, groupId)`:
```sql
UPDATE suggested_bets
SET group_id = :groupId, distributed_at = NOW()
WHERE id = :betId AND group_id IS NULL
```

The `group_id IS NULL` check makes the operation **idempotent** -- if a bet was already distributed (e.g., by a concurrent run), the update affects 0 rows and is treated as success.

### Step 5: Summary

The job logs a summary with:
- Total distributed count
- Failed count
- Per-group counts
- Duration in milliseconds

If any assignments failed, an admin alert is sent.

## Known Issues

### Systematic Bias (D1, D2)

The round-robin always starts from index 0. Since groups are ordered by `created_at ASC`, the oldest group (e.g., Osmar Palpites, created first) always gets bet[0], bet[2], bet[4]...

Since bets are ordered by `kickoff_time ASC`, and the AI pipeline tends to produce higher-confidence bets first, the first group systematically gets the "better" bets.

**Planned fix** (spec Task 3.1):
- Count existing bets per group before distributing
- Start assignment from the group with fewer bets
- Use `Math.random()` to break ties

### Rebalance is All-or-Nothing

When a new group is activated, `rebalanceIfNeeded()` undistributes ALL non-posted bets and redistributes from scratch. This works but is aggressive -- ideally it should only redistribute the delta needed for fairness.

### No Persistent Offset

Each run of `distributeRoundRobin` starts from index 0. There is no persistence of where the last run left off. This compounds the systematic bias issue.

## Key Functions

| Function | File | Purpose |
|---|---|---|
| `runDistributeBets()` | `bot/jobs/distributeBets.js` | Main entry point |
| `getActiveGroups()` | `bot/jobs/distributeBets.js` | Fetch active groups ordered by created_at |
| `getUndistributedBets()` | `bot/jobs/distributeBets.js` | Fetch eligible unassigned bets |
| `getDistributionWindow()` | `bot/jobs/distributeBets.js` | Calculate today+tomorrow BRT window |
| `rebalanceIfNeeded(groups)` | `bot/jobs/distributeBets.js` | Detect new groups, force redistribution |
| `distributeRoundRobin(bets, groups)` | `bot/jobs/distributeBets.js` | Pure round-robin assignment |
| `assignBetToGroup(betId, groupId)` | `bot/jobs/distributeBets.js` | Idempotent DB update |

## Related

- [[Posting]] -- posting reads from bets already distributed to the group
- [[Schema]] -- `suggested_bets.group_id` and `suggested_bets.distributed_at` columns
