# Story 10.3: Filtros de Periodo e Exportacao

Status: ready-for-dev

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

- [ ] Task 1: Adicionar filtros a pagina `/analytics`
  - [ ] 1.1 Period picker com opcoes rapidas + custom date range
  - [ ] 1.2 Group dropdown (super_admin only) — usar lista de grupos da API
  - [ ] 1.3 Market dropdown com categorias de bet-categories
  - [ ] 1.4 Passar filtros como query params para API
  - [ ] 1.5 Sincronizar filtros com URL searchParams

- [ ] Task 2: Exportacao CSV
  - [ ] 2.1 Botao "Exportar CSV" no topo
  - [ ] 2.2 Gerar CSV client-side com dados das tabelas
  - [ ] 2.3 Incluir linha de resumo com totais e taxas

- [ ] Task 3: Validacao
  - [ ] 3.1 `cd admin-panel && npm test` — todos passando
  - [ ] 3.2 `cd admin-panel && npm run build` — build OK

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

### Completion Notes List

### File List
