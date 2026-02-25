---
status: todo
tasks: 3
complexity: Media
design_dependency: false
tags: [phase, epic/e06]
---

# Fase 2 — Fundacao BotContext (Abstracoes Internas)

## Objetivo

Criar as abstracoes `BotContext` e `BotRegistry` internamente, sem mudar o deploy. Todo codigo novo das Fases 3-4 ja constroi sobre essa interface, evitando retrabalho.

**Dependencia**: Nenhuma. Pode rodar em paralelo com Fase 1.

**Rationale**: A Fase 2 (BotContext) foi antecipada para evitar retrabalho. As Fases 3 e 4 ja constroem sobre a nova interface `BotContext`, e a Fase 5 e so o deploy unificado + cleanup — nao reescreve codigo ja feito.

## Tasks

| # | Task | Prioridade | Deps |
|---|------|-----------|------|
| 2.1 | [[2.1 BotContext e BotRegistry]] | high | - |
| 2.2 | [[2.2 Config Multi-Group]] | high | [[2.1 BotContext e BotRegistry]] |
| 2.3 | [[2.3 Migrations SQL]] | high | - (paralelo com 2.1) |

## Acceptance Criteria

- [ ] **AC 2.1**: Given `initBots()` chamado no startup, when existem 2 grupos ativos com bots vinculados no `bot_pool`, then `BotRegistry` contem 2 entradas e `getBotForGroup(groupId)` retorna o `BotContext` correto para cada um.
- [ ] **AC 2.2**: Given codigo legado chama `sendToAdmin(text)` sem `botCtx`, when a funcao e executada, then usa o primeiro bot como fallback e loga warning de backward-compat.
- [ ] **AC 2.3**: Given `loadGroupConfigs()` chamado, when a tabela `groups` tem `copy_tone_config` e `max_active_bets` populados, then cada config e carregada no `BotContext.groupConfig`.

## Testing Strategy

- **Unit tests**: testar `BotRegistry`, `initBots()`, `getBotForGroup()`, backward-compat fallback
- **Unit tests**: testar `loadGroupConfigs()` com mock de Supabase
- **Integration**: verificar que deploy atual (1 bot por servico) continua funcionando com a abstracao nova
