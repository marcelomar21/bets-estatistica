# Story 3.2: Login e Dashboard do Admin de Grupo

Status: ready-for-dev

## Story

As a **Admin de Grupo (Influencer)**,
I want logar no painel e ver o dashboard do meu grupo,
so that eu tenha visibilidade da minha operação.

## Acceptance Criteria

1. **Given** um Admin de Grupo criado durante onboarding (Epic 2)
   **When** faz login com email/senha no painel (FR39)
   **Then** é redirecionado para `/dashboard`

2. **Given** Admin de Grupo logado
   **When** acessa `/dashboard`
   **Then** o dashboard mostra dados **APENAS do seu grupo** (FR40, FR43)

3. **Given** Admin de Grupo no dashboard
   **When** página carrega
   **Then** vê contagem de membros: total, em trial, ativos pagantes (FR41)

4. **Given** Admin de Grupo no dashboard
   **When** página carrega
   **Then** vê card com nome do grupo e status

5. **Given** Admin de Grupo no dashboard
   **When** acessa navegação
   **Then** **NÃO** vê menu de "Grupos", "Bots" ou funcionalidades de Super Admin

6. **Given** Admin de Grupo no dashboard
   **When** página carrega
   **Then** painel carrega em < 3 segundos (NFR-P3)

7. **Given** qualquer requisição de API do Admin de Grupo
   **When** middleware `withTenant()` executa
   **Then** filtra automaticamente por `group_id` do usuário

## Tasks / Subtasks

- [ ] Task 1: Atualizar API `/api/dashboard/stats` para retornar dados diferenciados por role (AC: #2, #3, #7)
  - [ ] 1.1 Adicionar branch condicional: `super_admin` (lógica atual) vs `group_admin` (nova lógica)
  - [ ] 1.2 Para `group_admin`: query do grupo único via `groupFilter`
  - [ ] 1.3 Para `group_admin`: query de membros agrupados por status (trial, ativo, vencendo em 7 dias)
  - [ ] 1.4 Retornar `group` (singular) para `group_admin` em vez de `groups` (array)
  - [ ] 1.5 Testes unitários da rota para ambos os roles

- [ ] Task 2: Atualizar tipos TypeScript (AC: #2, #3)
  - [ ] 2.1 Criar tipo `GroupAdminDashboardData` em `types/database.ts`
  - [ ] 2.2 Adicionar `members: { total, trial, ativo, vencendo }` ao summary do group_admin

- [ ] Task 3: Criar componente `GroupAdminDashboard` (AC: #2, #3, #4)
  - [ ] 3.1 Criar `admin-panel/src/components/features/dashboard/GroupAdminDashboard.tsx`
  - [ ] 3.2 Card do grupo com nome e status badge (reutilizar `statusConfig` de `group-utils.ts`)
  - [ ] 3.3 4 StatCards: "Membros Ativos" (total), "Em Trial", "Pagantes", "Vencendo em 7d"
  - [ ] 3.4 Integrar `NotificationsPanel` existente

- [ ] Task 4: Modificar `/dashboard/page.tsx` para renderização condicional por role (AC: #1, #2, #5)
  - [ ] 4.1 Obter role do usuário (já disponível via auth layout)
  - [ ] 4.2 Renderizar `GroupAdminDashboard` para `group_admin`
  - [ ] 4.3 Manter dashboard atual para `super_admin`

- [ ] Task 5: Verificar sidebar filtering (AC: #5)
  - [ ] 5.1 Confirmar que `Sidebar.tsx` já filtra menus por role (JÁ IMPLEMENTADO)
  - [ ] 5.2 Verificar que `group_admin` NÃO vê Grupos, Bots, Telegram

- [ ] Task 6: Performance e testes end-to-end (AC: #6)
  - [ ] 6.1 Testar login como `group_admin` e redirecionamento para `/dashboard`
  - [ ] 6.2 Verificar que dashboard carrega em < 3 segundos
  - [ ] 6.3 Verificar isolamento total de dados (sem vazamento entre grupos)

## Dev Notes

### O que JÁ EXISTE (NÃO recriar)

**Infraestrutura completa de multi-tenant:**
- `admin-panel/src/middleware/tenant.ts` — `withTenant()` retorna `{ user, role, groupFilter }`
- `admin-panel/src/middleware/api-handler.ts` — `createApiHandler()` wrapper obrigatório para todas as rotas
- `admin-panel/src/middleware/guards.ts` — Guards de role

**Autenticação e autorização:**
- `admin-panel/src/lib/supabase.ts` — Client-side Supabase
- `admin-panel/src/lib/supabase-server.ts` — Server-side Supabase
- `admin-panel/src/app/(auth)/layout.tsx` — Busca role do `admin_users` e redireciona se não autenticado
- Login funcional em `/login` com Supabase Auth

**Layout e navegação:**
- `admin-panel/src/components/layout/Sidebar.tsx` — JÁ filtra menus por role (`roles?: ('super_admin' | 'group_admin')[]`)
- `admin-panel/src/components/layout/LayoutShell.tsx` — Passa `role` ao Sidebar
- `admin-panel/src/components/layout/Header.tsx` — Email do usuário + logout

**Dashboard atual (Super Admin):**
- `admin-panel/src/app/(auth)/dashboard/page.tsx` — Client component que busca `/api/dashboard/stats`
- `admin-panel/src/app/api/dashboard/stats/route.ts` — Retorna `DashboardSummary` + `groups[]`
- `admin-panel/src/components/features/dashboard/StatCard.tsx` — Componente de card reutilizável
- `admin-panel/src/components/features/dashboard/NotificationsPanel.tsx` — Painel de notificações

**API Routes existentes:**
- `GET /api/me` — Retorna `userId`, `email`, `role`, `groupId`
- `GET /api/dashboard/stats` — Stats do dashboard (PRECISA ser modificado)
- `GET/PATCH /api/notifications` — Notificações (já filtrado por RLS)

**Tipos:**
- `admin-panel/src/types/database.ts` — `AdminUser`, `Group`, `DashboardSummary`, `DashboardGroupCard`

**RLS Policies ativas (tabela members):**
- `super_admin` vê todos os membros
- `group_admin` vê apenas membros do seu `group_id`
- Enforced via `public.get_my_role()` e `public.get_my_group_id()` (SECURITY DEFINER)

### O que PRECISA ser criado/modificado

1. **MODIFICAR** `admin-panel/src/app/api/dashboard/stats/route.ts`:
   - Adicionar path para `group_admin` com query de membros por status
   - Retornar `{ summary, group (singular), alerts, unread_count }` para `group_admin`

2. **MODIFICAR** `admin-panel/src/types/database.ts`:
   - Adicionar tipo `GroupAdminDashboardData`

3. **CRIAR** `admin-panel/src/components/features/dashboard/GroupAdminDashboard.tsx`:
   - Dashboard específico do Admin de Grupo

4. **MODIFICAR** `admin-panel/src/app/(auth)/dashboard/page.tsx`:
   - Renderização condicional por role

### Padrão de API obrigatório

```typescript
// TODAS as rotas DEVEM usar createApiHandler
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(async (req, context) => {
  const { supabase, role, groupFilter } = context;
  // groupFilter = null para super_admin, UUID para group_admin

  if (role === 'group_admin') {
    // Query filtrada pelo groupFilter
  }

  return NextResponse.json({ success: true, data: { ... } });
});
```

### Query de membros por status (group_admin)

```typescript
// Contar membros por status para o grupo
const { data: members } = await supabase
  .from('members')
  .select('status, vencimento_at')
  .eq('group_id', groupFilter);

const now = new Date();
const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

const memberSummary = {
  total: members?.filter(m => ['trial', 'ativo'].includes(m.status)).length ?? 0,
  trial: members?.filter(m => m.status === 'trial').length ?? 0,
  ativo: members?.filter(m => m.status === 'ativo').length ?? 0,
  vencendo: members?.filter(m =>
    m.status === 'ativo' && m.vencimento_at &&
    new Date(m.vencimento_at) <= sevenDays &&
    new Date(m.vencimento_at) > now
  ).length ?? 0,
};
```

### Machine de estados de membro (referência)

```
trial ──────► ativo ──────► inadimplente
  │             │                │
  │             │                ▼
  └─────────────┴──────────► removido
```

- `trial` — Período de trial de 7 dias
- `ativo` — Pagamento confirmado
- `inadimplente` — Pagamento falhou, em cobrança
- `removido` — Removido do grupo (estado final)
- **"Vencendo"** = membro `ativo` com `vencimento_at` entre agora e agora + 7 dias

### Componente GroupAdminDashboard — Estrutura

```tsx
// Reutilizar componentes existentes:
import { StatCard } from '@/components/features/dashboard/StatCard';
import { NotificationsPanel } from '@/components/features/dashboard/NotificationsPanel';

// Para badge de status do grupo, reutilizar:
// admin-panel/src/components/features/groups/group-utils.ts → statusConfig
```

### Performance (NFR-P3)

- Dashboard DEVE carregar em < 3 segundos
- RLS filtra no banco, não na aplicação — performance garantida
- Para 10k membros, query com count por status deve ser rápida (indexed)
- Migration 024 já criou índices relevantes para `members`

### Project Structure Notes

- Admin Panel usa Next.js 16.x App Router com TypeScript
- Componentes em `src/components/features/<domain>/`
- API routes em `src/app/api/<domain>/route.ts`
- Tipos em `src/types/database.ts`
- Middleware em `src/middleware/`
- Tailwind CSS 4.x para estilização
- Naming: camelCase (JS/TS), PascalCase (React components), snake_case (DB)

### Learnings da Story 3.1

- Migration 024 criou índices `idx_members_telegram_group` e `idx_members_telegram_null_group`
- `lib/config.js` agora expõe `groupId` via `membership.groupId`
- `memberService.js` aceita `groupId` como parâmetro em todas as funções CRUD
- Backward compatible: `group_id = null` quando `GROUP_ID` não está definido
- Padrão de duplicata: verificar por `telegram_id` + `group_id` (não apenas telegram_id)
- 720/720 testes passando (19 novos, 0 regressões)

### Git Intelligence

Commits recentes relevantes:
- `5a28882` docs(story): create Story 3.1 — adaptar registro de membros para multi-tenant
- `c5fc1dc` fix(admin): fix unicode escapes in NotificationsPanel display
- `0d1c724` Merge PR #19: feature/telegram-mtproto-automation
- `a781bfd` feat(admin): validate bot token via getMe before saving to pool
- `f59176a` fix(admin): resolve GramJS StringSession dual-package hazard in Next.js

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Story-3.2]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Authentication-Security]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Middleware-Pattern]
- [Source: _bmad-output/planning-artifacts/prd.md#FR39-FR43]
- [Source: _bmad-output/project-context.md#Multitenant-Rules]
- [Source: admin-panel/src/middleware/tenant.ts]
- [Source: admin-panel/src/app/api/dashboard/stats/route.ts]
- [Source: admin-panel/src/components/layout/Sidebar.tsx]
- [Source: _bmad-output/implementation-artifacts/3-1-adaptar-registro-de-membros-para-multi-tenant.md]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
