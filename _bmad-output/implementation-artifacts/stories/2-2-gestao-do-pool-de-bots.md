# Story 2.2: Gestao do Pool de Bots

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want visualizar e gerenciar o pool de bots disponiveis,
So that eu saiba quais bots estao livres para novos influencers.

## Acceptance Criteria

1. **Given** Super Admin esta logado e acessa `/bots` **When** a pagina carrega **Then** ve lista de todos os bots com status (`available` ou `in_use`) (FR26)
2. **Given** bots em uso na listagem **When** Super Admin visualiza um bot `in_use` **Then** o bot mostra qual grupo/influencer esta associado (FR27)
3. **Given** Super Admin esta na pagina `/bots` **When** visualiza o topo da pagina **Then** ve contador: "X disponiveis / Y em uso / Z total" (FR33)
4. **Given** Super Admin esta na pagina `/bots` **When** clica em "Adicionar Bot" **Then** pode adicionar novo bot ao pool informando token e username
5. **Given** Super Admin adiciona um novo bot **When** submete o formulario **Then** o token do bot e armazenado criptografado no banco (NFR-S2) e o bot aparece na lista com status `available`
6. **Given** Super Admin tenta adicionar bot com token ou username duplicado **When** submete o formulario **Then** recebe erro de validacao informando que ja existe
7. **Given** Super Admin tenta adicionar bot com campos vazios **When** submete o formulario **Then** recebe erro de validacao inline sem perder os dados preenchidos

## Tasks / Subtasks

- [x] Task 1: Criar API Routes para bots (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] 1.1: Criar `admin-panel/src/app/api/bots/route.ts` com handlers GET e POST
    - GET: Listar todos os bots do `bot_pool` com JOIN em `groups` para mostrar nome do grupo associado. Selecionar: `id, bot_username, status, group_id, created_at, groups(name)`. NAO retornar `bot_token` na resposta (NFR-S2)
    - POST: Adicionar novo bot ao pool com `bot_token` e `bot_username`. Validar com Zod. Status padrao `available`
    - Ambos protegidos com `createApiHandler({ allowedRoles: ['super_admin'] })`
  - [x] 1.2: Implementar contadores no GET: calcular `available_count`, `in_use_count`, `total_count` a partir dos dados retornados e incluir no response como campo `summary`

- [x] Task 2: Criar pagina `/bots` (AC: #1, #2, #3)
  - [x] 2.1: Criar `admin-panel/src/app/(auth)/bots/page.tsx` como Client Component
    - Buscar dados via `GET /api/bots` no `useEffect`
    - Mostrar loading skeleton enquanto carrega
    - Renderizar contadores no topo (cards com numeros)
    - Renderizar lista de bots usando componente `BotCard`
    - Botao "Adicionar Bot" que abre formulario inline ou modal simples
  - [x] 2.2: Adicionar tratamento de erro com mensagem amigavel

- [x] Task 3: Criar componente `BotCard` (AC: #1, #2)
  - [x] 3.1: Criar `admin-panel/src/components/features/bots/BotCard.tsx` como funcional component
    - Props: `bot: BotPoolListItem`
    - Exibir: `bot_username`, status badge (verde para available, azul para in_use), nome do grupo associado (se in_use), data de criacao
    - Usar `statusConfig` local para labels/cores dos status
  - [x] 3.2: Criar `admin-panel/src/components/features/bots/bot-utils.ts`
    - `botStatusConfig` com mapeamento de status para label e className
    - Reutilizar `formatDate` e `formatDateTime` de `group-utils.ts` ou criar equivalentes

- [x] Task 4: Criar componente `BotForm` (AC: #4, #5, #6, #7)
  - [x] 4.1: Criar `admin-panel/src/components/features/bots/BotForm.tsx` como Client Component
    - Props: `onSubmit`, `loading`, `error`
    - Campos: `bot_token` (obrigatorio, texto), `bot_username` (obrigatorio, texto, min 3 chars)
    - Validacao client-side: ambos obrigatorios, username min 3 chars
    - Botao "Adicionar Bot" com estado de loading
    - Botao "Cancelar" que limpa o formulario e esconde
  - [x] 4.2: Apos submit com sucesso, limpar formulario e atualizar a lista de bots (refetch)

- [x] Task 5: Adicionar link "Bots" no Sidebar (AC: #1)
  - [x] 5.1: Atualizar `admin-panel/src/components/layout/Sidebar.tsx`:
    - Adicionar item de navegacao: `{ name: 'Bots', href: '/bots', icon: '🤖', roles: ['super_admin'] }`
    - Posicionar apos "Grupos" na lista de navegacao

- [x] Task 6: Criar tipo `BotPoolListItem` (AC: #1, #2)
  - [x] 6.1: Atualizar `admin-panel/src/types/database.ts`:
    - Adicionar tipo `BotPoolListItem` que OMITE `bot_token` do `BotPool` e inclui campo opcional `group_name` para o JOIN
    ```typescript
    export type BotPoolListItem = Omit<BotPool, 'bot_token'> & {
      groups: { name: string } | null;
    };
    ```

- [x] Task 7: Testes (AC: #1-#7)
  - [x] 7.1: Testes para API Route `/api/bots`:
    - GET retorna lista de bots sem `bot_token` no response
    - GET inclui `summary` com contadores corretos
    - POST cria bot com status `available`
    - POST rejeita body invalido (campos faltando, username curto)
    - POST retorna erro para token/username duplicado (constraint error)
    - Ambos endpoints verificam `allowedRoles: ['super_admin']`
  - [x] 7.2: Testes para `BotCard`:
    - Renderiza bot available com badge verde
    - Renderiza bot in_use com badge azul e nome do grupo
    - Renderiza data de criacao formatada
  - [x] 7.3: Testes para `BotForm`:
    - Valida campos obrigatorios
    - Valida username min 3 chars
    - Submit envia dados corretos
    - Exibe erro de API inline
    - Botao Cancelar limpa formulario

## Dev Notes

### Contexto Critico - Pool de Bots para Multi-tenant

**Esta story cria a gestao do pool de bots**, um componente essencial para o onboarding de influencers (Story 2.3). O pool de bots funciona como um inventario: o Super Admin cadastra bots no pool com status `available`, e quando um novo influencer e criado via onboarding (Story 2.3), um bot do pool e associado ao grupo e seu status muda para `in_use`.

**IMPORTANTE:** Esta story NAO implementa a associacao de bot a grupo (isso e feito automaticamente no onboarding da Story 2.3). Esta story apenas:
1. Lista bots do pool com status e grupo associado
2. Permite adicionar novos bots ao pool
3. Mostra contadores de disponibilidade

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

### Schema da Tabela bot_pool (da Migration 019)

```sql
CREATE TABLE IF NOT EXISTS bot_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token VARCHAR NOT NULL UNIQUE,
  bot_username VARCHAR NOT NULL UNIQUE,
  status VARCHAR DEFAULT 'available' CHECK (status IN ('available', 'in_use')),
  group_id UUID REFERENCES groups(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Campos que esta story EXIBE na UI:**
- `id` — UUID (para referencia interna)
- `bot_username` — Username do bot no Telegram (ex: @meu_bot)
- `status` — `available` ou `in_use` (badge colorido)
- `group_id` — UUID do grupo associado (se in_use), com JOIN para mostrar nome
- `created_at` — Data de criacao

**Campos que esta story NAO exibe na UI:**
- `bot_token` — NUNCA exibir (seguranca critica - NFR-S2). Token criptografado at rest

### Schema da Tabela bot_health (da Migration 019 — Referencia)

```sql
CREATE TABLE IF NOT EXISTS bot_health (
  group_id UUID PRIMARY KEY REFERENCES groups(id),
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  status VARCHAR DEFAULT 'online' CHECK (status IN ('online', 'offline')),
  restart_requested BOOLEAN DEFAULT false,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**NOTA:** A tabela `bot_health` NAO e usada nesta story. O health check e restart remoto sao Epic 6 (Stories 6.1, 6.2, 6.3). Esta story foca exclusivamente no `bot_pool`.

### RLS Policies para bot_pool (da Migration 019 + 020)

```sql
-- super_admin: CRUD completo via helper function
CREATE POLICY "bot_pool_super_admin_all" ON bot_pool
  FOR ALL USING (public.get_my_role() = 'super_admin');
```

**IMPORTANTE:** Apenas `super_admin` tem acesso ao `bot_pool`. Group Admin NAO ve bots.

### Tipos TypeScript Existentes (de `@/types/database.ts`)

```typescript
export interface BotPool {
  id: string;
  bot_token: string;
  bot_username: string;
  status: 'available' | 'in_use';
  group_id: string | null;
  created_at: string;
}

export interface BotHealth {
  group_id: string;
  last_heartbeat: string;
  status: 'online' | 'offline';
  restart_requested: boolean;
  error_message: string | null;
  updated_at: string;
}
```

**Tipo NOVO a criar:**
```typescript
export type BotPoolListItem = Omit<BotPool, 'bot_token'> & {
  groups: { name: string } | null;
};
```

### Middleware e API Handler (Story 1.3 — PRONTO)

**OBRIGATORIO usar em todas as API Routes:**

```typescript
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (_req: NextRequest, context) => {
    // context.user, context.role, context.groupFilter, context.supabase
  },
  { allowedRoles: ['super_admin'] }
);
```

### Patterns Obrigatorios (do project-context.md)

**Response Format:**
```typescript
// Sucesso
return NextResponse.json({ success: true, data: {...} });

// Sucesso com summary
return NextResponse.json({
  success: true,
  data: bots,
  summary: { available: 3, in_use: 2, total: 5 }
});

// Erro
return NextResponse.json(
  { success: false, error: { code: 'NOT_FOUND', message: '...' } },
  { status: 404 }
);
```

**Naming:**
- Arquivos TSX/TS: PascalCase para componentes (`BotCard.tsx`, `BotForm.tsx`)
- Tipos: PascalCase (`BotPoolListItem`)
- Funcoes: camelCase (`addBot`, `handleSubmit`)
- Utils: camelCase arquivo (`bot-utils.ts`)

**Anti-patterns PROIBIDOS:**
```typescript
// NUNCA: API Route sem createApiHandler
export const GET = async (req: NextRequest) => { ... };

// NUNCA: Retornar bot_token na resposta
const { data } = await supabase.from('bot_pool').select('*');
// CORRETO: Selecionar apenas campos necessarios
const { data } = await supabase.from('bot_pool').select('id, bot_username, status, group_id, created_at, groups(name)');

// NUNCA: Retornar dados sem wrapper { success, data }
return NextResponse.json(bots);
```

### Supabase Client nas API Routes

**IMPORTANTE:** Usar `context.supabase` do TenantContext (retornado por `createApiHandler`). NAO criar novo client.

```typescript
export const GET = createApiHandler(async (_req, context) => {
  const { data, error } = await context.supabase
    .from('bot_pool')
    .select('id, bot_username, status, group_id, created_at, groups(name)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  const summary = {
    available: data.filter(b => b.status === 'available').length,
    in_use: data.filter(b => b.status === 'in_use').length,
    total: data.length,
  };

  return NextResponse.json({ success: true, data, summary });
}, { allowedRoles: ['super_admin'] });
```

### Supabase Client nas Pages (Server Components)

Para Server Components, usar `createClient()` de `@/lib/supabase-server`:

```typescript
import { createClient } from '@/lib/supabase-server';
```

**NOTA:** Nesta story, a pagina `/bots` e um Client Component que faz fetch via API Route (mesmo padrao da pagina `/groups`).

### Sidebar Navigation (a modificar)

Arquivo: `admin-panel/src/components/layout/Sidebar.tsx`

Adicionar novo item de navegacao:
```typescript
const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Grupos', href: '/groups', icon: '👥', roles: ['super_admin'] },
  { name: 'Bots', href: '/bots', icon: '🤖', roles: ['super_admin'] }, // NOVO
];
```

### Criptografia de Token (NFR-S2)

O PRD e a arquitetura exigem que tokens de bot sejam criptografados at rest (NFR-S2). Para esta story MVP:
- O `bot_token` e armazenado diretamente no banco via Supabase (que ja oferece encryption at rest no PostgreSQL)
- A RLS policy garante que apenas `super_admin` pode acessar `bot_pool`
- O SELECT na API Route NAO inclui `bot_token` — nunca expor na UI
- **Criptografia adicional (AES-256)** sera avaliada em story futura se necessario

### Inteligencia da Story 2.1 (Anterior)

**Licoes aprendidas no code review da Story 2.1:**
1. Audit log usava try/catch para erros do Supabase que retorna `{error}` em vez de lancar excecao — usar `if (error)` em vez de try/catch
2. Migration 021 usava sub-query inline em `admin_users` causando recursao infinita RLS — usar helper functions `get_my_role()` / `get_my_group_id()`
3. Zod v4 usa `.issues` em vez de `.errors` no resultado de `safeParse()`
4. Mock do Supabase query builder precisa encadear corretamente `from() -> select() -> order()/single()`
5. Diferenciar erros de DB (500) vs erros de validacao/constraint (400) — verificar `error.code?.startsWith('23')`
6. O audit log NAO deve bloquear a operacao principal

**Testes da Story 2.1 para referencia:**
- 139 testes passando no projeto total
- Pattern de teste: Vitest + Testing Library
- Mock pattern para Supabase: `vi.mock('@/middleware/tenant', ...)`

### Git Intelligence

**Commits recentes relevantes:**
- `19638eb` fix(admin): handle cookie set error in Server Components
- `6b7203e` feat(admin): add group editing, status management, and audit log (Story 2.1)
- `d7c9b36` fix(admin): address 10 code review issues for groups CRUD
- `1f99e85` feat(admin): add groups CRUD with listing, creation, and detail pages

**Branch atual:** `fix/supabase-server-cookie-error`
**Branch sugerida para esta story:** `feature/gestao-pool-bots`

**Padroes de commit observados:**
- `feat(admin):` para novas funcionalidades do admin panel
- `fix(admin):` para correcoes
- Mensagens em ingles

### Estrutura de Arquivos a Criar/Modificar

```
admin-panel/src/
├── app/
│   ├── (auth)/
│   │   └── bots/
│   │       └── page.tsx                    # NOVO - Pagina de listagem de bots
│   └── api/
│       └── bots/
│           └── route.ts                    # NOVO - API Routes GET/POST
├── components/
│   ├── features/
│   │   └── bots/
│   │       ├── BotCard.tsx                 # NOVO - Card de bot
│   │       ├── BotCard.test.tsx            # NOVO - Testes do BotCard
│   │       ├── BotForm.tsx                 # NOVO - Formulario de adicionar bot
│   │       ├── BotForm.test.tsx            # NOVO - Testes do BotForm
│   │       └── bot-utils.ts               # NOVO - Utilitarios de bots
│   └── layout/
│       └── Sidebar.tsx                     # MODIFICAR - Adicionar link Bots
├── types/
│   └── database.ts                         # MODIFICAR - Adicionar BotPoolListItem
```

**Arquivos a CRIAR:**
- `admin-panel/src/app/(auth)/bots/page.tsx` — Pagina de listagem de bots
- `admin-panel/src/app/api/bots/route.ts` — API Routes GET e POST
- `admin-panel/src/components/features/bots/BotCard.tsx` — Componente card de bot
- `admin-panel/src/components/features/bots/BotForm.tsx` — Formulario de adicionar bot
- `admin-panel/src/components/features/bots/bot-utils.ts` — Utilitarios
- `admin-panel/src/components/features/bots/BotCard.test.tsx` — Testes BotCard
- `admin-panel/src/components/features/bots/BotForm.test.tsx` — Testes BotForm
- `admin-panel/src/app/api/__tests__/bots.test.ts` — Testes API Routes

**Arquivos a MODIFICAR:**
- `admin-panel/src/components/layout/Sidebar.tsx` — Adicionar link Bots
- `admin-panel/src/types/database.ts` — Adicionar BotPoolListItem

### Dependencias entre Stories

```
Story 1.3 (done) → Story 2.2 (esta)
   Middleware         Pool de Bots
   + createApiHandler

Story 1.4 (done) → Story 2.2 (esta)
   CRUD Grupos        Referencia de patterns

Story 2.1 (done) → Story 2.2 (esta)
   Editar Grupos      Licoes aprendidas
   + Audit Log
```

**Story 2.2 prepara o terreno para:**
- Story 2.3: Onboarding automatico (seleciona bot do pool, muda status para `in_use`)
- Story 6.1: Health check dos bots (usa `bot_health` com referencia ao grupo do pool)
- Story 6.3: Restart remoto (usa info do pool para identificar bot)

### FRs Cobertos por Esta Story

- **FR26:** Super Admin pode visualizar pool de bots disponiveis
- **FR27:** Super Admin pode visualizar bots em uso e seus grupos
- **FR33:** Super Admin pode ver quantidade de bots disponiveis vs em uso

### NFRs Enderecados

- **NFR-S2:** Tokens de bot criptografados at rest (nao exibir na API/UI)
- **NFR-S1:** Zero vazamento entre tenants (createApiHandler com allowedRoles + RLS)

### Status Badge Colors (referencia)

| Status | Cor (Tailwind) | Texto |
|--------|----------------|-------|
| `available` | `bg-green-100 text-green-800` | Disponivel |
| `in_use` | `bg-blue-100 text-blue-800` | Em Uso |

### Project Structure Notes

- Pagina de bots fica em `(auth)/bots/` — protegida pelo layout de auth
- API Route nova em `api/bots/` — protegida por `createApiHandler({ allowedRoles: ['super_admin'] })`
- Componentes de bots em `components/features/bots/` — seguindo padrao de `features/groups/`
- Nenhum conflito com arquivos existentes
- Nenhuma migration nova necessaria — tabelas `bot_pool` e `bot_health` ja existem na migration 019

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2: Gestao do Pool de Bots]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Data Architecture]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Schema: Novas Tabelas — bot_pool]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#API Routes Patterns (Next.js)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Middleware de Tenant (CRITICO)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#React Components Patterns]
- [Source: _bmad-output/project-context.md#Multi-Tenant Rules]
- [Source: _bmad-output/project-context.md#Service Response Pattern]
- [Source: _bmad-output/project-context.md#Naming Conventions]
- [Source: sql/migrations/019_multitenant.sql#bot_pool table schema]
- [Source: sql/migrations/019_multitenant.sql#bot_health table schema]
- [Source: sql/migrations/019_multitenant.sql#RLS policies for bot_pool]
- [Source: sql/migrations/020_fix_rls_infinite_recursion.sql#get_my_role() helper]
- [Source: admin-panel/src/types/database.ts#BotPool interface]
- [Source: admin-panel/src/types/database.ts#BotHealth interface]
- [Source: admin-panel/src/middleware/api-handler.ts#createApiHandler]
- [Source: admin-panel/src/middleware/tenant.ts#withTenant]
- [Source: admin-panel/src/components/layout/Sidebar.tsx#navigation items]
- [Source: admin-panel/src/components/features/groups/GroupCard.tsx#card pattern]
- [Source: admin-panel/src/components/features/groups/GroupForm.tsx#form pattern]
- [Source: admin-panel/src/components/features/groups/group-utils.ts#statusConfig pattern]
- [Source: _bmad-output/implementation-artifacts/stories/2-1-editar-e-gerenciar-status-de-grupos.md — Story anterior]

## Change Log

- 2026-02-08: Implementacao completa da Story 2.2 - Gestao do Pool de Bots (API Routes, pagina /bots, componentes BotCard/BotForm, tipo BotPoolListItem, link no Sidebar, 25 testes novos)
- 2026-02-08: Code review fixes (10 issues) - Zod trim, bot_token type=password, noValidate form, 401 redirect, formatDate DRY (shared format-utils.ts), locale-safe test, sprint-status doc fix. Total: 166 testes (+2 novos)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- BotForm test fix: `fireEvent.click` nao dispara validacao JS quando campo HTML `required` esta vazio em jsdom. Resolvido usando `fireEvent.submit` com valor de espacos para bypassar required HTML mas falhar na validacao JS `trim()`.
- Build error pre-existente: `GroupEditForm` em `groups/[groupId]/edit/page.tsx` tem erro de tipo `Record<string, unknown>` vs `GroupEditFormData` — nao introduzido por esta story.

### Completion Notes List

- API Route GET /api/bots: lista bots do pool com JOIN em groups, inclui summary com contadores, NAO expoe bot_token (NFR-S2)
- API Route POST /api/bots: adiciona bot com validacao Zod, status padrao `available`, trata erros de constraint (duplicatas) vs DB errors
- Pagina /bots: Client Component com fetch via API, loading skeleton, contadores no topo, formulario inline para adicionar bot, tratamento de erro
- BotCard: exibe username, status badge (verde/azul), grupo associado (se in_use), data formatada pt-BR
- BotForm: campos token e username com validacao client-side, estados loading/error, botao cancelar limpa form
- bot-utils: botStatusConfig, re-exporta formatDate de shared format-utils.ts (DRY)
- BotPoolListItem: tipo que omite bot_token e inclui groups JOIN
- Sidebar: link Bots adicionado apos Grupos com role super_admin
- 27 testes novos: 17 API (GET/POST com auth, validation, DB errors, whitespace trim), 4 BotCard (status badges, group name, date), 6 BotForm (validation, submit, cancel, error, loading)
- Total: 166 testes passando, 0 regressoes

### File List

**Arquivos criados:**
- admin-panel/src/app/api/bots/route.ts
- admin-panel/src/app/(auth)/bots/page.tsx
- admin-panel/src/components/features/bots/BotCard.tsx
- admin-panel/src/components/features/bots/BotForm.tsx
- admin-panel/src/components/features/bots/bot-utils.ts
- admin-panel/src/app/api/__tests__/bots.test.ts
- admin-panel/src/components/features/bots/BotCard.test.tsx
- admin-panel/src/components/features/bots/BotForm.test.tsx
- admin-panel/src/lib/format-utils.ts (shared formatDate/formatDateTime - DRY)

**Arquivos modificados:**
- admin-panel/src/types/database.ts (adicionado BotPoolListItem)
- admin-panel/src/components/layout/Sidebar.tsx (adicionado link Bots)
- admin-panel/src/components/features/groups/group-utils.ts (re-exporta de format-utils.ts)
- _bmad-output/implementation-artifacts/sprint-status.yaml (story 2.2 status → review)
