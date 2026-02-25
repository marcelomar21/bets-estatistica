---
number: 033
status: planned
phase: 4
tags: [migration]
---

# Migration 033: post_previews Table

## Rationale

The preview/edit flow (spec Tasks 4.4-4.6) allows admins to review and edit LLM-generated bet messages before posting to Telegram. Generated previews need to be persisted because:

1. **Vercel serverless**: admin panel runs on serverless functions that can scale/restart. In-memory cache would lose state.
2. **Concurrency**: two admins preparing postings simultaneously need isolated state per `preview_id`.
3. **TTL**: previews expire after 30 minutes via `expires_at` column, preventing stale data.

## SQL

```sql
-- Migration 033: post_previews table for preview/edit flow
-- Phase 4, Task 4.4

CREATE TABLE IF NOT EXISTS post_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_id TEXT NOT NULL UNIQUE,
  group_id UUID NOT NULL REFERENCES groups(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  bets JSONB NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes')
);

-- Lookup index for active drafts
CREATE INDEX IF NOT EXISTS idx_post_previews_lookup
ON post_previews (preview_id)
WHERE status = 'draft';

-- Cleanup index for expired previews
CREATE INDEX IF NOT EXISTS idx_post_previews_expires
ON post_previews (expires_at)
WHERE status = 'draft';

COMMENT ON TABLE post_previews IS 'Persisted preview state for post-now preview/edit flow. TTL 30min via expires_at.';
COMMENT ON COLUMN post_previews.preview_id IS 'Unique ID for a preview session, returned to the frontend';
COMMENT ON COLUMN post_previews.bets IS 'Array of {betId, preview, betInfo, overrideText?} objects';
COMMENT ON COLUMN post_previews.status IS 'draft=active, confirmed=posted, expired=TTL reached';

-- RLS policy: users can only access their own previews or their group previews
ALTER TABLE post_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own previews"
ON post_previews
FOR ALL
USING (auth.uid() = user_id);

-- Also need groups.active_preview_id for the bot to find which preview to use
ALTER TABLE groups ADD COLUMN IF NOT EXISTS active_preview_id TEXT;
COMMENT ON COLUMN groups.active_preview_id IS 'References post_previews.preview_id when a preview is being posted';
```

## Expected JSONB Schema for `bets` Column

```json
[
  {
    "betId": 123,
    "preview": "Formatted Telegram message text...",
    "betInfo": {
      "homeTeamName": "Flamengo",
      "awayTeamName": "Palmeiras",
      "kickoffTime": "2026-02-25T20:00:00Z",
      "betMarket": "Over 2.5 Gols",
      "odds": 1.85
    },
    "overrideText": null
  }
]
```

When an admin edits a message, `overrideText` is set to the edited text. The bot uses `overrideText` if present, otherwise falls back to `preview`.

## Cleanup Strategy

Expired previews can be cleaned up by:

**Option A: SQL trigger (automatic)**
```sql
CREATE OR REPLACE FUNCTION cleanup_expired_previews()
RETURNS trigger AS $$
BEGIN
  DELETE FROM post_previews
  WHERE status = 'draft'
    AND expires_at < NOW() - INTERVAL '1 hour';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Run cleanup on every insert
CREATE TRIGGER trg_cleanup_expired_previews
AFTER INSERT ON post_previews
EXECUTE FUNCTION cleanup_expired_previews();
```

**Option B: Cron job (via existing scheduler)**
Add a periodic cleanup in the bot's hourly cleanup job (`cleanupStuckJobs` pattern).

## Verification

```sql
-- Check table exists
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'post_previews'
ORDER BY ordinal_position;

-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'post_previews';

-- Check groups.active_preview_id exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'groups'
  AND column_name = 'active_preview_id';
```

## Flow

1. Admin clicks "Preparar Postagem" -> `POST /api/bets/post-now/preview`
2. Backend generates copies, creates row in `post_previews` with `status='draft'`
3. Admin edits messages -> updates `bets[].overrideText` via API
4. Admin clicks "Enviar" -> `POST /api/bets/post-now` with `previewId`
5. Backend sets `groups.active_preview_id = previewId` and `post_now_requested_at = NOW()`
6. Bot detects flag, reads `active_preview_id`, loads previews from `post_previews`
7. Bot posts using `overrideText` where present, otherwise `preview`
8. Bot sets `post_previews.status = 'confirmed'`, clears `groups.active_preview_id`

## Related

- [[Manual Post]] -- the flow that uses previews
- [[Schema]] -- groups table (new `active_preview_id` column)
- [[032 tracking recovery index]] -- previous migration
