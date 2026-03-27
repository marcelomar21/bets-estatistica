---
status: todo
tasks: 2
complexity: Media
design_dependency: false
tags:
- phase
- epic/e06
permalink: guru/epics/e06-multi-bot-evolution/fase-3-distribuicao
---

# Fase 3 — Qualidade de Distribuicao e Resultados

## Objetivo

Distribuicao justa entre grupos + validacao robusta de resultados.

**Dependencia**: Fase 2 (BotContext) para usar `botCtx` nos alertas.

## Tasks

| # | Task | Prioridade | Deps |
|---|------|-----------|------|
| 3.1 | [[3.1 Distribuicao Fair]] | high | [[2.1 BotContext e BotRegistry]] |
| 3.2 | [[3.2 Consenso Multi-LLM]] | high | [[1.6 Precisao Evaluator LLM]], [[2.3 Migrations SQL]] |

## Acceptance Criteria

- [ ] **AC 3.1**: Given 2 grupos ativos e 7 bets para distribuir, when `runDistributeBets` executa, then o grupo com menos bets recebe a proxima (diferenca maxima de 1 bet entre grupos).
- [ ] **AC 3.2**: Given 10 runs consecutivos de distribuicao, when os resultados sao analisados, then nenhum grupo tem sistematicamente mais bets que outro (variancia < 5%).
- [ ] **AC 3.3**: Given uma aposta de mercado complexo (ex: "Handicap Asiatico -0.5") avaliada por 3 LLMs (GPT-5.1-mini, Claude Sonnet 4.6, Kimi 2.5) que concordam, when o tracking salva, then `result_confidence = 'high'`.
- [ ] **AC 3.4**: Given uma aposta onde 2 LLMs dizem `success` e 1 diz `failure`, when o tracking salva, then `bet_result = 'success'` e `result_confidence = 'medium'`.
- [ ] **AC 3.5**: Given uma aposta onde os 3 LLMs divergem, when o tracking salva, then `bet_result = 'unknown'`, `result_confidence = 'low'`, e bet e flaggada para revisao manual.
- [ ] **AC 3.6**: Given uma aposta de mercado simples (Over/Under, BTTS, 1X2), when o tracking roda, then a validacao deterministica e usada (multi-LLM NAO e chamado).

## Testing Strategy

- **Unit tests**: testar fairness do novo `distributeRoundRobin` com offset, testar logica de consenso multi-LLM (mock das 3 respostas com cada combinacao: 3/3, 2/3, 0/3 concordancia)
- **Unit tests**: testar que mercados simples usam validacao deterministica e NAO chamam LLM
- **E2E**: verificar distribuicao balanceada ao longo de 3 ciclos