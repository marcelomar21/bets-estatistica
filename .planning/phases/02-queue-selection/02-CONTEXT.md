# Phase 2: Queue Selection - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Add granular bet selection to the posting queue page (/postagem). Super admin can individually select/deselect bets before posting. Default: all selected. The API already supports `betIds` parameter — this phase adds the UI layer.

</domain>

<decisions>
## Implementation Decisions

### Selection Behavior
- Apostas deselelecionadas ficam na fila (status `ready`) para próxima sessão — não são canceladas automaticamente
- "Gerar Preview" mostra apenas apostas selecionadas, respeitando a seleção do admin
- Seleção é estado local (React state), resetada ao recarregar a página — default é todas selecionadas, sem persistência no banco/localStorage

### UI da Seleção
- Checkbox na primeira coluna da tabela — padrão UX de tabelas selecionáveis (igual ao BetTable em /bets)
- Checkbox no header da tabela para Select All/Deselect All
- Contador "X de Y selecionadas" exibido ao lado do botão "Postar Agora"

### Claude's Discretion
- Reutilizar padrões do `BetTable.tsx` existente (toggleAll, toggleOne, selectedIds state)
- Detalhes de estilo do checkbox (Tailwind classes, cor, tamanho) seguindo padrão existente

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `admin-panel/src/components/features/bets/BetTable.tsx` — Componente com checkbox selection já implementado (toggleAll, toggleOne, selectedIds: Set<number>)
- `admin-panel/src/app/(auth)/postagem/page.tsx` — Página de postagem atual (sem seleção)
- `admin-panel/src/components/features/posting/PostingQueueTable.tsx` — Tabela da fila de postagem (alvo principal)
- `admin-panel/src/app/api/bets/post-now/route.ts` — API já aceita `betIds` opcional

### Established Patterns
- Selection via `Set<number>` state no componente pai, passado como prop
- `toggleAll()` e `toggleOne()` como callbacks
- API `post-now` já filtra por `betIds` quando fornecido
- Bot já filtra por `allowedBetIds` em `postBets.js`

### Integration Points
- `PostingQueueTable` recebe dados de `postagem/page.tsx` via props
- `PostNowButton` component dispara POST para `/api/bets/post-now`
- Preview flow em `/api/bets/post-now/preview` já suporta `bet_ids`

</code_context>

<specifics>
## Specific Ideas

- Replicar o padrão exato do BetTable.tsx para consistência UX
- Botão "Postar Agora" deve enviar apenas IDs selecionados via `betIds` param
- "Gerar Preview" deve filtrar por seleção para evitar confusão

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
