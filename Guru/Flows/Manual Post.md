---
tags:
- flow
related:
- post-now
- postBets
permalink: guru/flows/manual-post
---

# Manual Post Flow

The manual post flow allows admins to trigger immediate posting from the admin panel, bypassing the scheduled posting times.

## Sequence Overview

```
Admin Panel                    Supabase                    Bot (Render)
    |                              |                           |
    |-- POST /api/bets/post-now -->|                           |
    |                              |-- set post_now_requested_at
    |<-- 200 OK ------------------|                           |
    |                              |                           |
    |                              |<-- checkPostNow() poll ---|
    |                              |   (every 30s)             |
    |                              |                           |
    |                              |-- read flag ------------->|
    |                              |                           |-- runPostBets(true)
    |                              |                           |-- post to Telegram
    |                              |<-- clear flag ------------|
```

## Step 1: Admin Panel Request

File: `admin-panel/src/app/api/bets/post-now/route.ts`

When the admin clicks "Postar Agora":

1. **Auth**: `createApiHandler` validates JWT, requires role `super_admin` or `group_admin`
2. **Group resolution**: from `groupFilter` (tenant context) or request body `group_id`
3. **Group validation**: verifies group exists in DB

### Pre-validation

The endpoint pre-validates bets before setting the flag, so the admin gets immediate feedback instead of a blind "Postagem solicitada":

```sql
SELECT id, bet_status, odds, deep_link, promovida_manual,
       league_matches.home_team_name, league_matches.away_team_name, league_matches.kickoff_time
FROM suggested_bets
JOIN league_matches ON ...
WHERE group_id = :groupId
  AND elegibilidade = 'elegivel'
  AND deep_link IS NOT NULL
  AND bet_status IN ('generated', 'pending_link', 'pending_odds', 'ready', 'posted')
  AND kickoff_time > NOW()
```

Then applies the same filter as the bot:
- `odds >= MIN_ODDS (1.60)` OR `promovida_manual = true`

If no valid bets pass: returns `422` with `NO_VALID_BETS` error and detail messages (e.g., "Sao Paulo x Santos: odds insuficientes (1.45 < 1.60)").

### Set the Flag

If validation passes:
```sql
UPDATE groups
SET post_now_requested_at = NOW()
WHERE id = :groupId
```

Returns `200` with: `{ validCount, betIds, issues }`.

### Known Issue: MIN_ODDS Duplication

`MIN_ODDS = 1.60` is hardcoded on line 4 of `post-now/route.ts`, separate from the bot's `config.betting.minOdds`. These can diverge silently if one is updated without the other.

## Step 2: Bot Polling

File: `bot/server.scheduler.js`

`checkPostNow()` runs every 30 seconds via `setInterval` (set up in `server.js` during scheduler init).

1. **Mutex check**: if `isManualPostInProgress` is true, skip this cycle
2. **Read flag**:
   ```sql
   SELECT post_now_requested_at
   FROM groups
   WHERE id = :groupId
   ```
3. If `post_now_requested_at` is null: return (no pending request)
4. If set: log the request and proceed

### Execute Posting

Sets `isManualPostInProgress = true`, then:
```javascript
await withExecutionLogging('post-bets-manual', () =>
  runPostBets(true, { postTimes: currentSchedule?.times })
);
```

`runPostBets(true)` is called with `skipConfirmation=true`, which means:
- No admin confirmation inline keyboard is sent
- Bets are posted directly to the public group
- The full [[Posting]] flow runs (getFilaStatus -> validate -> format -> send)

### Clear the Flag

After posting (whether success or failure):
```sql
UPDATE groups
SET post_now_requested_at = NULL
WHERE id = :groupId
  AND post_now_requested_at = :originalTimestamp
```

The `post_now_requested_at = :originalTimestamp` condition prevents clearing a newer request that arrived during execution.

Finally, `isManualPostInProgress = false` is set in the `finally` block.

## Error Handling

- If the bot process is down: the flag remains set in the DB. When the bot restarts, the next `checkPostNow()` poll (within 30s) will pick it up.
- If posting fails: the flag is still cleared (to prevent infinite retry loops). The error is logged in `job_executions`.
- If two admins click simultaneously: the mutex `isManualPostInProgress` prevents concurrent posting. The second request's flag will be picked up after the first completes.

## Key Functions

| Function | File | Purpose |
|---|---|---|
| `POST /api/bets/post-now` | `admin-panel/src/app/api/bets/post-now/route.ts` | API endpoint, pre-validates and sets flag |
| `checkPostNow()` | `bot/server.scheduler.js` | Polls DB for flag every 30s |
| `runPostBets(true)` | `bot/jobs/postBets.js` | Executes posting with skipConfirmation |

## Planned Enhancements

### Preview + Edit Flow (spec Task 4.4, 4.5, 4.6)

A new `POST /api/bets/post-now/preview` endpoint will:
1. Generate copy without sending
2. Persist previews in `post_previews` table (TTL 30min)
3. Allow editing/regenerating individual bet messages
4. Support `overrides: { [betId]: editedText }` in the confirm step

The Telegram inline keyboard (Confirmar/Cancelar) will remain as a fallback for when the admin does not have access to the web panel.

## Related

- [[Posting]] -- the full posting flow that manual post triggers
- [[Distribution]] -- bets must be distributed to the group before posting