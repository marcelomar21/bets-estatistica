# Story 5.2: Gestao de Odds no Painel (Individual e Bulk)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want atualizar odds de apostas no painel admin,
So that as apostas tenham odds corretas antes de serem postadas nos grupos Telegram.

## Acceptance Criteria

1. **AC1: Listagem de apostas com dados completos**
   - Given Super Admin esta logado e acessa `/bets`
   - When a pagina carrega
   - Then ve lista de todas as apostas com: jogo (times), mercado, pick, odds, grupo destino, status de distribuicao (FR20)
   - And apostas sao paginadas (50 por pagina por padrao, maximo 200)
   - And pode ordenar por kickoff_time, odds, status, created_at
   - And API Routes usam `createApiHandler()` com `withTenant()` (Super Admin ve tudo)

2. **AC2: Filtros na listagem**
   - Given Super Admin esta na pagina `/bets`
   - When aplica filtros
   - Then pode filtrar por: bet_status (generated, pending_link, pending_odds, ready, posted), elegibilidade (elegivel, removida, expirada), grupo destino, com/sem odds, com/sem link
   - And pode buscar por nome do time ou mercado
   - And filtros sao combinaveis (ex: status=ready + sem link)
   - And contadores de status sao exibidos (total, ready, posted, pending_link, pending_odds)

3. **AC3: Edicao individual de odds**
   - Given Super Admin seleciona uma aposta na listagem
   - When edita o campo de odds
   - Then pode inserir um novo valor de odds (numerico, > 0) (FR21)
   - And a alteracao e salva via API com resposta `{ success, data }`
   - And o historico de odds e registrado em `odds_update_history` com `job_name = 'manual_admin'`
   - And se a aposta tem odds >= 1.60 E deep_link preenchido, status auto-promove para `ready`
   - And se odds < 1.60, exibe warning visual (mas permite salvar se `promovida_manual = true`)
   - And feedback visual confirma sucesso ou exibe erro

4. **AC4: Edicao bulk de odds**
   - Given Super Admin seleciona multiplas apostas via checkbox
   - When clica em "Atualizar Odds em Lote" e insere um valor
   - Then todas as apostas selecionadas recebem o novo valor de odds (FR22)
   - And bulk update processa em < 5 segundos para ate 50 itens (NFR-P5)
   - And cada alteracao individual e registrada em `odds_update_history`
   - And auto-promocao e avaliada para cada aposta individualmente
   - And resposta inclui resumo: { updated: N, promoted: N, failed: N, errors: [] }
   - And se alguma falhar, as demais continuam (falha parcial nao aborta)

5. **AC5: Contadores de status na listagem**
   - Given Super Admin esta na pagina `/bets`
   - When a pagina carrega
   - Then ve contadores: total de apostas, quantas ready, quantas posted, quantas sem odds, quantas sem link
   - And contadores atualizam apos edicao de odds (individual ou bulk)

6. **AC6: Multi-tenant - Super Admin ve tudo, Group Admin ve so seu grupo**
   - Given Super Admin acessa `/bets`
   - Then ve apostas de TODOS os grupos + apostas nao distribuidas (group_id IS NULL)
   - Given Group Admin acessa `/bets`
   - Then ve APENAS apostas do seu grupo (filtradas por group_id via RLS + middleware)
   - And Group Admin pode VER odds mas NAO pode editar (somente leitura)

7. **AC7: Historico de odds por aposta**
   - Given Super Admin visualiza uma aposta
   - When expande detalhes ou abre modal
   - Then ve historico de alteracoes de odds: valor anterior, valor novo, job_name, timestamp
   - And historico vem da tabela `odds_update_history` ordenado por created_at DESC

## Tasks / Subtasks

- [x] Task 1: Criar tipos TypeScript para apostas no admin panel (AC: #1)
  - [x] 1.1 Adicionar interfaces `SuggestedBet`, `SuggestedBetListItem`, `OddsHistoryEntry` em `admin-panel/src/types/database.ts`
  - [x] 1.2 Adicionar tipos de request/response: `BetOddsUpdateRequest`, `BulkOddsUpdateRequest`, `BetListResponse`, `BetStatsResponse`

- [x] Task 2: Criar API Route GET /api/bets - listagem com filtros e paginacao (AC: #1, #2, #5, #6)
  - [x] 2.1 Criar `admin-panel/src/app/api/bets/route.ts` com handler GET usando `createApiHandler()`
  - [x] 2.2 Implementar query com join em `league_matches` para nomes dos times e `kickoff_time`
  - [x] 2.3 Implementar join em `groups` para nome do grupo destino (quando `group_id` preenchido)
  - [x] 2.4 Implementar filtros via query params: `status`, `elegibilidade`, `group_id`, `has_odds`, `has_link`, `search`
  - [x] 2.5 Implementar paginacao: `page`, `per_page` (default 50, max 200)
  - [x] 2.6 Implementar ordenacao: `sort_by` (kickoff_time, odds, created_at, bet_status), `sort_dir` (asc, desc)
  - [x] 2.7 Implementar counter queries em paralelo para contadores de status (total, ready, posted, pending_link, pending_odds, sem_odds, sem_link)
  - [x] 2.8 Multi-tenant: aplicar `groupFilter` para group_admin (ve so seu grupo); super_admin ve tudo
  - [x] 2.9 Permitir super_admin filtrar por grupo especifico via query param `group_id`
  - [x] 2.10 `allowedRoles: ['super_admin', 'group_admin']`

- [x] Task 3: Criar API Route GET /api/bets/[id] - detalhe com historico (AC: #3, #7)
  - [x] 3.1 Criar `admin-panel/src/app/api/bets/[id]/route.ts` com handler GET
  - [x] 3.2 Retornar aposta com dados completos do match (times, liga, kickoff_time)
  - [x] 3.3 Incluir historico de odds da tabela `odds_update_history` (ultimas 20 entradas)
  - [x] 3.4 Incluir nome do grupo destino
  - [x] 3.5 Multi-tenant: group_admin so ve apostas do seu grupo
  - [x] 3.6 Retornar 404 se aposta nao existe ou nao pertence ao grupo

- [x] Task 4: Criar API Route PATCH /api/bets/[id]/odds - edicao individual (AC: #3)
  - [x] 4.1 Criar `admin-panel/src/app/api/bets/[id]/odds/route.ts` com handler PATCH
  - [x] 4.2 Validar input: `odds` numerico, > 0 (usar parseFloat, rejeitar NaN/Infinity)
  - [x] 4.3 Buscar odds anterior da aposta (para historico)
  - [x] 4.4 Pular update se odds nao mudou (diferenca < 0.001)
  - [x] 4.5 Atualizar `suggested_bets.odds` no Supabase
  - [x] 4.6 Registrar em `odds_update_history`: bet_id, update_type='odds_change', old_value, new_value, job_name='manual_admin'
  - [x] 4.7 Auto-determinar bet_status: se tem odds >= MIN_ODDS (1.60) E deep_link, promover para `ready`; se tem odds mas nao link, `pending_link`; se tem link mas nao odds, `pending_odds`
  - [x] 4.8 Retornar `{ success: true, data: { bet, promoted, old_odds, new_odds } }`
  - [x] 4.9 `allowedRoles: ['super_admin']` - SOMENTE Super Admin edita odds

- [x] Task 5: Criar API Route POST /api/bets/bulk/odds - edicao bulk (AC: #4)
  - [x] 5.1 Criar `admin-panel/src/app/api/bets/bulk/odds/route.ts` com handler POST
  - [x] 5.2 Validar input: array de `{ id: number, odds: number }`, maximo 50 itens por request
  - [x] 5.3 Processar updates sequencialmente (nao paralelo, para evitar race conditions no historico)
  - [x] 5.4 Para cada item: buscar odds anterior, atualizar, registrar historico, avaliar auto-promocao
  - [x] 5.5 Falha parcial NAO aborta: continuar processando demais itens
  - [x] 5.6 Retornar `{ success: true, data: { updated: N, promoted: N, skipped: N, failed: N, errors: [{id, error}] } }`
  - [x] 5.7 Performance: processar 50 itens em < 5 segundos (NFR-P5) - cada update e ~2 queries (read old + update + history insert)
  - [x] 5.8 `allowedRoles: ['super_admin']`

- [x] Task 6: Criar pagina /bets e componentes de UI (AC: #1, #2, #3, #4, #5, #6)
  - [x] 6.1 Criar `admin-panel/src/app/(auth)/bets/page.tsx` - pagina principal
  - [x] 6.2 Criar `admin-panel/src/components/features/bets/BetTable.tsx` - tabela com colunas: jogo, mercado, pick, odds, grupo, status, distribuicao, acoes
  - [x] 6.3 Criar `admin-panel/src/components/features/bets/BetStatusBadge.tsx` - badge colorido por bet_status
  - [x] 6.4 Criar `admin-panel/src/components/features/bets/BetFilters.tsx` - barra de filtros (status, elegibilidade, grupo, search)
  - [x] 6.5 Criar `admin-panel/src/components/features/bets/BetStatsBar.tsx` - contadores de status no topo
  - [x] 6.6 Criar `admin-panel/src/components/features/bets/OddsEditModal.tsx` - modal para editar odds individual com historico
  - [x] 6.7 Criar `admin-panel/src/components/features/bets/BulkOddsModal.tsx` - modal para editar odds em lote
  - [x] 6.8 Implementar checkbox para selecao multipla na tabela
  - [x] 6.9 Implementar barra de acoes bulk (aparece quando ha selecao)
  - [x] 6.10 Implementar paginacao com controles (anterior, proximo, ir para pagina)
  - [x] 6.11 Group Admin: esconder botoes de edicao, exibir apenas leitura
  - [x] 6.12 Feedback visual: toast de sucesso/erro apos edicao

- [x] Task 7: Adicionar entrada "Apostas" no Sidebar (AC: #1)
  - [x] 7.1 Adicionar item `{ name: 'Apostas', href: '/bets', icon: '🎯', roles: ['super_admin', 'group_admin'] }` no array `navigation` em `Sidebar.tsx`

- [x] Task 8: Testes de API Routes (AC: #1-#7)
  - [x] 8.1 Criar `admin-panel/src/app/api/__tests__/bets.test.ts`
  - [x] 8.2 Testar GET /api/bets: listagem basica, paginacao, filtros, ordenacao
  - [x] 8.3 Testar GET /api/bets: multi-tenant (super_admin ve tudo, group_admin ve so seu grupo)
  - [x] 8.4 Testar GET /api/bets/[id]: aposta existente, aposta inexistente, group_admin restrito
  - [x] 8.5 Testar PATCH /api/bets/[id]/odds: odds valido, odds invalido (NaN, negativo, zero), auto-promocao
  - [x] 8.6 Testar PATCH /api/bets/[id]/odds: group_admin recebe 403
  - [x] 8.7 Testar POST /api/bets/bulk/odds: bulk valido (3 itens), bulk vazio, bulk > 50 itens (rejeitar)
  - [x] 8.8 Testar POST /api/bets/bulk/odds: falha parcial (1 de 3 falha, outros 2 salvam)
  - [x] 8.9 Testar POST /api/bets/bulk/odds: group_admin recebe 403
  - [x] 8.10 Testar contadores de status: retornam valores corretos

- [x] Task 9: Testes de componentes React (AC: #1-#6)
  - [x] 9.1 Criar testes para `BetTable.tsx`, `BetStatusBadge.tsx`, `BetFilters.tsx`
  - [x] 9.2 Testar: renderizacao da tabela com dados mockados
  - [x] 9.3 Testar: BetStatusBadge renderiza cores corretas por status
  - [x] 9.4 Testar: BetFilters emite eventos de filtro corretos
  - [x] 9.5 Testar: OddsEditModal valida input e chama API
  - [x] 9.6 Testar: BulkOddsModal valida input e chama API
  - [x] 9.7 Testar: Group Admin nao ve botoes de edicao

## Dev Notes

### Contexto Critico: Admin Panel + Supabase RLS, NAO betService.js

**IMPORTANTE:** O admin panel e uma aplicacao Next.js com seu proprio cliente Supabase (`@supabase/ssr` com `anon_key`). Ele NAO importa `betService.js` do bot (CommonJS, runtime diferente). As API Routes do admin panel fazem queries DIRETAS ao Supabase, e o RLS (Row Level Security) garante isolamento de dados.

**O que JA funciona no admin panel:**

| Componente | Arquivo | Status |
|------------|---------|--------|
| `createApiHandler()` | `admin-panel/src/middleware/api-handler.ts` | Wrapper obrigatorio para todas API Routes |
| `withTenant()` | `admin-panel/src/middleware/tenant.ts` | Extrai role + groupFilter do JWT |
| RLS em `suggested_bets` | `sql/migrations/019_multitenant.sql:205-216` | super_admin ve tudo, group_admin ve so seu grupo |
| Tipos TypeScript | `admin-panel/src/types/database.ts` | Falta interface SuggestedBet |
| Sidebar | `admin-panel/src/components/layout/Sidebar.tsx` | Falta entrada "Apostas" |
| Pattern de listagem | `admin-panel/src/app/api/members/route.ts` | Referencia para paginacao + filtros + contadores |
| Pattern de componentes | `admin-panel/src/components/features/members/MemberList.tsx` | Referencia para tabela + filtros |

**O que NAO existe ainda:**

| Componente | Destino | Descricao |
|------------|---------|-----------|
| API Route GET /api/bets | `admin-panel/src/app/api/bets/route.ts` | Listagem com filtros e paginacao |
| API Route GET /api/bets/[id] | `admin-panel/src/app/api/bets/[id]/route.ts` | Detalhe com historico de odds |
| API Route PATCH /api/bets/[id]/odds | `admin-panel/src/app/api/bets/[id]/odds/route.ts` | Update individual de odds |
| API Route POST /api/bets/bulk/odds | `admin-panel/src/app/api/bets/bulk/odds/route.ts` | Update bulk de odds |
| Pagina /bets | `admin-panel/src/app/(auth)/bets/page.tsx` | Pagina principal de apostas |
| Componentes | `admin-panel/src/components/features/bets/*.tsx` | Tabela, filtros, modais, badges |
| Testes API | `admin-panel/src/app/api/__tests__/bets.test.ts` | Testes das API Routes |

### Padrao de API Route - Referencia (members/route.ts)

```typescript
// Padrao OBRIGATORIO para todas as API Routes
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, role, groupFilter } = context;

    // 1. Parse query params
    const url = new URL(req.url);
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const perPage = Math.min(parsePositiveInt(url.searchParams.get('per_page'), 50), 200);

    // 2. Build query
    let query = supabase.from('suggested_bets').select('...', { count: 'exact' });

    // 3. Multi-tenant: CRITICO
    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    }

    // 4. Aplica filtros, paginacao
    // 5. Retorna com contadores (queries paralelas via Promise.all)

    return NextResponse.json({ success: true, data: { items, pagination, counters } });
  },
  { allowedRoles: ['super_admin', 'group_admin'] }
);
```

### Schema: suggested_bets - Colunas Relevantes para Odds

```sql
-- Core
id BIGSERIAL PRIMARY KEY,
match_id BIGINT REFERENCES league_matches(id),
bet_market TEXT,       -- ex: "Over 2.5 Gols"
bet_pick TEXT,         -- ex: "Over"
odds NUMERIC,          -- Odds atual (pode ser atualizada)
confidence NUMERIC,    -- 0-1

-- Status
bet_status TEXT,       -- generated | pending_link | pending_odds | ready | posted
elegibilidade TEXT,    -- elegivel | removida | expirada
promovida_manual BOOLEAN DEFAULT false,

-- Posting
deep_link TEXT,        -- URL do bookmaker
odds_at_post NUMERIC(6,2), -- Snapshot no momento da postagem (imutavel)
telegram_posted_at TIMESTAMPTZ,

-- Multi-tenant
group_id UUID REFERENCES groups(id),
distributed_at TIMESTAMPTZ,

-- Timestamps
created_at TIMESTAMPTZ DEFAULT now()
```

### Schema: odds_update_history

```sql
CREATE TABLE odds_update_history (
  id SERIAL PRIMARY KEY,
  bet_id BIGINT REFERENCES suggested_bets(id) ON DELETE CASCADE,
  update_type TEXT,     -- 'odds_change' | 'new_analysis' | 'manual_update'
  old_value NUMERIC(10,2),  -- NULL para new_analysis
  new_value NUMERIC(10,2) NOT NULL,
  job_name TEXT,        -- ex: 'enrichOdds_08h', 'manual_admin', 'scraping_09h30'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indices existentes: idx_odds_history_bet_id, idx_odds_history_created, idx_odds_history_bet_created
```

### Schema: league_matches - Colunas para Join

```sql
-- Colunas relevantes para exibicao na listagem de apostas:
id BIGINT,
home_team_name TEXT,
away_team_name TEXT,
kickoff_time TIMESTAMPTZ,
status TEXT,           -- 'scheduled' | 'live' | 'finished'
home_score INT,
away_score INT,
league_id BIGINT REFERENCES league_seasons(id)
```

### Logica de Auto-Promocao (determineStatus)

```javascript
// Implementar a MESMA logica no admin panel
const MIN_ODDS = 1.60;

function determineStatus(currentStatus, odds, deepLink) {
  if (currentStatus === 'posted') return 'posted'; // NUNCA regride
  const hasOdds = odds && odds >= MIN_ODDS;
  const hasLink = !!deepLink;
  if (hasOdds && hasLink) return 'ready';
  if (hasOdds && !hasLink) return 'pending_link';
  if (!hasOdds && hasLink) return 'pending_odds';
  return 'generated';
}
```

**ATENCAO:** Se `promovida_manual = true`, a aposta pode ter odds < 1.60 e ainda ser considerada `ready` (se tiver deep_link). A logica completa no betService.js e:
- Se odds >= MIN_ODDS E deep_link: status = `ready`
- Se odds < MIN_ODDS MAS `promovida_manual = true` E deep_link: status = `ready`
- Se odds < MIN_ODDS E NAO promovida_manual: status permanece ou vai para `pending_odds`

### Select Query para Listagem - Referencia

```sql
-- Query que o GET /api/bets deve executar (via Supabase client)
SELECT
  sb.id,
  sb.bet_market,
  sb.bet_pick,
  sb.odds,
  sb.deep_link,
  sb.bet_status,
  sb.elegibilidade,
  sb.promovida_manual,
  sb.group_id,
  sb.distributed_at,
  sb.created_at,
  sb.odds_at_post,
  sb.notes,
  lm.home_team_name,
  lm.away_team_name,
  lm.kickoff_time,
  lm.status as match_status,
  g.name as group_name
FROM suggested_bets sb
LEFT JOIN league_matches lm ON sb.match_id = lm.id
LEFT JOIN groups g ON sb.group_id = g.id
WHERE sb.elegibilidade = 'elegivel'  -- default, override com filtro
ORDER BY lm.kickoff_time DESC
LIMIT 50 OFFSET 0;
```

**Via Supabase client:**
```typescript
const query = supabase
  .from('suggested_bets')
  .select(`
    id, bet_market, bet_pick, odds, deep_link, bet_status,
    elegibilidade, promovida_manual, group_id, distributed_at,
    created_at, odds_at_post, notes,
    league_matches!inner(home_team_name, away_team_name, kickoff_time, status),
    groups(name)
  `, { count: 'exact' });
```

**NOTA:** Usar `league_matches!inner` para excluir apostas sem match (orfas). Usar `groups(name)` (sem !inner) para incluir apostas sem grupo (nao distribuidas).

### Bulk Update - Design e Performance

```typescript
// POST /api/bets/bulk/odds
// Body: { updates: [{ id: 123, odds: 2.10 }, { id: 456, odds: 1.85 }, ...] }

// Processamento SEQUENCIAL (nao paralelo) para:
// 1. Evitar race conditions no odds_update_history
// 2. Garantir cada historico tem timestamp unico
// 3. Permitir falha parcial sem corromper dados

const results = { updated: 0, promoted: 0, skipped: 0, failed: 0, errors: [] };

for (const item of updates) {
  // 1. Buscar odds atual
  const { data: current } = await supabase
    .from('suggested_bets')
    .select('odds, deep_link, bet_status, promovida_manual')
    .eq('id', item.id)
    .single();

  if (!current) { results.failed++; results.errors.push({ id: item.id, error: 'NOT_FOUND' }); continue; }

  // 2. Skip se nao mudou
  if (Math.abs((current.odds || 0) - item.odds) < 0.001) { results.skipped++; continue; }

  // 3. Update odds
  const { error } = await supabase
    .from('suggested_bets')
    .update({ odds: item.odds })
    .eq('id', item.id);

  if (error) { results.failed++; results.errors.push({ id: item.id, error: error.message }); continue; }

  // 4. Registrar historico (best-effort)
  await supabase.from('odds_update_history').insert({
    bet_id: item.id,
    update_type: 'odds_change',
    old_value: current.odds,
    new_value: item.odds,
    job_name: 'manual_admin_bulk'
  });

  // 5. Auto-determinar status
  const newStatus = determineStatus(current.bet_status, item.odds, current.deep_link);
  if (newStatus !== current.bet_status && current.bet_status !== 'posted') {
    await supabase.from('suggested_bets').update({ bet_status: newStatus }).eq('id', item.id);
    if (newStatus === 'ready') results.promoted++;
  }

  results.updated++;
}
// Performance: ~3 queries por item = ~150 queries para 50 itens
// Supabase REST latency ~20-50ms/query = ~3-7.5 segundos
// Dentro do limite NFR-P5 de < 5 segundos para 50 itens (margem apertada)
```

**Otimizacao se necessario:** Se a performance ficar acima de 5s, pode-se:
1. Buscar todos os current values em uma unica query com `.in('id', ids)` (1 query em vez de 50)
2. Fazer updates em batch com `.in('id', sameOddsIds)` para itens que vao para o mesmo valor
3. Inserir historico em batch com `.insert([...])` (1 query em vez de 50)
4. Isso reduz para ~5-10 queries total, ficando em < 1 segundo

### Padrao de Componentes React - Referencia (MemberList.tsx)

O admin panel usa:
- **Next.js App Router** com `'use client'` nos componentes interativos
- **Tailwind CSS 4.x** para estilizacao
- **fetch()** nativo para chamadas de API (nao React Query)
- **useState/useEffect** para estado e data fetching
- **Padrao de erro:** exibir mensagem inline ou toast

### Navigation - Sidebar Update

```typescript
// Adicionar em admin-panel/src/components/layout/Sidebar.tsx
const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Membros', href: '/members', icon: '👤' },
  { name: 'Apostas', href: '/bets', icon: '🎯' },  // NOVO - visivel para ambos roles
  { name: 'Grupos', href: '/groups', icon: '👥', roles: ['super_admin'] },
  { name: 'Bots', href: '/bots', icon: '🤖', roles: ['super_admin'] },
  { name: 'Telegram', href: '/settings/telegram', icon: '📱', roles: ['super_admin'] },
];
```

**NOTA:** "Apostas" e visivel para ambos os roles (sem restricao `roles`). Group Admin pode VER apostas do seu grupo, mas nao pode editar odds. O controle de edicao e feito:
1. No backend: API Routes de update sao `allowedRoles: ['super_admin']`
2. No frontend: botoes de edicao sao condicionalmente renderizados baseado em `role`

### Learnings da Story 5.1 (Anterior)

- **Multi-tenant group resolution:** `config.membership.groupId` no bot, `context.groupFilter` no admin panel
- **Service Response Pattern:** `{ success: true/false, data/error }` - OBRIGATORIO em APIs
- **Supabase joins:** Usar `table!inner(columns)` para inner join, `table(columns)` para left join
- **Filtro group_id:** Padrão `if (groupFilter) { query = query.eq('group_id', groupFilter); }` - NAO esquecer
- **Baseline de testes:** 26 testes da story 5.1 passando
- **betService.js JA tem `updateBetOdds()`** com historico e auto-promocao - mas o admin panel faz queries diretas, entao a logica precisa ser replicada na API Route
- **`registrarOddsHistory()` e best-effort** - falha no historico NAO deve impedir o update de odds

### Git Intelligence

**Commits recentes (Epic 5, Story 5.1):**
```
3540c3d Merge PR #29 (story 4.5 - kick-expired multi-tenant)
66bd3c0 fix(bot): close story 4.5 review findings
fd8fcde feat(bot): adapt kick-expired job for multi-tenant (story 4.5)
```

**Branch atual:** `feature/story-5.1-distribuicao-round-robin-de-apostas-entre-grupos` (story 5.1 esta done nesta branch, nao foi mergeada ainda)

**Branch naming para esta story:** `feature/story-5.2-gestao-de-odds-no-painel-individual-e-bulk`
**Commit pattern:** `feat(admin): implement odds management page with bulk editing (story 5.2)`

**ATENCAO:** A branch da story 5.1 ainda nao foi mergeada na master. Verificar se ha dependencias de codigo da 5.1 que esta story precisa. Na pratica, esta story (5.2) e no admin panel e nao depende diretamente de `distributeBets.js` ou das mudancas em `betService.js` da 5.1 — porem as apostas so terao `group_id` preenchido apos a distribuicao da 5.1 funcionar. Para desenvolvimento, pode-se criar a branch a partir da master (as colunas `group_id` e `distributed_at` ja existem na migration 019).

### Riscos e Mitigacoes

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| Performance bulk > 5s | Viola NFR-P5 | Otimizar com batch queries (buscar todos de uma vez, inserir historico em batch) |
| RLS nao filtra corretamente | Vazamento de dados entre tenants | Testar com 2 grupos simulados, validar que group_admin nao ve apostas de outro grupo |
| Auto-promocao diverge do betService.js | Status inconsistente entre bot e admin | Replicar EXATAMENTE a logica de `determineStatus()` — incluir `promovida_manual` check |
| Odds_update_history falha | Perde audit trail | Best-effort: nao abortar update de odds se historico falhar, mas logar erro |
| Supabase join com league_matches falha | Apostas orfas sem match | Usar `league_matches!inner` na listagem (exclui orfas) — aceito para MVP |
| Group Admin tenta editar via API direto | Bypass de UI | Backend valida `allowedRoles: ['super_admin']` — UI e apenas conveniencia |

### Project Structure Notes

**Arquivos NOVOS (admin-panel):**
- `src/app/api/bets/route.ts` - GET listagem
- `src/app/api/bets/[id]/route.ts` - GET detalhe
- `src/app/api/bets/[id]/odds/route.ts` - PATCH odds individual
- `src/app/api/bets/bulk/odds/route.ts` - POST odds bulk
- `src/app/(auth)/bets/page.tsx` - Pagina principal
- `src/components/features/bets/BetTable.tsx` - Tabela de apostas
- `src/components/features/bets/BetStatusBadge.tsx` - Badge de status
- `src/components/features/bets/BetFilters.tsx` - Filtros
- `src/components/features/bets/BetStatsBar.tsx` - Contadores
- `src/components/features/bets/OddsEditModal.tsx` - Modal edicao individual
- `src/components/features/bets/BulkOddsModal.tsx` - Modal edicao bulk
- `src/app/api/__tests__/bets.test.ts` - Testes de API
- `src/components/features/bets/__tests__/BetTable.test.tsx` - Testes de componentes

**Arquivos MODIFICADOS (admin-panel):**
- `src/types/database.ts` - Adicionar interfaces SuggestedBet, OddsHistoryEntry
- `src/components/layout/Sidebar.tsx` - Adicionar entrada "Apostas"

**Nenhum arquivo do bot/ e modificado nesta story.**
**Nenhuma migration SQL necessaria** - todas as tabelas e colunas ja existem.

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 5, Story 5.2 (FR20, FR21, FR22, NFR-P5)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md - Multi-tenant, withTenant(), API patterns]
- [Source: _bmad-output/project-context.md - Bet State Machines, Service Response Pattern, Multi-Tenant Rules]
- [Source: admin-panel/src/middleware/api-handler.ts - createApiHandler() pattern]
- [Source: admin-panel/src/middleware/tenant.ts - withTenant(), TenantContext]
- [Source: admin-panel/src/app/api/members/route.ts - Referencia de listagem com paginacao e contadores]
- [Source: admin-panel/src/types/database.ts - Interfaces existentes]
- [Source: admin-panel/src/components/layout/Sidebar.tsx - Navigation items]
- [Source: admin-panel/src/components/features/members/MemberList.tsx - Referencia de componente de listagem]
- [Source: bot/services/betService.js:926-971 - updateBetOdds() com historico e auto-promocao]
- [Source: bot/services/betService.js:857-915 - getOddsHistory() com paginacao]
- [Source: sql/migrations/001_initial_schema.sql:220-255 - Schema suggested_bets]
- [Source: sql/migrations/004_add_odds_update_history.sql - Schema odds_update_history]
- [Source: sql/migrations/019_multitenant.sql:205-216 - RLS em suggested_bets]
- [Source: stories/5-1-distribuicao-round-robin-de-apostas-entre-grupos.md - Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

### Completion Notes List

- All 9 tasks completed: types, 4 API routes, 6 UI components, sidebar update, API tests (25), component tests (29)
- Full regression suite: 462 tests pass across 43 test files, zero failures
- Multi-tenant fully enforced: super_admin sees all bets, group_admin sees only their group
- Auto-promotion logic includes `promovida_manual` override for odds < MIN_ODDS (1.60)
- Bulk update processes sequentially (max 50 items) with partial failure handling
- odds_update_history registration is best-effort (failure doesn't block odds update)
- Counter queries run in parallel via Promise.all for performance
- Component tests use @testing-library/react with userEvent for realistic interactions
- API test mocking uses chainable Supabase client mock pattern (from members/groups tests)
- Review fixes aplicados: role de Group Admin agora default-safe (somente leitura), sem edição acidental quando `/api/groups` retorna 403/erro.
- Review fixes aplicados: tabela de apostas agora exibe coluna de status de distribuicao (`Distribuida`/`Nao distribuida`) conforme FR20.
- Review fixes aplicados: update individual e bulk de odds passaram a aplicar odds + `bet_status` em update atomico por item, evitando `promoted` falso.
- Review fixes aplicados: contador "Sem Odds" corrigido para evitar dupla contagem e teste multi-tenant reforcado para validar `eq('group_id', groupFilter)`.

### File List

**New files (admin-panel/src):**
- `app/api/bets/route.ts` - GET /api/bets - listing with filters, pagination, counters, multi-tenant
- `app/api/bets/[id]/route.ts` - GET /api/bets/[id] - detail with odds history
- `app/api/bets/[id]/odds/route.ts` - PATCH /api/bets/[id]/odds - individual odds update with auto-promotion
- `app/api/bets/bulk/odds/route.ts` - POST /api/bets/bulk/odds - bulk odds update (max 50)
- `app/(auth)/bets/page.tsx` - Main bets page orchestrating all components
- `components/features/bets/BetStatusBadge.tsx` - Colored badge per bet_status
- `components/features/bets/BetStatsBar.tsx` - Counter cards grid (total, ready, posted, sem link, sem odds)
- `components/features/bets/BetFilters.tsx` - Search + filter dropdowns
- `components/features/bets/BetTable.tsx` - Table with sorting, checkboxes, pagination, role-based UI
- `components/features/bets/OddsEditModal.tsx` - Modal for individual odds edit with history
- `components/features/bets/BulkOddsModal.tsx` - Modal for bulk odds update
- `app/api/__tests__/bets.test.ts` - 25 API route tests
- `components/features/bets/__tests__/BetComponents.test.tsx` - 29 component tests

**Modified files (admin-panel/src):**
- `types/database.ts` - Added BetStatus, BetElegibilidade, SuggestedBet, SuggestedBetListItem, OddsHistoryEntry, BetOddsUpdateRequest, BulkOddsUpdateRequest, BetPagination, BetCounters, BetListResponse, BetDetailResponse, BetOddsUpdateResponse, BulkOddsUpdateResponse
- `components/layout/Sidebar.tsx` - Added 'Apostas' navigation entry (visible to both roles)

**No bot/ files modified. No SQL migrations needed.**

### Change Log

- feat(admin): add TypeScript types for bets, odds history, and API responses
- feat(admin): implement GET /api/bets with filters, pagination, counters, multi-tenant
- feat(admin): implement GET /api/bets/[id] with odds history
- feat(admin): implement PATCH /api/bets/[id]/odds with auto-promotion and history
- feat(admin): implement POST /api/bets/bulk/odds with sequential processing and partial failure
- feat(admin): add BetStatusBadge, BetStatsBar, BetFilters, BetTable, OddsEditModal, BulkOddsModal components
- feat(admin): add /bets page with full orchestration (filters, modals, bulk actions, toast)
- feat(admin): add 'Apostas' entry to Sidebar navigation
- test(admin): add 25 API route tests for bets endpoints
- test(admin): add 29 component tests for bet UI components
- fix(admin): enforce safe role detection on /bets page (group_admin by default, super_admin only after /api/groups success)
- fix(admin): add explicit distribution status column in bets table to satisfy FR20 visibility
- fix(admin): make individual and bulk odds updates atomic per item (odds + bet_status) to prevent inconsistent promotion responses
- fix(admin): correct "Sem Odds" stats calculation and strengthen multi-tenant assertion in bets API tests
