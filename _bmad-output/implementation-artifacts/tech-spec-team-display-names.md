---
title: 'Team Display Names — Tabela única de override + resolver em runtime'
slug: 'team-display-names'
created: '2026-03-21'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Supabase (PostgreSQL)', 'Node.js (CommonJS)', 'Next.js 16 (TypeScript)', 'React 19', 'Tailwind CSS 4', 'Vitest']
files_to_modify:
  - 'sql/migrations/060_team_display_names.sql'
  - 'lib/teamDisplayNames.js'
  - 'agent/persistence/htmlRenderer.js'
  - 'agent/persistence/generateMarkdown.js'
  - 'agent/persistence/reportUtils.js'
  - 'bot/services/betService.js'
  - 'admin-panel/src/app/api/team-display-names/route.ts'
  - 'admin-panel/src/hooks/useTeamDisplayNames.ts'
  - 'admin-panel/src/app/(auth)/team-names/page.tsx'
  - 'admin-panel/src/components/layout/Sidebar.tsx'
  - 'admin-panel/src/components/features/bets/BetTable.tsx'
  - 'admin-panel/src/components/features/bets/BetEditDrawer.tsx'
  - 'admin-panel/src/components/features/bets/DistributeModal.tsx'
  - 'admin-panel/src/components/features/bets/LinkEditModal.tsx'
  - 'admin-panel/src/components/features/bets/OddsEditModal.tsx'
  - 'admin-panel/src/components/features/posting/PostingQueueTable.tsx'
  - 'admin-panel/src/components/features/posting/PostingHistoryTable.tsx'
  - 'admin-panel/src/components/features/posting/ResultEditModal.tsx'
code_patterns:
  - 'Service response: { success: true, data } / { success: false, error: { code, message } }'
  - 'API routes: createApiHandler(handler, options) wrapper obrigatório'
  - 'DB access: require("../lib/supabase") singleton — nunca instanciar direto'
  - 'Logging: require("../lib/logger") — nunca console.log'
  - 'Team names denormalizados em league_matches (home_team_name, away_team_name)'
  - 'Bot usa camelCase (homeTeamName, awayTeamName) mapeado em betService.js'
  - 'Admin panel usa snake_case direto do Supabase (home_team_name, away_team_name)'
test_patterns:
  - 'Admin panel: Vitest 3.2 + @testing-library/react'
  - 'Backend: Jest (bot/services/__tests__, __tests__/)'
  - 'Test files: *.test.ts(x) ou __tests__/*.test.js'
---

# Tech-Spec: Team Display Names

**Created:** 2026-03-21

## Overview

### Problem Statement

Times aparecem com nomes vindos da API (ex: "Atlético PR") que nem sempre correspondem ao nome correto ou preferido (ex: "Athletico PR"). Não existe forma de corrigir isso sem alterar dados brutos. O problema afeta relatórios HTML, relatórios Markdown, mensagens do bot no Telegram e o admin panel.

### Solution

Criar uma tabela dedicada `team_display_names` com mapeamento `(api_name → display_name)`, deduplicada. Uma função resolver busca o override em runtime e faz fallback pro nome original. Aplicar em todos os pontos de exibição sem alterar dados brutos.

### Scope

**In Scope:**
- Migration SQL: tabela `team_display_names`
- Função resolver reutilizável (backend JS + frontend TS)
- Atualizar todos os pontos de exibição (HTML reports, Markdown reports, bot messages, admin panel)
- UI no admin panel (seção SuperAdmin) para gerenciar display names
- Popular tabela com times existentes (distinct dos `league_matches`)

**Out of Scope:**
- Alterar dados brutos na `league_matches` ou `league_team_stats`
- Merge/deduplicação de times (juntar variações como mesmo time)
- Tradução de nomes (inglês → português)

## Context for Development

### Codebase Patterns

- **Service response pattern**: `{ success: true, data }` / `{ success: false, error: { code, message } }`
- **API routes**: SEMPRE usar `createApiHandler()` como wrapper (importa `withTenant`)
- **DB access (backend)**: `require('../lib/supabase')` — singleton, nunca instanciar direto
- **DB access (admin panel)**: `createClient()` de `@/lib/supabase-server`
- **Logging**: `require('../lib/logger')` — nunca `console.log`
- **Team names**: denormalizados em `league_matches` como `home_team_name`/`away_team_name` (snake_case). Bot mapeia para camelCase em `betService.js`.
- **Sidebar navigation**: módulos em array `modules[]` em `Sidebar.tsx`, com `roles` para controle de acesso
- **Team data is global**: `league_matches` e `league_team_stats` NÃO têm `group_id` — são dados compartilhados entre todos os tenants

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `sql/league_schema.sql` | Schema de `league_team_stats` e `league_matches` |
| `bot/services/betService.js:62-79` | Mapeia `home_team_name`→`homeTeamName` no flatten de bets |
| `bot/services/copyService.js:84` | Usa `bet.homeTeamName x bet.awayTeamName` no prompt LLM |
| `bot/jobs/postBets.js:185` | Formata `⚽ *${bet.homeTeamName} x ${bet.awayTeamName}*` |
| `agent/persistence/htmlRenderer.js:155` | Título do relatório HTML |
| `agent/persistence/generateMarkdown.js:54-55` | Header do relatório Markdown |
| `agent/persistence/reportUtils.js:24-25` | Nome base do arquivo de relatório |
| `admin-panel/src/app/api/bets/route.ts:30-34` | SELECT com `league_matches!inner(...)` |
| `admin-panel/src/components/features/bets/BetTable.tsx:196` | Exibe nomes na tabela |
| `admin-panel/src/components/features/posting/PostingQueueTable.tsx:214-216` | Exibe nomes na fila |
| `admin-panel/src/components/features/posting/PostingHistoryTable.tsx:173` | Exibe nomes no histórico |
| `admin-panel/src/components/layout/Sidebar.tsx` | Navegação |
| `admin-panel/src/middleware/api-handler.ts` | `createApiHandler` wrapper |
| `lib/supabase.js` | Singleton Supabase client (backend) |

### Technical Decisions

- **Override em runtime** — não altera dados existentes, resolver aplica na hora de exibir
- **Tabela dedicada `team_display_names`** — ponto único deduplicado por `api_name` (UNIQUE)
- **UI na seção SuperAdmin** — dado global, não por grupo
- **Cache em memória (backend)** — mapa `api_name→display_name` com TTL de 5min para não fazer query por bet
- **Hook React (admin panel)** — `useTeamDisplayNames()` carrega o mapa via API uma vez e expõe função `resolve(name)`
- **Ponto de aplicação no bot** — resolver aplicado em `betService.js` no flatten; `copyService.js` e `postBets.js` recebem nomes já resolvidos sem mudança
- **Ponto de aplicação nos reports** — resolver aplicado em `htmlRenderer.js`, `generateMarkdown.js` e `reportUtils.js`

## Implementation Plan

### Tasks

- [x] **Task 1: Migration SQL — criar tabela `team_display_names`**
  - File: `sql/migrations/060_team_display_names.sql`
  - Action: Criar tabela com colunas:
    - `id BIGSERIAL PRIMARY KEY`
    - `api_name TEXT NOT NULL UNIQUE` — nome exato como vem da API (chave de lookup)
    - `display_name TEXT NOT NULL` — nome que será exibido
    - `created_at TIMESTAMPTZ DEFAULT NOW()`
    - `updated_at TIMESTAMPTZ DEFAULT NOW()`
  - Notes: Sem `group_id` (dado global). Index único em `api_name` para lookup rápido. Sem RLS (acessado pelo service key no backend e via API autenticada no admin). Adicionar trigger `updated_at` padrão.

- [x] **Task 2: Seed — popular com times existentes**
  - File: `sql/migrations/060_team_display_names.sql` (mesmo arquivo, seção final)
  - Action: INSERT com SELECT DISTINCT de todos os nomes de times que já existem:
    ```sql
    INSERT INTO team_display_names (api_name, display_name)
    SELECT DISTINCT name, name FROM (
      SELECT home_team_name AS name FROM league_matches WHERE home_team_name IS NOT NULL
      UNION
      SELECT away_team_name AS name FROM league_matches WHERE away_team_name IS NOT NULL
    ) t
    ON CONFLICT (api_name) DO NOTHING;
    ```
  - Notes: O `display_name` começa igual ao `api_name`. O admin edita só os que precisam de correção.

- [x] **Task 3: Backend resolver — `lib/teamDisplayNames.js`**
  - File: `lib/teamDisplayNames.js` (novo)
  - Action: Criar módulo com:
    - `loadDisplayNamesMap()` — faz SELECT em `team_display_names` onde `api_name != display_name`, retorna `Map<string, string>`
    - Cache em memória com TTL de 5 minutos (variável `_cache` e `_cacheExpiry`)
    - `resolveTeamName(apiName)` — async, carrega cache se expirado, retorna `display_name` ou fallback pro `apiName` original
    - `resolveTeamNames(homeApiName, awayApiName)` — convenience que resolve ambos de uma vez
    - `invalidateCache()` — para uso em testes
  - Notes: Usar `require('./supabase')` para acesso ao DB. Usar `require('./logger')` para logging. Seguir service response pattern. Só carrega registros onde houve override (`api_name != display_name`) para manter mapa pequeno.

- [x] **Task 4: Aplicar resolver em `betService.js`**
  - File: `bot/services/betService.js`
  - Action: Nas funções `getEligibleBets()` e `getBetsReadyForPosting()`, após o flatten que mapeia `home_team_name → homeTeamName`, aplicar `resolveTeamNames()`:
    ```javascript
    const { resolveTeamNames } = require('../../lib/teamDisplayNames');
    // ... após flatten dos bets:
    for (const bet of bets) {
      const resolved = await resolveTeamNames(bet.homeTeamName, bet.awayTeamName);
      bet.homeTeamName = resolved.home;
      bet.awayTeamName = resolved.away;
    }
    ```
  - Notes: Isso faz com que `copyService.js` e `postBets.js` recebam os nomes já resolvidos **sem nenhuma mudança nesses arquivos**. O cache de 5min garante que o mapa é carregado uma vez por ciclo de posting.

- [x] **Task 5: Aplicar resolver nos relatórios**
  - File: `agent/persistence/htmlRenderer.js`
  - Action: Na linha 155, antes de montar `title`, resolver os nomes:
    ```javascript
    const { resolveTeamNames } = require('../../lib/teamDisplayNames');
    const resolved = await resolveTeamNames(match.home_team_name, match.away_team_name);
    const title = `${resolved.home || 'Time da casa'} x ${resolved.away || 'Time visitante'}`;
    ```
  - Notes: A função `renderReport()` precisará virar `async` (ou a chamada ser awaited). Verificar se o caller já é async.
  - File: `agent/persistence/generateMarkdown.js`
  - Action: Nas linhas 54-55, resolver os nomes antes de usar:
    ```javascript
    const { resolveTeamNames } = require('../../lib/teamDisplayNames');
    const resolved = await resolveTeamNames(match.home_team_name, match.away_team_name);
    const home = resolved.home || 'Time da casa';
    const away = resolved.away || 'Time visitante';
    ```
  - Notes: `generateMarkdown()` precisará virar `async`. Verificar callers.
  - File: `agent/persistence/reportUtils.js`
  - Action: Na função `deriveReportBaseName()`, resolver os nomes:
    ```javascript
    const { resolveTeamNames } = require('../../lib/teamDisplayNames');
    // deriveReportBaseName precisa virar async
    const resolved = await resolveTeamNames(match.home_team_name, match.away_team_name);
    return buildReportBaseName({
      generatedAt: payload.generated_at,
      competitionName: match.competition_name || match.league_name || 'competicao',
      homeName: resolved.home,
      awayName: resolved.away,
    });
    ```

- [x] **Task 6: API Route — CRUD de display names**
  - File: `admin-panel/src/app/api/team-display-names/route.ts` (novo)
  - Action: Criar API route com `createApiHandler`:
    - **GET**: Lista todos os registros de `team_display_names`, ordenados por `api_name`. Suporta query param `?search=` para filtrar por `api_name` ou `display_name` (ilike). Suporta `?modified_only=true` para listar só overrides (onde `api_name != display_name`).
    - **PATCH**: Recebe `{ updates: [{ api_name: string, display_name: string }] }`. Faz upsert em batch. Valida que `display_name` não é vazio.
  - Notes: Usar `createApiHandler(handler, { allowedRoles: ['super_admin'] })` — só super admin pode editar nomes globais. Sem `groupFilter` (dado global). Retornar `{ success: true, data }` pattern.

- [x] **Task 7: Hook React — `useTeamDisplayNames`**
  - File: `admin-panel/src/hooks/useTeamDisplayNames.ts` (novo)
  - Action: Criar hook que:
    - Faz fetch de `GET /api/team-display-names?modified_only=true` no mount
    - Armazena mapa `Record<string, string>` em state
    - Expõe `resolve(apiName: string): string` — retorna display name ou fallback
    - Expõe `isLoaded: boolean` para saber se o mapa carregou
  - Notes: O hook faz UMA chamada API. Componentes usam `resolve()` que é síncrono (mapa já em memória). Se o fetch falhar, `resolve()` retorna o nome original (fallback gracioso).

- [x] **Task 8: Aplicar hook nos componentes do admin panel**
  - Files: 7 componentes que exibem team names
  - Action: Em cada componente, importar e usar o hook:
    ```tsx
    const { resolve } = useTeamDisplayNames();
    // onde antes era:
    {match.home_team_name} vs {match.away_team_name}
    // vira:
    {resolve(match.home_team_name)} vs {resolve(match.away_team_name)}
    ```
  - Componentes a alterar:
    1. `admin-panel/src/components/features/bets/BetTable.tsx:196`
    2. `admin-panel/src/components/features/bets/BetEditDrawer.tsx:167`
    3. `admin-panel/src/components/features/bets/DistributeModal.tsx:62`
    4. `admin-panel/src/components/features/bets/LinkEditModal.tsx:81`
    5. `admin-panel/src/components/features/bets/OddsEditModal.tsx:60`
    6. `admin-panel/src/components/features/posting/PostingQueueTable.tsx:214-216`
    7. `admin-panel/src/components/features/posting/PostingHistoryTable.tsx:173`
    8. `admin-panel/src/components/features/posting/ResultEditModal.tsx:88`
  - Notes: Mudança mínima por componente — adicionar hook + envolver nomes em `resolve()`.

- [x] **Task 9: UI — Página de gerenciamento de team names**
  - File: `admin-panel/src/app/(auth)/team-names/page.tsx` (novo)
  - Action: Criar página com:
    - Tabela com colunas: Nome API (readonly), Nome de Exibição (editável inline), Status (ícone se override ativo)
    - Campo de busca no topo (filtra local por api_name ou display_name)
    - Toggle "Mostrar apenas editados" (filtra por `api_name != display_name`)
    - Edição inline: clicar no display_name abre input, blur ou Enter salva via PATCH
    - Botão "Resetar" por linha — volta display_name para o valor de api_name
    - Contadores no topo: "X times | Y com nome customizado"
  - Notes: Seguir patterns existentes de UI (Tailwind, tabelas como em BetTable). Sem paginação necessária (tipicamente < 500 times). Usar `'use client'` no topo.

- [x] **Task 10: Sidebar — adicionar link "Nomes de Times"**
  - File: `admin-panel/src/components/layout/Sidebar.tsx`
  - Action: Adicionar item no módulo SuperAdmin:
    ```typescript
    { name: 'Nomes de Times', href: '/team-names', icon: '🏟️', roles: ['super_admin'] },
    ```
  - Notes: Posicionar após "Admin Users" ou onde fizer mais sentido na seção SuperAdmin.

### Acceptance Criteria

- [ ] **AC 1**: Given a tabela `team_display_names` existe no banco, when ela é populada com seed, then todos os nomes distintos de `league_matches` (home + away) estão presentes com `display_name = api_name`.

- [ ] **AC 2**: Given um registro em `team_display_names` com `api_name = 'Atlético PR'` e `display_name = 'Athletico PR'`, when o bot gera uma mensagem para uma bet com esse time, then a mensagem do Telegram mostra "Athletico PR" (não "Atlético PR").

- [ ] **AC 3**: Given um registro com override, when um relatório HTML é gerado para um jogo desse time, then o título do relatório mostra o display_name.

- [ ] **AC 4**: Given um registro com override, when um relatório Markdown é gerado, then o header mostra o display_name.

- [ ] **AC 5**: Given um registro com override, when o admin panel exibe uma bet com esse time (em qualquer dos 8 componentes), then o display_name é mostrado.

- [ ] **AC 6**: Given um time SEM override (display_name == api_name), when ele é exibido em qualquer ponto, then o nome original da API é mostrado (fallback funciona).

- [ ] **AC 7**: Given um super_admin logado, when ele acessa `/team-names`, then vê a lista completa de times com seus nomes de exibição e pode editar inline.

- [ ] **AC 8**: Given um super_admin edita o display_name de um time, when ele salva, then o PATCH retorna sucesso e o novo nome aparece em exibições futuras (após TTL do cache expirar no backend).

- [ ] **AC 9**: Given um group_admin logado, when ele tenta acessar a API `PATCH /api/team-display-names`, then recebe 403 Forbidden.

- [ ] **AC 10**: Given o backend não consegue acessar a tabela `team_display_names` (erro de DB), when o resolver é chamado, then ele retorna o nome original da API sem quebrar (fallback gracioso, sem crash).

- [ ] **AC 11**: Given um time que não existe na tabela `team_display_names` (novo time adicionado após seed), when ele aparece numa bet, then o nome original da API é mostrado (resolver retorna o input quando não encontra no mapa).

## Additional Context

### Dependencies

- Nenhuma dependência externa nova
- Supabase (já usado)
- `createApiHandler` (já existe em `admin-panel/src/middleware/api-handler.ts`)

### Testing Strategy

**Unit tests (backend — Jest):**
- `__tests__/lib/teamDisplayNames.test.js`: Testar `resolveTeamName()` com override, sem override, cache hit, cache miss, erro de DB (fallback)

**Unit tests (admin panel — Vitest):**
- `admin-panel/src/hooks/__tests__/useTeamDisplayNames.test.ts`: Testar hook com mock fetch — resolve com override, resolve sem override, fallback em erro
- `admin-panel/src/app/api/__tests__/team-display-names.test.ts`: Testar GET (lista, search, modified_only) e PATCH (upsert, validação, permissão)

**E2E (Playwright MCP):**
- Logar como super_admin → navegar para `/team-names` → verificar que lista aparece
- Editar display_name de um time → verificar que a mudança persiste após reload
- Navegar para `/bets` → verificar que o time editado mostra o display_name correto
- Logar como group_admin → verificar que "Nomes de Times" NÃO aparece no Sidebar

### Notes

- **Novos times**: Quando o pipeline diário adiciona novos times em `league_matches`, eles NÃO serão automaticamente inseridos em `team_display_names`. O resolver retorna o nome original (fallback). Para adicionar novos times à tabela, pode-se re-rodar o seed SQL ou adicionar um cron/trigger futuro (fora do escopo).
- **Performance**: O cache de 5min no backend significa que após editar um display_name, leva no máximo 5min para o bot usar o novo nome. No admin panel, o hook recarrega a cada mount da página.
- **Funções async**: Tasks 4 e 5 requerem que `generateMarkdown()` e `deriveReportBaseName()` virem `async`. Verificar e adaptar seus callers.
- **Risco**: A mudança de sync para async em `generateMarkdown()` e `reportUtils.js` pode afetar callers. Mitigação: verificar todos os callers antes de alterar.

## Review Notes

- Adversarial review completed (18 findings)
- All 18 findings addressed:
  - **F1 (Critical)**: Added `is_override` generated column for correct column-to-column comparison
  - **F2 (Critical)**: Added RLS with SELECT for authenticated, write only for super_admin
  - **F3 (High)**: Sanitized PostgREST search input
  - **F4 (High)**: Module-level singleton in hook — one fetch shared across all components
  - **F5 (High)**: Added LIMIT 1000 to GET endpoint
  - **F6 (High)**: Added 300ms debounce on search input
  - **F7 (Medium)**: Promise deduplication in ensureCache()
  - **F8 (Medium)**: cancelledRef prevents save on Escape
  - **F9 (Medium)**: handleKeyDown prevents double save on Enter
  - **F10 (Medium)**: Max 100 updates per PATCH batch
  - **F11 (Medium)**: Comment in migration about re-running seed for new teams
  - **F12 (Medium)**: api_name trimmed in PATCH validation
  - **F13 (Medium)**: Comment documenting 5min cache TTL tradeoff
  - **F14 (Low)**: Preload cache once before loop in betService.js
  - **F15 (Low)**: hasError state in hook distinguishes failure from empty
  - **F16 (Low)**: Dirty check — no-op PATCH skipped when value unchanged
  - **F17 (Low)**: Max 200 char length for display_name (DB + API + UI)
  - **F18 (Low)**: Uses `is_override` from DB instead of client-side comparison
- Resolution approach: auto-fix (all 18)
- Tests: 811 passed (0 failed)
- Build: passed
