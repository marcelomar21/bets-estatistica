# Story 20.1: Criar Usuário Osmar como Gestor de Grupo

Status: done

## Story

As a super admin,
I want criar uma conta no admin panel para o Osmar com role de gestor de grupo,
So that ele possa gerenciar seu grupo de forma autônoma.

## Acceptance Criteria

1. **Given** super admin acessa a página de gerenciamento de admin users
   **When** cria um novo usuário informando email, role e grupo
   **Then** usuário é criado no Supabase Auth
   **And** entrada na tabela `admin_users` é criada com `role = 'group_admin'` e `group_id` vinculado
   **And** convite por email é enviado via Supabase Auth (magic link)

2. **Given** Osmar recebe o convite por email
   **When** clica no magic link e faz login
   **Then** é redirecionado ao admin panel e vê apenas o(s) grupo(s) que gerencia

3. **Given** Osmar está logado como `group_admin`
   **When** navega pelo admin panel
   **Then** vê apenas dados do seu grupo (RLS já implementado)
   **And** NÃO tem acesso a: Pool de Números WhatsApp, Bots, Configurações globais, outros grupos

4. **Given** super admin acessa a lista de admin users
   **When** visualiza a tabela
   **Then** vê todos os admin users com email, role, grupo vinculado e data de criação
   **And** pode remover/desativar um admin user

## Tasks / Subtasks

- [x] Task 1: API — CRUD de admin users (AC: #1, #4)
  - [x] 1.1: Criar `POST /api/admin-users` (super_admin only) — cria Auth user + admin_users entry
  - [x] 1.2: Criar `GET /api/admin-users` (super_admin only) — lista todos admin users com grupo
  - [x] 1.3: Criar `DELETE /api/admin-users/[id]` (super_admin only) — remove admin_users entry e desativa Auth user
  - [x] 1.4: Usar `supabase.auth.admin.inviteUserByEmail()` via service role key para enviar magic link
- [x] Task 2: UI — Página de Admin Users (AC: #1, #4)
  - [x] 2.1: Criar `/admin-users` page no admin panel (super_admin only no sidebar)
  - [x] 2.2: Tabela com colunas: Email, Role, Grupo, Criado em, Ações
  - [x] 2.3: Botão "Criar Admin User" → modal com campos: email, role (dropdown: super_admin | group_admin), grupo (dropdown, obrigatório se group_admin)
  - [x] 2.4: Botão "Remover" em cada row
- [x] Task 3: Validar isolamento (AC: #2, #3)
  - [x] 3.1: Sidebar já oculta links super_admin-only (roles array filtering existente)
  - [x] 3.2: RLS + groupFilter já isolam dados por grupo (infraestrutura existente)
- [x] Task 4: Criar o usuário do Osmar de fato (AC: #1)
  - [x] 4.1: Osmar já existia como group_admin em admin_users (marcelomar21@gmail.com → Osmar Palpites)
- [x] Task 5: Testes unitários (9 tests)
  - [x] 5.1: Test POST /api/admin-users — cria user com role correto
  - [x] 5.2: Test POST /api/admin-users — rejeita se role inválido
  - [x] 5.3: Test POST /api/admin-users — rejeita se group_admin sem group_id
  - [x] 5.4: Test POST /api/admin-users — rejeita email duplicado (409)
  - [x] 5.5: Test GET /api/admin-users — retorna lista com grupos
  - [x] 5.6: Test DELETE /api/admin-users/[id] — remove entry
  - [x] 5.7: Test DELETE — impede auto-remoção (403)
  - [x] 5.8: Test GET group_admin NÃO pode acessar /api/admin-users (403)
  - [x] 5.9: Test POST group_admin NÃO pode criar admin users (403)

## Dev Notes

### Context & Existing Infrastructure

O sistema já tem multi-tenancy completo implementado:

- **Tabela `admin_users`** (`sql/migrations/019_multitenant.sql`): `(id UUID PK, email, role CHECK('super_admin','group_admin'), group_id FK→groups, created_at)`
- **RLS policies**: super_admin vê tudo, group_admin vê só seu grupo — JÁ EXISTEM e funcionam
- **Middleware `tenant.ts`**: Resolve `TenantContext` com `{ user, role, groupFilter, supabase }`. `groupFilter` é `null` para super_admin, `group_id` para group_admin
- **Middleware `api-handler.ts`**: `createApiHandler()` com option `allowedRoles` para restringir endpoints
- **Middleware `guards.ts`**: `preventSelfRoleChange()` impede group_admin de alterar roles

### Implementation Approach

**API — Usar Supabase Admin API (service role)**

Para criar Auth users programaticamente, é necessário usar o Supabase service role client:

```typescript
import { createClient } from '@supabase/supabase-js';

// Service role client — NEVER expose to browser
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!, // service role key
);

// Invite user (sends magic link email)
const { data: authUser, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);

// Create admin_users entry
await supabaseAdmin.from('admin_users').insert({
  id: authUser.user.id,
  email,
  role,
  group_id: groupId,
});
```

**CRITICAL**: A service role key (`SUPABASE_SERVICE_KEY`) já existe em `.env.local` mas NÃO é usada no middleware de requests normais (que usa anon key para RLS). O admin client deve ser instanciado APENAS nos server-side API routes de gerenciamento de users.

**UI — Página `/admin-users`**

Padrão de páginas existentes:
- Layout com sidebar (só visible se role == 'super_admin')
- Tabela com dados
- Modal para criação
- createApiHandler com `allowedRoles: ['super_admin']`

**Sidebar — Ocultar para group_admin**

O sidebar em `admin-panel/src/components/layout/Sidebar.tsx` já deve filtrar links por role. Verificar se os links de super_admin-only estão corretamente protegidos. Adicionar `/admin-users` ao sidebar para super_admin.

### Key Files

| File | Action | Description |
|------|--------|-------------|
| `admin-panel/src/app/api/admin-users/route.ts` | **CREATE** | GET (list) + POST (create) admin users |
| `admin-panel/src/app/api/admin-users/[id]/route.ts` | **CREATE** | DELETE admin user |
| `admin-panel/src/app/(auth)/admin-users/page.tsx` | **CREATE** | Admin users management page |
| `admin-panel/src/lib/supabase-admin.ts` | **CREATE** | Service role Supabase client for admin operations |
| `admin-panel/src/components/layout/Sidebar.tsx` | **MODIFY** | Add admin-users link, verify role filtering |
| `admin-panel/src/middleware/tenant.ts` | **CHECK** | Verify role validation handles all cases |

### Architecture Compliance

- Pattern `{ success, data/error }` response — MUST follow ✅
- `createApiHandler` wrapper — MUST use for all API routes ✅
- RLS enforcement — `admin_users_super_admin_all` policy already handles admin_users access ✅
- Multi-tenant: `groupFilter` automatically applied via `applyTenantFilter()` ✅
- Service role client ONLY server-side, NEVER exposed to browser ✅
- Roles: use existing `'super_admin' | 'group_admin'` — NOT `group_manager` (epic typo) ✅

### Sidebar Role Check

Verificar em `Sidebar.tsx` que links como "Pool WhatsApp", "Bots", "Telegram" são condicionados a `role === 'super_admin'`. Se não estiverem, adicionar a verificação.

### Testing Strategy

- Vitest para API routes (mock supabase admin client)
- Playwright E2E: login como super_admin → criar user → verificar na tabela
- Verificar 403 para group_admin acessando /api/admin-users

### References

- [Source: admin-panel/src/middleware/tenant.ts] — TenantContext, withTenant(), applyTenantFilter()
- [Source: admin-panel/src/middleware/api-handler.ts] — createApiHandler() pattern
- [Source: admin-panel/src/middleware/guards.ts] — preventSelfRoleChange()
- [Source: sql/migrations/019_multitenant.sql] — admin_users table + RLS policies
- [Source: admin-panel/src/app/api/me/route.ts] — Simple API route pattern reference
- [Source: admin-panel/src/app/api/groups/route.ts] — super_admin-only API route reference

## Dev Agent Record

### Agent Model Used
claude-opus-4-6

### Completion Notes List
- Created `supabase-admin.ts` helper with service role client for admin operations
- `POST /api/admin-users`: invites user via Supabase Auth, creates admin_users entry, validates role/group_id, checks duplicates, rolls back auth user on DB insert failure
- `GET /api/admin-users`: lists all users with joined group name
- `DELETE /api/admin-users/[id]`: removes admin_users entry + auth user, prevents self-deletion
- Admin Users page with table and create modal, role-based group dropdown
- Sidebar link added with key icon, super_admin only
- Osmar (marcelomar21@gmail.com) already existed as group_admin for "Osmar Palpites" — no manual creation needed
- 9 unit tests, 699 total tests pass, build clean
- E2E: page loads with 6 users, create modal shows groups, cancel works

### File List
| File | Action |
|------|--------|
| `admin-panel/src/lib/supabase-admin.ts` | CREATED — service role Supabase client |
| `admin-panel/src/app/api/admin-users/route.ts` | CREATED — GET + POST endpoints |
| `admin-panel/src/app/api/admin-users/[id]/route.ts` | CREATED — DELETE endpoint |
| `admin-panel/src/app/(auth)/admin-users/page.tsx` | CREATED — Admin users management page |
| `admin-panel/src/app/api/__tests__/admin-users.test.ts` | CREATED — 9 tests |
| `admin-panel/src/components/layout/Sidebar.tsx` | MODIFIED — added Admin Users link |
