---
status: todo
tasks: 6
complexity: Baixa-Media
design_dependency: false
tags:
- phase
- epic/e06
permalink: guru/epics/e06-multi-bot-evolution/fase-1-bugs
---

# Fase 1 — Correcao de Bugs Criticos

## Objetivo

Restaurar funcionalidade basica. Tudo que esta quebrado volta a funcionar.

Prioridade: **Urgente, sem dependencia**. Pode rodar em paralelo com Fase 2.

## Tasks

| # | Task | Prioridade | Deps |
|---|------|-----------|------|
| 1.1 | [[1.1 Guru Offline]] | critical | - |
| 1.2 | [[1.2 Remover Limite 3 Bets]] | critical | - |
| 1.3 | [[1.3 Corrigir Testes maxActiveBets]] | high | [[1.2 Remover Limite 3 Bets]] |
| 1.4 | [[1.4 Sincronizar MIN_ODDS]] | high | - |
| 1.5 | [[1.5 Recovery Sweep Tracking]] | high | - |
| 1.6 | [[1.6 Precisao Evaluator LLM]] | high | - |

## Acceptance Criteria

- [ ] **AC 1.1**: Given bot Guru no Render, when o servico esta rodando, then o bot responde ao comando `/status` no grupo admin do Guru em menos de 5 segundos.
- [ ] **AC 1.2**: Given bot Guru configurado com posting_schedule enabled, when chega o horario configurado (10h/15h/22h), then o bot distribui e posta automaticamente no grupo publico do Guru.
- [ ] **AC 1.3**: Given admin seleciona 5 apostas elegiveis no painel, when clica "Postar Agora", then as 5 apostas sao postadas no grupo (nao apenas 3).
- [ ] **AC 1.4**: Given 3 apostas postadas com jogos as 15h, 16h e 17h, when o cron de tracking roda entre 17h-23h, then as 3 apostas sao avaliadas (nao apenas 2).
- [ ] **AC 1.5**: Given uma aposta de "Over 2.5 gols" postada e o jogo termina 3x1 (4 gols), when o tracking roda, then o resultado e `success` (validacao deterministica, sem LLM).
- [ ] **AC 1.6**: Given uma aposta de "BTTS - Sim" postada e o jogo termina 2x0, when o tracking roda, then o resultado e `failure` (validacao deterministica, sem LLM).
- [ ] **AC 1.7**: Given uma bet cujo match nao estava completo no ciclo de tracking, when o recovery sweep roda no proximo ciclo, then a bet e encontrada e avaliada corretamente.

## Testing Strategy

- **Unit tests (Vitest)**: atualizar mocks de `maxActiveBets`, testar recovery sweep, testar validacao deterministica de mercados simples
- **E2E (Playwright)**: testar postagem de 4+ apostas via admin panel, verificar no Telegram
- **Manual**: verificar bot Guru responde comandos e faz disparos automaticos