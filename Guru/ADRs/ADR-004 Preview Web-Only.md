---
title: Preview e Edição de Mensagens — Web-Only
created: '2026-02-25'
status: accepted
author: Sally (UX), Winston (Arquiteto)
tags:
- adr
permalink: guru/adrs/adr-004-preview-web-only
---

# ADR-004: Preview e Edicao de Mensagens -- Web-Only

## Context

Operators want to preview and edit messages before sending them to Telegram groups. The current flow is: admin clicks "Postar" in the admin panel, the bot generates copy via LLM, and sends it directly to Telegram with no review step.

Operators requested the ability to:
- See the generated message before it goes out
- Edit text, fix team names, adjust tone
- Remove specific bets from a batch
- Only then confirm sending

Telegram has limited UI capabilities -- inline keyboards support only simple button interactions, and there is no rich text editing. Building a preview/edit flow in Telegram would result in a terrible UX.

Additionally, state management is a concern: the admin panel runs on Vercel (serverless), which can scale and restart at any time. In-memory caches would be lost on restart.

## Decision

Preview and editing happens **ONLY in the admin panel web** (mobile-first). Telegram keeps a simple Confirmar/Cancelar inline keyboard as a read-only fallback.

### Architecture

1. **New endpoint** `POST /api/bets/post-now/preview` generates copy without sending, returns `previewId` + texts
2. **State persisted in Supabase** in a `post_previews` table (not in-memory):

```sql
CREATE TABLE post_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_id TEXT NOT NULL UNIQUE,
  group_id UUID NOT NULL REFERENCES groups(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  bets JSONB NOT NULL,           -- [{ betId, preview, betInfo, overrideText? }]
  status TEXT DEFAULT 'draft',   -- 'draft' | 'confirmed' | 'expired'
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes')
);
CREATE INDEX idx_post_previews_lookup ON post_previews (preview_id) WHERE status = 'draft';
```

3. **UI is mobile-first** with stacked full-width cards, one per bet:
   - Header: team names, match time, market, odds
   - Body: message text rendered as preview (as it will appear on Telegram)
   - Actions per card: **Edit** (inline textarea), **Regenerate** (re-calls LLM), **Remove** (with confirmation)
   - Top: counter "3 of 5 bets selected" + **"Send All"** button

4. **Regenerate** shows visual diff using `diff-match-patch` (Google, MIT, ~10KB gzipped):
   - Endpoint returns `{ oldText, newText }`
   - Frontend computes word-level diff client-side
   - Renders with `<ins>` (green) and `<del>` (red)

5. **Confirmation flow**: `POST /api/bets/post-now` receives `overrides: { [betId]: editedText }` + `previewId`
   - Bot reads from `post_previews` table when `active_preview_id` is set on the group
   - After posting: marks `post_previews.status = 'confirmed'` and clears `groups.active_preview_id`

6. **Concurrency**: each session isolated by unique `preview_id` in `post_previews` table; `active_preview_id` on `groups` ensures only 1 posting is processed at a time

### Telegram Fallback

The bot's existing Telegram flow (inline keyboard with Confirmar/Cancelar) remains as a **read-only fallback** for when the admin doesn't have access to the web panel. No editing capability in Telegram.

## Consequences

### Positive

- **Rich editing UX**: full web capabilities -- text editing, diff visualization, card-based layout
- **Mobile-first**: operators edit on their phones, with thumb-zone-friendly action buttons
- **Survives Vercel restarts**: state persisted in Supabase, not in-memory
- **Concurrency safe**: `preview_id` isolates sessions; no race conditions between admins
- **TTL cleanup**: `expires_at` with 30-minute TTL prevents stale previews (cleanup via cron or SQL trigger)

### Negative

- **Operators must access web panel**: preview/edit is not available in Telegram -- operators must open the admin panel
- **Extra table/complexity**: `post_previews` table adds schema complexity and requires migration 033
- **LLM latency**: generating previews for N bets requires N LLM calls (mitigated by parallel generation and progressive loading state)
- **Diff library dependency**: `diff-match-patch` is an additional client-side dependency (~10KB gzipped)

## Alternatives Considered

| Alternative | Status | Reason |
|---|---|---|
| Telegram-based editing (inline messages + callbacks) | Rejected | Terrible UX -- no rich text editing, no diff, limited to button interactions |
| In-memory cache (Map in Node.js or Vercel) | Rejected | Breaks on Vercel scale/restart; no persistence guarantee in serverless |
| `pending_post_overrides` JSONB column in `groups` table | Rejected | Race condition if 2 admins post simultaneously; no session isolation |
| Desktop-only design | Rejected | Operators use the platform on mobile, often with urgency between postings |

## Related

- [[Specs/Multi-Bot v2]] — Full technical specification (Tasks 4.4, 4.5, 4.6)
- [[2026-02-25 Feedback Operadores]] — Discovery session (item F1)
- [[ADR-003 Tom de Voz 2 Níveis]] — Tone config used in preview generation