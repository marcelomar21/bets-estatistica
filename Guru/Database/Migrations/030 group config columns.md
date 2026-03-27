---
number: 24
status: planned
phase: 2
tags:
- migration
permalink: guru/database/migrations/030-group-config-columns
---

# Migration 030: Group Config Columns

## Rationale

Two new per-group configuration columns are needed:

1. **`max_active_bets`**: Removes the hardcoded limit of 3 in `lib/config.js`. Each group can configure its own maximum, or leave it null for no limit. This resolves bug B5 (Osmar only sends 3 bets when 4+ are selected).

2. **`copy_tone_config`**: Stores tone of voice configuration per group as JSONB. This enables operators to control vocabulary, persona, and messaging style without code changes. Resolves feature requests V1 (no "apostas" word) and V3 (configurable tone).

## SQL

```sql
-- Migration 030: Per-group configuration columns
-- Phase 2, Task 2.3

-- Dynamic limit for active bets per posting slot
-- NULL = no limit (uses a sensible high default like 50 in code)
-- Replaces hardcoded maxActiveBets: 3 in lib/config.js
ALTER TABLE groups ADD COLUMN IF NOT EXISTS max_active_bets INTEGER DEFAULT NULL;

COMMENT ON COLUMN groups.max_active_bets IS 'Max bets per posting slot. NULL = no limit. Replaces hardcoded config.betting.maxActiveBets.';

-- Tone of voice configuration (JSONB)
-- Schema: { tone, persona, forbiddenWords, ctaText, customRules, rawDescription }
ALTER TABLE groups ADD COLUMN IF NOT EXISTS copy_tone_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN groups.copy_tone_config IS 'Per-group tone of voice config for copyService. Schema: { tone, persona, forbiddenWords[], ctaText, customRules[], rawDescription }';
```

## Expected JSONB Schema for `copy_tone_config`

```json
{
  "tone": "informal",
  "persona": "Guru da Bet",
  "forbiddenWords": ["aposta", "bet", "apostar"],
  "ctaText": "Confira agora!",
  "customRules": [
    "Chamar o publico de 'galera'",
    "Usar tom confiante mas nao arrogante"
  ],
  "rawDescription": "Informal, sem usar a palavra 'aposta', chamar o publico de 'galera'."
}
```

The `rawDescription` field preserves the original free-text input from the admin (Level 1 UI). The structured fields are extracted from it via LLM (Task 4.1).

## Verification

```sql
SELECT id, name, max_active_bets, copy_tone_config
FROM groups
WHERE status = 'active';
```

## Impact

- `lib/config.js`: `maxActiveBets` reads from `groups.max_active_bets` (with fallback to env var or 50)
- `bot/services/betService.js`: `getFilaStatus()` uses per-group limit instead of global
- `bot/services/copyService.js`: `generateBetCopy()` receives `toneConfig` and injects into prompt
- Admin panel: new "Tom de Voz" section (Task 4.2)

## Related

- [[Schema]] -- groups table definition
- [[029 bot_pool source of truth]] -- previous migration
- [[031 bet result confidence]] -- next migration