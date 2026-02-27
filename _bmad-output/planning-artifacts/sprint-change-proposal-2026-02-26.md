# Sprint Change Proposal — PRD v3

**Data:** 2026-02-26
**Status:** ✅ APROVADO
**Aprovado por:** Marcelomendes

## Trigger

5 novas demandas de produto identificadas na operação pós Epic 1-6 v2. Todos os epics anteriores estão DONE.

## Novos Epics Aprovados

| Epic | Nome | Complexidade |
|------|------|-------------|
| Epic 7 | Mensagens com Mídia e Preview | Médio |
| Epic 8 | Coluna Campeonato + Filtros | Baixo |
| Epic 9 | Fluxo de Cancelamento | Alto |
| Epic 10 | Analytics de Taxa de Acerto | Alto |
| Epic 11 | Revisão do Dashboard | Médio |

## Ordem de Implementação

Epic 8 → Epic 7 → Epic 10 → Epic 9 → Epic 11

## Impacto

- **PRD:** ~20 novos FRs (FR59-FR78)
- **Arquitetura:** Nenhum novo ADR necessário
- **Schema:** Migrations para scheduled_messages (mídia), notifications (dismiss)
- **Bot:** Suportar sendDocument/sendPhoto + comando /cancelar
- **UI:** Nova aba Analytics + expansão de Mensagens, Apostas, Membros, Dashboard

## Abordagem

Ajuste Direto — novos epics dentro da estrutura existente. Sem rollback, sem mudança fundamental.

## Próximos Passos

1. Edit PRD com novos FRs
2. Create Epics and Stories
3. Sprint Planning
4. Implementação story por story
