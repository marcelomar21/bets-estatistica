# Story 12.7: Aprimorar Comando /overview

Status: done

## Story

As a operador,
I want um overview mais completo e útil,
so that tenha visão geral do sistema em um único comando.

## Requisitos

**Informações a adicionar:**
- Contagem por status (geradas, aguardando, prontas, postadas)
- IDs das apostas sem odds e sem link
- Próximo jogo (data/hora mais próxima)
- Última postagem (quando foi)
- Taxa de acerto 30 dias

## Acceptance Criteria

1. **AC1:** Overview mostra contagem por status
2. **AC2:** Overview mostra IDs sem odds
3. **AC3:** Overview mostra IDs sem link
4. **AC4:** Overview mostra próximo jogo
5. **AC5:** Overview mostra última postagem
6. **AC6:** Overview mostra taxa de acerto 30 dias

## Tasks / Subtasks

- [x] Task 1: Expandir getOverviewStats no betService
  - [x] 1.1 Adicionar contagem por status
  - [x] 1.2 Adicionar IDs sem odds
  - [x] 1.3 Adicionar IDs sem link
  - [x] 1.4 Adicionar próximo jogo
  - [x] 1.5 Adicionar última postagem
  - [x] 1.6 Adicionar taxa de acerto (success rate)

- [x] Task 2: Atualizar handleOverviewCommand
  - [x] 2.1 Formatar novo layout
  - [x] 2.2 Adicionar taxa de acerto

## Dev Notes

### Novo Formato

```
📊 *OVERVIEW - APOSTAS*

*Status Atual:*
🆕 Geradas: 8
⏳ Aguardando link: 3
✅ Prontas: 4
📤 Postadas: 3 (#45, #47, #52)

*Próximo Jogo:*
⚽ Liverpool vs Arsenal
📅 15/01 às 17:00 (em 6h)

*Última Postagem:*
🕐 Hoje às 15:00

*Pendências:*
⚠️ Sem odds: #48, #51
❌ Sem link: #45, #48, #51

*Métricas:*
📈 Taxa 30d: 72% (18/25)

💡 /filtrar | /simular | /postar
```

### References

- [Source: prd-addendum-v3.md#FEAT-010]
- [Source: bot/services/betService.js#getOverviewStats]
- [Source: bot/handlers/adminGroup.js#handleOverviewCommand]

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-20250514

### Completion Notes List
- Expandido getOverviewStats para retornar contagem por status (generated, pending_link, ready, posted)
- Adicionados IDs de apostas sem odds e sem link
- Adicionada lógica para próximo jogo (primeiro da lista ordenada por kickoff)
- Adicionada última postagem (reduce para encontrar timestamp mais recente)
- Adicionada taxa de acerto 30 dias (success rate)
- Atualizado handleOverviewCommand com novo layout rico e informativo
- IDs sem odds/links limitados a 10 com "..." para evitar overflow

### File List

- `bot/services/betService.js` (modificado)
- `bot/handlers/adminGroup.js` (modificado)
