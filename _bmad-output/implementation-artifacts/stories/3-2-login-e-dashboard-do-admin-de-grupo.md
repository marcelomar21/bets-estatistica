# Story 3.2: Login e Dashboard do Admin de Grupo

Status: done

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

- [x] Task 1: Atualizar API `/api/dashboard/stats` para retornar dados diferenciados por role (AC: #2, #3, #7)
  - [x] 1.1 Adicionar branch condicional: `super_admin` (lógica atual) vs `group_admin` (nova lógica)
  - [x] 1.2 Para `group_admin`: query do grupo único via `groupFilter`
  - [x] 1.3 Para `group_admin`: query de membros agrupados por status (trial, ativo, vencendo em 7 dias)
  - [x] 1.4 Retornar `group` (singular) para `group_admin` em vez de `groups` (array)
  - [x] 1.5 Testes unitários da rota para ambos os roles

- [x] Task 2: Atualizar tipos TypeScript (AC: #2, #3)
  - [x] 2.1 Criar tipo `GroupAdminDashboardData` em `types/database.ts`
  - [x] 2.2 Adicionar `members: { total, trial, ativo, vencendo }` ao summary do group_admin

- [x] Task 3: Criar componente `GroupAdminDashboard` (AC: #2, #3, #4)
  - [x] 3.1 Criar `admin-panel/src/components/features/dashboard/GroupAdminDashboard.tsx`
  - [x] 3.2 Card do grupo com nome e status badge (reutilizar `statusConfig` de `group-utils.ts`)
  - [x] 3.3 4 StatCards: "Membros Ativos" (total), "Em Trial", "Pagantes", "Vencendo em 7d"
  - [x] 3.4 Integrar `NotificationsPanel` existente

- [x] Task 4: Modificar `/dashboard/page.tsx` para renderização condicional por role (AC: #1, #2, #5)
  - [x] 4.1 Obter role do usuário (via `/api/me` fetch)
  - [x] 4.2 Renderizar `GroupAdminDashboard` para `group_admin`
  - [x] 4.3 Manter dashboard atual para `super_admin`

- [x] Task 5: Verificar sidebar filtering (AC: #5)
  - [x] 5.1 Confirmar que `Sidebar.tsx` já filtra menus por role (JÁ IMPLEMENTADO)
  - [x] 5.2 Verificar que `group_admin` NÃO vê Grupos, Bots, Telegram

- [x] Task 6: Performance e testes end-to-end (AC: #6)
  - [x] 6.1 Testar login como `group_admin` e redirecionamento para `/dashboard`
  - [x] 6.2 Verificar que dashboard carrega em < 3 segundos
  - [x] 6.3 Verificar isolamento total de dados (sem vazamento entre grupos)

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

Claude Opus 4.6

### Debug Log References

- Nenhum issue de debug significativo. Implementacao fluiu sem bloqueios.

### Completion Notes List

- Task 1: API `/api/dashboard/stats` diferencia `super_admin` vs `group_admin` via `handleGroupAdmin()` e agora trata erro de query de unread notifications de forma explicita.
- Task 1 (hardening): unread notifications de `group_admin` agora usa filtro explicito por `group_id` alem de RLS.
- Task 1 (hardening adicional): fluxo `super_admin` tambem passou a tratar erro de unread notifications como `DB_ERROR` (sem sucesso silencioso).
- Task 2: Tipos `GroupAdminDashboardData` e `GroupAdminMemberSummary` seguem em `database.ts` com summary `{ total, trial, ativo, vencendo }`.
- Task 3: `GroupAdminDashboard` mantido com card de grupo, 4 StatCards e `NotificationsPanel`.
- Task 4: `page.tsx` foi ajustado para resolver role primeiro (`/api/me`) e evitar race condition de shape mismatch; para `group_admin`, renderiza diretamente `GroupAdminDashboard` sem fetches redundantes do fluxo `super_admin`.
- Task 5: Sidebar continua filtrando menu por role (`group_admin` sem Grupos/Bots/Telegram).
- Task 6.1: Coberto por fluxo existente de login para `/dashboard` e teste novo de renderizacao especifica para `group_admin` no dashboard.
- Task 6.2: Adicionado teste de performance de resumo `group_admin` com 10k membros em < 3s (camada de rota).
- Task 6.3: Isolamento validado por testes de rota para payload de `group_admin` sem campos de super admin e com dados filtrados.
- Testes executados nesta rodada: `vitest` em `dashboard.test.ts` e `page.test.tsx` com 28/28 passando.

### File List

- `admin-panel/src/app/api/dashboard/stats/route.ts` (modificado) - Branch condicional group_admin com handleGroupAdmin()
- `admin-panel/src/types/database.ts` (modificado) - Tipos GroupAdminDashboardData e GroupAdminMemberSummary
- `admin-panel/src/components/features/dashboard/GroupAdminDashboard.tsx` (novo) - Dashboard do Admin de Grupo
- `admin-panel/src/app/(auth)/dashboard/page.tsx` (modificado) - Renderizacao condicional por role via /api/me
- `admin-panel/src/app/api/__tests__/dashboard.test.ts` (modificado) - Testes ampliados para group_admin (inclui erro unread notifications e budget de performance)
- `admin-panel/src/app/(auth)/dashboard/page.test.tsx` (modificado) - Testes atualizados para /api/me e fluxo especifico de group_admin

### Senior Developer Review (AI)

- 2026-02-09: Revisao adversarial executada com 5 achados. Correcoes aplicadas para todos os itens reportados.
- Corrigido risco critico de race condition no `DashboardPage` (role resolvida antes de carregar dados de super admin).
- Endurecido isolamento no dashboard de `group_admin` com filtro explicito de `group_id` em unread notifications.
- Adicionado tratamento de erro de unread notifications para evitar sucesso silencioso com contagem incorreta (group_admin e super_admin).
- Suite de testes da story atualizada e validada com 28/28 passando nos arquivos alterados.

## Change Log

- 2026-02-09: Implementacao completa da Story 3.2 - Login e Dashboard do Admin de Grupo. API diferenciada por role, componente GroupAdminDashboard, renderizacao condicional, sidebar filtering verificado. 357/357 testes passando.
- 2026-02-09: Correcoes de code review aplicadas: eliminacao de race condition no dashboard, hardening multi-tenant em notifications para group_admin, tratamento de erro de unread count (group_admin/super_admin) e ampliacao de testes (28/28 passing na suite alvo).
