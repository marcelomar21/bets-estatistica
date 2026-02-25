---
number: 031
status: planned
phase: 2
tags: [migration]
---

# Migration 031: Bet Result Confidence

## Rationale

The planned multi-LLM consensus system (spec Task 3.2) evaluates bet results using 3 independent LLM providers. The consensus level needs to be tracked per bet to:

1. **Distinguish evaluation quality**: `high` (3/3 agree) vs `medium` (2/3 agree) vs `low` (all diverge)
2. **Flag for manual review**: bets with `low` confidence should be reviewed by an operator
3. **Include in alerts**: "ACERTOU (alta confianca)" vs "ACERTOU (media confianca -- verificar)"
4. **Track accuracy metrics**: correlate confidence level with actual accuracy over time

## SQL

```sql
-- Migration 031: Result confidence column for multi-LLM consensus
-- Phase 2, Task 2.3

ALTER TABLE suggested_bets
ADD COLUMN IF NOT EXISTS result_confidence TEXT
CHECK (result_confidence IN ('high', 'medium', 'low'));

COMMENT ON COLUMN suggested_bets.result_confidence IS 'Confidence from multi-LLM consensus: high (3/3 agree), medium (2/3 agree), low (all diverge or insufficient providers)';
```

## Confidence Logic (implemented in `resultEvaluator.js`)

| Scenario | Confidence | Result |
|---|---|---|
| 3/3 providers agree | `high` | Agreed result |
| 2/3 providers agree (3rd diverges) | `medium` | Majority result |
| 2/2 providers agree (1 failed) | `medium` | Agreed result (degraded) |
| All 3 diverge | `low` | `unknown` + flag for review |
| 2/2 providers diverge (1 failed) | `low` | `unknown` + flag for review |
| 2+ providers failed | `low` | `unknown` + alert admin |

## Verification

```sql
-- Check column exists
SELECT column_name, data_type, check_clause
FROM information_schema.columns c
LEFT JOIN information_schema.check_constraints cc ON cc.constraint_name LIKE '%result_confidence%'
WHERE c.table_name = 'suggested_bets'
  AND c.column_name = 'result_confidence';

-- After tracking runs with multi-LLM
SELECT result_confidence, COUNT(*) as count
FROM suggested_bets
WHERE bet_result IS NOT NULL
  AND bet_result != 'pending'
GROUP BY result_confidence;
```

## Impact

- `bot/services/resultEvaluator.js`: `evaluateBetsWithLLM()` returns `ConsensusResult` with `confidence` field
- `bot/jobs/trackResults.js`: saves `result_confidence` alongside `bet_result`
- `bot/services/alertService.js`: includes confidence indicator in alerts
- Admin panel: can filter/display confidence in bet results view

## Related

- [[Schema]] -- suggested_bets table
- [[Tracking]] -- flow that populates this column
- [[030 group config columns]] -- previous migration
- [[032 tracking recovery index]] -- next migration
