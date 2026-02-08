# Story 2.4: Dashboard Consolidado do Super Admin

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want ver um dashboard com visao geral de todos os grupos,
So that eu tenha visibilidade completa da plataforma.

## Acceptance Criteria

1. **Given** Super Admin esta logado e acessa `/dashboard` **When** a pagina carrega **Then** ve cards com resumo de cada grupo: nome, membros ativos, status (FR35)
2. **Given** Super Admin esta no dashboard **When** os dados carregam **Then** ve totalizadores: total de membros, total de grupos ativos, bots em uso
3. **Given** Super Admin esta no dashboard **When** eventos relevantes existem **Then** ve secao de alertas e notificacoes do sistema (FR38)
4. **Given** Super Admin esta no dashboard **When** dados sao requisitados **Then** dados vem via API Routes com `createApiHandler({ allowedRoles: ['super_admin'] })`
5. **Given** Group Admin esta logado e acessa `/dashboard` **When** a pagina carrega **Then** ve apenas dados do seu grupo (nome, status, membros) filtrados automaticamente por `groupFilter`
6. **Given** o dashboard carrega **When** dados estao sendo buscados **Then** mostra loading state com skeleton/spinner
7. **Given** o dashboard carrega **When** ocorre erro na API **Then** mostra mensagem de erro com opcao de retry

## Tasks / Subtasks

- [x] Task 1: Criar API Route GET `/api/dashboard/stats` (AC: #1-#4)
  - [x] 1.1: Criar `admin-panel/src/app/api/dashboard/stats/route.ts`
    - Usar `createApiHandler()` (nao restringir por role — super_admin ve tudo, group_admin ve seu grupo via RLS)
    - Queries em paralelo via `Promise.all()`:
      - `groups`: contar por status (active, paused, inactive, creating, failed)
      - `bot_pool`: contar por status (available, in_use)
      - `bot_health`: contar por status (online, offline)
      - `members`: contar total (filtrado por tenant se group_admin)
      - `groups` com detalhes: listar todos com `id, name, status, created_at` + count de membros ativos
    - Response: `{ success: true, data: { summary: {...}, groups: [...], alerts: [...] } }`
  - [x] 1.2: Implementar agregacao de grupos com contagem de membros
    - Buscar todos os grupos (RLS filtra automaticamente)
    - Para cada grupo, contar membros com `status IN ('trial', 'ativo')` — usar query com join ou sub-select
    - Retornar array de `{ id, name, status, created_at, active_members: number }`
  - [x] 1.3: Implementar secao de alertas (AC: #3)
    - Buscar bots offline: `bot_health` onde `status = 'offline'` com join em `groups(name)` e `bot_pool(bot_username)`
    - Buscar grupos com `status = 'failed'` (onboarding falhou)
    - Buscar audit_log recentes (ultimas 24h): eventos criticos como onboarding, status changes
    - Retornar array de alertas: `{ type: 'bot_offline' | 'group_failed' | 'onboarding_completed', message, timestamp, group_name? }`

- [x] Task 2: Criar tipos TypeScript para Dashboard (AC: #1-#3)
  - [x] 2.1: Adicionar tipos em `admin-panel/src/types/database.ts`
    - `DashboardSummary`: `{ groups: { active: number, paused: number, total: number }, bots: { available: number, in_use: number, total: number, online: number, offline: number }, members: { total: number } }`
    - `DashboardGroupCard`: `{ id: string, name: string, status: Group['status'], created_at: string, active_members: number }`
    - `DashboardAlert`: `{ type: 'bot_offline' | 'group_failed' | 'onboarding_completed', message: string, timestamp: string, group_name?: string }`
    - `DashboardData`: `{ summary: DashboardSummary, groups: DashboardGroupCard[], alerts: DashboardAlert[] }`

- [x] Task 3: Redesenhar pagina `/dashboard` com dados reais (AC: #1, #2, #5, #6, #7)
  - [x] 3.1: Atualizar `admin-panel/src/app/(auth)/dashboard/page.tsx`
    - Converter para Client Component (`'use client'`)
    - `useEffect` para buscar `GET /api/dashboard/stats` no mount
    - Estados: `loading`, `error`, `data` (DashboardData)
    - Layout responsivo com Tailwind: grid de cards
  - [x] 3.2: Criar componente `admin-panel/src/components/features/dashboard/StatCard.tsx`
    - Recebe: `title`, `value` (number), `subtitle?`, `icon?` (emoji ou SVG)
    - Tailwind: bg-white rounded-lg shadow p-6
    - Reutilizavel para todos os totalizadores
  - [x] 3.3: Criar componente `admin-panel/src/components/features/dashboard/GroupSummaryCard.tsx`
    - Recebe: `DashboardGroupCard`
    - Mostra: nome do grupo, status com badge colorido, membros ativos
    - Status badges: active=green, paused=yellow, inactive=gray, creating=blue, failed=red
    - Link para `/groups/[groupId]` ao clicar
  - [x] 3.4: Criar componente `admin-panel/src/components/features/dashboard/AlertsSection.tsx`
    - Recebe: array de `DashboardAlert`
    - Lista de alertas com icone por tipo, mensagem e timestamp
    - Se vazio, mostra "Nenhum alerta no momento"
    - Icones: bot_offline=red, group_failed=orange, onboarding_completed=green
  - [x] 3.5: Implementar loading skeleton
    - Enquanto `loading = true`, mostrar cards com animacao pulse (Tailwind `animate-pulse`)
    - Layout identico ao final para evitar layout shift
  - [x] 3.6: Implementar tratamento de erro com retry
    - Se `error` presente, mostrar mensagem + botao "Tentar Novamente"
    - Botao re-executa fetch

- [x] Task 4: Testes (AC: #1-#7)
  - [x] 4.1: Testes para API Route `GET /api/dashboard/stats`
    - Retorna dados corretos para super_admin (summary + groups + alerts)
    - Retorna dados filtrados para group_admin (apenas seu grupo)
    - Retorna 401 para usuario nao autenticado
    - Trata erro de DB graciosamente
    - Inclui bots offline nos alerts
    - Inclui grupos com status 'failed' nos alerts
  - [x] 4.2: Testes para componentes UI
    - `StatCard` renderiza titulo e valor
    - `GroupSummaryCard` mostra nome, status badge, membros ativos
    - `AlertsSection` lista alertas ou mostra mensagem vazia
    - Dashboard page mostra loading, depois dados, trata erro

## Dev Notes

### Contexto Critico - Dashboard Consolidado

**Esta story implementa o dashboard principal do Super Admin**, a primeira tela que o usuario ve apos login. O dashboard deve dar visibilidade imediata sobre a saude da plataforma: quantos grupos, quantos bots, alertas criticos.

**Diferencial Super Admin vs Group Admin:**
- **Super Admin (groupFilter = null):** Ve TODOS os grupos, TODOS os bots, TODOS os membros. Dashboard mostra totalizadores globais + cards de cada grupo + alertas do sistema.
- **Group Admin (groupFilter = UUID):** Ve APENAS seu grupo. Dashboard mostra stats do seu grupo unico + membros do seu grupo. Alertas filtrados para seu grupo (apenas bot do seu grupo offline, etc.).

**IMPORTANTE:** O RLS no Supabase ja filtra automaticamente os dados com base no usuario autenticado (anon key). Nao e necessario aplicar `groupFilter` manualmente nas queries — o RLS das tabelas `groups`, `bot_health`, `members` ja garante isolamento. Porem, para queries que precisam de count ou agregacao, pode ser necessario usar `applyTenantFilter()` ou queries especificas.

### Stack Tecnologica Atual do Admin Panel

| Tecnologia | Versao | Notas |
|------------|--------|-------|
| Next.js | 16.1.6 | App Router (NAO Pages Router) |
| React | 19.2.3 | |
| TypeScript | 5.x | Strict mode |
| Tailwind CSS | 4.x | Styling |
| @supabase/supabase-js | ^2.95.3 | Database client |
| @supabase/ssr | ^0.8.0 | Auth helpers para Next.js App Router |
| Zod | 4.3.6 | Validacao de schemas |
| Vitest | 3.2.4 | Testing framework (NAO Jest) |
| Testing Library | latest | @testing-library/react |

### Middleware e API Handler (OBRIGATORIO)

```typescript
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (_req, context) => {
    // context.user, context.role, context.groupFilter, context.supabase
    // context.supabase usa anon key com RLS
    // NAO precisa verificar role manualmente — createApiHandler ja faz isso
    // Para dashboard, NAO usar allowedRoles — ambos os roles acessam, RLS filtra
  }
);
```

**Supabase Client com RLS:**
- `context.supabase` usa **anon key** — RLS policies aplicam automaticamente
- Super Admin: policies permitem ver tudo (`role = 'super_admin'`)
- Group Admin: policies filtram por `group_id` do admin_users

### Schemas de Banco Relevantes

**Tabela `groups`:**
```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  bot_token VARCHAR,
  telegram_group_id BIGINT UNIQUE,
  telegram_admin_group_id BIGINT,
  mp_product_id VARCHAR,
  render_service_id VARCHAR,
  checkout_url VARCHAR,
  status VARCHAR DEFAULT 'active' CHECK (status IN ('creating', 'active', 'paused', 'inactive', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Tabela `bot_pool`:**
```sql
CREATE TABLE bot_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token VARCHAR NOT NULL UNIQUE,
  bot_username VARCHAR NOT NULL UNIQUE,
  status VARCHAR DEFAULT 'available' CHECK (status IN ('available', 'in_use')),
  group_id UUID REFERENCES groups(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Tabela `bot_health`:**
```sql
CREATE TABLE bot_health (
  group_id UUID PRIMARY KEY REFERENCES groups(id),
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  status VARCHAR DEFAULT 'online' CHECK (status IN ('online', 'offline')),
  restart_requested BOOLEAN DEFAULT false,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Tabela `members` (com group_id):**
```sql
ALTER TABLE members ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id);
-- Colunas relevantes: id, telegram_id, telegram_username, status, group_id, created_at
-- Status: trial, ativo, inadimplente, removido
```

**Tabela `audit_log`:**
```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name VARCHAR NOT NULL,
  record_id VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  changed_by UUID NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### RLS Policies Relevantes

As policies garantem que:
- **Super Admin** pode SELECT em todas as tabelas (groups, bot_pool, bot_health, members, audit_log)
- **Group Admin** pode SELECT apenas registros do seu `group_id` em groups, bot_health, members
- **Bot Pool** e **Audit Log** sao acessiveis apenas por super_admin

Isso significa que o endpoint da dashboard NAO precisa de `allowedRoles` — ambos podem acessar, e o RLS filtra automaticamente.

### Patterns de API Existentes

**GET /api/bots (referencia para summary pattern):**
```typescript
const botList = bots ?? [];
const summary = {
  available: botList.filter((b) => b.status === 'available').length,
  in_use: botList.filter((b) => b.status === 'in_use').length,
  total: botList.length,
};
return NextResponse.json({ success: true, data: botList, summary });
```

**Supabase query com join:**
```typescript
const { data: bots } = await context.supabase
  .from('bot_pool')
  .select('id, bot_username, status, group_id, created_at, groups(name)')
  .order('created_at', { ascending: false });
```

**Response Format:**
```typescript
// Sucesso
return NextResponse.json({ success: true, data: { summary, groups, alerts } });

// Erro
return NextResponse.json(
  { success: false, error: { code: 'DB_ERROR', message: error.message } },
  { status: 500 }
);
```

### Componentes UI Existentes (referencia)

**Layout:** `LayoutShell.tsx` com Sidebar + Header + main content area
**Cards:** `GroupCard.tsx`, `BotCard.tsx` — padrao: bg-white rounded-lg shadow p-6
**Badges de status:** green (active), yellow (paused), gray (inactive), blue (creating), red (failed)

**Sidebar Navigation (Sidebar.tsx):**
```typescript
const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Grupos', href: '/groups', icon: '👥', roles: ['super_admin'] },
  { name: 'Bots', href: '/bots', icon: '🤖', roles: ['super_admin'] },
];
```
Dashboard ja esta no menu para ambos os roles.

### Inteligencia da Story 2.3 (Anterior)

**Licoes aprendidas criticas:**
1. Zod v4 usa `.issues` em vez de `.errors` no resultado de `safeParse()`
2. Mock do Supabase query builder precisa encadear corretamente `from() -> select() -> order()/single()`
3. Diferenciar erros de DB (500) vs erros de validacao/constraint (400) — verificar `error.code?.startsWith('23')`
4. Audit log NAO deve bloquear a operacao principal — usar `.then().catch()` sem await
5. `bot_token` NUNCA deve ser retornado em respostas de API (NFR-S2)
6. Usar `formatDate` de `@/lib/format-utils.ts` (DRY, nao recriar)
7. Build error pre-existente: `GroupEditForm` em `groups/[groupId]/edit/page.tsx` tem erro de tipo — nao introduzido e nao precisa ser corrigido nesta story

**Padroes de teste (Vitest):**
```typescript
// Mock withTenant
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Create mock context
function createMockContext(role, queryBuilder) {
  const qb = queryBuilder ?? createMockQueryBuilder();
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-uuid-1',
    supabase: { from: qb.from } as unknown as TenantContext['supabase'],
  };
}

// Create mock request
function createMockRequest(method, url, body?) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new Request(url, init));
}
```

**ATENCAO para mocking de queries paralelas:**
O dashboard usa `Promise.all()` com multiplas queries. O mock do Supabase precisa distinguir entre chamadas `from('groups')`, `from('bot_pool')`, `from('bot_health')`, `from('members')`, etc. Usar o pattern `createMockPutQueryBuilder` da story 2.3 que diferencia por table name.

### Git Intelligence

**Commits recentes relevantes:**
- `1d423f2` chore: mark story 2.3 as done in sprint-status
- `c01fb2d` refactor(admin): step-by-step onboarding API + wizard tests (Story 2.3)
- `e83c66e` feat(admin): add influencer onboarding wizard with multi-step pipeline (Story 2.3)
- `1420d8d` feat(admin): add bot pool management page and API (Story 2.2)

**Branch atual:** `feature/onboarding-influencer`
**Branch sugerida para esta story:** `feature/dashboard-consolidado`

**Padroes de commit:**
- `feat(admin):` para novas funcionalidades do admin panel
- Mensagens em ingles

### Estrutura de Arquivos a Criar/Modificar

```
admin-panel/src/
├── app/
│   ├── (auth)/
│   │   └── dashboard/
│   │       └── page.tsx                                    # MODIFICAR - dashboard com dados reais
│   └── api/
│       └── dashboard/
│           └── stats/
│               └── route.ts                                # NOVO - GET stats consolidados
├── components/
│   └── features/
│       └── dashboard/
│           ├── StatCard.tsx                                 # NOVO - card de totalizador
│           ├── GroupSummaryCard.tsx                         # NOVO - card resumo do grupo
│           └── AlertsSection.tsx                            # NOVO - secao de alertas
└── types/
    └── database.ts                                          # MODIFICAR - adicionar tipos Dashboard
```

**Arquivos a CRIAR:**
- `admin-panel/src/app/api/dashboard/stats/route.ts` — API de stats
- `admin-panel/src/components/features/dashboard/StatCard.tsx` — Card totalizador
- `admin-panel/src/components/features/dashboard/GroupSummaryCard.tsx` — Card do grupo
- `admin-panel/src/components/features/dashboard/AlertsSection.tsx` — Alertas
- `admin-panel/src/app/api/__tests__/dashboard.test.ts` — Testes API
- `admin-panel/src/components/features/dashboard/StatCard.test.tsx` — Testes componente
- `admin-panel/src/components/features/dashboard/GroupSummaryCard.test.tsx` — Testes componente
- `admin-panel/src/components/features/dashboard/AlertsSection.test.tsx` — Testes componente
- `admin-panel/src/app/(auth)/dashboard/page.test.tsx` — Testes pagina (MODIFICAR existente)

**Arquivos a MODIFICAR:**
- `admin-panel/src/app/(auth)/dashboard/page.tsx` — De placeholder para dashboard real
- `admin-panel/src/types/database.ts` — Adicionar tipos Dashboard

### Dependencias entre Stories

```
Story 1.3 (done) → Story 2.4 (esta)
   Middleware         Dashboard (usa createApiHandler)
   + createApiHandler

Story 1.4 (done) → Story 2.4 (esta)
   CRUD Grupos        Lista de grupos no dashboard

Story 2.2 (done) → Story 2.4 (esta)
   Pool de Bots       Status de bots no dashboard

Story 2.3 (done) → Story 2.4 (esta)
   Onboarding         Grupos criados aparecem no dashboard
```

**Story 2.4 prepara o terreno para:**
- Story 2.5: Notificacoes e Alertas no Painel (expandir secao de alertas)
- Story 3.2: Login e Dashboard do Group Admin (dashboard filtrado para group_admin)

### FRs Cobertos por Esta Story

- **FR35:** Super Admin pode ver dashboard consolidado de todos os grupos
- **FR38:** Super Admin pode ver alertas e notificacoes do sistema (parcial — implementa alertas basicos: bot offline, grupo failed, onboarding completo)

### NFRs Enderecados

- **NFR-P3:** Painel admin carrega em < 3 segundos (first contentful paint)
- **NFR-R6:** Painel admin disponivel 99% do tempo
- **NFR-S1:** Zero vazamento entre tenants (RLS + middleware)

### Project Structure Notes

- Dashboard API fica em `api/dashboard/stats/` — rota dedicada para dashboard
- Componentes ficam em `components/features/dashboard/` — modulo isolado
- Nao reutilizar `GroupCard.tsx` existente — criar `GroupSummaryCard.tsx` especifico para dashboard (card mais compacto com count de membros)
- Endpoint NAO usa `allowedRoles` — ambos os roles acessam, RLS filtra dados
- `bot_token` NUNCA e retornado na API (NFR-S2)
- Nenhuma migration nova necessaria — todas as tabelas ja existem

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4: Dashboard Consolidado do Super Admin]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2: Gestao de Grupos e Onboarding de Influencer]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Middleware de Tenant (CRITICO)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#API Routes Patterns (Next.js)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#React Components Patterns]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Schema: Novas Tabelas]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Bot Health Check Pattern]
- [Source: _bmad-output/project-context.md#Multi-Tenant Rules]
- [Source: _bmad-output/project-context.md#Service Response Pattern]
- [Source: _bmad-output/project-context.md#Naming Conventions]
- [Source: admin-panel/src/middleware/api-handler.ts#createApiHandler]
- [Source: admin-panel/src/middleware/tenant.ts#withTenant + TenantContext + applyTenantFilter]
- [Source: admin-panel/src/types/database.ts#Group, AdminUser, BotPool, BotHealth]
- [Source: admin-panel/src/app/api/bots/route.ts#Summary pattern reference]
- [Source: admin-panel/src/app/api/__tests__/groups.test.ts#Test patterns reference]
- [Source: admin-panel/src/components/layout/Sidebar.tsx#Navigation items]
- [Source: admin-panel/src/components/features/groups/GroupCard.tsx#Card styling reference]
- [Source: sql/migrations/019_multitenant.sql#RLS policies]
- [Source: _bmad-output/implementation-artifacts/stories/2-3-onboarding-automatico-de-influencer.md#Licoes aprendidas]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- All 234 tests passing (29 test files), 0 regressions

### Completion Notes List

- Task 2: Created DashboardSummary, DashboardGroupCard, DashboardAlert, DashboardData types in database.ts
- Task 1: Created GET /api/dashboard/stats API route using createApiHandler (no role restriction — RLS handles filtering). Parallel queries via Promise.all for groups, bot_pool, bot_health, members. Builds summary aggregations, group cards with active member counts, and alerts (bot_offline, group_failed).
- Task 3: Converted dashboard page to Client Component with useEffect fetch, loading skeleton (animate-pulse), error state with retry button. Created StatCard, GroupSummaryCard (with status badges and link to group detail), AlertsSection (with icons by type and formatDate from format-utils.ts).
- Task 4: Created API tests (7 test cases: super_admin data, group_admin filtered, 401, 500, offline alerts, failed alerts, empty state). Created component tests for StatCard (4), GroupSummaryCard (6), AlertsSection (3). Updated dashboard page tests (5: loading skeleton, data render, error with retry, retry click, network failure).
- AC #4 note: The story specified `createApiHandler({ allowedRoles: ['super_admin'] })` but Dev Notes correctly clarify that both roles should access the endpoint with RLS filtering. No allowedRoles restriction was applied — RLS handles isolation automatically.

### Change Log

- 2026-02-08: Story 2.4 implementation complete — all 4 tasks, 16 subtasks done, 230 tests pass
- 2026-02-08: Code review fixes (8 issues) — TS type cast fix, added audit_log alerts (onboarding_completed), useCallback for fetchDashboard, formatDateTime in alerts, vi import fix, HTTP status check, composite key, 4 new tests. 234 tests pass

### File List

**Created:**
- admin-panel/src/app/api/dashboard/stats/route.ts
- admin-panel/src/components/features/dashboard/StatCard.tsx
- admin-panel/src/components/features/dashboard/GroupSummaryCard.tsx
- admin-panel/src/components/features/dashboard/AlertsSection.tsx
- admin-panel/src/app/api/__tests__/dashboard.test.ts
- admin-panel/src/components/features/dashboard/StatCard.test.tsx
- admin-panel/src/components/features/dashboard/GroupSummaryCard.test.tsx
- admin-panel/src/components/features/dashboard/AlertsSection.test.tsx

**Modified:**
- admin-panel/src/app/(auth)/dashboard/page.tsx (placeholder → full dashboard)
- admin-panel/src/app/(auth)/dashboard/page.test.tsx (updated for new component)
- admin-panel/src/types/database.ts (added Dashboard types)
- _bmad-output/implementation-artifacts/sprint-status.yaml (2-4 → in-progress → review)
