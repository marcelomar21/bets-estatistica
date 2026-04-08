# GuruBet

## What This Is

Plataforma SaaS multi-tenant para gestão de grupos de apostas esportivas no Telegram e WhatsApp. Influencers operam seus próprios grupos, o sistema usa IA (GPT via LangChain) para analisar partidas e gerar recomendações, distribui apostas automaticamente nos canais, e gerencia membros com cobrança via Mercado Pago. Admin Panel completo em Next.js para dashboard, configuração e operação.

## Core Value

Influencers recebem apostas analisadas por IA e as entregam automaticamente aos seus grupos com qualidade consistente — sem esforço manual, sem erro humano, sem downtime.

## Requirements

### Validated

- ✓ Pipeline ETL para coleta de dados esportivos (FootyStats, The Odds API) — existing
- ✓ Análise IA com GPT (LangChain) para gerar recomendações de apostas — existing
- ✓ Distribuição automática de apostas para grupos Telegram — existing
- ✓ Gestão de membros com cobrança via Mercado Pago (webhook) — existing
- ✓ Admin Panel completo (dashboard, bots, grupos, membros, métricas) — existing
- ✓ Multi-tenancy via RLS no Supabase — existing
- ✓ MTProto sync para sincronização de membros Telegram — existing
- ✓ Integração WhatsApp via Baileys (pool de números, auth state, failover automático) — existing
- ✓ Postagem multi-canal simultânea (Telegram + WhatsApp) — existing
- ✓ Ciclo de vida de membros WhatsApp (trial, kick, reativação) — existing
- ✓ Integração de pagamentos multi-canal — existing
- ✓ Admin Panel estendido para gestão WhatsApp (pool de números, status, QR) — existing

### Active

- [x] Fix: Postagem automática deve respeitar tom de voz configurado por grupo/influencer — Validated in Phase 1: Posting Fixes
- [x] Fix: Confirmação de envio não deve ser enviada para grupos de clientes (apenas admin) — Validated in Phase 1: Posting Fixes
- [x] Fix: Post de vitória — remover label CTA indevida e corrigir leitura de odds — Validated in Phase 1: Posting Fixes
- [x] Feature: Seleção individual na fila de postagem (escolher quais apostas postar, default = todas) — Validated in Phase 2: Queue Selection
- [ ] Feature: Checkout de ligas extras (upsell) — liga adicional por R$200/mês, definir padrão vs extra, valor modificável por liga, desconto por cliente

### Out of Scope

- WhatsApp Communities — complexidade não justifica no momento
- Bot commands/inline keyboards no WhatsApp — plataforma não suporta em grupos
- Migração para API oficial WhatsApp — Baileys atende, API oficial não suporta grupos grandes
- App mobile nativo — web-first, admin panel responsivo é suficiente

## Context

- **Produção ativa:** Sistema operacional com clientes pagantes em múltiplos grupos
- **Stack backend:** Node.js 20+, CommonJS, Express, Baileys (WhatsApp)
- **Stack frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Banco:** PostgreSQL via Supabase com RLS multi-tenant
- **Deploy:** Render (bots/webhook) + Vercel (admin panel)
- **Artefatos BMAD:** PRD, arquitetura e epics da integração WhatsApp em `_bmad-output/planning-artifacts/`
- **Documentação técnica:** `docs/` com overview, arquitetura, data models, development guide
- **Padrões consolidados:** 55+ regras de código documentadas em `.claude/rules/`

## Constraints

- **Multi-tenancy**: Toda query deve respeitar RLS e filtrar por group_id — isolamento de tenant é inviolável
- **Telegram API**: Limite de 4096 chars por mensagem — dividir em múltiplas, nunca truncar
- **WhatsApp (Baileys)**: Rate limit ~10-20 msgs/min por número, sessões WebSocket persistentes 24/7
- **LLM Models**: Sempre via `config.llm.*`, nunca hardcodar — heavy/light model configuráveis
- **Conventional Commits**: Obrigatório para todos os commits
- **Testes obrigatórios**: Vitest (admin-panel) + Jest (bot) + Playwright E2E antes de qualquer PR

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Monorepo (bot + admin-panel + whatsapp + lib) | Compartilhar lib/, config, supabase client | ✓ Good |
| Baileys (API não-oficial) para WhatsApp | API oficial não suporta grupos grandes, Baileys é mantido ativamente | ✓ Good |
| Pool de números com failover automático | Resiliência contra bans do WhatsApp | ✓ Good |
| Channel adapter pattern | Services de negócio agnósticos de canal | ✓ Good |
| Supabase com RLS | Multi-tenancy sem complexidade de múltiplos bancos | ✓ Good |
| Mercado Pago para pagamentos | Dominante no Brasil, webhook confiável | ✓ Good |
| LangChain + OpenAI para análise | Flexibilidade para trocar modelos, tooling maduro | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-08 after Phase 2 completion*
