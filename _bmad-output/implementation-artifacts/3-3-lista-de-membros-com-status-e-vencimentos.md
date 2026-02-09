# Story 3.3: Lista de Membros com Status e Vencimentos

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Admin de Grupo**,
I want ver a lista completa dos membros do meu grupo com status e vencimentos,
so that eu saiba quem esta ativo, em trial e quem vai vencer.

## Acceptance Criteria

1. **Given** Admin de Grupo esta logado e acessa `/members`
   **When** a pagina carrega
   **Then** ve lista de membros do seu grupo com: nome Telegram, status (trial/ativo/vencendo/expirado), data de entrada, data de vencimento (FR13, FR14, FR15, FR42)

2. **Given** Admin de Grupo na pagina `/members`
   **When** seleciona filtro de status
   **Then** pode filtrar por status: todos, trial, ativos, vencendo em 7 dias

3. **Given** Admin de Grupo na pagina `/members`
   **When** digita no campo de busca
   **Then** pode buscar membro por nome Telegram (username)

4. **Given** Admin de Grupo na pagina `/members`
   **When** a lista carrega com ate 10k registros
   **Then** lista carrega em < 2 segundos (NFR-P4)

5. **Given** Admin de Grupo na pagina `/members` com muitos membros
   **When** a lista excede tamanho razoavel de exibicao
   **Then** paginacao e exibida

6. **Given** Admin de Grupo na pagina `/members`
   **When** qualquer requisicao de API e feita
   **Then** dados sao filtrados por `group_id` via `withTenant()` e RLS

7. **Given** Admin de Grupo na pagina `/members`
   **When** tenta acessar membros de outro grupo
   **Then** RLS impede acesso e retorna apenas membros do seu grupo

## Tasks / Subtasks

- [x] Task 1: Criar API Route `GET /api/members` (AC: #1, #4, #6, #7)
  - [x] 1.1 Criar `admin-panel/src/app/api/members/route.ts` com `createApiHandler`
  - [x] 1.2 Implementar query com select de campos necessarios: `id, telegram_id, telegram_username, status, subscription_ends_at, created_at, group_id`
  - [x] 1.3 RLS filtra automaticamente por group_id para `group_admin`; para `super_admin`, retornar todos
  - [x] 1.4 Para `super_admin`: fazer join com `groups(name)` para mostrar nome do grupo de cada membro
  - [x] 1.5 Ordenar por `created_at` descendente (mais recentes primeiro)
  - [x] 1.6 Suportar query params: `?status=trial|ativo|vencendo|expirado` e `?search=username` e `?page=1&per_page=50`
  - [x] 1.7 Para filtro `vencendo`: calcular server-side como `status = 'ativo' AND subscription_ends_at BETWEEN now() AND now() + 7 days`
  - [x] 1.8 Testes unitarios da rota para ambos os roles

- [x] Task 2: Adicionar tipo `Member` em `types/database.ts` (AC: #1)
  - [x] 2.1 Criar interface `Member` com campos do schema
  - [x] 2.2 Criar tipo `MemberListItem` com campos necessarios para a lista (sem dados sensiveis)

- [x] Task 3: Criar componente `MemberList` (AC: #1, #2, #3, #5)
  - [x] 3.1 Criar `admin-panel/src/components/features/members/MemberList.tsx`
  - [x] 3.2 Tabela responsiva com colunas: Nome Telegram, Status (badge colorido), Data de Entrada, Vencimento
  - [x] 3.3 Para `super_admin`: coluna adicional "Grupo" mostrando nome do grupo
  - [x] 3.4 Badge de status com cores: trial (azul), ativo (verde), vencendo (amarelo), inadimplente (vermelho), removido (cinza)

- [x] Task 4: Criar utilidades de membro `member-utils.ts` (AC: #1)
  - [x] 4.1 Criar `admin-panel/src/components/features/members/member-utils.ts`
  - [x] 4.2 Definir `statusConfig` com labels e cores para cada status
  - [x] 4.3 Funcao `getDisplayStatus(member)` que calcula status visual (incluindo "vencendo" para ativos com vencimento < 7 dias)

- [x] Task 5: Criar pagina `/members` (AC: #1, #2, #3, #5)
  - [x] 5.1 Criar `admin-panel/src/app/(auth)/members/page.tsx` como Client Component (precisa de interatividade: filtros, busca, paginacao)
  - [x] 5.2 Header com titulo "Membros" e contadores resumidos
  - [x] 5.3 Barra de filtros: dropdown de status + campo de busca por nome
  - [x] 5.4 Integrar componente `MemberList`
  - [x] 5.5 Paginacao com controles anterior/proximo e contagem total

- [x] Task 6: Adicionar item "Membros" na Sidebar (AC: #1)
  - [x] 6.1 Editar `admin-panel/src/components/layout/Sidebar.tsx`
  - [x] 6.2 Adicionar `{ name: 'Membros', href: '/members', icon: '👤' }` visivel para ambos os roles (`super_admin` e `group_admin`)

- [x] Task 7: Testes (AC: #1-7)
  - [x] 7.1 Testes da API route: group_admin ve apenas seus membros, super_admin ve todos
  - [x] 7.2 Teste de filtro por status (trial, ativo, vencendo)
  - [x] 7.3 Teste de busca por username
  - [x] 7.4 Teste de paginacao
  - [x] 7.5 Teste de performance: budget de < 2s para 10k registros (camada de rota)
  - [x] 7.6 Teste de isolamento: group_admin NAO ve membros de outro grupo

## Dev Notes

### O que JA EXISTE (NAO recriar)

**Infraestrutura multi-tenant completa:**
- `admin-panel/src/middleware/tenant.ts` — `withTenant()` retorna `{ user, role, groupFilter, supabase }`
- `admin-panel/src/middleware/api-handler.ts` — `createApiHandler()` wrapper obrigatorio
- `admin-panel/src/middleware/guards.ts` — Guards de role

**Autenticacao e autorizacao:**
- `admin-panel/src/lib/supabase.ts` — Client-side Supabase (`createBrowserClient`)
- `admin-panel/src/lib/supabase-server.ts` — Server-side Supabase (`createServerClient`)
- Login funcional, Supabase Auth, RLS policies ativas na tabela `members`

**Layout e navegacao:**
- `admin-panel/src/components/layout/Sidebar.tsx` — Filtra menus por role
- `admin-panel/src/components/layout/LayoutShell.tsx` — Passa `role` ao Sidebar
- `admin-panel/src/components/layout/Header.tsx` — Email + logout

**Componentes reutilizaveis:**
- `admin-panel/src/components/features/dashboard/StatCard.tsx` — Card de estatistica
- `admin-panel/src/lib/format-utils.ts` — `formatDate()` e `formatDateTime()` (Intl.DateTimeFormat pt-BR)
- `admin-panel/src/components/features/groups/group-utils.ts` — Referencia para pattern de `statusConfig`

**RLS Policies ativas (tabela members):**
- `super_admin` ve todos os membros (via `public.get_my_role()`)
- `group_admin` ve apenas membros do seu `group_id` (via `public.get_my_group_id()`)
- Enforced via SECURITY DEFINER functions

**API `/api/me`:**
- Retorna `userId`, `email`, `role`, `groupId` — usar para determinar role no client

**Dashboard que JA query membros:**
- `admin-panel/src/app/api/dashboard/stats/route.ts` — handleGroupAdmin() faz query de membros por status com `vencimento_at`

### O que PRECISA ser criado/modificado

1. **CRIAR** `admin-panel/src/app/api/members/route.ts` — API de listagem de membros
2. **CRIAR** `admin-panel/src/app/(auth)/members/page.tsx` — Pagina de membros
3. **CRIAR** `admin-panel/src/components/features/members/MemberList.tsx` — Componente de tabela
4. **CRIAR** `admin-panel/src/components/features/members/member-utils.ts` — Status config e helpers
5. **MODIFICAR** `admin-panel/src/types/database.ts` — Adicionar tipos `Member` e `MemberListItem`
6. **MODIFICAR** `admin-panel/src/components/layout/Sidebar.tsx` — Adicionar nav item "Membros"

### ALERTA CRITICO: Coluna de vencimento

O codigo do dashboard (`route.ts:96`) usa `vencimento_at` na query:
```typescript
.select('id, status, vencimento_at')
```

Porem o schema da tabela `members` (migration `005_membership_tables.sql`) define a coluna como **`subscription_ends_at`**. Verificar ANTES de implementar se:
1. Existe um alias/view que mapeia `subscription_ends_at` para `vencimento_at`, OU
2. Houve uma migration que renomeou a coluna para `vencimento_at`, OU
3. E um bug no dashboard code (nesse caso, a query pode estar retornando null e o contadores de "vencendo" estao sempre 0)

**Para descobrir, executar no inicio da implementacao:**
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'members' AND column_name IN ('vencimento_at', 'subscription_ends_at');
```

Se a coluna for `subscription_ends_at`, usar esse nome nas queries da Story 3.3 e reportar o bug no dashboard para correcao.

### Schema da tabela `members` (referencia)

```sql
-- De sql/migrations/005_membership_tables.sql + 019 + 024
CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  telegram_username TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'ativo', 'inadimplente', 'removido')),
  mp_subscription_id TEXT,
  mp_payer_id TEXT,
  trial_started_at TIMESTAMPTZ,
  subscription_started_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,      -- Data de vencimento
  payment_method TEXT,
  last_payment_at TIMESTAMPTZ,
  kicked_at TIMESTAMPTZ,
  notes TEXT,
  group_id UUID REFERENCES groups(id),   -- Multi-tenant (nullable para backward compat)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes relevantes
CREATE INDEX idx_members_group_id ON members(group_id);
CREATE INDEX idx_members_subscription_ends ON members(subscription_ends_at);
CREATE UNIQUE INDEX idx_members_telegram_group ON members(telegram_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX idx_members_telegram_null_group ON members(telegram_id) WHERE group_id IS NULL;
```

### Padrao de API obrigatorio

```typescript
// TODAS as rotas DEVEM usar createApiHandler
import { createApiHandler } from '@/middleware/api-handler';
import { NextResponse } from 'next/server';

export const GET = createApiHandler(async (req, context) => {
  const { supabase, role, groupFilter } = context;
  // groupFilter = null para super_admin, UUID para group_admin
  // RLS ja filtra automaticamente — mas usar groupFilter explicitamente para queries adicionais

  return NextResponse.json({ success: true, data: { ... } });
}, { allowedRoles: ['super_admin', 'group_admin'] });
```

### Pattern de filtro e busca na API

```typescript
// Extrair query params
const url = new URL(req.url);
const statusFilter = url.searchParams.get('status');    // trial|ativo|vencendo|expirado
const search = url.searchParams.get('search');           // busca por username
const page = parseInt(url.searchParams.get('page') ?? '1', 10);
const perPage = parseInt(url.searchParams.get('per_page') ?? '50', 10);

// Build query — RLS filtra por group_id automaticamente para group_admin
let query = supabase
  .from('members')
  .select('id, telegram_id, telegram_username, status, subscription_ends_at, created_at, group_id, groups(name)', { count: 'exact' });

// Filtro de status
if (statusFilter && statusFilter !== 'todos') {
  if (statusFilter === 'vencendo') {
    const now = new Date().toISOString();
    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query
      .eq('status', 'ativo')
      .gte('subscription_ends_at', now)
      .lte('subscription_ends_at', sevenDays);
  } else {
    query = query.eq('status', statusFilter);
  }
}

// Busca por username
if (search) {
  query = query.ilike('telegram_username', `%${search}%`);
}

// Paginacao
const from = (page - 1) * perPage;
query = query
  .order('created_at', { ascending: false })
  .range(from, from + perPage - 1);
```

### Pattern de status visual do membro

```typescript
// member-utils.ts
export type MemberDisplayStatus = 'trial' | 'ativo' | 'vencendo' | 'inadimplente' | 'removido' | 'expirado';

export const memberStatusConfig: Record<MemberDisplayStatus, { label: string; className: string }> = {
  trial:         { label: 'Trial',        className: 'bg-blue-100 text-blue-800' },
  ativo:         { label: 'Ativo',        className: 'bg-green-100 text-green-800' },
  vencendo:      { label: 'Vencendo',     className: 'bg-yellow-100 text-yellow-800' },
  inadimplente:  { label: 'Inadimplente', className: 'bg-red-100 text-red-800' },
  expirado:      { label: 'Expirado',     className: 'bg-red-100 text-red-800' },
  removido:      { label: 'Removido',     className: 'bg-gray-100 text-gray-800' },
};

// Calcular status visual (membro "ativo" com vencimento < 7 dias = "vencendo")
export function getDisplayStatus(member: { status: string; subscription_ends_at: string | null }): MemberDisplayStatus {
  if (member.status === 'ativo' && member.subscription_ends_at) {
    const now = new Date();
    const ends = new Date(member.subscription_ends_at);
    if (ends <= now) return 'expirado';
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (ends <= sevenDays) return 'vencendo';
  }
  return member.status as MemberDisplayStatus;
}
```

### Machine de estados de membro (referencia)

```
trial ──────► ativo ──────► inadimplente
  │             │                │
  │             │                ▼
  └─────────────┴──────────► removido
```

- `trial` — Periodo de trial (7 dias, gerenciado pelo Mercado Pago)
- `ativo` — Pagamento confirmado
- `inadimplente` — Pagamento falhou
- `removido` — Removido do grupo (estado final)
- **"vencendo"** — Status VISUAL: membro `ativo` com `subscription_ends_at` entre agora e agora + 7 dias (NAO e um status no banco)
- **"expirado"** — Status VISUAL: membro `ativo` com `subscription_ends_at` no passado (NAO e um status no banco)

### Sidebar: adicionar Membros

```typescript
// Sidebar.tsx - Adicionar apos Dashboard, visivel para AMBOS os roles
const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Membros', href: '/members', icon: '👤' },  // NOVO - ambos roles
  { name: 'Grupos', href: '/groups', icon: '👥', roles: ['super_admin'] },
  { name: 'Bots', href: '/bots', icon: '🤖', roles: ['super_admin'] },
  { name: 'Telegram', href: '/settings/telegram', icon: '📱', roles: ['super_admin'] },
];
```

Nota: sem propriedade `roles` = visivel para todos os roles (dashboard e membros).

### Performance (NFR-P4)

- Lista DEVE carregar em < 2 segundos com ate 10k registros
- RLS filtra no banco (nivel PostgreSQL) — nao na aplicacao
- Paginacao server-side (50 por pagina) reduz payload
- Indices existentes: `idx_members_group_id`, `idx_members_subscription_ends`, `idx_members_telegram_group`
- Usar `{ count: 'exact' }` no select para contagem total sem trazer todos os registros

### Super Admin vs Group Admin na pagina de membros

| Aspecto | Group Admin | Super Admin |
|---------|-------------|-------------|
| Membros visiveis | Apenas do seu grupo | Todos os grupos |
| Coluna "Grupo" | NAO (irrelevante) | SIM (nome do grupo) |
| Filtro por grupo | NAO | SIM (dropdown de grupos) |
| Filtro por status | SIM | SIM |
| Busca por nome | SIM | SIM |
| Paginacao | SIM | SIM |

### Learnings da Story 3.2 (ANTERIOR)

- **Dashboard group_admin** JA funciona: API diferencia por role, componente `GroupAdminDashboard` renderiza contadores de membros
- **API `/api/me`** retorna `{ userId, email, role, groupId }` — usar para determinar role no client
- **`createApiHandler`** com `allowedRoles` e obrigatorio — NAO criar API routes sem esse wrapper
- **Testes com vitest**: suites em `__tests__/` com mocks de supabase client
- **28/28 testes passando** na suite da story 3.2 (arquivos: `dashboard.test.ts` e `page.test.tsx`)
- **Race condition resolvida**: no dashboard, role e resolvida ANTES de buscar dados especificos do role

### Learnings da Story 3.1 (ANTERIOR)

- Migration 024 criou indices `idx_members_telegram_group` e `idx_members_telegram_null_group`
- `memberService.js` aceita `groupId` como parametro em todas as funcoes CRUD
- Backward compatible: `group_id = null` quando `GROUP_ID` nao esta definido
- Padrao de duplicata: verificar por `telegram_id` + `group_id` (nao apenas telegram_id)
- **720/720 testes passando** no bot (19 novos, 0 regressoes)

### Git Intelligence

Commits recentes relevantes:
- `34436b6` Merge PR #21: chore/bmad-sync-pending-changes
- `1464070` Merge PR #20: feature/story-3.1-multi-tenant-members
- `8b09e33` fix(story-3.1): resolve multi-tenant review findings and apply members migration
- `5a28882` docs(story): create Story 3.1 — adaptar registro de membros para multi-tenant

Branch atual: `feature/story-3.2-login-dashboard-group-admin` — **CRIAR nova branch** `feature/story-3.3-members-list` a partir de master (ou da branch mais recente merged).

### Project Structure Notes

- Admin Panel usa Next.js 16.x App Router com TypeScript
- Componentes em `src/components/features/<domain>/`
- API routes em `src/app/api/<domain>/route.ts`
- Tipos em `src/types/database.ts`
- Middleware em `src/middleware/`
- Tailwind CSS 4.x para estilizacao
- Naming: camelCase (JS/TS), PascalCase (React components), snake_case (DB)
- Testes com vitest em arquivos `*.test.ts` / `*.test.tsx`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Story-3.3]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Middleware-Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Authentication-Security]
- [Source: _bmad-output/project-context.md#Multi-Tenant-Rules]
- [Source: _bmad-output/project-context.md#Critical-Implementation-Rules]
- [Source: admin-panel/src/middleware/api-handler.ts]
- [Source: admin-panel/src/middleware/tenant.ts]
- [Source: admin-panel/src/types/database.ts]
- [Source: admin-panel/src/components/layout/Sidebar.tsx]
- [Source: admin-panel/src/app/api/dashboard/stats/route.ts]
- [Source: admin-panel/src/lib/format-utils.ts]
- [Source: admin-panel/src/components/features/groups/group-utils.ts]
- [Source: sql/migrations/005_membership_tables.sql]
- [Source: sql/migrations/019_multitenant.sql]
- [Source: sql/migrations/024_members_multitenant_unique.sql]
- [Source: _bmad-output/implementation-artifacts/3-2-login-e-dashboard-do-admin-de-grupo.md]
- [Source: _bmad-output/implementation-artifacts/3-1-adaptar-registro-de-membros-para-multi-tenant.md]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex (CLI)

### Debug Log References

- Branch criada: `feature/story-3.3-members-list`
- Consulta SQL de validação do schema executada:
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'members' AND column_name IN ('vencimento_at', 'subscription_ends_at');`
  Resultado: `subscription_ends_at`
- Testes executados:
  - `npm test -- src/app/api/__tests__/members.test.ts`
  - `npm test -- src/components/features/members/member-utils.test.ts src/components/features/members/MemberList.test.tsx`
  - `npm test -- src/app/(auth)/members/page.test.tsx`
  - `npm test -- src/components/layout/Sidebar.test.tsx`
  - `npm test` (suite completa `admin-panel`: 390/390 passando)
- Lint:
  - `npm run lint` (falhas pré-existentes em arquivos fora do escopo da Story 3.3)
  - `npx eslint` nos arquivos alterados da Story 3.3 (sem erros)

### Completion Notes List

- ✅ Implementada API `GET /api/members` com `createApiHandler`, filtros (`status`, `search`), paginação e isolamento por tenant com suporte a `group_admin` e `super_admin`.
- ✅ Adicionados tipos `Member` e `MemberListItem` em `types/database.ts`.
- ✅ Criados `member-utils.ts` e `MemberList.tsx` com status visual (`vencendo`/`expirado`) e badge por cor.
- ✅ Criada página client `/members` com header, contadores, filtros, busca e paginação.
- ✅ Sidebar atualizada com item `Membros` visível para ambos os roles.
- ✅ Cobertura de testes adicionada para rota, utilitários, lista, página e sidebar.
- ⚠️ Detectado no ambiente que a coluna correta é `subscription_ends_at`; mantido registro de possível bug legado em `admin-panel/src/app/api/dashboard/stats/route.ts` que ainda consulta `vencimento_at`.

### File List

- _bmad-output/implementation-artifacts/sprint-status.yaml
- admin-panel/src/app/api/members/route.ts
- admin-panel/src/app/api/__tests__/members.test.ts
- admin-panel/src/types/database.ts
- admin-panel/src/types/database.test.ts
- admin-panel/src/components/features/members/member-utils.ts
- admin-panel/src/components/features/members/member-utils.test.ts
- admin-panel/src/components/features/members/MemberList.tsx
- admin-panel/src/components/features/members/MemberList.test.tsx
- admin-panel/src/app/(auth)/members/page.tsx
- admin-panel/src/app/(auth)/members/page.test.tsx
- admin-panel/src/components/layout/Sidebar.tsx
- admin-panel/src/components/layout/Sidebar.test.tsx

### Change Log

- 2026-02-09: Implementada Story 3.3 (lista de membros com status e vencimentos), incluindo API, UI, tipos, sidebar e testes.
- 2026-02-09: Code review fixes: contadores server-side na API (H1/M3), fix precedencia operador (M2), teste performance corrigido (M4), teste sidebar com assertions negativas (L2), File List atualizada (M1).
