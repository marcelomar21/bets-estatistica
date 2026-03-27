---
status: todo
tasks: 7
complexity: Alta
design_dependency: false
tags:
- phase
- epic/e06
permalink: guru/epics/e06-multi-bot-evolution/fase-5-deploy-1
---

# Fase 5 — Deploy Multi-Bot Unificado

## Objetivo

Consolidar N bots em 1 processo no Render. Todo o codigo ja usa `BotContext` (Fases 2-4). Esta fase e deploy + cleanup.

**Dependencia**: Fases 1-4 estaveis e validadas.

## Tasks

| # | Task | Prioridade | Deps |
|---|------|-----------|------|
| 5.1 | [[5.1 Server Multi-Webhook]] | medium | [[2.1 BotContext e BotRegistry]] |
| 5.2 | [[5.2 Scheduler Factory]] | medium | [[5.1 Server Multi-Webhook]] |
| 5.3 | [[5.3 Propagar botCtx Handlers]] | medium | [[5.1 Server Multi-Webhook]] |
| 5.4 | [[5.4 Propagar groupId Jobs]] | medium | [[5.1 Server Multi-Webhook]] |
| 5.5 | [[5.5 Propagar botCtx Services]] | medium | [[5.1 Server Multi-Webhook]] |
| 5.6 | [[5.6 Cleanup Backward-Compat]] | medium | [[5.1 Server Multi-Webhook]] ate [[5.5 Propagar botCtx Services]] |
| 5.7 | [[5.7 Deploy Render]] | medium | TODAS as tasks anteriores |

## Acceptance Criteria

- [ ] **AC 5.1**: Given 1 processo Node.js rodando no Render, when mensagens chegam de ambos os grupos (Guru e Osmar), then cada mensagem e roteada para o handler correto do bot correspondente.
- [ ] **AC 5.2**: Given posting schedule de Guru as 10h e Osmar as 10:05, when ambos os horarios chegam, then cada bot posta no seu grupo correto sem interferencia.
- [ ] **AC 5.3**: Given o handler de Osmar lanca uma excecao, when o erro e capturado, then o bot do Guru continua funcionando normalmente (isolamento de falhas).
- [ ] **AC 5.4**: Given o processo unificado e deployado, when ambos os bots sao verificados, then `getWebhookInfo` retorna URLs corretas para cada token e ambos respondem a `/status`.
- [ ] **AC 5.5**: Given o cleanup da Task 5.6 executado, when `grep -rn "config\.telegram\.adminGroupId\|config\.telegram\.publicGroupId" bot/ lib/` e executado, then zero matches sao encontrados. Verificacao automatizada via `scripts/lint-no-singleton-config.sh`.

## Testing Strategy

- **Unit tests**: testar `createScheduler` factory, `processWebhookUpdate` com botCtx
- **Integration**: deploy staging no Render com 2 bots no mesmo processo, enviar mensagens em ambos os grupos e verificar isolamento
- **Rollback plan**: manter servicos antigos por 1 semana apos migracao