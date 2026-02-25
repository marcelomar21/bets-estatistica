---
title: "Consenso Multi-LLM para Avaliação de Resultados"
created: "2026-02-25"
status: accepted
author: Marcelomendes
tags: [adr]
---

# ADR-002: Consenso Multi-LLM para Avaliação de Resultados

## Context

The current system uses a single LLM (`config.llm.heavyModel`, currently `gpt-5.2`) via `evaluateBetsWithLLM()` in `resultEvaluator.js` to determine bet outcomes (success/failure). This evaluation is non-deterministic -- the LLM can hallucinate results, leading to **inverted alerts** (telling users they won when they lost, and vice-versa).

The root cause of bug B3 (inverted alerts) is NOT in the alert code (`alertService.js:192-205`, which correctly maps `won ? 'ACERTOU' : 'ERROU'`), but in the **LLM returning incorrect results upstream**. The system prompt has a limited list of market types, and edge markets (Asian handicap, specific cards) can be misinterpreted. Poorly formatted `betPick` values (untranslated, abbreviated) further confuse the evaluation.

This is a critical issue: operators report frequent incorrect alerts, undermining trust in the platform.

## Decision

Use **3 distinct LLM providers** for result evaluation with consensus logic:

### Providers

| Chain | Provider | Model ID | Env Var |
|---|---|---|---|
| `evaluatorChainA` | OpenAI | `gpt-5.1-mini` | `EVALUATOR_MODEL_OPENAI` |
| `evaluatorChainB` | Anthropic | `claude-sonnet-4-6-20250514` | `EVALUATOR_MODEL_ANTHROPIC` |
| `evaluatorChainC` | Moonshot | `kimi-2.5` | `EVALUATOR_MODEL_MOONSHOT` |

All 3 use the same Zod schema (`{ id, result, reason }`) and run in parallel via `Promise.allSettled()`.

### Consensus Logic

| Scenario | Result | Confidence |
|---|---|---|
| 3/3 respond and agree | Majority result | `high` |
| 2/3 respond and agree (3rd diverges or agrees) | Majority result | `medium` |
| 3/3 diverge | `unknown` | `low` (flagged for manual review) |
| 1 provider failed, 2/2 agree | Majority result | `medium` (degraded) |
| 1 provider failed, 2/2 diverge | `unknown` | `low` |
| 2+ providers failed | `unknown` | `low` (flag + alert in logs) |

The `confidence` field is **NOT returned by the LLM** -- it is calculated post-aggregation by the consensus logic.

### Deterministic Validation First

Multi-LLM runs **only for non-deterministic markets**. Simple markets use deterministic validation as a first-pass (Task 1.6):

- **Over/Under X.5 goals**: compare `totalGoals > X.5` directly
- **BTTS (Both Teams To Score)**: compare `homeScore > 0 && awayScore > 0`
- **Match Result (1X2)**: compare scores directly

This means ~80% of bets are evaluated deterministically (zero hallucination risk), and multi-LLM is reserved for the ~20% of complex markets (handicap, cards, corners, specific player goals).

### Schema

```js
// Individual result (Zod schema, returned by each LLM)
const betEvalSchema = z.object({
  id: z.number(),
  result: z.enum(['success', 'failure', 'unknown']),
  reason: z.string()
})

// Aggregated result (calculated by consensus, not by LLM)
type ConsensusResult = {
  id: number,
  result: 'success' | 'failure' | 'unknown',
  confidence: 'high' | 'medium' | 'low',
  reason: string,
  votes: { provider: string, result: string }[]
}
```

Result confidence is saved in `suggested_bets.result_confidence` (migration 031). Alerts include confidence indicator: `ACERTOU (alta confianca)` vs `ACERTOU (media confianca -- verificar)`.

## Consequences

### Positive

- **Drastically reduces hallucination errors**: 3 architecturally diverse providers compensate for individual training biases
- **Graceful degradation**: `Promise.allSettled` tolerates individual provider failures; consensus degrades rather than fails
- **Transparent confidence**: `result_confidence` field makes evaluation quality visible to operators
- **Deterministic first-pass**: eliminates 100% of hallucinations for simple markets (majority of bets)

### Negative

- **Increased API cost**: ~3x for complex markets (~20% of bets). Mitigated by: GPT-5.1-mini is economical, deterministic validation handles 80%
- **Dependency on 3 providers**: requires `ANTHROPIC_API_KEY` and `MOONSHOT_API_KEY` in addition to existing `OPENAI_API_KEY`
- **Increased latency**: 3 parallel API calls; mitigated by `Promise.allSettled` (wall clock = slowest provider, not sum)
- **Kimi (Moonshot) stability risk**: newer provider, potentially less stable. Mitigated by allSettled tolerance and degraded consensus logic

## Alternatives Considered

| Alternative | Status | Reason |
|---|---|---|
| Same model 3x with different temperatures | Rejected | Same training bias amplified; not true diversity |
| 2 providers only | Rejected | Insufficient for tie-breaking; 2/2 divergence gives no majority |
| Single model with better prompt | Rejected | Prompt improvements help but don't eliminate hallucinations for edge markets |
| Human-only evaluation | Rejected | Doesn't scale; operators need real-time alerts |

## Related

- [[Specs/Multi-Bot v2]] — Full technical specification (Task 3.2)
- [[2026-02-25 Feedback Operadores]] — Discovery session (items B3, T1)
- [[ADR-001 Servidor Único Multi-Bot]] — Architecture that enables shared multi-LLM infrastructure