# Story 2.1: Editar e Gerenciar Status de Grupos

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want editar configuracoes de um grupo e pausar/desativar grupos,
So that eu possa gerenciar o ciclo de vida de cada influencer.

## Acceptance Criteria

1. **Given** Super Admin esta logado e acessa `/groups/[groupId]` **When** clica em "Editar" **Then** o botao de edicao se torna funcional e redireciona para `/groups/[groupId]/edit` (anteriormente desabilitado na Story 1.4)
2. **Given** Super Admin esta na pagina `/groups/[groupId]/edit` **When** a pagina carrega **Then** o formulario aparece pre-preenchido com os dados atuais do grupo (nome, telegram_group_id, telegram_admin_group_id)
3. **Given** Super Admin edita campos do grupo (nome, telegram_group_id, telegram_admin_group_id) **When** submete o formulario **Then** as alteracoes sao salvas no banco via API Route `PUT /api/groups/[groupId]` com `createApiHandler()` (FR3)
4. **Given** Super Admin esta na pagina de edicao **When** altera o status do grupo para `active`, `paused` ou `inactive` **Then** o status e atualizado no banco e refletido na UI com badge de cor correspondente (FR4)
5. **Given** grupo com status `paused` ou `inactive` **When** Super Admin acessa `/groups` **Then** grupo aparece na listagem com badge de status visual (amarelo para pausado, cinza para inativo)
6. **Given** qualquer operacao de edicao **When** alteracao e salva **Then** audit log registra quem alterou, quando e o que mudou (NFR-S5)
7. **Given** Super Admin tenta salvar com nome vazio ou menor que 2 caracteres **When** submete o formulario **Then** recebe erro de validacao inline sem perder os dados preenchidos

## Tasks / Subtasks

- [x] Task 1: Habilitar botao "Editar" na pagina de detalhes (AC: #1)
  - [x] 1.1: Atualizar `admin-panel/src/app/(auth)/groups/[groupId]/page.tsx`:
    - Substituir o `<button disabled>` por um `<Link href={/groups/${groupId}/edit}>Editar</Link>` estilizado como botao
    - Manter estilo consistente com botoes existentes (`bg-blue-600 text-white hover:bg-blue-700`)
    - Manter o link "Voltar para Grupos"

- [x] Task 2: Criar pagina de edicao `/groups/[groupId]/edit` (AC: #2, #3, #4, #7)
  - [x] 2.1: Criar `admin-panel/src/app/(auth)/groups/[groupId]/edit/page.tsx` como Client Component
    - Buscar dados do grupo via `GET /api/groups/[groupId]` no `useEffect`
    - Mostrar loading state enquanto carrega dados
    - Renderizar `GroupEditForm` com dados pre-preenchidos
    - Submit faz `PUT /api/groups/[groupId]` via fetch
    - Sucesso: redireciona para `/groups/[groupId]` (pagina de detalhes)
    - Erro: exibe mensagem inline
  - [x] 2.2: Adicionar tratamento de grupo nao encontrado (404) com mensagem amigavel e link para `/groups`

- [x] Task 3: Criar componente `GroupEditForm` (AC: #2, #3, #4, #7)
  - [x] 3.1: Criar `admin-panel/src/components/features/groups/GroupEditForm.tsx` como Client Component
    - Props: `initialData: GroupListItem`, `onSubmit`, `loading`, `error`
    - Campos editaveis: nome (obrigatorio, min 2 chars), telegram_group_id (opcional, numerico), telegram_admin_group_id (opcional, numerico)
    - Campo de status: dropdown/select com opcoes `active`, `paused`, `inactive`
      - NAO incluir `creating` e `failed` no select (estados de sistema, nao manuais)
    - Validacao client-side: nome obrigatorio, min 2 chars; telegram IDs devem ser numericos se preenchidos
    - Botao "Salvar Alteracoes" com estado de loading
    - Botao "Cancelar" que navega de volta para `/groups/[groupId]`
  - [x] 3.2: Usar `statusConfig` de `group-utils.ts` para labels dos status no dropdown
  - [x] 3.3: Pre-preencher todos os campos com dados de `initialData` usando estado controlado

- [x] Task 4: Implementar audit log para alteracoes de grupo (AC: #6)
  - [x] 4.1: Criar migration `sql/migrations/021_audit_log.sql`:
    - Tabela `audit_log` com campos: id (UUID), table_name (TEXT), record_id (UUID), action (TEXT: 'update'), changed_by (UUID FK admin_users), changes (JSONB — old/new values), created_at (TIMESTAMPTZ)
    - Indices em `table_name`, `record_id`, `created_at`
    - RLS policy: super_admin pode SELECT tudo
    - Retencao de 90 dias (NFR-S5) - documentar no comentario SQL
  - [x] 4.2: Atualizar `PUT /api/groups/[groupId]` em `admin-panel/src/app/api/groups/[groupId]/route.ts`:
    - Antes de fazer `update`, fazer `select` dos dados atuais para comparar
    - Apos update bem-sucedido, inserir registro em `audit_log` com diff (campos que mudaram)
    - O audit log deve registrar: `table_name: 'groups'`, `record_id: groupId`, `action: 'update'`, `changed_by: context.user.id`, `changes: { old: {...}, new: {...} }`
    - Se o insert do audit log falhar, NAO deve bloquear a operacao de update (log warning apenas)

- [x] Task 5: Testes (AC: #1-#7)
  - [x] 5.1: Testes para pagina de edicao:
    - Carrega dados do grupo e pre-preenche formulario
    - Submit envia PUT com dados corretos
    - Erro de API exibe mensagem inline
    - Grupo nao encontrado exibe mensagem 404
  - [x] 5.2: Testes para `GroupEditForm`:
    - Renderiza com dados pre-preenchidos
    - Valida nome obrigatorio (min 2 chars)
    - Valida telegram IDs numericos
    - Select de status mostra apenas active/paused/inactive
    - Submit envia dados corretos
    - Botao "Cancelar" funciona
  - [x] 5.3: Testes para audit log no PUT handler:
    - Verifica que audit_log e inserido apos update
    - Verifica que changes contem old/new values
    - Verifica que falha no audit log nao bloqueia o update
  - [x] 5.4: Teste de enforcement: verificar que pagina de edicao usa API Route protegida (createApiHandler com allowedRoles: ['super_admin'])

## Dev Notes

### Contexto Critico - Primeira Edicao Real do Admin Panel

**Esta story estende a Story 1.4** (CRUD de Grupos) adicionando funcionalidade de edicao que estava desabilitada. O botao "Editar" na pagina de detalhes (`/groups/[groupId]`) foi intencionalmente deixado como `disabled` com tooltip "Funcionalidade de edicao sera implementada na Story 2.1".

**O backend para PUT ja existe!** A API Route `PUT /api/groups/[groupId]` ja foi implementada na Story 1.4 com validacao Zod e `createApiHandler`. Esta story precisa apenas:
1. Criar a UI de edicao (pagina + formulario)
2. Habilitar o botao na pagina de detalhes
3. Adicionar audit log

### Stack Tecnologica Atual do Admin Panel

| Tecnologia | Versao | Notas |
|------------|--------|-------|
| Next.js | 16.1.6 | App Router (NAO Pages Router) |
| TypeScript | 5.x | Strict mode |
| Tailwind CSS | 4.x | Styling |
| @supabase/supabase-js | ^2.95.3 | Database client |
| @supabase/ssr | ^0.8.0 | Auth helpers para Next.js App Router |
| Zod | 4.x | Validacao de schemas (ja adicionado na Story 1.4) |

### API Route PUT Existente (Story 1.4 — PRONTO)

A API Route `PUT /api/groups/[groupId]` ja esta implementada em:
`admin-panel/src/app/api/groups/[groupId]/route.ts`

```typescript
// Schema de validacao existente
const updateGroupSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
  telegram_group_id: z.number().nullable().optional(),
  telegram_admin_group_id: z.number().nullable().optional(),
  status: z.enum(['creating', 'active', 'paused', 'inactive', 'failed']).optional(),
});
```

**IMPORTANTE:** O schema backend aceita `creating` e `failed`, mas o dropdown da UI deve oferecer APENAS `active`, `paused`, `inactive` — os outros sao estados de sistema controlados pelo onboarding automatico (Story 2.3).

### Middleware Disponivel (Story 1.3 — PRONTO)

**OBRIGATORIO usar em todas as API Routes:**

```typescript
import { createApiHandler } from '@/middleware/api-handler';

export const PUT = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    // context.user, context.role, context.groupFilter, context.supabase
    // routeContext tem params (com groupId)
  },
  { allowedRoles: ['super_admin'] }
);
```

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

**Campos que esta story permite EDITAR na UI:**
- `name` — Nome do grupo/influencer (obrigatorio, min 2 chars)
- `telegram_group_id` — ID do grupo Telegram (opcional, numerico)
- `telegram_admin_group_id` — ID do grupo admin Telegram (opcional, numerico)
- `status` — Dropdown com active/paused/inactive (FR4)

**Campos que esta story NAO permite editar:**
- `id` — UUID (imutavel)
- `bot_token` — NUNCA exibir (seguranca - NFR-S2)
- `mp_product_id` — Gerenciado pelo onboarding (Story 2.3)
- `render_service_id` — Gerenciado pelo onboarding (Story 2.3)
- `checkout_url` — Gerenciado pelo onboarding (Story 2.3) — exibir read-only
- `created_at` — Imutavel

### Tipo TypeScript Existente (de `@/types/database`)

```typescript
export interface Group {
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

export type GroupListItem = Pick<Group, 'id' | 'name' | 'status' | 'telegram_group_id' | 'telegram_admin_group_id' | 'checkout_url' | 'created_at'>;
```

### Componentes Existentes Reutilizaveis

**GroupForm (`components/features/groups/GroupForm.tsx`):**
- Formulario atual de CRIACAO — props: `onSubmit`, `loading`, `error`
- Usa estado controlado com `useState`
- Validacao client-side para nome (min 2) e telegram IDs (numerico)
- **NAO reutilizar diretamente** para edicao: criar `GroupEditForm` separado porque:
  - Precisa de `initialData` para pre-preencher
  - Precisa de campo de status (dropdown)
  - Botao muda de "Criar Grupo" para "Salvar Alteracoes"
  - Botao "Cancelar" adicional

**group-utils.ts (`components/features/groups/group-utils.ts`):**
- `statusConfig` — mapeamento de status para label e classe Tailwind (reutilizar)
- `formatDate()` — formatacao PT-BR de data (reutilizar)
- `formatDateTime()` — formatacao PT-BR com hora (reutilizar)

### Pagina de Detalhes Atual (sera modificada)

`admin-panel/src/app/(auth)/groups/[groupId]/page.tsx`:
- Server Component que busca grupo por ID
- Exibe detalhes em cards
- Tem botao "Editar" **desabilitado** com `disabled` e `cursor-not-allowed`
- **Modificacao necessaria:** Substituir `<button disabled>` por `<Link href={/groups/${groupId}/edit}>`

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
- Arquivos TSX/TS: PascalCase para componentes (`GroupEditForm.tsx`)
- Tipos: PascalCase (`GroupEditFormData`)
- Funcoes: camelCase (`updateGroup`, `handleSubmit`)

**Anti-patterns PROIBIDOS:**
```typescript
// NUNCA: API Route sem createApiHandler
export const PUT = async (req: NextRequest) => { ... };

// NUNCA: Retornar dados sem wrapper { success, data }
return NextResponse.json(group);

// NUNCA: Expor bot_token na resposta da API
const { data } = await supabase.from('groups').select('*');
// CORRETO: Selecionar apenas campos necessarios
const { data } = await supabase.from('groups').select('id, name, status, ...');
```

### Supabase Client nas API Routes

**IMPORTANTE:** Usar `context.supabase` do TenantContext (retornado por `createApiHandler`). NAO criar novo client.

```typescript
export const PUT = createApiHandler(async (req, context, routeContext) => {
  const { groupId } = await (routeContext as GroupRouteContext).params;

  // Buscar dados atuais para audit log
  const { data: currentGroup } = await context.supabase
    .from('groups')
    .select('id, name, status, telegram_group_id, telegram_admin_group_id')
    .eq('id', groupId)
    .single();

  // ... atualizar e logar audit
}, { allowedRoles: ['super_admin'] });
```

### Supabase Client nas Pages (Server Components)

Para Server Components, usar `createClient()` de `@/lib/supabase-server`:

```typescript
import { createClient } from '@/lib/supabase-server';
```

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

### Audit Log Design Notes

**NFR-S5 requer audit log de acoes criticas com retencao de 90 dias.**

Design da tabela `audit_log`:
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,       -- 'groups', 'admin_users', etc
  record_id UUID NOT NULL,        -- ID do registro alterado
  action TEXT NOT NULL,           -- 'create', 'update', 'delete', 'status_change'
  changed_by UUID NOT NULL REFERENCES admin_users(id),
  changes JSONB NOT NULL,         -- { old: {...}, new: {...} }
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**IMPORTANTE:** Esta tabela sera reutilizada por TODAS as futuras stories que precisam de audit log (Story 2.2, 2.3, etc). Projetar de forma generica.

**O audit log NAO deve bloquear a operacao principal.** Se o insert falhar, logar um warning mas retornar sucesso da operacao de update.

### Inteligencia da Story 1.4 (Anterior)

**Licoes aprendidas no code review da Story 1.4:**
1. `createApiHandler` precisa de forward de route params — usar `routeContext` como terceiro argumento
2. Diferenciar erros de DB (500) vs erros de validacao/constraint (400) — verificar `error.code?.startsWith('23')`
3. Usar `GroupListItem` type em vez de `Group` completo para type safety na listagem
4. Shared utils (`group-utils.ts`) para DRY — statusConfig e formatDate
5. Error logging no auth layout — nao silenciar erros
6. Null checks para Telegram IDs — sao `number | null`, nao `number | undefined`
7. Zod v4 usa `.issues` em vez de `.errors` no resultado de `safeParse()`
8. Mock do Supabase query builder precisa encadear corretamente `from() -> select() -> order()/single()`

**Testes da Story 1.4 para referencia:**
- 24 testes API (groups.test.ts)
- 9 testes GroupCard
- 6 testes GroupForm
- Total: 121 testes passando no projeto

### Git Intelligence

**Commits recentes relevantes:**
- `d7c9b36` fix(admin): address 10 code review issues for groups CRUD
- `1f99e85` feat(admin): add groups CRUD with listing, creation, and detail pages
- `b07593a` feat(admin): add tenant middleware, API handlers, and route protection

**Branch atual:** `feature/crud-grupos`
**Branch sugerida para esta story:** Pode continuar na mesma branch `feature/crud-grupos` ou criar `feature/editar-grupos`

**Padroes de commit observados:**
- `feat(admin):` para novas funcionalidades do admin panel
- `fix(admin):` para correcoes
- Mensagens em ingles

### Estrutura de Arquivos a Criar/Modificar

```
admin-panel/src/
├── app/
│   ├── (auth)/
│   │   └── groups/
│   │       └── [groupId]/
│   │           ├── page.tsx                # MODIFICAR - Habilitar botao Editar
│   │           └── edit/
│   │               └── page.tsx            # NOVO - Pagina de edicao
│   └── api/
│       └── groups/
│           └── [groupId]/
│               └── route.ts               # MODIFICAR - Adicionar audit log no PUT
├── components/
│   └── features/
│       └── groups/
│           └── GroupEditForm.tsx           # NOVO - Formulario de edicao

sql/migrations/
└── 021_audit_log.sql                      # NOVO - Tabela de audit log
```

**Arquivos a MODIFICAR:**
- `admin-panel/src/app/(auth)/groups/[groupId]/page.tsx` — Habilitar botao "Editar" como Link
- `admin-panel/src/app/api/groups/[groupId]/route.ts` — Adicionar audit log no PUT handler

### Dependencias entre Stories

```
Story 1.4 (done) → Story 2.1 (esta)
   CRUD Grupos       Editar Grupos
   + Listagem         + Audit Log
```

**Story 2.1 depende de:**
- Story 1.4: Pagina de detalhes, API Route PUT, GroupForm, GroupCard, group-utils

**Story 2.1 prepara o terreno para:**
- Story 2.3: Onboarding automatico (usara status `creating` → `active` via audit log)
- Story 2.4: Dashboard consolidado (dados de grupos com status)
- Story 2.5: Notificacoes e alertas (audit log como base)

### FRs Cobertos por Esta Story

- **FR3:** Super Admin pode editar configuracoes de um grupo
- **FR4:** Super Admin pode pausar ou desativar um grupo

### NFRs Enderecados

- **NFR-S5:** Audit log de acoes criticas retido por 90 dias
- **NFR-S1:** Zero vazamento entre tenants (createApiHandler com allowedRoles + RLS)

### Status Badge Colors (referencia)

| Status | Cor (Tailwind) | Texto |
|--------|----------------|-------|
| `active` | `bg-green-100 text-green-800` | Ativo |
| `paused` | `bg-yellow-100 text-yellow-800` | Pausado |
| `inactive` | `bg-gray-100 text-gray-800` | Inativo |
| `creating` | `bg-blue-100 text-blue-800` | Criando |
| `failed` | `bg-red-100 text-red-800` | Falhou |

### Project Structure Notes

- Pagina de edicao fica em `(auth)/groups/[groupId]/edit/` — protegida pelo layout de auth
- API Route PUT ja existente em `api/groups/[groupId]/` — protegida por `createApiHandler({ allowedRoles: ['super_admin'] })`
- Componente `GroupEditForm` separado de `GroupForm` para separacao clara de responsabilidades
- Migration audit_log independente — sera reutilizada por futuras stories
- Nenhum conflito com arquivos existentes

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1: Editar e Gerenciar Status de Grupos]
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
- [Source: admin-panel/src/types/database.ts#GroupListItem type]
- [Source: admin-panel/src/middleware/api-handler.ts#createApiHandler]
- [Source: admin-panel/src/middleware/tenant.ts#withTenant]
- [Source: admin-panel/src/app/api/groups/[groupId]/route.ts#PUT handler existing]
- [Source: admin-panel/src/app/(auth)/groups/[groupId]/page.tsx#disabled edit button]
- [Source: admin-panel/src/components/features/groups/GroupForm.tsx#form pattern]
- [Source: admin-panel/src/components/features/groups/group-utils.ts#statusConfig]
- [Source: _bmad-output/implementation-artifacts/stories/1-4-crud-de-grupos-e-listagem.md - Story anterior]

## Change Log

- 2026-02-08: Story 2.1 implementada — edicao de grupos com formulario pre-preenchido, status dropdown (active/paused/inactive), audit log generico, e testes completos (138 testes passando, 0 falhas)
- 2026-02-08: Code review fixes — corrigido audit log error handling (try/catch → error check), corrigido RLS recursao infinita na migration 021 (inline sub-query → get_my_role()), testes de audit log aprimorados com verificacao de payload real, adicionado teste de no-op quando campos nao mudam. Total: 139 testes passando

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Code review encontrou 8 issues (3 HIGH, 3 MEDIUM, 2 LOW)
- H1: audit log usava try/catch para erros do Supabase que retorna {error} em vez de lançar excecao
- H2: migration 021 usava sub-query inline em admin_users causando recursao infinita RLS (mesmo bug que 020 corrigiu)
- H3: migration 020 nao documentada no File List
- M3: testes de audit log verificavam apenas from() chamado, nao o payload real

### Completion Notes List

- Task 1: Substituido `<button disabled>` por `<Link>` estilizado como botao com `bg-blue-600` na pagina de detalhes
- Task 2: Pagina de edicao criada como Client Component com fetch no useEffect, loading skeleton, tratamento 404, e redirect apos sucesso
- Task 3: GroupEditForm criado com pre-fill via initialData, dropdown de status (apenas active/paused/inactive), validacao client-side, e botao Cancelar
- Task 4.1: Migration 021_audit_log.sql criada com tabela generica, indices em table_name/record_id/created_at, RLS para super_admin (SELECT e INSERT)
- Task 4.2: PUT handler atualizado para buscar dados atuais antes do update, comparar campos alterados, e inserir audit_log com diff (old/new). Falha no audit log nao bloqueia o update
- Task 5: 17 novos testes adicionados (4 edit page, 9 GroupEditForm, 4 audit log/enforcement). Total: 138 testes passando

### File List

**Novos:**
- `admin-panel/src/app/(auth)/groups/[groupId]/edit/page.tsx` — Pagina de edicao de grupo
- `admin-panel/src/app/(auth)/groups/[groupId]/edit/page.test.tsx` — Testes da pagina de edicao
- `admin-panel/src/components/features/groups/GroupEditForm.tsx` — Componente de formulario de edicao
- `admin-panel/src/components/features/groups/GroupEditForm.test.tsx` — Testes do GroupEditForm
- `sql/migrations/020_fix_rls_infinite_recursion.sql` — Fix recursao infinita em RLS policies (SECURITY DEFINER helpers)
- `sql/migrations/021_audit_log.sql` — Migration da tabela audit_log

**Modificados:**
- `admin-panel/src/app/(auth)/groups/[groupId]/page.tsx` — Botao Editar habilitado como Link
- `admin-panel/src/app/api/groups/[groupId]/route.ts` — Audit log adicionado ao PUT handler
- `admin-panel/src/app/api/__tests__/groups.test.ts` — Testes de audit log e mock aprimorado para PUT
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Status da story 2-1 atualizado para review
