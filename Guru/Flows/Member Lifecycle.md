---
tags:
- flow
related:
- membership
- sync-group-members
- kick-expired
- renewal-reminders
permalink: guru/flows/member-lifecycle
---

# Member Lifecycle

The member lifecycle covers the full journey from payment to expiration: subscription activation, group sync, renewal reminders, and removal of expired/defaulted members.

## Overview

```
Payment Webhook -> Subscription Activated -> Member Joins Group
                                                |
                                    sync-group-members (every 30min)
                                                |
                                    renewal-reminders (daily 10:00 BRT)
                                                |
                                    kick-expired (daily 00:01 BRT)
                                                |
                                    Member Removed from Group
```

## 1. Payment and Subscription Activation

Payment webhooks from Mercado Pago are processed by `bot/jobs/membership/process-webhooks.js` (runs every 30s via `setInterval`). On successful payment:
- Creates/updates member record in `members` table
- Sets `status = 'ativo'` or `status = 'trial'`
- Sets `subscription_ends_at` based on plan duration

The `/start` command in private chat (`bot/handlers/startCommand.js`) handles the gate entry: user clicks invite link, bot verifies subscription, generates join link.

## 2. Sync Group Members

File: `bot/jobs/membership/sync-group-members.js`

**Schedule**: Every 30 minutes (cron `*/30 * * * *`), runs in `group` mode.

### Group Resolution

`resolveGroup()` determines which Telegram group to sync:
- If `GROUP_ID` env var is set (multi-tenant): queries `groups` table for `telegram_group_id`
- If `GROUP_ID` is NOT set: **aborts entirely** to prevent creating orphan member records without `group_id`

This was a recent fix -- previously, without `GROUP_ID`, the job would fall back to `config.telegram.publicGroupId` and create members without group association.

### Sync Process

`runSyncGroupMembers()` (with in-memory lock to prevent concurrent runs):

**Step 1: Fetch Telegram Admins**
- Calls `bot.getChatAdministrators(chatId)` on the resolved group
- Filters out bot accounts (`is_bot: false`)

**Step 2: Ensure Admins Exist in DB**
For each human admin:
- Queries `members` table by `telegram_id` (and `group_id` if multi-tenant)
- If not found: creates new member record with `status: 'ativo'`, `joined_group_at: now`
- If found but missing `joined_group_at`: updates it

Rate-limited at 100ms between Telegram API calls (10 req/s).

**Step 3: Verify Active Members**
For each member in DB with `status IN ('ativo', 'trial')` and `telegram_id IS NOT NULL`:
- Calls `bot.getChatMember(chatId, telegramId)` to check if still in group
- If NOT in group (status: `left`, `kicked`, `not_found`): logs as `leftGroup`
- Does NOT automatically remove from DB -- just reports discrepancies

Rate-limited at 100ms between API calls.

### Result
Returns: `{ created, updated_join, skipped_admins, active_members_checked, left_group, left_group_details }`

## 3. Renewal Reminders

File: `bot/jobs/membership/renewal-reminders.js`

**Schedule**: Daily at 10:00 BRT (cron `0 10 * * *`), runs in `group` mode.

### Who Gets Reminders

`getMembersNeedingRenewalReminder()` filters:
- `status = 'ativo'`
- `payment_method IN ('pix', 'boleto')` -- excludes `cartao_recorrente` (auto-renewal)
- `subscription_ends_at IS NOT NULL`
- Days until subscription end matches target days: **5, 3, or 1 days**

### Sending Process

For each eligible member:
1. **Duplicate check**: `hasNotificationToday(memberId, 'renewal_reminder')` prevents sending twice in one day
2. **Payment link**: `getPaymentLinkForMember(member)` generates checkout URL (with optional affiliate tracking)
3. **Message**: `formatRenewalReminder(member, daysUntilRenewal, checkoutUrl)` creates the reminder text
4. **Send**: `sendPrivateMessage(telegramId, message)` delivers via Telegram
5. **Register**: `registerNotification(memberId, type, channel, messageId)` records in DB

Handles `USER_BLOCKED_BOT` gracefully (user blocked the bot -- skip, don't fail).

## 4. Kick Expired Members

File: `bot/jobs/membership/kick-expired.js`

**Schedule**: Daily at 00:01 BRT (cron `1 0 * * *`), runs in `central` or `mixed` mode.

### Who Gets Kicked

`getAllInadimplenteMembers()` queries:
- `status = 'inadimplente'` -- set by webhook handler when payment fails/cancels
- Filtered by `group_id` if `GROUP_ID` is configured

### Grace Period

`calculateDaysRemaining(member)` computes:
```
daysRemaining = gracePeriodDays - floor((now - inadimplente_at) / 1 day)
```

Default `gracePeriodDays = 2`. So:
- Day 0-1 after becoming `inadimplente`: **warning** sent via `sendKickWarningNotification()`
- Day 2+: **kicked** from group

### Kick Process

`processMemberKick(member, reason, groupData)`:

1. **Resolve chat ID**: from `groupData.telegram_group_id` (multi-tenant) or `config.telegram.publicGroupId` (single-tenant fallback)
2. **Send farewell message**: private message with checkout URL to re-subscribe
3. **Kick from Telegram**: `kickMemberFromGroup(telegramId, chatId)` via Telegram API
4. **Mark as removed**: `markMemberAsRemoved(memberId, reason)` updates DB status
5. **Audit log**: `registerKickAuditEvent()` creates event in audit table

Error handling:
- `USER_NOT_IN_GROUP`: member already left -- mark as removed in DB
- `BOT_NO_PERMISSION`, `CONFIG_MISSING`: persistent errors -- alert admin immediately
- Transient Telegram errors: retry naturally on next daily run

### Multi-tenant Group Resolution

`resolveGroupData(groupId)` fetches from `groups` table:
- `id`, `name`, `telegram_group_id`, `checkout_url`, `status`

If group resolution fails in multi-tenant mode, the job **aborts** all kicks for that group and alerts admin.

## Singleton Issue (GROUP_ID Global)

All three membership jobs currently use `config.membership.groupId` (from `GROUP_ID` env var) as a module-level singleton:
- `sync-group-members.js`: `resolveGroup()` reads from `config.membership.groupId`
- `kick-expired.js`: `getAllInadimplenteMembers()` filters by `config.membership.groupId`
- `renewal-reminders.js`: does not filter by group_id at all (processes all active PIX/Boleto members)

In the current deployment model (1 Render service per bot), this works because each service has its own `GROUP_ID`. In the planned multi-bot future (spec Phase 5), these jobs need to receive `groupId` as a parameter instead.

## Key Files

| File | Purpose |
|---|---|
| `bot/jobs/membership/sync-group-members.js` | Sync Telegram group members with DB |
| `bot/jobs/membership/renewal-reminders.js` | Send payment reminders before expiration |
| `bot/jobs/membership/kick-expired.js` | Warn and remove defaulted members |
| `bot/jobs/membership/process-webhooks.js` | Process Mercado Pago payment webhooks |
| `bot/handlers/startCommand.js` | `/start` gate entry flow |
| `bot/services/notificationService.js` | Message formatting and sending |
| `bot/services/memberService.js` | `kickMemberFromGroup()`, `markMemberAsRemoved()` |

## Related

- [[Schema]] -- `members`, `subscriptions` tables
- [[Posting]] -- posting requires active group with members
- [[Guru da Bet]] and [[Osmar Palpites]] -- client-specific group IDs