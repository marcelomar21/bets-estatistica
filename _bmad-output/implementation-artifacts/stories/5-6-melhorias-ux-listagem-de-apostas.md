# Story 5.6: Melhorias de UX na Listagem de Apostas

Status: ready-for-dev

## Story

As a **Super Admin / Admin de Grupo**,
I want uma listagem de apostas mais clara, com filtro de jogos futuros, coluna de data separada, filtro por data, coluna de mercado corrigida e taxa historica de acerto,
So that eu consiga analisar as apostas rapidamente sem poluicao visual de jogos passados e com contexto de performance historica.

## Acceptance Criteria

1. **AC1: Filtro padrao de jogos futuros (esconder jogos passados)**
   - Given o admin acessa a pagina `/bets`
   - When a pagina carrega pela primeira vez
   - Then apenas apostas com `kickoff_time > now()` sao exibidas por padrao
   - And existe um toggle/checkbox "Mostrar jogos passados" que, ao ser ativado, remove o filtro e exibe todos
   - And o filtro e aplicado via query parameter `future_only=true` (padrao) na API
   - And apostas sem `league_matches` (match deletado) continuam visiveis independente do filtro
   - And os contadores (stats bar) refletem apenas os itens filtrados

2. **AC2: Coluna separada "Data Jogo" com kickoff_time**
   - Given a tabela de apostas e renderizada
   - When o admin visualiza as colunas
   - Then existe uma coluna dedicada "Data Jogo" exibindo `kickoff_time` formatada como `DD/MM/YYYY HH:mm`
   - And a coluna "Jogo" exibe apenas os nomes dos times (sem data abaixo)
   - And a coluna "Data Jogo" e sortable (ordenavel por `kickoff_time`)
   - And a coluna aparece logo apos a coluna "Jogo" (segunda posicao apos checkbox)

3. **AC3: Filtro por data (periodo ou dia especifico)**
   - Given o admin esta na area de filtros da pagina `/bets`
   - When utiliza o filtro de data
   - Then pode selecionar um periodo com data inicio e data fim (inputs `type="date"`)
   - And pode clicar em atalhos rapidos: "Hoje", "Amanha", "Proximos 7 dias"
   - And o filtro e enviado como query params `date_from` e `date_to` na API
   - And a API filtra por `league_matches.kickoff_time` dentro do periodo
   - And ao limpar o filtro de data, volta ao comportamento padrao (future_only)

4. **AC4: Correcao da coluna MERCADO vs PICK**
   - Given os dados de `bet_market` e `bet_pick` vem do pipeline de analise do LLM
   - When o admin visualiza a tabela
   - Then a coluna "Mercado" exibe a **categoria** do mercado (Gols, Escanteios, Cartoes, BTTS, Outros) derivada de `bet_market` usando a mesma logica de `categorizeMarket()` do `metricsService.js`
   - And a coluna "Pick" exibe o `bet_market` completo + `bet_pick` combinados de forma legivel (ex: "Over 2.5 Gols - Sim")
   - And se `bet_market` e `bet_pick` forem identicos, exibir apenas `bet_pick` sem duplicar
   - And um tooltip no header "Mercado" explica: "Categoria do mercado de aposta (Gols, Escanteios, etc.)"

5. **AC5: Coluna de taxa historica de acerto com tooltip**
   - Given a tabela de apostas exibe apostas com mercado e liga
   - When o admin visualiza uma aposta
   - Then existe uma coluna "Taxa Hist." exibindo a taxa de acerto historica para o par liga+categoria daquela aposta
   - And a taxa e exibida como porcentagem com indicador visual colorido:
     - Verde (>= 70%): alta confianca
     - Amarelo (50-69%): confianca media
     - Vermelho (< 50%): baixa confianca
     - Cinza com "-": sem dados suficientes (< 3 apostas historicas)
   - And a taxa e calculada com base em TODAS as apostas historicas (all-time) para aquele par liga+categoria, usando logica identica ao `getAllPairStats()` do `metricsService.js`
   - And a coluna tem um icone (i) no header que, ao clicar/hover, abre um tooltip explicando:
     "Taxa de acerto historica para esta combinacao de liga e categoria de mercado. Baseada em apostas com resultado definido (minimo 3). Categorias: Gols, Escanteios, Cartoes, BTTS, Outros."
   - And a taxa e calculada uma unica vez no backend (na API `/api/bets`) e retornada junto com cada aposta
   - And o calculo NAO adiciona N+1 queries — buscar todos os pair stats em uma unica query e fazer lookup no frontend

## Tasks / Subtasks

- [ ] Task 1: API — Adicionar filtros de data e future_only no `GET /api/bets` (AC: #1, #3)
  - [ ] 1.1 Adicionar query params: `future_only` (boolean, default "true"), `date_from` (ISO date), `date_to` (ISO date)
  - [ ] 1.2 Quando `future_only=true` e nenhum filtro de data especifico: filtrar `league_matches.kickoff_time > now()`
  - [ ] 1.3 Quando `date_from` e/ou `date_to` fornecidos: filtrar `kickoff_time` dentro do range (ignorar `future_only`)
  - [ ] 1.4 Atualizar contadores para respeitar os mesmos filtros de data
  - [ ] 1.5 Adicionar validacao: `date_from` e `date_to` devem ser datas ISO validas quando presentes

- [ ] Task 2: API — Calcular e retornar pair stats junto com apostas (AC: #5)
  - [ ] 2.1 No `GET /api/bets`, buscar pair stats via query Supabase (uma unica query para todos os pares liga+categoria com resultado definido, identica a `getAllPairStats()`)
  - [ ] 2.2 Para cada aposta, fazer lookup do par `{country} - {league_name}|{categoria}` e incluir campo `hit_rate: { rate: number | null, wins: number, total: number }` no response
  - [ ] 2.3 Incluir dados de `league_seasons` (league_name, country) no SELECT da query principal via join: `league_matches!inner(home_team_name, away_team_name, kickoff_time, status, league_seasons!inner(league_name, country))`
  - [ ] 2.4 Implementar `categorizeMarket()` em TypeScript no backend (port da funcao do `metricsService.js`)

- [ ] Task 3: Frontend — Atualizar BetFilters com filtro de data e toggle future_only (AC: #1, #3)
  - [ ] 3.1 Adicionar ao `BetFilterValues`: `future_only: string` (default "true"), `date_from: string`, `date_to: string`
  - [ ] 3.2 Adicionar toggle/checkbox "Mostrar jogos passados" que seta `future_only = "false"`
  - [ ] 3.3 Adicionar inputs `type="date"` para "De" e "Ate"
  - [ ] 3.4 Adicionar botoes de atalho: "Hoje", "Amanha", "Prox. 7 dias" que preenchem automaticamente `date_from` e `date_to`
  - [ ] 3.5 Ao usar filtro de data explicito, o `future_only` e ignorado (API ja trata isso)

- [ ] Task 4: Frontend — Separar coluna "Data Jogo" e corrigir coluna "Jogo" (AC: #2)
  - [ ] 4.1 Modificar `BetTable.tsx`: remover data do render da coluna "Jogo" (exibir apenas times)
  - [ ] 4.2 Adicionar nova coluna "Data Jogo" apos coluna "Jogo" com `kickoff_time` formatada `DD/MM/YYYY HH:mm`
  - [ ] 4.3 Tornar "Data Jogo" sortable via `SortHeader` (campo `kickoff_time`)
  - [ ] 4.4 Remover sortable da coluna "Jogo" (redundante agora que data tem coluna propria)

- [ ] Task 5: Frontend — Corrigir colunas Mercado e Pick (AC: #4)
  - [ ] 5.1 Implementar `categorizeMarket()` em TypeScript no frontend (utils) — mesma logica do backend
  - [ ] 5.2 Coluna "Mercado": exibir badge colorido com a categoria (Gols, Escanteios, Cartoes, BTTS, Outros)
  - [ ] 5.3 Coluna "Pick": combinar `bet_market` + `bet_pick` de forma legivel; se iguais, exibir apenas `bet_pick`
  - [ ] 5.4 Adicionar tooltip no header "Mercado" explicando as categorias

- [ ] Task 6: Frontend — Coluna "Taxa Hist." com tooltip e indicador visual (AC: #5)
  - [ ] 6.1 Adicionar coluna "Taxa Hist." na tabela apos "Pick"
  - [ ] 6.2 Renderizar taxa com cor: verde (>= 70), amarelo (50-69), vermelho (< 50), cinza ("-" sem dados)
  - [ ] 6.3 Formato de exibicao: `75% (15/20)` em texto pequeno
  - [ ] 6.4 Adicionar icone (i) no header da coluna com tooltip explicativo (hover/click)
  - [ ] 6.5 Usar dados de `hit_rate` retornados pela API (Task 2)

- [ ] Task 7: Tipos TypeScript — Atualizar interfaces (AC: #2, #4, #5)
  - [ ] 7.1 Estender `SuggestedBetListItem` em `database.ts`:
    - Adicionar `league_seasons` ao join de `league_matches`: `{ league_name: string; country: string }`
    - Adicionar campo `hit_rate?: { rate: number | null; wins: number; total: number } | null`
  - [ ] 7.2 Estender `BetFilterValues` com `future_only`, `date_from`, `date_to`

- [ ] Task 8: Frontend — Atualizar page.tsx para passar novos filtros (AC: #1, #3)
  - [ ] 8.1 Adicionar estados para `future_only` (default "true"), `date_from`, `date_to` no state do page
  - [ ] 8.2 Passar novos filtros como query params ao chamar `fetchBets()`
  - [ ] 8.3 Resetar pagina para 1 ao mudar filtros de data

- [ ] Task 9: Testes (AC: #1-#5)
  - [ ] 9.1 Testes API: filtro `future_only=true` filtra jogos passados corretamente
  - [ ] 9.2 Testes API: filtros `date_from`/`date_to` funcionam com ranges validos
  - [ ] 9.3 Testes API: pair stats retornados corretamente por aposta
  - [ ] 9.4 Testes API: `categorizeMarket()` backend — cobrir todas as categorias
  - [ ] 9.5 Testes frontend: `categorizeMarket()` — cobrir todas as categorias
  - [ ] 9.6 Testes frontend: BetTable renderiza nova coluna "Data Jogo" separada
  - [ ] 9.7 Testes frontend: BetTable renderiza "Mercado" como categoria e "Pick" combinado
  - [ ] 9.8 Testes frontend: BetTable renderiza "Taxa Hist." com cores corretas
  - [ ] 9.9 Testes frontend: BetFilters renderiza toggle future_only e inputs de data
  - [ ] 9.10 Testes frontend: tooltip do (i) exibe texto explicativo

- [ ] Task 10: Regressao completa (OBRIGATORIO antes de PR)
  - [ ] 10.1 Rodar `npm test` no bot — todos os testes existentes devem passar
  - [ ] 10.2 Rodar `npm test` no admin-panel — todos os testes existentes devem passar
  - [ ] 10.3 Verificar que filtros existentes (status, elegibilidade, grupo, odds, link, search) continuam funcionando
  - [ ] 10.4 Verificar que sorting existente continua funcionando

## Dev Notes

### Contexto Critico: Melhorias puramente de UX no admin-panel — NAO altera bot nem banco

**IMPORTANTE:** Esta story NAO cria migrations SQL, NAO modifica o bot, NAO altera fluxos de postagem. Todas as mudancas sao no admin-panel (API routes + componentes frontend). A logica de `categorizeMarket()` e de `getAllPairStats()` ja existe no bot (`metricsService.js`) e deve ser PORTADA para TypeScript no admin-panel — NAO reutilizar modulos CommonJS do bot.

### Componentes JA Existentes (NAO RECRIAR)

| Componente | Arquivo | O que ja faz |
|------------|---------|--------------|
| `BetTable` | `admin-panel/src/components/features/bets/BetTable.tsx` | Tabela principal — MODIFICAR colunas |
| `BetFilters` | `admin-panel/src/components/features/bets/BetFilters.tsx` | Filtros — ESTENDER com data e future_only |
| `BetStatusBadge` | `admin-panel/src/components/features/bets/BetStatusBadge.tsx` | Badge de status — NAO MODIFICAR |
| `BetStatsBar` | `admin-panel/src/components/features/bets/BetStatsBar.tsx` | Contadores — NAO MODIFICAR |
| `GET /api/bets` | `admin-panel/src/app/api/bets/route.ts` | API principal — ESTENDER com filtros e pair stats |
| `categorizeMarket()` | `bot/services/metricsService.js` | Categorizacao de mercado — PORTAR para TS |
| `getAllPairStats()` | `bot/services/metricsService.js` | Calculo de pair stats — PORTAR logica para API |

### O que CRIAR/MODIFICAR nesta story

| Tipo | Arquivo | Descricao |
|------|---------|-----------|
| **MODIFICAR** | `admin-panel/src/app/api/bets/route.ts` | Adicionar filtros future_only/date_from/date_to + pair stats no response |
| **MODIFICAR** | `admin-panel/src/components/features/bets/BetTable.tsx` | Nova coluna "Data Jogo", corrigir Mercado/Pick, nova coluna "Taxa Hist." |
| **MODIFICAR** | `admin-panel/src/components/features/bets/BetFilters.tsx` | Toggle future_only, inputs date, atalhos rapidos |
| **MODIFICAR** | `admin-panel/src/app/(auth)/bets/page.tsx` | Novos estados de filtro, passar params na fetch |
| **MODIFICAR** | `admin-panel/src/types/database.ts` | Estender SuggestedBetListItem e BetFilterValues |
| **NOVO** | `admin-panel/src/lib/bet-categories.ts` | `categorizeMarket()` em TypeScript (port do bot) |
| **NOVO** | Testes para novos filtros e colunas | Testes unitarios API + componentes |

### Arquitetura: Pair Stats sem N+1 Queries

```
GET /api/bets
  |
  |-- Query 1: SELECT apostas com joins (existente + league_seasons)
  |-- Query 2: SELECT pair stats agregados (uma unica query)
  |
  |-- No backend: para cada aposta, lookup no mapa de pair stats
  |-- Response: cada item inclui hit_rate { rate, wins, total }
```

**Query de pair stats (port do getAllPairStats):**
```typescript
const { data: pairData } = await supabase
  .from('suggested_bets')
  .select(`
    bet_market,
    bet_result,
    league_matches!inner (
      league_seasons!inner (league_name, country)
    )
  `)
  .in('bet_result', ['success', 'failure']);

// Agregar em memoria: Map<"country - league|category", { wins, total, rate }>
```

**Lookup por aposta:**
```typescript
const league = `${match.league_seasons.country} - ${match.league_seasons.league_name}`;
const category = categorizeMarket(bet.bet_market);
const key = `${league}|${category}`;
const stats = pairStatsMap[key] || null; // null = sem dados suficientes
```

### categorizeMarket() — Port para TypeScript

```typescript
// admin-panel/src/lib/bet-categories.ts
export function categorizeMarket(market: string): string {
  const m = (market || '').toLowerCase();
  if (m.includes('escanteio') || m.includes('corner')) return 'Escanteios';
  if (m.includes('cartõ') || m.includes('cartao') || m.includes('cartoe') || m.includes('card')) return 'Cartões';
  if (m.includes('ambas') || m.includes('btts')) return 'BTTS';
  if (m.includes('gol') || m.includes('goal')) return 'Gols';
  return 'Outros';
}
```

**IDENTICA a funcao do bot** (`metricsService.js:222-230`). Manter sincronia — se mudar em um, mudar no outro.

### Coluna Mercado vs Pick — Problema e Solucao

**Problema:** O LLM gera `mercado` (ex: "Over 2.5 Gols") e `pick` (ex: "Over 2.5 Gols" ou "Sim") que frequentemente sao identicos ou muito similares.

**Solucao:**
- **Coluna "Mercado"**: Exibir a CATEGORIA (Gols, Escanteios, etc.) como badge colorido — informacao util e diferenciada
- **Coluna "Pick"**: Se `bet_market !== bet_pick`, exibir `bet_market - bet_pick` (ex: "Over 2.5 Gols - Sim"). Se iguais, exibir apenas `bet_pick`

**Cores das categorias (badges):**
```
Gols       -> bg-blue-100 text-blue-800
Escanteios -> bg-purple-100 text-purple-800
Cartoes    -> bg-yellow-100 text-yellow-800
BTTS       -> bg-green-100 text-green-800
Outros     -> bg-gray-100 text-gray-700
```

### Filtro de Datas — UX Reference

```
┌─────────────────────────────────────────────────────────────────┐
│ [Buscar...]  [Status v] [Elegib. v] [Grupo v] [Odds v] [Link v] │
│                                                                 │
│ ☑ Apenas jogos futuros    De: [____/____/____]  Ate: [____/____/____] │
│                           [Hoje] [Amanha] [Prox. 7 dias] [Limpar] │
└─────────────────────────────────────────────────────────────────┘
```

### Coluna Taxa Hist. — Mockup Visual

```
┌──────────────────┐
│ Taxa Hist. (i)   │
├──────────────────┤
│  75% (15/20)     │  <- verde >= 70%
│  58% (7/12)      │  <- amarelo 50-69%
│  33% (2/6)       │  <- vermelho < 50%
│  - sem dados     │  <- cinza, < 3 apostas
└──────────────────┘
```

O (i) no header abre tooltip:
> "Taxa de acerto historica para esta combinacao de liga e categoria de mercado.
> Baseada em apostas com resultado definido (minimo 3 apostas).
> Categorias: Gols, Escanteios, Cartoes, BTTS, Outros."

### Performance: Pair Stats Query

A query de pair stats busca TODOS os resultados historicos (all-time). Para manter performance:
- Executar em paralelo com a query principal de apostas (Promise.all)
- Agregar em memoria (Map) — rapido para centenas/milhares de registros
- Resultado cacheavel futuramente se necessario (dados historicos mudam pouco)
- NAO adicionar index novo — os indices existentes `idx_suggested_bets_result` ja cobrem

### Padrao createApiHandler — Referencia para modificacoes

```typescript
// Filtro de data na query Supabase
if (futureOnly === 'true' && !dateFrom && !dateTo) {
  query = query.gt('league_matches.kickoff_time', new Date().toISOString());
}
if (dateFrom) {
  query = query.gte('league_matches.kickoff_time', dateFrom);
}
if (dateTo) {
  // Adicionar 23:59:59 para incluir o dia inteiro
  query = query.lte('league_matches.kickoff_time', `${dateTo}T23:59:59.999Z`);
}
```

**ATENCAO:** Filtros em `referencedTable` (league_matches) podem nao funcionar diretamente com `.gt()/.gte()` no Supabase PostgREST para inner joins. Alternativa: usar RPC ou filtrar no backend apos fetch. Testar e ajustar conforme necessario.

### Learnings da Story 5.5 (Anterior)

- Suite de testes bot: ~39 suites / ~837 testes (baseline pos-5.4)
- Suite de testes admin: ~498 testes em ~45 arquivos (baseline pos-5.3)
- `createApiHandler()` com `withTenant()` e OBRIGATORIO em toda API Route
- Response pattern: `{ success: true, data }` ou `{ success: false, error }`
- Filtros em `referencedTable` do Supabase requerem `!inner` join

### Riscos e Mitigacoes

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| Filtro `future_only` em referencedTable nao funciona direto no Supabase | Jogos passados continuam aparecendo | Testar com PostgREST; se necessario, filtrar no backend apos fetch |
| Pair stats query lenta com muitos registros | Pagina demora a carregar | Query roda em paralelo; considerar cache se > 2s |
| `categorizeMarket()` out of sync entre bot e admin | Categorias diferentes | Documentar como shared logic; considerar package compartilhado futuro |
| `bet_market` e `bet_pick` identicos em 100% dos casos | Coluna "Pick" redundante | Combinar de forma inteligente; se sempre iguais, exibir so `bet_pick` |
| Join com `league_seasons` aumenta payload | Response maior | Campos league_name e country sao strings curtas; impacto negligivel |

### Git Intelligence

**Branch atual:** `feature/story-5.4-postagem-automatica-de-apostas-nos-grupos-telegram`

**Branch para esta story:** `feature/story-5.6-melhorias-ux-listagem-de-apostas`
- Criar a partir de `master` apos merge das PRs pendentes

**Commit pattern:** `feat(admin): improve bets listing UX with date filters, hit rate and market categories (story 5.6)`

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 5, Story 5.5]
- [Source: admin-panel/src/components/features/bets/BetTable.tsx - Tabela atual de apostas]
- [Source: admin-panel/src/components/features/bets/BetFilters.tsx - Filtros atuais]
- [Source: admin-panel/src/app/api/bets/route.ts - API GET /api/bets]
- [Source: admin-panel/src/app/(auth)/bets/page.tsx - Pagina de apostas]
- [Source: admin-panel/src/types/database.ts - Tipos SuggestedBetListItem, BetFilterValues]
- [Source: bot/services/metricsService.js - categorizeMarket() (linha 222), getAllPairStats() (linha 238)]
- [Source: agent/analysis/schema.js - Schema LLM: mercado + pick]
- [Source: agent/persistence/saveOutputs.js - Mapeamento mercado->bet_market, pick->bet_pick]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List
