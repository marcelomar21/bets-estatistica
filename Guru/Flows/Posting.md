---
tags: [flow]
related: [postBets, copyService, betService]
---

# Posting Flow

The posting flow is the core mechanism that sends bet messages to Telegram public groups. It is triggered either by the dynamic scheduler at configured times or manually via the admin panel.

## Entry Points

There are two ways posting is triggered:

1. **Scheduled posting** -- `server.scheduler.js` creates cron jobs per configured time (e.g., 10:00, 15:00, 22:00 BRT). At each posting time, `runPostBets(true, { postTimes })` is called with `skipConfirmation=true`.
2. **Manual posting** -- Admin clicks "Postar Agora" in the admin panel, which sets a flag in the DB. The `checkPostNow()` polling (every 30s) detects it and triggers `runPostBets(true, { postTimes })`. See [[Manual Post]] for details.

## Scheduler Setup

File: `bot/server.scheduler.js`

The scheduler reads `posting_schedule` from the `groups` table (JSONB with `{ enabled, times }`) via `loadPostingSchedule()`. Default schedule is `{ enabled: true, times: ['10:00', '15:00', '22:00'] }`.

`setupDynamicScheduler(schedule)` creates pairs of cron jobs for each time:
- **Distribution job** at `T - 5 minutes` -- calls `runDistributeBets()` to assign bets to this group. See [[Distribution]].
- **Posting job** at `T` -- calls `runPostBets(true, { postTimes })`.

The scheduler reloads config from DB every 5 minutes via `reloadPostingSchedule()`. If the schedule changed, it stops old cron jobs and recreates new ones.

State is held in module-level variables:
- `activePostingJobs` -- array of active cron job instances
- `currentSchedule` -- cached schedule object
- `isManualPostInProgress` -- mutex to prevent concurrent manual posts

## Posting Sequence

File: `bot/jobs/postBets.js`

### Step 1: Get Bets to Post

`runPostBets()` calls `getFilaStatus(groupId, postTimes)` from [[betService]]. This is the **single source of truth** for what gets posted -- the same function that powers the `/fila` command.

`getFilaStatus()` returns two arrays:
- **`ativas`** -- Bets already posted (`bet_status='posted'`) with future kickoff, filtered by `elegibilidade='elegivel'`. These are **reposted** each cycle. Currently capped by `config.betting.maxActiveBets` (hardcoded to 3, planned removal in spec Task 1.2).
- **`novas`** -- New eligible bets (`elegibilidade='elegivel'`, has `deep_link`, non-terminal status) that fill remaining slots (`maxActiveBets - ativas.length`).

Both arrays are filtered by `group_id` when in multi-tenant mode.

### Step 2: Request Confirmation (scheduled only)

When `skipConfirmation=false` (manual `/postar` command in Telegram), the bot sends a preview message to the admin group with inline keyboard buttons:
- `requestConfirmation(ativas, novas, period)` generates a preview with `formatBetPreview()` for each bet
- Sends to `config.telegram.adminGroupId` with `inline_keyboard` containing "Confirmar" and "Cancelar" buttons
- Creates a Promise that resolves when admin clicks a button or after **15 minutes** (auto-confirm timeout)

The `pendingConfirmations` Map stores pending confirmations keyed by `confirmationId` (format: `postbets_{timestamp}`). Each entry holds:
- `resolve` -- Promise resolver
- `timeoutId` -- Auto-confirm setTimeout reference
- `messageId` -- Telegram message ID for editing
- `period` -- Current period name

`handlePostConfirmation(action, confirmationId, callbackQuery)` is called from `server.js` when a callback query arrives with `postbets_confirm:` or `postbets_cancel:` prefix.

When `skipConfirmation=true` (scheduled or manual-via-panel), confirmation is skipped entirely and posting proceeds immediately.

### Step 3: Repost Active Bets

For each bet in `ativas`:
1. `validateBetForPosting(bet)` checks: has `deepLink`, odds >= `config.betting.minOdds` (1.60) unless `promovidaManual=true`, kickoff in the future
2. `formatBetMessage(bet, template)` generates the message:
   - Random template from `MESSAGE_TEMPLATES` (5 variants with different headers/footers)
   - Match info: teams, kickoff time (formatted to BRT), market, odds
   - Calls `generateBetCopy(bet)` from [[copyService]] to generate LLM-powered bullet points from `bet.reasoning`
   - Deep link button
3. `sendToPublic(message)` sends to the public Telegram group
4. `registrarPostagem(bet.id)` logs the repost in history (does NOT change `bet_status`)

### Step 4: Post New Bets

For each bet in `novas`:
1. Same validation as Step 3
2. Same formatting as Step 3
3. `sendToPublic(message)` sends to public group
4. `markBetAsPosted(bet.id, messageId, odds)` updates: `bet_status='posted'`, `telegram_posted_at`, `telegram_message_id`, `odds_at_post`
5. `registrarPostagem(bet.id)` logs the post

### Step 5: Send Post Warn

After posting, `sendPostWarn()` from `bot/jobs/jobWarn.js` sends a summary to the admin group:
- Lists posted bets (reposted + new)
- Lists upcoming bets for the next 2 days with pending actions (missing link, insufficient odds)
- Provides actionable commands (e.g., `/link {id} URL`)

## Key Functions

| Function | File | Purpose |
|---|---|---|
| `runPostBets(skipConfirmation)` | `bot/jobs/postBets.js` | Main entry point |
| `getFilaStatus(groupId, postTimes)` | `bot/services/betService.js` | Source of truth for posting queue |
| `validateBetForPosting(bet)` | `bot/jobs/postBets.js` | Pre-post validation |
| `formatBetMessage(bet, template)` | `bot/jobs/postBets.js` | Telegram message formatting |
| `generateBetCopy(bet)` | `bot/services/copyService.js` | LLM bullet point generation |
| `requestConfirmation(ativas, novas, period)` | `bot/jobs/postBets.js` | Admin confirmation flow |
| `handlePostConfirmation(action, id, query)` | `bot/jobs/postBets.js` | Callback handler for confirm/cancel |
| `markBetAsPosted(betId, msgId, odds)` | `bot/services/betService.js` | DB status update |
| `sendPostWarn(period, posted, upcoming, pending)` | `bot/jobs/jobWarn.js` | Post-posting summary |

## Known Issues

- **MAX_ACTIVE_BETS = 3 hardcoded** in `lib/config.js` line 37. Propagates to 5 points in `betService.js`. Planned removal in spec Task 1.2.
- **MIN_ODDS = 1.60 duplicated** between bot (`config.betting.minOdds`) and admin panel (`post-now/route.ts` line 4). Can diverge silently.
- **`pendingConfirmations` is a global Map** -- not scoped per group. In multi-bot future, two groups confirming simultaneously could collide.
- **Copy generation failures** fall back to truncated raw `reasoning` text (200 chars max). Not ideal for user-facing messages.

## Related

- [[Distribution]] -- how bets get assigned to groups before posting
- [[Manual Post]] -- admin panel manual trigger flow
- [[Tracking]] -- what happens after bets are posted (result tracking)
