---
tags: [database, queries]
---

# Useful Queries

Recurring queries for debugging and operations. All can be run via the Supabase Management API or the Supabase dashboard.

## Running Queries via Supabase Management API

```bash
# Get access token from macOS Keychain
TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/go-keyring-base64://' | base64 -d)

# Run query
curl -s -X POST "https://api.supabase.com/v1/projects/vqrcuttvcgmozabsqqja/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT 1"}'
```

Response `[]` (empty array) indicates success for DDL commands (CREATE, ALTER, DROP).

## Job Execution Queries

### Last 5 executions of any job

```sql
SELECT id, job_name, status, started_at, completed_at, error
FROM job_executions
WHERE job_name = 'post-bets-manual'  -- or: post-bets, track-results, distribute-bets, etc.
ORDER BY created_at DESC
LIMIT 5;
```

### Via REST API (from CLAUDE.md)

```bash
# Replace <job-name> with: post-bets-manual, distribute-bets, track-results, etc.
curl -s "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/job_executions?order=created_at.desc&limit=5&job_name=eq.<job-name>" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -m json.tool
```

The `SUPABASE_SERVICE_KEY` is in `admin-panel/.env.local`.

### Failed jobs in the last 24h

```sql
SELECT job_name, status, error, started_at
FROM job_executions
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Stuck jobs (running for more than 10 minutes)

```sql
SELECT id, job_name, started_at
FROM job_executions
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '10 minutes';
```

## Bet Queries

### Get undistributed bets (ready for distribution)

```sql
SELECT sb.id, sb.elegibilidade, sb.bet_status, sb.group_id,
       lm.home_team_name, lm.away_team_name, lm.kickoff_time
FROM suggested_bets sb
JOIN league_matches lm ON sb.match_id = lm.match_id
WHERE sb.elegibilidade = 'elegivel'
  AND sb.group_id IS NULL
  AND sb.distributed_at IS NULL
  AND sb.bet_status != 'posted'
  AND lm.kickoff_time >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::timestamptz
  AND lm.kickoff_time <= ((CURRENT_DATE + 1) AT TIME ZONE 'America/Sao_Paulo' + INTERVAL '23 hours 59 minutes 59 seconds')::timestamptz
ORDER BY lm.kickoff_time ASC;
```

### Get bets to track (sliding window)

```sql
SELECT sb.id, sb.match_id, sb.bet_market, sb.bet_pick, sb.bet_result,
       lm.home_team_name, lm.away_team_name, lm.kickoff_time, lm.status
FROM suggested_bets sb
JOIN league_matches lm ON sb.match_id = lm.match_id
WHERE sb.bet_status = 'posted'
  AND sb.bet_result = 'pending'
  AND lm.kickoff_time <= NOW() - INTERVAL '2 hours'
  AND lm.kickoff_time >= NOW() - INTERVAL '4 hours';
```

### Recovery sweep candidates (bets that escaped tracking window)

```sql
SELECT sb.id, sb.match_id, sb.bet_market, sb.bet_pick,
       lm.home_team_name, lm.away_team_name, lm.kickoff_time, lm.status
FROM suggested_bets sb
JOIN league_matches lm ON sb.match_id = lm.match_id
WHERE sb.bet_status = 'posted'
  AND sb.bet_result = 'pending'
  AND lm.kickoff_time < NOW() - INTERVAL '8 hours'
ORDER BY lm.kickoff_time DESC;
```

### Get active groups with bet counts

```sql
SELECT g.id, g.name, g.status,
       COUNT(sb.id) as bet_count
FROM groups g
LEFT JOIN suggested_bets sb ON sb.group_id = g.id
  AND sb.bet_status = 'posted'
  AND sb.bet_result = 'pending'
WHERE g.status = 'active'
GROUP BY g.id, g.name, g.status
ORDER BY g.created_at ASC;
```

### Get posting queue for a group (mirrors getFilaStatus)

```sql
-- Active bets (repost)
SELECT sb.id, sb.bet_market, sb.odds_at_post, sb.deep_link,
       lm.home_team_name, lm.away_team_name, lm.kickoff_time
FROM suggested_bets sb
JOIN league_matches lm ON sb.match_id = lm.match_id
WHERE sb.bet_status = 'posted'
  AND sb.elegibilidade = 'elegivel'
  AND sb.group_id = '<GROUP_UUID>'
  AND lm.kickoff_time > NOW()
  AND lm.kickoff_time <= NOW() + INTERVAL '2 days'
ORDER BY lm.kickoff_time ASC, sb.odds DESC
LIMIT 3;

-- New bets (fill slots)
SELECT sb.id, sb.bet_market, sb.odds, sb.deep_link,
       lm.home_team_name, lm.away_team_name, lm.kickoff_time
FROM suggested_bets sb
JOIN league_matches lm ON sb.match_id = lm.match_id
WHERE sb.elegibilidade = 'elegivel'
  AND sb.deep_link IS NOT NULL
  AND sb.bet_status IN ('generated', 'pending_link', 'pending_odds', 'ready')
  AND sb.group_id = '<GROUP_UUID>'
  AND lm.kickoff_time > NOW()
  AND lm.kickoff_time <= NOW() + INTERVAL '2 days'
  AND (sb.promovida_manual = true OR sb.odds >= 1.60)
ORDER BY lm.kickoff_time ASC, sb.promovida_manual DESC, sb.odds DESC;
```

## Member Queries

### Active members by group

```sql
SELECT m.id, m.telegram_username, m.status, m.payment_method,
       m.subscription_ends_at
FROM members m
WHERE m.group_id = '<GROUP_UUID>'
  AND m.status IN ('ativo', 'trial')
ORDER BY m.subscription_ends_at ASC;
```

### Members expiring in next 5 days (PIX/Boleto only)

```sql
SELECT m.id, m.telegram_username, m.payment_method,
       m.subscription_ends_at,
       CEIL(EXTRACT(EPOCH FROM (m.subscription_ends_at - NOW())) / 86400) as days_remaining
FROM members m
WHERE m.status = 'ativo'
  AND m.payment_method IN ('pix', 'boleto')
  AND m.subscription_ends_at BETWEEN NOW() AND NOW() + INTERVAL '5 days'
ORDER BY m.subscription_ends_at ASC;
```

### Inadimplente members pending kick

```sql
SELECT m.id, m.telegram_username, m.inadimplente_at, m.status,
       FLOOR(EXTRACT(EPOCH FROM (NOW() - m.inadimplente_at)) / 86400) as days_since
FROM members m
WHERE m.status = 'inadimplente'
ORDER BY m.inadimplente_at ASC;
```

## Applying Migrations

Migrations are stored in `sql/migrations/` with sequential numbering.

```bash
# Read migration file and apply via Management API
SQL=$(cat sql/migrations/029_bot_pool_source_of_truth.sql)

curl -s -X POST "https://api.supabase.com/v1/projects/vqrcuttvcgmozabsqqja/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$SQL" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}"
```

Response `[]` = success for DDL. Verify by querying the created/altered objects.

## Related

- [[Schema]] -- table definitions
- [[Posting]] -- uses getFilaStatus queries
- [[Tracking]] -- uses getBetsToTrack queries
