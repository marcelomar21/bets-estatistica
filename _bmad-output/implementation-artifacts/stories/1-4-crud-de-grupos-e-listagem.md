# Story 1.4: CRUD de Grupos e Listagem

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want criar e listar grupos de influencers no painel,
So that eu possa gerenciar os tenants da plataforma.

## Acceptance Criteria

1. **Given** Super Admin esta logado no painel **When** acessa `/groups` **Then** ve lista de todos os grupos com nome, status e data de criacao (FR2)
2. **Given** Super Admin esta na pagina `/groups` **When** clica em "Novo Grupo" **Then** pode criar um grupo com nome e configuracoes basicas (FR1)
3. **Given** Super Admin cria um novo grupo **When** o formulario e submetido **Then** grupo e criado no banco com `status = 'active'` (FR1)
4. **Given** qualquer grupo existe no banco **When** Super Admin acessa `/groups` **Then** dados do grupo sao isolados por RLS (FR5)
5. **Given** qualquer operacao em `/groups` ou `/api/groups` **When** API Route e chamada **Then** usa `createApiHandler()` com `{ allowedRoles: ['super_admin'] }` (enforcement obrigatorio)
6. **Given** um Group Admin tenta acessar `/groups` **When** a API Route verifica role **Then** retorna 403 `{ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }`
7. **Given** Super Admin esta na pagina `/groups` **When** ve a lista **Then** cada grupo mostra: nome, status (badge colorido), data de criacao formatada

## Tasks / Subtasks

- [x] Task 1: Criar API Routes para Grupos (AC: #1, #2, #3, #5, #6)
  - [x] 1.1: Criar `admin-panel/src/app/api/groups/route.ts` com:
    - `GET` handler via `createApiHandler({ allowedRoles: ['super_admin'] })` — lista todos os grupos ordenados por `created_at DESC`
    - `POST` handler via `createApiHandler({ allowedRoles: ['super_admin'] })` — cria novo grupo com validacao Zod
  - [x] 1.2: No `GET` handler:
    - Usar `context.supabase.from('groups').select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at').order('created_at', { ascending: false })`
    - NAO precisa de `applyTenantFilter()` na tabela `groups` (super_admin only, sem group_id filter)
    - Retornar `{ success: true, data: groups }`
  - [x] 1.3: No `POST` handler:
    - Validar body com Zod: `{ name: string (required, min 2 chars), telegram_group_id?: number, telegram_admin_group_id?: number }`
    - Inserir grupo com `status: 'active'` (default na tabela)
    - Retornar `{ success: true, data: group }` com status 201
    - Se nome duplicado ou erro de DB, retornar `{ success: false, error: { code: 'VALIDATION_ERROR', message } }` com status 400
  - [x] 1.4: Criar `admin-panel/src/app/api/groups/[groupId]/route.ts` com:
    - `GET` handler via `createApiHandler({ allowedRoles: ['super_admin'] })` — detalhes de um grupo pelo ID
    - `PUT` handler via `createApiHandler({ allowedRoles: ['super_admin'] })` — atualizar dados do grupo
  - [x] 1.5: No `GET /api/groups/[groupId]` handler:
    - Extrair `groupId` dos params
    - Buscar grupo por ID
    - Se nao encontrado, retornar 404 `{ success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } }`
  - [x] 1.6: No `PUT /api/groups/[groupId]` handler:
    - Validar body com Zod: campos opcionais `name`, `telegram_group_id`, `telegram_admin_group_id`, `status` (apenas valores validos do CHECK constraint)
    - Atualizar grupo
    - Retornar `{ success: true, data: updatedGroup }`

- [x] Task 2: Criar pagina de listagem `/groups` (AC: #1, #4, #7)
  - [x] 2.1: Criar `admin-panel/src/app/(auth)/groups/page.tsx` como Server Component
    - Buscar grupos via Supabase server client (createClient do `@/lib/supabase-server`)
    - Renderizar lista de grupos em cards/tabela
    - Botao "Novo Grupo" que navega para `/groups/new`
  - [x] 2.2: Criar componente `admin-panel/src/components/features/groups/GroupCard.tsx`:
    - Props: `group: Group` (tipo de `@/types/database`)
    - Exibir: nome, status (badge colorido), data de criacao formatada em PT-BR
    - Badge de status: `active` = verde, `paused` = amarelo, `inactive` = cinza, `creating` = azul, `failed` = vermelho
    - Clicar no card navega para `/groups/[groupId]`
  - [x] 2.3: Exibir estado vazio quando nao ha grupos: mensagem "Nenhum grupo cadastrado" com CTA para criar

- [x] Task 3: Criar pagina de criacao `/groups/new` (AC: #2, #3)
  - [x] 3.1: Criar `admin-panel/src/app/(auth)/groups/new/page.tsx` como Client Component
    - Formulario com campos: nome (obrigatorio), Telegram Group ID (opcional), Telegram Admin Group ID (opcional)
    - Submit faz `POST /api/groups` via fetch
    - Sucesso: redireciona para `/groups` com toast/feedback
    - Erro: exibe mensagem inline
  - [x] 3.2: Criar componente `admin-panel/src/components/features/groups/GroupForm.tsx`:
    - Props: `onSubmit`, `loading`, `error`
    - Inputs com labels em PT-BR
    - Botao submit com estado de loading
    - Validacao client-side basica (nome obrigatorio, min 2 chars)

- [x] Task 4: Criar pagina de detalhes `/groups/[groupId]` (AC: #1)
  - [x] 4.1: Criar `admin-panel/src/app/(auth)/groups/[groupId]/page.tsx` como Server Component
    - Buscar grupo por ID via Supabase server client
    - Exibir detalhes do grupo: nome, status, telegram IDs, checkout URL, data de criacao
    - Botao "Editar" (funcionalidade de edicao completa sera Story 2.1, mas base deve estar preparada)
    - Link para voltar a `/groups`

- [x] Task 5: Atualizar navegacao do Sidebar (AC: #1, #6)
  - [x] 5.1: Atualizar `admin-panel/src/components/layout/Sidebar.tsx`:
    - Adicionar item "Grupos" com icon adequado, href `/groups`, APENAS para super_admin
    - O Sidebar precisa receber prop `role` para condicionar itens visiveis
    - Atualizar `SidebarProps` para incluir `role?: 'super_admin' | 'group_admin'`
  - [x] 5.2: Atualizar `admin-panel/src/app/(auth)/layout.tsx`:
    - Buscar role do usuario autenticado (query `admin_users`)
    - Passar `role` para o `LayoutShell` e de la para o `Sidebar`
  - [x] 5.3: Atualizar `LayoutShell.tsx` para receber e repassar `role` ao `Sidebar`

- [x] Task 6: Testes (AC: #1-#7)
  - [x] 6.1: Testes para API Routes `/api/groups`:
    - GET retorna lista de grupos para super_admin
    - POST cria grupo com dados validos
    - POST rejeita body sem nome (validation error)
    - Qualquer request sem auth retorna 401
    - Group admin recebe 403
  - [x] 6.2: Testes para API Route `/api/groups/[groupId]`:
    - GET retorna grupo existente
    - GET retorna 404 para grupo inexistente
    - PUT atualiza grupo
    - PUT com status invalido retorna erro
  - [x] 6.3: Testes de componentes:
    - GroupCard renderiza nome, status badge, data
    - GroupForm valida campos obrigatorios
    - Pagina `/groups` exibe estado vazio
  - [x] 6.4: Teste de enforcement: verificar que TODAS as novas API Routes usam `createApiHandler` com `allowedRoles: ['super_admin']`

## Dev Notes

### Contexto Critico - CRUD de Grupos e o Primeiro CRUD Real do Admin Panel

**Esta story e o primeiro CRUD completo do admin panel.** Ela estabelece os patterns que TODAS as futuras stories de CRUD devem seguir. Qualquer decisao aqui sera replicada em Stories 2.1 (editar grupos), 2.2 (bots), 3.3 (membros), etc.

### Stack Tecnologica Atual do Admin Panel

| Tecnologia | Versao | Notas |
|------------|--------|-------|
| Next.js | 16.1.6 | App Router (NAO Pages Router) |
| TypeScript | 5.x | Strict mode |
| Tailwind CSS | 4.x | Styling |
| @supabase/supabase-js | ^2.95.3 | Database client |
| @supabase/ssr | ^0.8.0 | Auth helpers para Next.js App Router |

### Middleware Disponivel (Story 1.3 — PRONTO)

**OBRIGATORIO usar em todas as API Routes:**

```typescript
// Rota protegida (super_admin only):
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (req, context) => {
    // context.user, context.role, context.groupFilter, context.supabase
    return NextResponse.json({ success: true, data: {...} });
  },
  { allowedRoles: ['super_admin'] }
);
```

**NAO criar API Routes sem wrapper.** O teste de enforcement da Story 1.3 ja valida isso automaticamente.

### Schema da Tabela groups (da Migration 019)

```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  bot_token VARCHAR,              -- Criptografado (NAO exibir na UI)
  telegram_group_id BIGINT UNIQUE,
  telegram_admin_group_id BIGINT,
  mp_product_id VARCHAR,          -- Preenchido no onboarding (Story 2.3)
  render_service_id VARCHAR,      -- Preenchido no onboarding (Story 2.3)
  checkout_url VARCHAR,           -- Preenchido no onboarding (Story 2.3)
  status VARCHAR DEFAULT 'active' CHECK (status IN ('creating', 'active', 'paused', 'inactive', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Campos que esta story EXPOE na UI:**
- `id` — UUID (para links/navegacao, nao exibir diretamente)
- `name` — Nome do grupo/influencer
- `status` — Badge colorido (active/paused/inactive/creating/failed)
- `telegram_group_id` — ID do grupo Telegram (opcional no formulario)
- `telegram_admin_group_id` — ID do grupo admin Telegram (opcional no formulario)
- `checkout_url` — Exibir como link na pagina de detalhes (se existir)
- `created_at` — Data formatada em PT-BR

**Campos que esta story NAO expoe:**
- `bot_token` — NUNCA exibir (seguranca - NFR-S2)
- `mp_product_id` — Criado automaticamente no onboarding
- `render_service_id` — Criado automaticamente no onboarding

### RLS Policies Existentes para groups

```sql
-- super_admin: CRUD completo
CREATE POLICY "groups_super_admin_all" ON groups
  FOR ALL USING (
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
  );

-- group_admin: apenas SELECT do seu proprio grupo
CREATE POLICY "groups_group_admin_select" ON groups
  FOR SELECT USING (
    id = (SELECT group_id FROM admin_users WHERE id = auth.uid())
  );
```

**Impacto:** Como estamos usando `createApiHandler({ allowedRoles: ['super_admin'] })`, group_admin nem chega ao handler (403 antes). Mas mesmo se chegasse, RLS no banco bloquearia escrita. Defesa em camadas.

### Tipo TypeScript Existente (de `@/types/database`)

```typescript
interface Group {
  id: string;
  name: string;
  bot_token: string | null;
  telegram_group_id: number | null;
  telegram_admin_group_id: number | null;
  mp_product_id: string | null;
  render_service_id: string | null;
  checkout_url: string | null;
  status: 'creating' | 'active' | 'paused' | 'inactive' | 'failed';
  created_at: string;
}
```

### Patterns Obrigatorios (do project-context.md)

**Response Format:**
```typescript
// Sucesso
return NextResponse.json({ success: true, data: {...} });

// Erro
return NextResponse.json(
  { success: false, error: { code: 'NOT_FOUND', message: '...' } },
  { status: 404 }
);
```

**Naming:**
- Arquivos TSX/TS: PascalCase para componentes (`GroupCard.tsx`), kebab-case para utils
- Tipos: PascalCase (`Group`, `GroupFormData`)
- Funcoes: camelCase (`createGroup`, `getGroupById`)

**Anti-patterns PROIBIDOS:**
```typescript
// NUNCA: API Route sem createApiHandler
export const GET = async (req: NextRequest) => { ... };

// NUNCA: Retornar dados sem wrapper { success, data }
return NextResponse.json(groups);

// NUNCA: Expor bot_token na resposta da API
const { data } = await supabase.from('groups').select('*'); // Inclui bot_token!
// CORRETO: Selecionar apenas campos necessarios
const { data } = await supabase.from('groups').select('id, name, status, ...');
```

### Supabase Client nas API Routes

**IMPORTANTE:** Usar `context.supabase` do TenantContext (retornado por `createApiHandler`). NAO criar novo client. O client ja vem autenticado com o usuario correto e respeita RLS.

```typescript
export const GET = createApiHandler(async (req, context) => {
  // context.supabase ja esta pronto e autenticado
  const { data, error } = await context.supabase
    .from('groups')
    .select('id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data });
}, { allowedRoles: ['super_admin'] });
```

### Supabase Client nas Pages (Server Components)

Para Server Components (paginas), usar `createClient()` de `@/lib/supabase-server`:

```typescript
import { createClient } from '@/lib/supabase-server';

export default async function GroupsPage() {
  const supabase = await createClient();
  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false });
  // ...
}
```

### Sidebar - Navegacao Condicional por Role

O Sidebar atual tem apenas "Dashboard". Esta story adiciona "Grupos" visivel APENAS para super_admin. O layout (`(auth)/layout.tsx`) precisa buscar o role do usuario e passar para o LayoutShell/Sidebar.

**Importante:** O `(auth)/layout.tsx` atual ja verifica auth e redireciona para login. Precisamos ESTENDER (nao reescrever) para tambem buscar o role via query a `admin_users`.

### Inteligencia da Story 1.3 (Anterior)

**O que foi implementado e esta disponivel:**
- `withTenant()` em `src/middleware/tenant.ts` — extrai auth context
- `createApiHandler()` em `src/middleware/api-handler.ts` — factory com `allowedRoles`
- `createPublicHandler()` — para rotas publicas
- `applyTenantFilter()` — helper para queries com group_id
- `preventSelfRoleChange()` em `src/middleware/guards.ts`
- Barrel file em `src/middleware/index.ts`
- API Routes demo: `GET /api/health` (public), `GET /api/me` (authenticated)
- 34 testes passando

**Licoes do code review (Story 1.3):**
- Integrar guards como opcoes no `createApiHandler()` (nao wrappers separados)
- Reusar `createClient` do `supabase-server.ts` (DRY)
- Validar runtime types (nao confiar em `as` assertions)
- Per-export enforcement tests (nao apenas file-level import check)

### Git Intelligence

**Commits recentes:**
- `b07593a` feat(admin): add tenant middleware, API handlers, and route protection
- `9ec9793` Merge PR #6 - fix lint warnings
- `4818cf5` chore: update dependencies
- `dc1721f` Merge PR #5 - scaffold admin panel

**Branch atual:** `feature/tenant-middleware`
**Branch sugerida para esta story:** `feature/crud-grupos`

### Estrutura de Arquivos a Criar

```
admin-panel/src/
├── app/
│   ├── (auth)/
│   │   └── groups/                     # NOVO - Diretorio
│   │       ├── page.tsx                # NOVO - Listagem de grupos
│   │       ├── new/
│   │       │   └── page.tsx            # NOVO - Formulario de criacao
│   │       └── [groupId]/
│   │           └── page.tsx            # NOVO - Detalhes do grupo
│   └── api/
│       └── groups/                     # NOVO - Diretorio
│           ├── route.ts                # NOVO - GET (list) + POST (create)
│           └── [groupId]/
│               └── route.ts            # NOVO - GET (detail) + PUT (update)
├── components/
│   └── features/
│       └── groups/                     # NOVO - Diretorio
│           ├── GroupCard.tsx            # NOVO - Card de grupo
│           └── GroupForm.tsx            # NOVO - Formulario de grupo
```

**Arquivos a MODIFICAR:**
- `admin-panel/src/components/layout/Sidebar.tsx` — Adicionar item "Grupos" condicional
- `admin-panel/src/components/layout/LayoutShell.tsx` — Repassar prop `role`
- `admin-panel/src/app/(auth)/layout.tsx` — Buscar role do usuario

### Dependencias entre Stories

```
Story 1.1 (done) → Story 1.2 (done) → Story 1.3 (done) → Story 1.4 (esta)
   Migration          Admin Panel          Middleware           CRUD Grupos
   + RLS              + Auth               de Tenant            + Listagem
```

**Story 1.4 depende de:**
- Story 1.1: Tabela `groups` com RLS policies
- Story 1.2: Admin panel scaffold, Supabase Auth, componentes layout
- Story 1.3: `createApiHandler()` com `allowedRoles`, `withTenant()`, `applyTenantFilter()`

**Story 1.4 prepara o terreno para:**
- Story 2.1: Editar/gerenciar status de grupos (extendera a pagina de detalhes)
- Story 2.3: Onboarding automatico de influencer (usara o form de criacao como base)
- Story 2.4: Dashboard consolidado (usara dados de grupos)

### FRs Cobertos por Esta Story

- **FR1:** Super Admin pode criar um novo grupo/influencer
- **FR2:** Super Admin pode visualizar lista de todos os grupos
- **FR5:** Sistema pode isolar dados de cada grupo (RLS + middleware)

### NFRs Enderecados

- **NFR-S1:** Zero vazamento entre tenants (createApiHandler com allowedRoles + RLS)
- **NFR-P3:** Painel admin carrega em < 3 segundos (Server Components para listagem)

### Validacao Zod para Criacao de Grupo

```typescript
import { z } from 'zod';

const createGroupSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  telegram_group_id: z.number().optional(),
  telegram_admin_group_id: z.number().optional(),
});
```

### Formato de Data PT-BR

```typescript
// Usar Intl.DateTimeFormat para formatar datas
const formatDate = (dateString: string) => {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateString));
};
```

### Status Badge Colors

| Status | Cor (Tailwind) | Texto |
|--------|----------------|-------|
| `active` | `bg-green-100 text-green-800` | Ativo |
| `paused` | `bg-yellow-100 text-yellow-800` | Pausado |
| `inactive` | `bg-gray-100 text-gray-800` | Inativo |
| `creating` | `bg-blue-100 text-blue-800` | Criando |
| `failed` | `bg-red-100 text-red-800` | Falhou |

### Project Structure Notes

- Rotas de grupos ficam em `(auth)/groups/` — protegidas pelo layout de auth
- API Routes ficam em `api/groups/` — protegidas por `createApiHandler({ allowedRoles: ['super_admin'] })`
- Componentes reutilizaveis ficam em `components/features/groups/`
- Nenhum conflito com arquivos existentes — tudo e novo
- Sidebar atualizado com navegacao condicional por role

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4: CRUD de Grupos e Listagem]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Data Architecture]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#API Routes Patterns (Next.js)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Middleware de Tenant (CRITICO)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#React Components Patterns]
- [Source: _bmad-output/project-context.md#Multi-Tenant Rules]
- [Source: _bmad-output/project-context.md#Service Response Pattern]
- [Source: _bmad-output/project-context.md#Naming Conventions]
- [Source: sql/migrations/019_multitenant.sql#groups table schema]
- [Source: sql/migrations/019_multitenant.sql#RLS policies for groups]
- [Source: admin-panel/src/types/database.ts#Group interface]
- [Source: admin-panel/src/middleware/api-handler.ts#createApiHandler]
- [Source: admin-panel/src/middleware/tenant.ts#withTenant]
- [Source: admin-panel/src/components/layout/Sidebar.tsx#navigation items]
- [Source: _bmad-output/implementation-artifacts/stories/1-3-middleware-de-tenant-e-protecao-de-rotas.md - Story anterior]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Zod v4 usa `.issues` em vez de `.errors` no resultado de `safeParse()` — corrigido em ambas API routes
- Mock do Supabase query builder precisou de refatoracao para encadear corretamente `from() -> select() -> order()/single()`

### Completion Notes List

- Task 1: API Routes criadas com `createApiHandler({ allowedRoles: ['super_admin'] })`, validacao Zod v4, response format padrao
- Task 2: Pagina de listagem como Server Component com GroupCard, estado vazio, botao "Novo Grupo"
- Task 3: Pagina de criacao como Client Component com GroupForm, validacao client-side, POST via fetch
- Task 4: Pagina de detalhes como Server Component com exibicao de todos os campos, botao Editar desabilitado (Story 2.1)
- Task 5: Sidebar atualizado com navegacao condicional por role, auth layout busca role via query admin_users
- Task 6: 19 testes API + 9 testes GroupCard + 6 testes GroupForm = 34 novos testes. Enforcement test existente valida automaticamente as novas routes
- Zod adicionado como dependencia (v4.x)
- 116 testes totais passando, zero regressoes, zero lint errors

### Change Log

- 2026-02-08: Implementacao completa da Story 1.4 — CRUD de Grupos e Listagem. Primeiro CRUD real do admin panel, estabelecendo patterns para futuras stories.
- 2026-02-08: Code Review adversarial — 10 issues encontradas (3 HIGH, 4 MEDIUM, 3 LOW), todas corrigidas. Fixes: createApiHandler forward de route params (H1), diferenciacao de erros DB vs validacao (H2/M4), tipo GroupListItem para type safety (H3), shared utils para DRY (M1), error logging no auth layout (M2), null checks para Telegram IDs (M3), testes para JSON invalido (L2), fix import vi (L3), docs (L1). Testes: 116 → 121, todos passando.

### File List

**Novos:**
- admin-panel/src/app/api/groups/route.ts (GET list + POST create)
- admin-panel/src/app/api/groups/[groupId]/route.ts (GET detail + PUT update)
- admin-panel/src/app/(auth)/groups/page.tsx (listagem Server Component)
- admin-panel/src/app/(auth)/groups/new/page.tsx (criacao Client Component)
- admin-panel/src/app/(auth)/groups/[groupId]/page.tsx (detalhes Server Component)
- admin-panel/src/components/features/groups/GroupCard.tsx (card de grupo)
- admin-panel/src/components/features/groups/GroupForm.tsx (formulario de grupo)
- admin-panel/src/components/features/groups/group-utils.ts (statusConfig e formatDate compartilhados)
- admin-panel/src/app/api/__tests__/groups.test.ts (24 testes API)
- admin-panel/src/components/features/groups/GroupCard.test.tsx (9 testes)
- admin-panel/src/components/features/groups/GroupForm.test.tsx (6 testes)

**Modificados:**
- admin-panel/src/components/layout/Sidebar.tsx (navegacao condicional por role)
- admin-panel/src/components/layout/LayoutShell.tsx (prop role adicionada)
- admin-panel/src/app/(auth)/layout.tsx (busca role do usuario)
- admin-panel/package.json (zod adicionado como dependencia)
- admin-panel/package-lock.json (zod dependency lock)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status atualizado)
