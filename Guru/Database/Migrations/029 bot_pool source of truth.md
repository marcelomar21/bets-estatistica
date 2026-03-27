---
number: 029
status: planned
phase: 2
tags:
- migration
permalink: guru/database/migrations/029-bot-pool-source-of-truth
---

# Migration 029: bot_pool as Source of Truth

## Rationale

The `bot_pool` table currently stores `bot_token` and `group_id`, but the Telegram chat IDs (`admin_group_id`, `public_group_id`) are stored as env vars per Render service. This makes multi-bot deployments fragile and requires N separate env configurations.

This migration promotes `bot_pool` to the **single source of truth** for all Telegram-related identifiers. The `groups.bot_token` column is deprecated -- the `BotContext` (Task 2.1) will read exclusively from `bot_pool`.

## SQL

```sql
-- Migration 029: bot_pool as source of truth for tokens and chat IDs
-- Phase 2, Task 2.3

-- Add admin and public group chat ID columns
ALTER TABLE bot_pool ADD COLUMN IF NOT EXISTS admin_group_id BIGINT;
ALTER TABLE bot_pool ADD COLUMN IF NOT EXISTS public_group_id BIGINT;

-- Make them NOT NULL after backfilling (run UPDATE first)
-- UPDATE bot_pool SET admin_group_id = ... , public_group_id = ... WHERE group_id = '...';

-- Add comment to document deprecation
COMMENT ON TABLE bot_pool IS 'Source of truth for Telegram bot tokens and chat IDs. groups.bot_token is deprecated.';
COMMENT ON COLUMN bot_pool.admin_group_id IS 'Telegram chat ID for the admin group where confirmations/alerts are sent';
COMMENT ON COLUMN bot_pool.public_group_id IS 'Telegram chat ID for the public group where bets are posted';

-- Ensure structure has all expected columns
-- id SERIAL PRIMARY KEY (already exists)
-- group_id UUID NOT NULL REFERENCES groups(id) (already exists)
-- bot_token TEXT NOT NULL (already exists)
-- is_active BOOLEAN DEFAULT true (already exists)
-- created_at TIMESTAMPTZ DEFAULT now() (already exists)
```

## Backfill

After running the DDL, backfill from current env var values:

```sql
-- Osmar Palpites
UPDATE bot_pool
SET admin_group_id = -1003363567204,
    public_group_id = -1003659711655
WHERE group_id = '<OSMAR_GROUP_UUID>';

-- Guru da Bet
UPDATE bot_pool
SET admin_group_id = <GURU_ADMIN_CHAT_ID>,
    public_group_id = <GURU_PUBLIC_CHAT_ID>
WHERE group_id = '<GURU_GROUP_UUID>';
```

After backfill, add NOT NULL constraints:

```sql
ALTER TABLE bot_pool ALTER COLUMN admin_group_id SET NOT NULL;
ALTER TABLE bot_pool ALTER COLUMN public_group_id SET NOT NULL;
```

## Verification

```sql
SELECT id, group_id, bot_token IS NOT NULL as has_token,
       admin_group_id, public_group_id, is_active
FROM bot_pool
ORDER BY created_at;
```

## Impact

- `bot/telegram.js`: `initBots()` reads from `bot_pool` instead of env vars
- `lib/config.js`: `loadGroupConfigs()` JOINs `bot_pool` with `groups`
- `groups.bot_token` is no longer read -- can be dropped in Phase 5 cleanup

## Related

- [[Schema]] -- bot_pool table definition
- [[030 group config columns]] -- next migration