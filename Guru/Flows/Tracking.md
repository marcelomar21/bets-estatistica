---
tags:
- flow
related:
- trackResults
- resultEvaluator
- alertService
permalink: guru/flows/tracking
---

# Tracking / Results Flow

The tracking flow evaluates whether posted bets won or lost by comparing bet predictions against actual match results. It runs as a cron job and uses a combination of FootyStats API data and LLM evaluation.

## Schedule

File: `bot/server.js` (scheduler setup)

- Cron: `0 13-23 * * *` -- runs **hourly between 13h and 23h** (Sao Paulo time)
- Only runs in `central` or `mixed` bot mode (cross-group job)
- Wrapped in `withExecutionLogging('track-results', runTrackResults)` for job execution audit

## Tracking Sequence

File: `bot/jobs/trackResults.js`

### Step 1: Get Bets to Track

`getBetsToTrack()` queries `suggested_bets` with these filters:
- `bet_status = 'posted'` -- only posted bets
- `bet_result = 'pending'` -- not yet evaluated (prevents re-evaluation)
- `kickoff_time <= now - 2h` -- match should be finished (2h buffer after kickoff)
- `kickoff_time >= now - 4h` -- sliding window upper bound

Constants:
- `CHECK_DELAY_MS = 2 * 60 * 60 * 1000` (2 hours)
- `MAX_CHECK_DURATION_MS = 4 * 60 * 60 * 1000` (4 hours)

The query joins `league_matches` to get `home_team_name`, `away_team_name`, `kickoff_time`, and `status`.

### Step 2: Group by Match

Bets are grouped by `matchId` using a `Map`. This allows batch evaluation -- all bets for the same match are evaluated in a single LLM call, reducing API costs and improving consistency.

### Step 3: Fetch/Refresh Match Data

For each match:
1. `getMatchRawData(matchId)` reads `raw_match` from `league_matches` table
2. `isMatchComplete(status)` checks if match status is in `['complete', 'finished', 'ft', 'aet', 'pen']`
3. If NOT complete: `refreshMatchIfNeeded(matchId, currentStatus)` fetches fresh data from FootyStats API:
   - `fetchMatchFromAPI(matchId)` calls `https://api.football-data-api.com/match?key={key}&match_id={matchId}`
   - `updateMatchFromAPI(matchId, apiData)` saves `status`, `home_score`, `away_score`, `raw_match` back to DB
4. If still not complete after refresh: **`continue`** (silently skips this match)

### Step 4: LLM Evaluation

File: `bot/services/resultEvaluator.js`

`evaluateBetsWithLLM(matchInfo, bets)` processes all bets for a single match:

1. `extractMatchData(rawMatch)` extracts structured data from raw FootyStats JSON:
   - `homeScore`, `awayScore`, `totalGoals`
   - `homeCorners`, `awayCorners`, `totalCorners`
   - `homeYellow`, `awayYellow`, `totalYellow`
   - `homeRed`, `awayRed`, `totalRed`, `totalCards`
   - `btts` (both teams to score)

2. **Minimum data validation**: if `homeScore` or `awayScore` is null, returns all bets as `unknown` with reason "Dados do jogo incompletos"

3. **LLM call** using LangChain `ChatOpenAI`:
   - Model: `config.llm.resultEvaluatorModel` (currently `gpt-5.4`)
   - Temperature: 0 (deterministic)
   - Uses `withStructuredOutput(evaluationResponseSchema)` with Zod schema:
     ```
     { results: [{ id: number, result: 'success'|'failure'|'unknown', reason: string }] }
     ```
   - System prompt includes rules for common bet types (over/under, BTTS, corners, cards)
   - Human prompt includes formatted match data and bets as JSON

4. **Retry logic**: 3 attempts with exponential backoff (1s, 2s, 4s)

5. **ID validation** (F3 fix): validates that each returned bet ID exists in the input set. Invalid IDs from LLM hallucinations are skipped.

### Step 5: Update Results

For each evaluation result:
1. `markBetResult(betId, result, reason)` in [[betService]] updates:
   - `bet_result` = `'success'` | `'failure'` | `'unknown'`
   - `result_updated_at` = current timestamp
   - `result_reason` = LLM justification
2. For `success` or `failure` results: sends alert via `trackingResultAlert()` in `alertService.js`
3. `unknown` results do NOT generate alerts

### Step 6: Summary Alert

If any bets were tracked:
1. `getSuccessRateForDays(7)` from `metricsService.js` calculates 7-day success rate
2. `trackingSummaryAlert(stats, rate7Days)` sends summary to admin group with counts and success rate

## Known Bugs and Limitations

### B4: Sliding Window Gap (2-4h)

The query window `now-4h < kickoff_time < now-2h` creates a blind spot:
- If a match is NOT complete when the cron runs (e.g., extra time, delayed API update), the bet gets skipped with `continue`
- In the next hour, the kickoff_time may have fallen outside the 4h window
- **Result**: bet is never tracked, permanently lost as `pending`

Example: match at 15:00, cron runs at 17:00 (2h window). Match goes to penalties, FootyStats shows "incomplete". At 18:00 (3h window), match is complete but still in window. At 19:00 (4h mark), match falls out of the window permanently.

### B3: LLM Hallucination / Inverted Results

The root cause of "inverted alerts" is NOT in `alertService.js` (which correctly maps `success -> ACERTOU`). The problem is upstream:
- `resultEvaluator.js` uses a single LLM call (non-deterministic)
- The system prompt has a limited list of bet types
- Edge markets (Asian handicap, specific card bets) can be misinterpreted
- Poorly formatted `betPick` values (English, abbreviated) confuse evaluation

### No Recovery Mechanism

Currently, there is no recovery sweep for bets that escape the 2-4h window. Once `kickoff_time < now - 4h`, the bet is never queried again.

**Planned fix** (spec Task 1.5): Add a recovery sweep block at the end of `runTrackResults()` that queries `bet_status='posted' AND bet_result='pending' AND kickoff_time < now-8h`.

### No Deterministic Validation

Simple markets (Over/Under X.5, BTTS, 1X2) are sent to LLM even though they could be evaluated deterministically by comparing scores directly.

**Planned fix** (spec Task 1.6): Add deterministic first-pass for simple markets before calling LLM.

### Planned: Multi-LLM Consensus (spec Task 3.2)

Replace single LLM evaluation with 3 independent providers:
- **GPT-5.1-mini** (OpenAI)
- **Claude Sonnet 4.6** (Anthropic)
- **Kimi 2.5** (Moonshot)

Consensus logic:
- 3/3 agree: `confidence: 'high'`
- 2/3 agree: `confidence: 'medium'`
- All diverge: `result: 'unknown'`, `confidence: 'low'`

New column `result_confidence` in `suggested_bets` (migration 031).

## Key Files

| File | Purpose |
|---|---|
| `bot/jobs/trackResults.js` | Main job: fetch bets, refresh matches, evaluate, update |
| `bot/services/resultEvaluator.js` | LLM evaluation with Zod structured output |
| `bot/services/betService.js` | `markBetResult()` -- DB update |
| `bot/services/alertService.js` | `trackingResultAlert()`, `trackingSummaryAlert()` |
| `bot/services/metricsService.js` | `getSuccessRateForDays()` for summary |

## Related

- [[Posting]] -- bets must be posted before they can be tracked
- [[Distribution]] -- distribution assigns group_id which does not affect tracking (tracking is cross-group)