# Story 10.3: Filtros de Periodo e Exportacao

Status: done

## Story

As a **operador (Super Admin ou Group Admin)**,
I want filtrar analytics por periodo personalizado e exportar os dados,
So that eu possa analisar periodos especificos e compartilhar relatorios.

## Acceptance Criteria

1. **Given** operador esta na pagina `/analytics`
   **When** interage com filtros no topo
   **Then** exibe date picker com opcoes rapidas: "Ultimos 7 dias", "Ultimos 30 dias", "Ultimo mes", "Personalizado"

2. **Given** "Personalizado" selecionado
   **When** preenche data inicio e fim
   **Then** filtra dados pelo periodo

3. **Given** filtro de periodo aplicado
   **When** dados carregam
   **Then** todos cards e tabelas atualizam com dados do periodo

4. **Given** pagina com dados
   **When** clica "Exportar CSV"
   **Then** gera CSV com resumo de taxas por breakdown

5. **Given** Super Admin
   **When** ve filtros
   **Then** tem dropdown de grupo para filtrar por grupo especifico

6. **Given** qualquer operador
   **When** ve filtros
   **Then** tem dropdown de mercado para filtrar por categoria

7. **Given** filtros sao combinaveis (periodo + grupo + mercado)
   **When** aplicados
   **Then** URL atualiza com query params (permite compartilhar link filtrado)

## Tasks / Subtasks

- [x] Task 1: Adicionar filtros a pagina `/analytics`
  - [x] 1.1 Period picker com opcoes rapidas + custom date range
  - [x] 1.2 Group dropdown (super_admin only) — usar lista de grupos da API
  - [x] 1.3 Market dropdown com categorias de bet-categories
  - [x] 1.4 Passar filtros como query params para API
  - [x] 1.5 Sincronizar filtros com URL searchParams

- [x] Task 2: Exportacao CSV
  - [x] 2.1 Botao "Exportar CSV" no topo
  - [x] 2.2 Gerar CSV client-side com dados das tabelas
  - [x] 2.3 Incluir linha de resumo com totais e taxas

- [x] Task 3: Validacao
  - [x] 3.1 `cd admin-panel && npm test` — 663 passed (58 files)
  - [x] 3.2 `cd admin-panel && npm run build` — build OK

- [x] Task 4: Code Review (adversarial)
  - [x] 4.1 Added csvEscape() for proper CSV field escaping (MEDIUM)
  - [x] 4.2 Wrapped with Suspense for useSearchParams (MEDIUM)

## Dev Notes

### API Params (ja suportados por Story 10-1)

- `group_id` — UUID do grupo
- `market` — categoria (Gols, Escanteios, Cartoes, BTTS, Outros)
- `date_from` — YYYY-MM-DD
- `date_to` — YYYY-MM-DD

### Groups List

Fetch from `/api/groups` (existing endpoint) for group dropdown options.

### References

- [Source: admin-panel/src/app/(auth)/analytics/page.tsx] Current analytics page (Story 10-2)
- [Source: admin-panel/src/app/api/analytics/accuracy/route.ts] API with filter support
- [Source: admin-panel/src/lib/bet-categories.ts] CATEGORY_STYLES for market categories

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Added period, market, and group filters to /analytics page
- CSV export with proper escaping and summary rows
- URL query param sync for shareable filtered links
- Code review: CSV escaping fix, Suspense boundary for useSearchParams

### File List
- admin-panel/src/app/(auth)/analytics/page.tsx (MODIFIED)
