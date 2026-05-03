---
title: 2026-03-29 — Fix decision parsing + dashboard logs
type: note
permalink: guru/changelog/2026-03-29-fix-decision-parsing-dashboard-logs
tags:
- agent-ops
- pipeline
- dashboard
- bug-fix
---

# 2026-03-29 — Fix decision parsing + dashboard logs

## PR
- marcelomar21/agent-ops#1 (squash-merged to master)

## O que mudou

### Bug fix: `run_step()` sem decision parsing
- `run_step()` não parseava decisões do stream do agente, diferente de `run_agent()`
- Resultado: todo flow quick-spec/create-story falhava com "no decision in result" (RC=21)
- Cards acabavam quarantined após 5 tentativas sem necessidade
- **Fix:** `run_step()` agora aceita `PARSED_FILE` como 6º parâmetro e parseia decisões do stream identicamente ao `run_agent()`

### Dashboard melhorado (`serve.sh` + `index.html`)
- `parse_runs()` agora detecta decisões de refine/execute via linhas `[finalize]`
- Detecta quarantine via linhas `[guardrail]`
- Reconhece boundaries de `run_step()` (triage/refine done) para agrupar runs corretamente
- Linhas `[finalize]` coloridas em roxo, `[guardrail]` em vermelho itálico
- Badges visuais: → Ready to Dev, → Needs Info, → Done, WARN:, quarantine
- Decision chips na sidebar para todos os tipos: refined, needs_info, prd_done, ready_for_review, failed, quarantined

## Arquivos modificados
- `scripts/pipeline.sh` — `run_step()` + `run_refine_pipeline()`
- `dashboard/serve.sh` — `parse_runs()` com run_step boundaries e finalize/guardrail tracking
- `dashboard/index.html` — CSS + JS para classificação, badges e decision chips
