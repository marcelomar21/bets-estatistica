---
title: "E06 — Evolucao Plataforma Multi-Bot"
status: todo
phases: 5
tasks: 24
spec: "[[Multi-Bot v2]]"
tags: [epic]
---

# E06 — Evolucao Plataforma Multi-Bot

## Overview

A plataforma GuruBet opera dois bots (Guru da Bet e Osmar Palpites) com feedback negativo significativo dos usuarios e operadores. Os problemas sao de 3 naturezas:

1. **Bugs criticos**: Bot Guru nao faz disparos automaticos, nao responde comandos, alertas de resultado invertidos (diz que acertou quando errou e vice-versa), alertas so cobrem 2 de 3 apostas.
2. **Limitacoes arquiteturais**: Cada bot roda como servico isolado no Render (1:1), distribuicao round-robin ingenua favorece sistematicamente o primeiro grupo, limite hardcoded de 3 apostas por slot.
3. **Falta de customizacao**: Sem controle de tom de voz por grupo, sem preview/edicao de mensagens antes do envio, sem redistribuicao manual de apostas.

A evolucao abrange 7 workstreams:

1. Migrar para **servidor unico multi-bot** (1 processo -> N bots)
2. **Distribuicao inteligente** com possibilidade de redistribuicao manual
3. **Validacao de resultados com consenso de 3 LLMs** (substituir avaliacao single-LLM)
4. **Tom de voz configuravel por grupo** (secao no admin panel, vira parte do prompt)
5. **Preview + edicao de mensagens** antes do disparo (fluxo novo no admin)
6. **Limite dinamico de apostas** (remover hard-cap de 3)
7. **Correcao de bugs criticos** (Guru offline, alertas invertidos/incompletos)

## Fases

| # | Fase | Tasks | Complexidade | Design Dep |
|---|------|-------|-------------|------------|
| 1 | [[Fase 1 - Bugs]] | 6 | Baixa-Media | Nao |
| 2 | [[Fase 2 - BotContext]] | 3 (4 migrations) | Media | Nao |
| 3 | [[Fase 3 - Distribuicao]] | 2 | Media | Nao |
| 4 | [[Fase 4 - Customizacao]] | 6 | Media-Alta | Sim (4.2, 4.5) |
| 5 | [[Fase 5 - Deploy]] | 7 | Alta | Nao |

## Diagrama de Dependencias

```
Fase 1 (bugs) ──┐
                 ├──> Fase 2 (BotContext + migrations) ──> Fase 3 (distribuicao + multi-LLM)
                 │                                    └──> Fase 4 (customizacao + preview)
                 │
Design UI ───────────────────────────────────────────────> Fase 4 (Tasks 4.2 e 4.5)
                                                           │
Fases 1-4 estaveis ──────────────────────────────────────> Fase 5 (deploy unificado)
```

## Metricas de Sucesso

| Metrica | Meta | Baseline Atual |
|---|---|---|
| Tracking accuracy (alertas corretos / total) | >95% | Desconhecido (reportado como frequentemente errado) |
| Scheduler uptime (disparos no horario / programados) | >99% | Guru: ~0% (offline), Osmar: ~90% (estimado) |
| Distribuicao fairness (desvio max de bets entre grupos) | <=1 bet | Sistematicamente enviesado pro Osmar |
| Tempo de postagem manual (clique -> enviado) | <60s | N/A (fluxo novo) |
| Satisfacao dos operadores | Qualitativo positivo | Negativo (feedback atual) |

## Spec Completa

Referencia: [[Multi-Bot v2]]

Arquivo: `_bmad-output/implementation-artifacts/tech-spec-evolucao-plataforma-multi-bot-v2.md`
