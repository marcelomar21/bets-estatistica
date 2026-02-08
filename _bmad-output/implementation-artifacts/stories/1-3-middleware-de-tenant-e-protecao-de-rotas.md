# Story 1.3: Middleware de Tenant e Protecao de Rotas

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want que toda requisicao API valide permissoes e filtre por grupo,
So that nenhum dado vaze entre tenants.

## Acceptance Criteria

1. **Given** um usuario autenticado no admin panel **When** qualquer API Route e chamada **Then** o middleware `withTenant()` identifica o role e group_id do usuario via JWT
2. **Given** um usuario com role `super_admin` **When** `withTenant()` e executado **Then** `groupFilter = null` (ve tudo)
3. **Given** um usuario com role `group_admin` **When** `withTenant()` e executado **Then** `groupFilter = user.group_id` (so seu grupo)
4. **Given** um usuario nao autenticado **When** qualquer API Route e chamada **Then** retorna 401 `{ success: false, error: { code: 'UNAUTHORIZED', message: '...' } }`
5. **Given** qualquer API Route **When** responde ao client **Then** response segue o pattern `{ success: true, data }` ou `{ success: false, error: { code, message } }`
6. **Given** um Admin de Grupo **When** tenta alterar seu proprio role **Then** a operacao e rejeitada com 403 (FR58)
7. **Given** qualquer nova API Route **When** e criada pelo desenvolvedor **Then** DEVE usar o wrapper `createApiHandler()` que aplica `withTenant()` automaticamente — nenhuma rota pode ser criada sem passar por ele (enforcement automatico de seguranca)

## Tasks / Subtasks

- [x] Task 1: Criar middleware `withTenant()` (AC: #1, #2, #3, #4)
  - [x] 1.1: Criar diretorio `admin-panel/src/middleware/`
  - [x] 1.2: Criar `admin-panel/src/middleware/tenant.ts` com funcao `withTenant()` que:
    - Recebe `Request` do Next.js
    - Cria server Supabase client via `@supabase/ssr` (usando `cookies()` de `next/headers`)
    - Chama `supabase.auth.getUser()` para obter usuario autenticado
    - Se nao autenticado: retorna `{ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }`
    - Se autenticado: consulta `admin_users` para obter `role` e `group_id`
    - Se usuario nao existe em `admin_users`: retorna `{ error: { code: 'FORBIDDEN', message: 'User not authorized' } }`
    - Se `super_admin`: retorna `{ user, role: 'super_admin', groupFilter: null, supabase }`
    - Se `group_admin`: retorna `{ user, role: 'group_admin', groupFilter: adminUser.group_id, supabase }`
  - [x] 1.3: Exportar tipo `TenantContext` com tipagem completa da resposta
  - [x] 1.4: Retornar tambem a instancia `supabase` para reuso nas API Routes (evita criar multiplos clients)
  - [x] 1.5: VALIDACAO CRITICA — Se `role === 'group_admin'` e `group_id` e null/undefined, retornar FORBIDDEN com mensagem "Group admin without group assignment" (previne escalacao de privilegios por dados corrompidos)
  - [x] 1.6: Criar helper `applyTenantFilter(query, context)` em `tenant.ts` que aplica `.eq('group_id', groupFilter)` automaticamente quando `groupFilter !== null`. TODA query em tabelas com `group_id` DEVE usar este helper

- [x] Task 2: Criar wrapper `createApiHandler()` (AC: #7)
  - [x] 2.1: Criar `admin-panel/src/middleware/api-handler.ts` com funcao factory `createApiHandler()`
  - [x] 2.2: O wrapper deve:
    - Aplicar `withTenant()` automaticamente em toda requisicao
    - Se `withTenant()` retorna erro, responder imediatamente com status HTTP correto (401/403)
    - Passar `TenantContext` para o handler da rota
    - Capturar erros nao tratados e retornar 500 `{ success: false, error: { code: 'INTERNAL_ERROR', message } }`
    - Suportar configuracao de roles permitidos (ex: `{ allowedRoles: ['super_admin'] }`) para rotas exclusivas
  - [x] 2.3: Exportar tipo `ApiHandler<T>` para tipagem dos handlers
  - [x] 2.4: O handler recebe `(req: NextRequest, context: TenantContext)` como parametros
  - [x] 2.5: Criar `createPublicHandler()` no mesmo arquivo para rotas publicas sem auth (ex: `/api/health`). Garante que TODA rota usa um wrapper padrao — zero ambiguidade no enforcement. O handler recebe apenas `(req: NextRequest)` sem TenantContext

- [x] Task 3: Criar API Routes de demonstracao (AC: #1, #2, #3, #5)
  - [x] 3.1: Criar `admin-panel/src/app/api/health/route.ts` — rota publica usando `createPublicHandler()` (health check do admin panel)
  - [x] 3.2: Criar `admin-panel/src/app/api/me/route.ts` — retorna dados do usuario autenticado e seu role/group usando `createApiHandler()`
  - [x] 3.3: Verificar que `GET /api/me` retorna `{ success: true, data: { user, role, groupId } }` para super_admin
  - [x] 3.4: Verificar que `GET /api/me` retorna `{ success: true, data: { user, role, groupId } }` para group_admin (com groupId preenchido)
  - [x] 3.5: Verificar que `GET /api/me` sem auth retorna `{ success: false, error: { code: 'UNAUTHORIZED' } }` com status 401

- [x] Task 4: Protecao contra escalacao de privilegios (AC: #6)
  - [x] 4.1: No `createApiHandler()`, adicionar verificacao: se role do usuario e `group_admin` e o body contiver tentativa de alterar `role`, rejeitar com 403
  - [x] 4.2: Criar helper `preventSelfRoleChange(context, body)` em `admin-panel/src/middleware/guards.ts`
  - [x] 4.3: O guard deve ser invocavel explicitamente em rotas que fazem update de `admin_users`

- [x] Task 5: Testes (AC: #1-#7)
  - [x] 5.1: Criar testes unitarios para `withTenant()` cobrindo todos os cenarios:
    - Usuario nao autenticado → erro UNAUTHORIZED
    - Usuario autenticado mas nao em admin_users → erro FORBIDDEN
    - Super admin → groupFilter null
    - Group admin → groupFilter com UUID
  - [x] 5.2: Criar testes unitarios para `createApiHandler()` cobrindo:
    - Handler executado com TenantContext correto
    - Erro de auth retorna 401 automaticamente
    - Roles nao permitidos retornam 403
    - Erro no handler retorna 500 com formato correto
  - [x] 5.3: Criar testes unitarios para `preventSelfRoleChange()` guard
  - [x] 5.4: Testar que response format SEMPRE segue `{ success, data/error }`
  - [x] 5.5: Criar teste de enforcement: script/teste que verifica que TODA API Route em `src/app/api/` usa `createApiHandler()` OU `createPublicHandler()`. Usar grep/regex para detectar `export const GET`, `export const POST`, etc. que NAO usam nenhum dos dois wrappers. Se uma rota exporta handler diretamente sem wrapper, o teste DEVE falhar
  - [x] 5.6: Testar `applyTenantFilter()` — verifica que super_admin NAO adiciona filtro e group_admin SEMPRE adiciona `.eq('group_id', ...)`
  - [x] 5.7: Testar validacao de group_admin com group_id null — deve retornar FORBIDDEN (prevencao de escalacao)

- [x] Task 6: Adicionar `SUPABASE_SERVICE_KEY` ao `.env.example` (preparacao)
  - [x] 6.1: Atualizar `admin-panel/.env.example` adicionando `SUPABASE_SERVICE_KEY=your-service-key-here` com comentario explicando que e necessario a partir desta story
  - [x] 6.2: NÃO usar service_key no middleware — usar anon key com RLS. Service key so sera necessaria em rotas administrativas especificas (ex: criar usuarios via Supabase Auth Admin API, que sera em Story 2.3)

## Dev Notes

### Contexto Critico - Middleware de Tenant e o CORACAO da Seguranca Multi-tenant

**Este middleware e a LINHA DE DEFESA mais importante no admin panel.** Junto com RLS no Supabase, ele garante que nenhum dado vaze entre tenants. TODA API Route que acessa dados com `group_id` DEVE passar por `withTenant()` via `createApiHandler()`.

### Stack Tecnologica Atual do Admin Panel

| Tecnologia | Versao | Notas |
|------------|--------|-------|
| Next.js | 16.1.6 | App Router (NAO Pages Router) |
| TypeScript | 5.x | Strict mode |
| Tailwind CSS | 4.x | Styling |
| @supabase/supabase-js | ^2.95.3 | Database client |
| @supabase/ssr | ^0.8.0 | Auth helpers para Next.js App Router |

### Arquitetura do withTenant() (da Arquitetura Multi-tenant)

**NOTA (ADR-001):** `withTenant()` usa `cookies()` de `next/headers` internamente — funciona APENAS em contexto de request Next.js (Route Handlers, Server Components). NAO usar em scripts, jobs ou cron. Jobs/scripts que acessam o banco usam `service_role` diretamente via `lib/supabase.js` (no bot), sem necessidade de tenant middleware.

```typescript
// admin-panel/src/middleware/tenant.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { AdminUser } from '@/types/database';

export interface TenantContext {
  user: { id: string; email: string };
  role: 'super_admin' | 'group_admin';
  groupFilter: string | null;  // null = ve tudo (super_admin)
  supabase: ReturnType<typeof createServerClient>;
}

export interface TenantError {
  error: { code: string; message: string };
}

export type TenantResult =
  | { success: true; context: TenantContext }
  | { success: false; error: { code: string; message: string }; status: number };

export async function withTenant(): Promise<TenantResult> {
  const cookieStore = await cookies();

  // CRITICAL: Use anon key here, NEVER service_role — RLS MUST apply to enforce tenant isolation
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    };
  }

  const { data: adminUser, error: dbError } = await supabase
    .from('admin_users')
    .select('role, group_id')
    .eq('id', user.id)
    .single();

  if (dbError || !adminUser) {
    return {
      success: false,
      error: { code: 'FORBIDDEN', message: 'User not authorized for admin access' },
      status: 403,
    };
  }

  // CRITICAL: Prevent privilege escalation from corrupted data
  // If group_admin has null group_id, deny access instead of granting super_admin-like access
  if (adminUser.role === 'group_admin' && !adminUser.group_id) {
    return {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Group admin without group assignment' },
      status: 403,
    };
  }

  return {
    success: true,
    context: {
      user: { id: user.id, email: user.email! },
      role: adminUser.role as 'super_admin' | 'group_admin',
      groupFilter: adminUser.role === 'super_admin' ? null : adminUser.group_id,
      supabase,
    },
  };
}

/**
 * Helper to apply tenant filter to Supabase queries.
 * MUST be used on every query to tables with group_id column.
 * Super admin: no filter (sees all). Group admin: filters by group_id.
 */
export function applyTenantFilter<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  context: TenantContext,
): T {
  if (context.groupFilter) {
    return query.eq('group_id', context.groupFilter);
  }
  return query;
}
```

### Arquitetura do createApiHandler()

```typescript
// admin-panel/src/middleware/api-handler.ts
import { NextRequest, NextResponse } from 'next/server';
import { withTenant, TenantContext } from './tenant';

// ADR-002: createApiHandler e o UNICO ponto de entrada para API Routes autenticadas.
// Middlewares futuros (rate limiting, logging, etc.) devem ser adicionados como
// opcoes DENTRO de ApiHandlerOptions, NAO como wrappers separados.
// Isso garante que withTenant() SEMPRE e aplicado — impossivel esquecer.
type ApiHandlerOptions = {
  allowedRoles?: ('super_admin' | 'group_admin')[];
};

type ApiHandler = (
  req: NextRequest,
  context: TenantContext,
) => Promise<NextResponse>;

export function createApiHandler(handler: ApiHandler, options?: ApiHandlerOptions) {
  return async (req: NextRequest) => {
    const result = await withTenant();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    const { context } = result;

    // Check role permission
    if (options?.allowedRoles && !options.allowedRoles.includes(context.role)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        { status: 403 }
      );
    }

    try {
      return await handler(req, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message } },
        { status: 500 }
      );
    }
  };
}
```

### Exemplo de Uso em API Routes

**Rota autenticada (usa `createApiHandler`):**
```typescript
// admin-panel/src/app/api/me/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(async (req, context) => {
  return NextResponse.json({
    success: true,
    data: {
      userId: context.user.id,
      email: context.user.email,
      role: context.role,
      groupId: context.groupFilter,
    },
  });
});
```

**Rota publica (usa `createPublicHandler`):**
```typescript
// admin-panel/src/app/api/health/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createPublicHandler } from '@/middleware/api-handler';

export const GET = createPublicHandler(async (req) => {
  return NextResponse.json({
    success: true,
    data: { status: 'ok', timestamp: new Date().toISOString() },
  });
});
```

**Rota restrita a super_admin:**
```typescript
// Exemplo futuro (Story 1.4) — CRUD de grupos so para super_admin
export const POST = createApiHandler(
  async (req, context) => { /* ... */ },
  { allowedRoles: ['super_admin'] }
);
```

### Patterns Obrigatorios do Projeto

**Naming:**
- Arquivos TSX/TS: PascalCase para componentes (`MemberList.tsx`), kebab-case para middleware/utils (`api-handler.ts`, `tenant.ts`)
- Tipos: PascalCase (`TenantContext`, `ApiHandler`)
- Funcoes: camelCase (`withTenant`, `createApiHandler`)

**Response Format (TODAS as API Routes):**
```typescript
// Sucesso
return NextResponse.json({ success: true, data: {...} });

// Erro
return NextResponse.json(
  { success: false, error: { code: 'NOT_FOUND', message: '...' } },
  { status: 404 }
);
```

### Supabase Client no Middleware vs API Routes

**IMPORTANTE:** O `withTenant()` cria uma instancia do Supabase server client usando `cookies()` de `next/headers`. Esta instancia e retornada no `TenantContext` para reuso nas API Routes, evitando criar multiplos clients por requisicao.

**NAO criar novo client Supabase nas API Routes.** Usar sempre `context.supabase` que ja vem autenticado com o usuario correto e respeita RLS.

### Defesa em Camadas (Multi-tenant Security)

```
Camada 1: Next.js middleware.ts (redirect login/dashboard)
Camada 2: withTenant() via createApiHandler() (auth + role + groupFilter)
Camada 3: RLS no Supabase (ultima linha de defesa no banco)
```

Se o `withTenant()` falhar por algum motivo, as RLS policies no Supabase ainda protegem os dados. Mas NAO confiar apenas no RLS — o middleware e a primeira e mais importante barreira.

**Comportamento de Role Changes:** Mudancas de role sao refletidas em tempo real. `withTenant()` consulta `admin_users` a CADA request — se um super_admin remover/alterar o role de um group_admin, o efeito e imediato na proxima requisicao. Nao ha cache de roles.

### Inteligencia da Story 1.1 (Migration Multi-tenant)

**O que foi implementado:**
- Migration `019_multitenant.sql` com 4 novas tabelas: `groups`, `admin_users`, `bot_pool`, `bot_health`
- Colunas `group_id` adicionadas em `members` e `suggested_bets`
- RLS policies para 8 tabelas com padrao super_admin/group_admin
- CHECK constraints, UNIQUE constraints, indices

**Licoes do code review (Story 1.1):**
- WITH CHECK clauses sao obrigatorias em policies de escrita (H1)
- Migrations DEVEM ser wrappadas em transacao BEGIN/COMMIT (H2)
- Constraints UNIQUE sao importantes para integridade (M1, M2)
- Testes devem ter assertions reais, nao passar vacuamente (M3)

### Inteligencia da Story 1.2 (Scaffold Admin Panel)

**O que foi implementado:**
- Admin panel com Next.js 16.1.6, App Router, TypeScript, Tailwind 4.x
- `@supabase/ssr` ^0.8.0 para auth (NAO @supabase/auth-helpers-nextjs que esta deprecated)
- `middleware.ts` na raiz com session refresh e redirect logic
- Login page em `(public)/login/page.tsx` com `signInWithPassword()`
- Layout protegido em `(auth)/layout.tsx` com verificacao server-side
- Sidebar, Header, LayoutShell para navegacao responsiva
- Tipos TypeScript em `src/types/database.ts` (Group, AdminUser, BotPool, BotHealth)

**Licoes do code review (Story 1.2):**
- Mobile navigation e importante (adicionado LayoutShell)
- Metadata deve estar em PT-BR
- Testes devem cobrir interacao real, nao apenas render
- .env.example deve preservar-se no .gitignore

**Impacto na Story 1.3:**
- O `middleware.ts` na raiz JA faz session refresh e redirect — NAO modificar
- O `src/lib/supabase-server.ts` JA cria server client — reusar o padrao
- Os tipos em `src/types/database.ts` JA tem `AdminUser` com `role` e `group_id` — reusar
- O diretorio `src/middleware/` NAO existe — criar nesta story
- O diretorio `src/app/api/` NAO existe — criar nesta story

### Estrutura de Arquivos a Criar

```
admin-panel/src/
├── middleware/                    # NOVO - Diretorio
│   ├── tenant.ts                 # NOVO - withTenant()
│   ├── api-handler.ts            # NOVO - createApiHandler()
│   └── guards.ts                 # NOVO - preventSelfRoleChange()
├── app/
│   └── api/                      # NOVO - Diretorio
│       ├── health/
│       │   └── route.ts          # NOVO - Health check
│       └── me/
│           └── route.ts          # NOVO - User info
```

### Dependencias entre Stories

```
Story 1.1 (done) → Story 1.2 (done) → Story 1.3 (esta) → Story 1.4
   Migration          Admin Panel          Middleware         CRUD Grupos
   + RLS              + Auth               de Tenant          + Listagem
```

**Story 1.3 depende de:**
- Story 1.1: Tabelas `admin_users`, `groups` com RLS policies
- Story 1.2: Admin panel scaffold, Supabase Auth integrado, tipos TypeScript

**Story 1.3 prepara o terreno para:**
- Story 1.4: CRUD de Grupos usara `createApiHandler({ allowedRoles: ['super_admin'] })` para proteger rotas
- Story 2.1+: Todas as futuras API Routes usarao `createApiHandler()` obrigatoriamente

### Git Intelligence

**Commits recentes relevantes:**
- `4818cf5` chore: update dependencies and add backups to .gitignore
- `dc1721f` Merge PR #5 - scaffold admin panel
- `b136c53` feat(admin): add login UX improvements, password reset, and test suite
- `482b32f` feat(admin): scaffold admin panel with Supabase Auth and code review fixes

**Patterns de commits:**
- Conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`
- PRs para merge na master
- Branch pattern: `feature/<descricao-curta>`

**Branch sugerida para esta story:** `feature/tenant-middleware`

### FRs Cobertos por Esta Story

- **FR55:** Autenticacao multi-tenant — sistema identifica role e group_id do usuario
- **FR56:** Isolamento de dados — groupFilter garante filtragem automatica
- **FR58:** Admin de Grupo nao pode alterar seu proprio role (guard)

### NFRs Enderecados

- **NFR-S1:** Zero vazamento entre tenants (withTenant + RLS = defesa em camadas)
- **NFR-S3:** Todas API Routes protegidas por middleware obrigatorio (createApiHandler enforcement)

### Seguranca - Notas Importantes

- **NAO usar service_role key** nesta story. Usar anon key com RLS. Comentario explicito OBRIGATORIO no codigo: `// CRITICAL: Use anon key, NEVER service_role here`
- **withTenant()** consulta `admin_users` via anon key — RLS permite SELECT para usuarios autenticados cujo `id` bate com a row
- O Supabase client retornado no TenantContext opera com as permissoes do usuario logado, respeitando RLS
- **NUNCA** confiar apenas no client-side para validacao de roles — sempre validar server-side
- **SIGNUP DEVE ESTAR DESABILITADO no Supabase Dashboard.** O `(auth)/layout.tsx` da Story 1.2 verifica apenas se o usuario tem sessao Supabase Auth, NAO se esta em `admin_users`. Se signup publico estiver habilitado, qualquer pessoa pode criar conta e ver as paginas protegidas (mesmo sem acesso a API Routes). Verificar que em Supabase Dashboard > Auth > Settings, "Enable Sign Ups" esta OFF. Apenas admins criam contas via API Admin
- **Validacao de group_id null:** Se um `group_admin` tiver `group_id = null` (dados corrompidos), o middleware DEVE retornar FORBIDDEN — NUNCA conceder acesso irrestrito como super_admin

### Enforcement e Anti-patterns CRITICOS

**Enforcement de Wrappers (ADR-004):**
- TODA API Route DEVE usar `createApiHandler()` (rotas autenticadas) OU `createPublicHandler()` (rotas publicas)
- NENHUMA rota pode exportar handlers diretamente sem um dos dois wrappers — zero ambiguidade
- Teste de enforcement obrigatorio (Task 5.5): grep em `src/app/api/` por exports que NAO usam nenhum dos wrappers
- Se um dev criar `export const GET = async (req) => {...}` sem wrapper, e uma FALHA DE SEGURANCA

**Enforcement do applyTenantFilter():**
- TODA query a tabelas com `group_id` DEVE usar `applyTenantFilter(query, context)` — NUNCA fazer `.eq('group_id', ...)` manualmente
- O helper garante consistencia e facilita code review

**Anti-patterns (PROIBIDOS):**
```typescript
// NUNCA: API Route sem wrapper (nem createApiHandler nem createPublicHandler)
export const GET = async (req: NextRequest) => { ... }; // FALHA DE SEGURANCA

// NUNCA: Query sem filtro de tenant
const { data } = await context.supabase.from('members').select('*'); // VAZAMENTO!

// NUNCA: Filtro manual em vez de helper
query.eq('group_id', context.groupFilter); // USE applyTenantFilter()

// NUNCA: Service key no withTenant
createServerClient(url, process.env.SUPABASE_SERVICE_KEY!); // BYPASSA RLS!
```

### Decisoes Arquiteturais (ADRs)

| ADR | Decisao | Alternativa Rejeitada | Razao |
|-----|---------|----------------------|-------|
| ADR-001 | `withTenant()` sem parametros, usa `cookies()` | Parametro opcional cookieStore | Jobs/scripts usam service_role, nao precisam de tenant middleware |
| ADR-002 | `createApiHandler()` como wrapper unico | Pipeline/middleware chain | Ponto unico de entrada = enforcement mais forte que composicao |
| ADR-003 | `applyTenantFilter()` helper explicito | Monkey-patch auto-filter no client | Helper + code review + RLS = mais robusto que auto-filter fragil |
| ADR-004 | `createPublicHandler()` para rotas publicas | Excecao silenciosa no enforcement | Zero ambiguidade — toda rota tem wrapper |
| ADR-005 | Mensagens de erro descritivas | Mensagens genericas em prod | Sistema interno, usabilidade > security-by-obscurity |

### Error Codes Utilizados

| Code | Status HTTP | Quando |
|------|-------------|--------|
| `UNAUTHORIZED` | 401 | Usuario nao autenticado |
| `FORBIDDEN` | 403 | Usuario sem permissao (role insuficiente ou nao e admin) |
| `INTERNAL_ERROR` | 500 | Erro nao tratado no handler |

### Project Structure Notes

- `src/middleware/tenant.ts` — funcao `withTenant()` que extrai auth context
- `src/middleware/api-handler.ts` — wrapper factory `createApiHandler()` para enforcement
- `src/middleware/guards.ts` — guards reutilizaveis (ex: `preventSelfRoleChange`)
- `src/app/api/` — diretorio de API Routes (criado nesta story)
- Alinhado com a estrutura definida na arquitetura multi-tenant
- Nenhum conflito com middleware.ts na raiz (que faz session refresh, nao tenant validation)

### Tech Debt

- [ ] Adicionar rate limiting em API Routes (futuro)
- [ ] Adicionar audit logging para acoes administrativas (Story 2.1 - NFR-S5)
- [ ] Considerar caching do resultado de `admin_users` query para reduzir latencia

### References

- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Authentication & Security]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Middleware de Tenant (CRITICO)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#API Routes Patterns (Next.js)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3: Middleware de Tenant e Protecao de Rotas]
- [Source: _bmad-output/planning-artifacts/prd.md#Requisitos de Seguranca]
- [Source: _bmad-output/project-context.md#Multi-Tenant Rules]
- [Source: _bmad-output/project-context.md#Service Response Pattern]
- [Source: _bmad-output/project-context.md#Naming Conventions]
- [Source: _bmad-output/implementation-artifacts/stories/1-1-migration-multi-tenant-e-rls.md - Story anterior]
- [Source: _bmad-output/implementation-artifacts/stories/1-2-scaffold-admin-panel-com-supabase-auth.md - Story anterior]
- [Source: admin-panel/middleware.ts - Middleware de session existente]
- [Source: admin-panel/src/lib/supabase-server.ts - Server client existente]
- [Source: admin-panel/src/types/database.ts - Tipos existentes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- All 82 tests passing (34 for this story after code review fixes)
- Zero TypeScript errors in story code
- Zero lint errors

### Completion Notes List

- **Task 1:** Implemented `withTenant()` in `src/middleware/tenant.ts` following exact architecture spec. Reuses `createClient()` from `@/lib/supabase-server` (DRY). Authenticates user, validates email, queries `admin_users` for role/group_id with runtime role validation (no unsafe `as` assertion). Returns discriminated union `TenantResult`. Includes `applyTenantFilter()` helper. Uses `AdminUser['role']` type from `@/types/database`. Critical: uses anon key (never service_role) to enforce RLS. Validates group_admin with null group_id returns FORBIDDEN (privilege escalation prevention).
- **Task 2:** Implemented `createApiHandler()` and `createPublicHandler()` in `src/middleware/api-handler.ts`. Factory pattern wraps all API handlers with automatic `withTenant()` enforcement, role-based access control via `allowedRoles`, `preventRoleChange` option for automatic role-change blocking (AC6), and standardized error handling (401/403/500). `createPublicHandler()` provides wrapper for unauthenticated routes (ADR-004 zero-ambiguity enforcement).
- **Task 3:** Created demo API routes: `GET /api/health` (public, uses `createPublicHandler`) and `GET /api/me` (authenticated, uses `createApiHandler`). Both follow standard `{ success, data/error }` response format.
- **Task 4:** Implemented `preventSelfRoleChange()` guard in `src/middleware/guards.ts` AND integrated `preventRoleChange` option into `createApiHandler()`. Blocks group_admin from modifying role field in request body. Available both as automatic option in createApiHandler and as explicit guard for custom logic.
- **Task 5:** 34 tests across 5 test files: tenant.test.ts (10 tests), api-handler.test.ts (13 tests), guards.test.ts (5 tests), routes.test.ts (4 tests), enforcement.test.ts (2 tests). Enforcement test validates per-export wrapper usage (not just file-level import). Tests cover null email, unknown roles, and preventRoleChange scenarios.
- **Task 6:** Added `SUPABASE_SERVICE_KEY` to `.env.example` with explanatory comment. Service key is NOT used in middleware.

### Change Log

- 2026-02-08: Implemented tenant middleware, API handler wrappers, guards, demo routes, and comprehensive test suite (Story 1.3)
- 2026-02-08: Code review fixes — H1: integrated preventRoleChange into createApiHandler, H2: reuse createClient from supabase-server (DRY), M1: validate user.email instead of non-null assertion, M2: use AdminUser type + runtime role validation, M3: per-export enforcement test, L2: added barrel index.ts. Tests: 28 → 34 (+6 security tests)

### File List

**New files:**
- `admin-panel/src/middleware/tenant.ts` — withTenant() middleware and applyTenantFilter() helper
- `admin-panel/src/middleware/api-handler.ts` — createApiHandler() and createPublicHandler() wrappers
- `admin-panel/src/middleware/guards.ts` — preventSelfRoleChange() guard
- `admin-panel/src/middleware/index.ts` — Barrel file for middleware module exports
- `admin-panel/src/app/api/health/route.ts` — Public health check endpoint
- `admin-panel/src/app/api/me/route.ts` — Authenticated user info endpoint
- `admin-panel/src/middleware/__tests__/tenant.test.ts` — withTenant() and applyTenantFilter() tests (10 tests)
- `admin-panel/src/middleware/__tests__/api-handler.test.ts` — createApiHandler(), createPublicHandler() and preventRoleChange tests (13 tests)
- `admin-panel/src/middleware/__tests__/guards.test.ts` — preventSelfRoleChange() tests (5 tests)
- `admin-panel/src/middleware/__tests__/enforcement.test.ts` — Per-export API route wrapper enforcement test (2 tests)
- `admin-panel/src/app/api/__tests__/routes.test.ts` — API route integration tests (4 tests)

**Modified files:**
- `admin-panel/.env.example` — Added SUPABASE_SERVICE_KEY placeholder
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story status updated to review
