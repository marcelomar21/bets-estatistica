# Story 2.3: Onboarding Automatico de Influencer

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want fazer onboarding de um novo influencer em ate 5 passos,
So that um novo influencer esteja operacional rapidamente.

## Acceptance Criteria

1. **Given** Super Admin acessa `/groups/new` (FR36) **When** preenche: nome do influencer, email, seleciona bot do pool **Then** sistema valida o token do bot selecionado via Telegram API (`getMe`) e preenche automaticamente o `bot_username` com o username retornado
2. **Given** Super Admin submeteu o formulario de onboarding **When** os dados sao validos **Then** sistema executa onboarding automatico em sequencia:
   - (Step 1) Cria grupo no banco com `status = 'creating'`
   - (Step 2) Cria produto no Mercado Pago via API → salva `mp_product_id` e `checkout_url` (FR49)
   - (Step 3) Faz deploy do bot no Render via API → salva `render_service_id` (NFR-I4)
   - (Step 4) Cria usuario admin via Supabase Auth → insere em `admin_users` com `role = 'group_admin'`
   - (Step 5) Atualiza grupo para `status = 'active'`
3. **Given** onboarding esta em execucao **When** qualquer step e processado **Then** UI mostra progresso de cada step (creating → configurando MP → deploy bot → criando admin → ativo)
4. **Given** bot e selecionado durante onboarding **When** onboarding completa com sucesso **Then** bot e associado ao grupo via `bot_pool` (status muda para `in_use`, `group_id` preenchido) (FR28)
5. **Given** onboarding completou com sucesso **When** UI mostra resultado **Then** retorna: link do bot + credenciais de login do influencer (email + senha temporaria)
6. **Given** checkout_url criado no MP **When** onboarding finaliza **Then** checkout_url inclui `external_reference` com `group_id` do grupo (security audit: rastreabilidade no webhook)
7. **Given** qualquer step do onboarding falha **When** erro ocorre **Then** grupo fica com `status = 'failed'` e UI permite retry do step que falhou (pre-mortem)
8. **Given** onboarding completa em ate 5 passos/cliques (FR37) **When** Super Admin finaliza **Then** todo o processo e automatizado sem necessidade de acao manual adicional

## Tasks / Subtasks

- [x] Task 1: Criar API Route POST `/api/groups/onboarding` (AC: #1-#8)
  - [x] 1.1: Criar `admin-panel/src/app/api/groups/onboarding/route.ts` com handler POST
    - Proteger com `createApiHandler({ allowedRoles: ['super_admin'] })`
    - Validar body com Zod: `name` (string, min 2), `email` (string, email valido), `bot_id` (string, UUID)
    - Validar que bot existe, esta `available`, e pertence ao pool
    - Validar que email nao esta em uso em `admin_users`
  - [x] 1.2: Implementar Step 1 - Criar grupo no banco
    - INSERT em `groups` com `status = 'creating'`, campos basicos (name)
    - Retornar `group_id` para proximos steps
  - [x] 1.3: Implementar Step 2 - Validar bot via Telegram API
    - Buscar `bot_token` do `bot_pool` pelo `bot_id`
    - Chamar Telegram API `getMe` com o token para validar
    - Salvar `bot_username` retornado no bot_pool (caso diferente)
    - Se falhar: atualizar grupo para `status = 'failed'`, retornar erro
  - [x] 1.4: Implementar Step 3 - Criar produto no Mercado Pago
    - Criar client Mercado Pago em `admin-panel/src/lib/mercadopago.ts`
    - Chamar API de checkout preferences com `external_reference = group_id`
    - Salvar `mp_product_id` e `checkout_url` no grupo
    - Se falhar: atualizar grupo para `status = 'failed'`, retornar erro
  - [x] 1.5: Implementar Step 4 - Deploy do bot no Render
    - Criar client Render em `admin-panel/src/lib/render.ts`
    - Chamar Render API para criar servico a partir do blueprint
    - Passar env vars: `GROUP_ID`, `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
    - Salvar `render_service_id` no grupo
    - Se falhar: atualizar grupo para `status = 'failed'`, retornar erro
  - [x] 1.6: Implementar Step 5 - Criar usuario admin
    - Usar Supabase Admin API (`supabase.auth.admin.createUser`) para criar usuario com email e senha temporaria
    - INSERT em `admin_users` com `role = 'group_admin'`, `group_id = grupo criado`
    - Se falhar: atualizar grupo para `status = 'failed'`, retornar erro
  - [x] 1.7: Implementar Step 6 - Associar bot e finalizar
    - UPDATE `bot_pool` SET `status = 'in_use'`, `group_id = grupo_id` WHERE `id = bot_id`
    - INSERT em `bot_health` com `group_id` e status `offline` (bot ainda nao esta rodando)
    - UPDATE `groups` SET `status = 'active'`
    - Retornar: `{ group, checkout_url, admin_email, temp_password, bot_username }`
  - [x] 1.8: Implementar tratamento de falha com status intermediarios
    - Cada step atualiza `groups.status` para refletir progresso: `creating` → `active` ou `failed`
    - Em caso de falha, registrar qual step falhou para permitir retry
    - Registrar audit log: `action = 'onboarding'`, com campos: `step`, `status`, `error`

- [x] ~~Task 2: Criar API Route POST `/api/groups/onboarding/retry`~~ (REMOVIDO — refatorado para step-by-step)
  - Retry agora e nativo: frontend re-chama o step que falhou com o `group_id`
  - `retry/route.ts` deletado na refatoracao step-by-step

- [x] Task 3: Criar clients de integracao externa (AC: #2)
  - [x] 3.1: Criar `admin-panel/src/lib/mercadopago.ts`
    - Funcao `createCheckoutPreference(groupName, groupId)` → retorna `{ id, checkout_url }`
    - Usar `MERCADO_PAGO_ACCESS_TOKEN` do env
    - Retry com backoff (3 tentativas) seguindo pattern do project-context
    - Retornar `{ success, data }` ou `{ success, error }`
  - [x] 3.2: Criar `admin-panel/src/lib/render.ts`
    - Funcao `createBotService(groupId, botToken, envVars)` → retorna `{ service_id }`
    - Usar `RENDER_API_KEY` e `RENDER_BLUEPRINT_ID` do env
    - Retry com backoff (3 tentativas)
    - Retornar `{ success, data }` ou `{ success, error }`
  - [x] 3.3: Criar `admin-panel/src/lib/telegram.ts`
    - Funcao `validateBotToken(token)` → retorna `{ success, data: { username } }` ou `{ success: false, error }`
    - Chamar `https://api.telegram.org/bot{token}/getMe`
    - Sem retry (operacao rapida e idempotente)

- [x] Task 4: Redesenhar pagina `/groups/new` como wizard de onboarding (AC: #1, #3, #5, #8)
  - [x] 4.1: Criar `admin-panel/src/components/features/groups/OnboardingWizard.tsx`
    - Client Component com estado de steps
    - Formulario: nome do influencer, email, seletor de bot (dropdown com bots `available`)
    - Buscar bots disponiveis via `GET /api/bots` no mount
    - Submit chama `POST /api/groups/onboarding`
    - Validacao client-side: nome min 2 chars, email valido, bot selecionado
  - [x] 4.2: Implementar UI de progresso do onboarding
    - Stepper visual mostrando: Criando Grupo → Validando Bot → Config. Mercado Pago → Deploy Bot → Criando Admin → Concluido
    - Cada step mostra: icone (pendente/loading/sucesso/erro), label
    - Em caso de erro: mostra mensagem + botao "Tentar Novamente"
  - [x] 4.3: Implementar tela de sucesso
    - Exibir: nome do grupo, link do bot, email do admin, senha temporaria
    - Botao "Copiar Credenciais" para clipboard
    - Botao "Ir para Grupos" para voltar a listagem
  - [x] 4.4: Atualizar `admin-panel/src/app/(auth)/groups/new/page.tsx`
    - Substituir `GroupForm` por `OnboardingWizard`
    - Manter layout com breadcrumb para Grupos

- [x] Task 5: Criar tipos TypeScript (AC: #1-#8)
  - [x] 5.1: Atualizar `admin-panel/src/types/database.ts`
    - Adicionar tipo `OnboardingRequest`: `{ name: string; email: string; bot_id: string }`
    - Adicionar tipo `OnboardingResult`: `{ group: Group; checkout_url: string; admin_email: string; temp_password: string; bot_username: string }`
    - Adicionar tipo `OnboardingStep`: `'creating' | 'validating_bot' | 'configuring_mp' | 'deploying_bot' | 'creating_admin' | 'finalizing'`

- [x] Task 6: Testes (AC: #1-#8)
  - [x] 6.1: Testes para API Route `/api/groups/onboarding`:
    - POST cria grupo com onboarding completo (happy path)
    - POST rejeita body invalido (nome curto, email invalido, bot_id faltando)
    - POST rejeita bot que nao esta disponivel (status != 'available')
    - POST rejeita email ja em uso
    - POST retorna erro correto quando Telegram API falha
    - POST retorna erro correto quando MP API falha
    - POST retorna erro correto quando Render API falha
    - POST retorna erro correto quando Supabase Auth falha
    - POST marca grupo como 'failed' quando step falha
    - Endpoint protegido por `allowedRoles: ['super_admin']`
  - [x] 6.2: Testes para `OnboardingWizard` (8 test cases):
    - Renderiza formulario com campos nome, email, bot selector, preco
    - Mostra "Carregando bots..." enquanto bots carregam
    - Mostra mensagem quando nao ha bots disponiveis
    - Valida campos obrigatorios (nome, email, bot, preco)
    - Stepper progride durante execucao sequencial dos steps
    - Mostra tela de sucesso com credenciais (email, senha, bot, checkout_url)
    - Mostra erro + botao retry; retry retoma do step falho
    - Botao "Copiar Credenciais" copia texto correto para clipboard
  - [x] 6.3: Testes para clients de integracao:
    - `mercadopago.ts`: cria preference com dados corretos, trata erros
    - `render.ts`: cria servico com env vars corretas, trata erros
    - `telegram.ts`: valida token valido, rejeita token invalido

## Dev Notes

### Contexto Critico - Onboarding Multi-step

**Esta story implementa o onboarding completo de um novo influencer**, a operacao mais complexa do sistema. O onboarding integra 4 servicos externos (Telegram API, Mercado Pago API, Render API, Supabase Auth) em sequencia, cada um com possibilidade de falha.

**Pre-mortem da Arquitetura (CRITICO):**
- Onboarding e operacao multi-step SEM rollback automatico
- Grupo deve ter status intermediarios (`creating`, `active`, `failed`)
- Se qualquer API externa falhar no meio, DEVE ser possivel retry/resume sem recriar tudo
- UI DEVE mostrar status de cada step em tempo real

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

### Schemas de Banco Relevantes

**Tabela `groups` (Migration 019):**
```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  bot_token VARCHAR,
  telegram_group_id BIGINT,
  telegram_admin_group_id BIGINT,
  mp_product_id VARCHAR,
  render_service_id VARCHAR,
  checkout_url VARCHAR,
  status VARCHAR DEFAULT 'creating' CHECK (status IN ('creating', 'active', 'paused', 'inactive', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Tabela `bot_pool` (Migration 019):**
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

**Tabela `admin_users` (Migration 019):**
```sql
CREATE TABLE admin_users (
  id UUID PRIMARY KEY,  -- = Supabase Auth user id
  email VARCHAR NOT NULL,
  role VARCHAR NOT NULL,  -- super_admin / group_admin
  group_id UUID REFERENCES groups(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Tabela `bot_health` (Migration 019):**
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

### Middleware e API Handler (OBRIGATORIO)

```typescript
import { createApiHandler } from '@/middleware/api-handler';

export const POST = createApiHandler(
  async (req: NextRequest, context) => {
    // context.user, context.role, context.groupFilter, context.supabase
    // context.supabase usa anon key com RLS
  },
  { allowedRoles: ['super_admin'] }
);
```

**ATENCAO:** O `context.supabase` usa **anon key** (NAO service_role). Para operacoes que precisam de `supabase.auth.admin.createUser()`, e necessario criar um client separado com a `SUPABASE_SERVICE_KEY`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Usar supabaseAdmin para: auth.admin.createUser(), operacoes administrativas
// Usar context.supabase para: queries com RLS (grupos, bots, etc.)
```

### APIs Externas - Referencia

**Telegram Bot API - getMe:**
```
GET https://api.telegram.org/bot{token}/getMe
Response: { ok: true, result: { id, is_bot, first_name, username } }
Error: { ok: false, error_code: 401, description: "Unauthorized" }
```

**Mercado Pago - Criar Preferencia de Checkout:**
```
POST https://api.mercadopago.com/checkout/preferences
Headers: { Authorization: 'Bearer ACCESS_TOKEN', Content-Type: 'application/json' }
Body: {
  items: [{ title: 'Assinatura {groupName}', quantity: 1, currency_id: 'BRL', unit_price: valor }],
  external_reference: '{group_id}',
  auto_return: 'approved'
}
Response: { id, init_point (checkout_url) }
```

**Render API - Criar Servico:**
```
POST https://api.render.com/v1/services
Headers: { Authorization: 'Bearer API_KEY', Content-Type: 'application/json' }
Body: {
  type: 'web_service',
  name: 'bot-{groupName}',
  repo: 'https://github.com/user/bets-estatistica',
  envVars: [
    { key: 'GROUP_ID', value: '{group_id}' },
    { key: 'TELEGRAM_BOT_TOKEN', value: '{bot_token}' },
    ...
  ]
}
Response: { service: { id } }
```

**Supabase Auth Admin - Criar Usuario:**
```typescript
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email: 'influencer@email.com',
  password: generateTempPassword(),
  email_confirm: true  // Auto-confirma email
});
// data.user.id → usar como PK em admin_users
```

### Patterns Obrigatorios

**Response Format:**
```typescript
// Sucesso
return NextResponse.json({
  success: true,
  data: {
    group: { id, name, status, checkout_url },
    admin_email: 'email@example.com',
    temp_password: 'Abc123!@',
    bot_username: '@meu_bot'
  }
});

// Erro com step info
return NextResponse.json(
  {
    success: false,
    error: {
      code: 'ONBOARDING_FAILED',
      message: 'Falha ao criar produto no Mercado Pago',
      step: 'configuring_mp',
      group_id: 'uuid...'
    }
  },
  { status: 500 }
);
```

**Anti-patterns PROIBIDOS:**
```typescript
// NUNCA: API Route sem createApiHandler
export const POST = async (req: NextRequest) => { ... };

// NUNCA: Ignorar falha de step e continuar
await createMPProduct(); // Se falhar, NAO prosseguir para proximo step

// NUNCA: Deixar grupo em estado 'creating' indefinidamente
// Se falhar, SEMPRE marcar como 'failed'

// NUNCA: Retornar senha temporaria em log ou audit
logger.info('Admin criado', { email, password }); // ERRADO - nao logar senha!
```

### Inteligencia da Story 2.2 (Anterior)

**Licoes aprendidas:**
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
function createMockContext(role, queryBuilder) { ... }
```

### Pagina `/groups/new` Existente

A pagina `/groups/new` ja existe e atualmente usa `GroupForm` simples (nome + telegram IDs). Esta story SUBSTITUI o conteudo dessa pagina pelo `OnboardingWizard` com o fluxo completo de onboarding.

**Arquivo atual:** `admin-panel/src/app/(auth)/groups/new/page.tsx` (56 linhas)
- Client Component simples com `GroupForm`
- POST para `/api/groups` (criacao basica de grupo)

**Apos esta story:** A pagina usara `OnboardingWizard` que:
1. Mostra formulario com nome, email, seletor de bot
2. Submit chama `POST /api/groups/onboarding` (novo endpoint)
3. Mostra stepper de progresso
4. Mostra resultado com credenciais

**NOTA:** O endpoint `POST /api/groups` (criacao basica) continua existindo para casos de criacao manual sem onboarding completo. O novo endpoint `/api/groups/onboarding` e especifico para o fluxo automatizado.

### Variaveis de Ambiente Necessarias

```bash
# Ja existentes no admin-panel/.env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=  # NECESSARIO para auth.admin.createUser()

# NOVAS - adicionar ao .env.local e .env.example
MERCADO_PAGO_ACCESS_TOKEN=  # Token de acesso da API do Mercado Pago
MERCADO_PAGO_WEBHOOK_SECRET=  # Para validacao HMAC (usado em story futura 4.2)
RENDER_API_KEY=  # API key do Render.com
RENDER_BLUEPRINT_ID=  # ID do blueprint/template do bot no Render
```

### Git Intelligence

**Commits recentes relevantes:**
- `1420d8d` feat(admin): add bot pool management page and API (Story 2.2)
- `6b7203e` feat(admin): add group editing, status management, and audit log (Story 2.1)
- `1f99e85` feat(admin): add groups CRUD with listing, creation, and detail pages (Story 1.4)
- `b07593a` feat(admin): add tenant middleware, API handlers, and route protection (Story 1.3)

**Branch atual:** `feature/gestao-pool-bots`
**Branch sugerida para esta story:** `feature/onboarding-influencer`

**Padroes de commit:**
- `feat(admin):` para novas funcionalidades do admin panel
- Mensagens em ingles

### Estrutura de Arquivos a Criar/Modificar

```
admin-panel/src/
├── app/
│   ├── (auth)/
│   │   └── groups/
│   │       └── new/
│   │           └── page.tsx                           # MODIFICAR - trocar GroupForm por OnboardingWizard
│   └── api/
│       └── groups/
│           └── onboarding/
│               ├── route.ts                           # NOVO - POST onboarding completo
│               └── retry/
│                   └── route.ts                       # NOVO - POST retry de step falho
├── components/
│   └── features/
│       └── groups/
│           └── OnboardingWizard.tsx                   # NOVO - Wizard de onboarding com stepper
├── lib/
│   ├── mercadopago.ts                                # NOVO - Client Mercado Pago API
│   ├── render.ts                                     # NOVO - Client Render API
│   └── telegram.ts                                   # NOVO - Client Telegram Bot API (getMe)
└── types/
    └── database.ts                                    # MODIFICAR - adicionar tipos de onboarding
```

**Arquivos a CRIAR:**
- `admin-panel/src/app/api/groups/onboarding/route.ts` — API onboarding
- `admin-panel/src/app/api/groups/onboarding/retry/route.ts` — API retry
- `admin-panel/src/components/features/groups/OnboardingWizard.tsx` — Wizard UI
- `admin-panel/src/lib/mercadopago.ts` — Client Mercado Pago
- `admin-panel/src/lib/render.ts` — Client Render
- `admin-panel/src/lib/telegram.ts` — Client Telegram
- `admin-panel/src/app/api/__tests__/onboarding.test.ts` — Testes API
- `admin-panel/src/components/features/groups/OnboardingWizard.test.tsx` — Testes UI

**Arquivos a MODIFICAR:**
- `admin-panel/src/app/(auth)/groups/new/page.tsx` — Trocar para OnboardingWizard
- `admin-panel/src/types/database.ts` — Adicionar tipos de onboarding

### Dependencias entre Stories

```
Story 1.3 (done) → Story 2.3 (esta)
   Middleware         Onboarding (usa createApiHandler)
   + createApiHandler

Story 1.4 (done) → Story 2.3 (esta)
   CRUD Grupos        POST /api/groups continua existindo

Story 2.1 (done) → Story 2.3 (esta)
   Editar Grupos      Status transitions: creating → active/failed

Story 2.2 (done) → Story 2.3 (esta)
   Pool de Bots       Seleciona bot available, muda para in_use
```

**Story 2.3 prepara o terreno para:**
- Story 2.4: Dashboard consolidado (mostra grupos criados via onboarding)
- Story 4.2: Webhook Mercado Pago (usa `checkout_url` e `external_reference` criados aqui)
- Story 3.2: Login do Admin de Grupo (usa credenciais criadas aqui)

### FRs Cobertos por Esta Story

- **FR28:** Super Admin pode associar bot do pool a um novo grupo
- **FR36:** Super Admin pode acessar tela de onboarding de novo influencer
- **FR37:** Super Admin pode completar onboarding em ate 5 passos
- **FR49:** Cada grupo pode ter seu proprio link de checkout

### NFRs Enderecados

- **NFR-I4:** Deploy automatizado via Render (1 servico por bot)
- **NFR-S5:** Audit log de acoes criticas retido por 90 dias
- **NFR-S1:** Zero vazamento entre tenants (createApiHandler + RLS)

### Project Structure Notes

- Onboarding API fica em `api/groups/onboarding/` — sub-rota do groups
- Retry API fica em `api/groups/onboarding/retry/` — sub-rota do onboarding
- Wizard component fica em `components/features/groups/` — mesmo modulo de groups
- Novos clients (mercadopago, render, telegram) ficam em `lib/` — seguindo padrao de supabase.ts
- O endpoint POST /api/groups (criacao basica) NAO e alterado — coexiste com o onboarding
- Nenhuma migration nova necessaria — todas as tabelas ja existem

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3: Onboarding Automatico de Influencer]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2: Gestao de Grupos e Onboarding de Influencer — Pre-mortem]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Infrastructure & Deployment — Onboarding Automatico]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Schema: Novas Tabelas]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Middleware de Tenant (CRITICO)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#API Routes Patterns (Next.js)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#React Components Patterns]
- [Source: _bmad-output/project-context.md#Multi-Tenant Rules]
- [Source: _bmad-output/project-context.md#Service Response Pattern]
- [Source: _bmad-output/project-context.md#Error Handling Pattern — fetchWithRetry]
- [Source: _bmad-output/project-context.md#Naming Conventions]
- [Source: _bmad-output/project-context.md#Environment Variables — Admin Panel]
- [Source: admin-panel/src/middleware/api-handler.ts#createApiHandler]
- [Source: admin-panel/src/middleware/tenant.ts#withTenant + TenantContext]
- [Source: admin-panel/src/types/database.ts#Group, AdminUser, BotPool, BotHealth]
- [Source: admin-panel/src/app/(auth)/groups/new/page.tsx — Pagina atual a substituir]
- [Source: admin-panel/src/components/features/groups/GroupForm.tsx — Form atual (referencia)]
- [Source: admin-panel/src/app/api/bots/route.ts — API de bots (referencia de pattern)]
- [Source: admin-panel/src/lib/supabase-server.ts — Supabase server client]
- [Source: _bmad-output/implementation-artifacts/stories/2-2-gestao-do-pool-de-bots.md — Story anterior]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

### Completion Notes List

- All 6 tasks implemented (Tasks 1-6), with Task 6.2 (OnboardingWizard UI tests) left unchecked as it requires complex async UI mocking; API and integration client tests fully cover business logic
- Fixed Zod v4 UUID validation in tests: `00000000-0000-0000-0000-000000000001` is not a valid UUID v4 per Zod's regex (requires version nibble [1-8] and variant nibble [89ab]); used `a0000000-0000-4000-a000-000000000001` instead
- Audit log uses non-blocking closure pattern matching existing `groups/[groupId]/route.ts` implementation (context.supabase, not supabaseAdmin)
- `supabaseAdmin` (service_role key) used only for `auth.admin.createUser()` and email-in-use check (bypasses RLS)
- Pre-existing TypeScript errors in `GroupEditForm`, `dashboard/page.test.tsx`, and `layout.test.tsx` were not introduced by this story

### Change Log

| File | Action | Description |
|------|--------|-------------|
| `admin-panel/src/types/database.ts` | MODIFIED | Added OnboardingRequest, OnboardingResult, OnboardingStep types |
| `admin-panel/src/lib/telegram.ts` | CREATED | Telegram Bot API client - validateBotToken(token) |
| `admin-panel/src/lib/mercadopago.ts` | CREATED | Mercado Pago API client - createCheckoutPreference() with fetchWithRetry |
| `admin-panel/src/lib/render.ts` | CREATED | Render API client - createBotService() with fetchWithRetry |
| `admin-panel/src/app/api/groups/onboarding/route.ts` | CREATED | POST handler - 6-step onboarding pipeline with failure handling |
| `admin-panel/src/app/api/groups/onboarding/retry/route.ts` | CREATED | POST handler - retry from failed step onwards |
| `admin-panel/src/components/features/groups/OnboardingWizard.tsx` | CREATED | Client Component with form, stepper UI, success/error screens |
| `admin-panel/src/app/(auth)/groups/new/page.tsx` | MODIFIED | Replaced GroupForm with OnboardingWizard |
| `admin-panel/src/app/api/__tests__/onboarding.test.ts` | CREATED | 11 test cases for onboarding API route |
| `admin-panel/src/lib/__tests__/telegram.test.ts` | CREATED | 4 test cases for Telegram client |
| `admin-panel/src/lib/__tests__/mercadopago.test.ts` | CREATED | 4 test cases for Mercado Pago client |
| `admin-panel/src/lib/__tests__/render.test.ts` | CREATED | 5 test cases for Render client |

#### Code Review Fixes (2026-02-08)

| File | Action | Description |
|------|--------|-------------|
| `admin-panel/src/lib/fetch-utils.ts` | CREATED | Shared fetchWithRetry utility (extracted from mercadopago.ts and render.ts) |
| `admin-panel/src/lib/mercadopago.ts` | MODIFIED | Added `price` parameter, uses shared fetchWithRetry, removed hardcoded unit_price |
| `admin-panel/src/lib/render.ts` | MODIFIED | Removed unused RENDER_BLUEPRINT_ID validation, uses shared fetchWithRetry, added RENDER_REPO_URL validation |
| `admin-panel/src/types/database.ts` | MODIFIED | Added `price` field to OnboardingRequest |
| `admin-panel/src/app/api/groups/onboarding/route.ts` | MODIFIED | Added `price` to Zod schema, passes price to createCheckoutPreference |
| `admin-panel/src/app/api/groups/onboarding/retry/route.ts` | MODIFIED | Added optional `price` to retry schema, validates price when recreating MP preference |
| `admin-panel/src/components/features/groups/OnboardingWizard.tsx` | MODIFIED | Added price input field to form, passes price in onboarding and retry requests |
| `admin-panel/src/app/api/__tests__/onboarding.test.ts` | MODIFIED | Fixed 10 TS cast errors (as unknown as TenantResult), added happy path test, added price validation test, added price passthrough test |
| `admin-panel/src/lib/__tests__/mercadopago.test.ts` | MODIFIED | Updated for price parameter, verifies unit_price in body |
| `admin-panel/src/lib/__tests__/render.test.ts` | MODIFIED | Replaced RENDER_BLUEPRINT_ID test with RENDER_REPO_URL test |

#### Step-by-Step Refactor + Task 6.2 (2026-02-08)

| File | Action | Description |
|------|--------|-------------|
| `admin-panel/src/types/database.ts` | MODIFIED | Replaced OnboardingRequest/OnboardingResult with StepRequest discriminated union type |
| `admin-panel/src/app/api/groups/onboarding/route.ts` | REWRITTEN | Refactored from monolithic 6-step pipeline to step-by-step discriminated union handlers with idempotency |
| `admin-panel/src/app/api/groups/onboarding/retry/route.ts` | DELETED | No longer needed — step-by-step design supports native retry |
| `admin-panel/src/app/api/__tests__/onboarding.test.ts` | REWRITTEN | 21 tests adapted for step-by-step format with idempotency tests |
| `admin-panel/src/components/features/groups/OnboardingWizard.tsx` | REWRITTEN | Sequential step calls via for loop, local accumulators, retry resumes from failed step |
| `admin-panel/src/components/features/groups/OnboardingWizard.test.tsx` | CREATED | 8 test cases for OnboardingWizard UI (Task 6.2) |

### Review Follow-ups (AI)

- [ ] [AI-Review][MEDIUM] Stepper de progresso nao mostra atualizacao incremental em tempo real (AC #3 parcial). Requer mudanca arquitetural: implementar SSE ou ReadableStream para enviar progresso step-by-step do backend para a UI. [OnboardingWizard.tsx + onboarding/route.ts]
- [x] [AI-Review][MEDIUM] Task 6.2 (testes OnboardingWizard) implementado — 8 testes de UI com @testing-library/react [OnboardingWizard.test.tsx]

### File List

- `admin-panel/src/types/database.ts`
- `admin-panel/src/lib/fetch-utils.ts`
- `admin-panel/src/lib/telegram.ts`
- `admin-panel/src/lib/mercadopago.ts`
- `admin-panel/src/lib/render.ts`
- `admin-panel/src/app/api/groups/onboarding/route.ts`
- `admin-panel/src/components/features/groups/OnboardingWizard.tsx`
- `admin-panel/src/app/(auth)/groups/new/page.tsx`
- `admin-panel/src/app/api/__tests__/onboarding.test.ts`
- `admin-panel/src/components/features/groups/OnboardingWizard.test.tsx`
- `admin-panel/src/lib/__tests__/telegram.test.ts`
- `admin-panel/src/lib/__tests__/mercadopago.test.ts`
- `admin-panel/src/lib/__tests__/render.test.ts`
