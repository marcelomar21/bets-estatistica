---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
status: 'complete'
completedAt: '2026-02-05'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/project-context.md
  - docs/index.md
  - docs/project-overview.md
  - docs/architecture.md
  - docs/data-models.md
  - docs/development-guide.md
  - docs/metrics.md
  - docs/source-tree-analysis.md
workflowType: 'architecture'
project_name: 'bets-estatistica'
user_name: 'Marcelomendes'
date: '2026-02-05'
scope: 'SaaS Multi-tenant Platform'
---

# Architecture Decision Document - SaaS Multi-tenant

_Este documento é construído colaborativamente através de descoberta passo-a-passo. Seções são adicionadas conforme trabalhamos em cada decisão arquitetural juntos._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements (58 FRs em 8 domínios):**

| Domínio | FRs | Descrição |
|---------|-----|-----------|
| Gestão de Grupos | FR1-5 | CRUD de tenants com isolamento completo |
| Gestão de Membros | FR6-16 | Trial via MP, kick por expiração, acesso instantâneo |
| Gestão de Apostas | FR17-25 | Distribuição round-robin entre grupos |
| Gestão de Bots | FR26-33 | Pool de bots, health check, restart remoto |
| Painel Super Admin | FR34-38 | Dashboard consolidado, onboarding influencers |
| Painel Group Admin | FR39-43 | Dashboard do grupo, lista de membros |
| Pagamentos | FR44-49 | Mercado Pago webhook multi-tenant |
| Notificações | FR50-54 | Telegram DM + alertas admin |
| Segurança | FR55-58 | Supabase Auth + RLS + middleware |

**Non-Functional Requirements (22 NFRs):**

| Categoria | NFRs Críticos | Impacto Arquitetural |
|-----------|---------------|---------------------|
| **Performance** | P2: Acesso < 30s após pagamento | Webhook processing rápido |
| **Security** | S1: Zero vazamento entre tenants | RLS + middleware obrigatório |
| **Reliability** | R2: Health check detecta em ≤ 2min | Monitoramento ativo de bots |
| **Scalability** | SC1: 30k membros sem degradação | Arquitetura adequada |

**Scale & Complexity:**

- Primary domain: Full-stack (Backend + Frontend + Multi-Bot)
- Complexity level: Média-Alta
- Multi-tenancy: Sim (isolamento por `group_id`)
- Real-time: Não (reload manual por simplicidade)
- Escala MVP: 3 influencers, ~9.000 membros totais

### Technical Constraints & Dependencies

| Constraint | Origem | Impacto |
|------------|--------|---------|
| Node.js 20+ CommonJS | project-context | Manter padrão existente nos bots |
| Supabase PostgreSQL | Existente | RLS nativo disponível |
| Next.js App Router | PRD decisão | Admin panel novo |
| 1 bot = 1 processo | PRD decisão | Deploy separado no Render |
| Mercado Pago | PRD decisão | Substituiu Cakto |

### Cross-Cutting Concerns Identificados

1. **Multi-tenancy** - `group_id` em todas as tabelas + RLS + middleware obrigatório
2. **Bot Management** - Pool de bots, 1 processo por bot, health check com alertas
3. **Webhook Processing** - Mercado Pago com validação HMAC + idempotency
4. **Permissões em Dois Níveis** - Super Admin (null group_id) vs Group Admin (specific group_id)
5. **Auditoria** - Audit trail de ações críticas (90 dias de retenção)

### Foco MVP vs Futuro

**Prioridade Agora:**
- Multi-tenancy funciona e isola dados ✓
- Bots não caem (ou recuperam rápido) ✓
- Pagamento → acesso instantâneo ✓
- Admin panel usável ✓

**Não Necessário Agora:**
- Cache layer
- Load balancing
- Multi-region
- Escala para milhões

---

## Starter Template Evaluation

### Primary Technology Domain

**Projeto Brownfield** - Sistema existente sendo estendido para multi-tenant.

### Base Técnica Existente (Funciona)

| Componente | Tecnologia | Status |
|------------|------------|--------|
| **Bots Telegram** | Node.js 20+ CommonJS | ✅ Funcionando |
| **Database** | Supabase PostgreSQL | ✅ Funcionando |
| **Pagamentos** | Mercado Pago | ✅ Funcionando |
| **Jobs** | node-cron | ✅ Funcionando |
| **Deploy Bots** | Render | ✅ Funcionando |

### Novo Componente (Criar)

| Componente | Tecnologia | Comando |
|------------|------------|---------|
| **Admin Panel** | Next.js 14+ App Router | `npx create-next-app@latest` |
| **Autenticação** | Supabase Auth | Integrado ao Next.js |
| **Deploy Admin** | Vercel | Conectar repo |

**Comando de Inicialização:**
```bash
npx create-next-app@latest admin-panel --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

### Adaptações Necessárias (Existente → Multi-tenant)

| Componente | Adaptação Necessária |
|------------|---------------------|
| **Banco de dados** | Adicionar `group_id` em tabelas relevantes |
| **RLS** | Criar policies de Row Level Security |
| **Webhook Mercado Pago** | Identificar grupo via `external_reference` |
| **Bots** | Replicar deploy para cada influencer |
| **Middleware** | Validar `group_id` em todas as requisições |

### Decisões Arquiteturais do PRD (Já Definidas)

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| **Admin Framework** | Next.js App Router | API Routes integradas |
| **Auth** | Supabase Auth | RLS nativo com JWT |
| **Bot Deploy** | 1 processo = 1 bot | Isolamento, simplicidade |
| **Real-time** | Não | Reload manual, menos complexidade |

---

## Core Architectural Decisions

### Decision Summary

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| **Identificação grupo no MP** | Produto por grupo | Cada influencer tem seu próprio produto no Mercado Pago |
| **Distribuição de apostas** | Pool global → round-robin | Gera pool único, distribui entre grupos |
| **Health check** | Bot pinga Supabase | Tabela `bot_health` com heartbeat |
| **Restart remoto** | Flag no Supabase | Bot verifica flag, faz `process.exit(1)`, Render reinicia |
| **Onboarding** | 100% automático | MP API + Render API + Supabase |

### Data Architecture

**Tabelas Novas:**

| Tabela | Descrição |
|--------|-----------|
| `groups` | Tenants (influencers) |
| `admin_users` | Usuários do painel admin |
| `bot_pool` | Pool de bots disponíveis |
| `bot_health` | Status/heartbeat dos bots |

**Campos Novos em Tabelas Existentes:**

| Tabela | Campo | Descrição |
|--------|-------|-----------|
| `members` | `group_id` | FK → groups |
| `suggested_bets` | `group_id` | FK → groups (após distribuição) |
| `suggested_bets` | `distributed_at` | Timestamp da distribuição |

**Tabelas SEM group_id (dados globais):**
- `league_matches` - partidas são globais
- `game_analysis` - análises são globais
- `league_seasons`, `league_players`, etc.

### Schema: Novas Tabelas

```sql
-- Grupos/Tenants
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  bot_token VARCHAR,  -- Criptografado
  telegram_group_id BIGINT,
  telegram_admin_group_id BIGINT,
  mp_product_id VARCHAR,  -- Produto no Mercado Pago
  render_service_id VARCHAR,  -- Serviço no Render
  checkout_url VARCHAR,
  status VARCHAR DEFAULT 'active',  -- active/paused/inactive
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Usuários admin do painel
CREATE TABLE admin_users (
  id UUID PRIMARY KEY,  -- = Supabase Auth user id
  email VARCHAR NOT NULL,
  role VARCHAR NOT NULL,  -- super_admin / group_admin
  group_id UUID REFERENCES groups(id),  -- NULL para super_admin
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pool de bots disponíveis
CREATE TABLE bot_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token VARCHAR NOT NULL,  -- Criptografado
  bot_username VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'available',  -- available / in_use
  group_id UUID REFERENCES groups(id),  -- Quando em uso
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Health check dos bots
CREATE TABLE bot_health (
  group_id UUID PRIMARY KEY REFERENCES groups(id),
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  status VARCHAR DEFAULT 'online',  -- online / offline
  restart_requested BOOLEAN DEFAULT false,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Authentication & Security

**Dois Níveis de Acesso:**

| Role | group_id | Acesso |
|------|----------|--------|
| `super_admin` | NULL | Todos os grupos, todas as funcionalidades |
| `group_admin` | UUID | Apenas seu grupo (RLS automático) |

**RLS Policies:**
```sql
-- Exemplo para members
CREATE POLICY "Users see own group members" ON members
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'super_admin'
    OR group_id = (auth.jwt() ->> 'group_id')::uuid
  );
```

**Middleware Obrigatório:**
```javascript
// Toda rota API passa por aqui
function tenantMiddleware(req, res, next) {
  const user = req.user;
  if (user.role === 'super_admin') {
    req.groupFilter = null;  // vê tudo
  } else {
    req.groupFilter = user.group_id;  // só seu grupo
  }
  next();
}
```

### API & Communication

**Health Check Flow:**
```
Bot (a cada 1 min) → UPDATE bot_health SET last_heartbeat = now()
Admin Panel → SELECT * FROM bot_health WHERE last_heartbeat < now() - interval '2 min'
                → Mostrar como OFFLINE
```

**Restart Flow:**
```
Admin clica "Reiniciar" → UPDATE bot_health SET restart_requested = true
Bot (no health check) → SE restart_requested ENTÃO process.exit(1)
Render → Detecta processo morto → Reinicia automaticamente
Bot → UPDATE bot_health SET restart_requested = false, last_heartbeat = now()
```

### Infrastructure & Deployment

**Onboarding Automático (Super Admin cria influencer):**

```
1. POST /api/groups (Next.js API Route)
   │
   ├─ 2. INSERT INTO groups (...)
   │
   ├─ 3. Mercado Pago API: criar produto
   │     POST /checkout/preferences
   │     → Salva mp_product_id, checkout_url
   │
   ├─ 4. Render API: deploy do bot
   │     POST /services (usando Blueprint)
   │     → Salva render_service_id
   │
   ├─ 5. Supabase Auth: criar usuário admin
   │     → INSERT INTO admin_users (role = 'group_admin')
   │
   └─ 6. Retorna: { group, admin_login, bot_link }
```

**Dependências para Onboarding:**
- `MERCADO_PAGO_ACCESS_TOKEN`
- `RENDER_API_KEY`
- `RENDER_BLUEPRINT_ID` (template do bot)

---

## Implementation Patterns & Consistency Rules

### Patterns Existentes (manter do project-context.md)

| Pattern | Regra |
|---------|-------|
| **DB Naming** | snake_case, plural (`members`, `groups`) |
| **JS Naming** | camelCase (`getMemberById`) |
| **Service Response** | `{ success: true, data }` ou `{ success: false, error }` |
| **Logging** | `logger.info/warn/error` com contexto |
| **Supabase Access** | Sempre via `lib/supabase.js` |

### Middleware de Tenant (CRÍTICO)

**Toda API Route que acessa dados com `group_id` DEVE usar este middleware:**

```javascript
// middleware/tenant.js
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function withTenant(req) {
  const supabase = createMiddlewareClient({ req });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'UNAUTHORIZED', groupFilter: null };
  }

  // Busca role e group_id do usuário
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('role, group_id')
    .eq('id', user.id)
    .single();

  if (adminUser.role === 'super_admin') {
    return {
      user,
      role: 'super_admin',
      groupFilter: null  // Vê TUDO
    };
  }

  return {
    user,
    role: 'group_admin',
    groupFilter: adminUser.group_id  // Só seu grupo
  };
}
```

**Uso obrigatório em API Routes:**

```javascript
// app/api/members/route.js
import { withTenant } from '@/middleware/tenant';

export async function GET(req) {
  const { error, groupFilter, role } = await withTenant(req);

  if (error) {
    return NextResponse.json({ success: false, error }, { status: 401 });
  }

  let query = supabase.from('members').select('*');

  // 🔒 CRÍTICO: Sempre filtrar se não for super_admin
  if (groupFilter) {
    query = query.eq('group_id', groupFilter);
  }

  const { data, error: dbError } = await query;

  return NextResponse.json({ success: true, data });
}
```

### API Routes Patterns (Next.js)

**Naming:**
| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/groups` | GET/POST | Listar/criar grupos |
| `/api/groups/[groupId]` | GET/PUT | Detalhes/atualizar grupo |
| `/api/groups/[groupId]/members` | GET | Membros do grupo |
| `/api/bots/[groupId]/restart` | POST | Reiniciar bot |
| `/api/bets/distribute` | POST | Distribuir apostas |

**Response Format:**
```javascript
// Sucesso
return NextResponse.json({ success: true, data: {...} });

// Erro
return NextResponse.json(
  { success: false, error: { code: 'NOT_FOUND', message: '...' } },
  { status: 404 }
);
```

### React Components Patterns (Admin Panel)

**Naming:**
- Arquivos: `PascalCase.tsx` (`MemberList.tsx`)
- Componentes: `PascalCase` (`<MemberList />`)
- Hooks: `useCamelCase` (`useMembers`)

**Estrutura do Admin Panel:**
```
app/
├── (auth)/           # Rotas que requerem login
│   ├── dashboard/
│   ├── members/
│   └── bets/
├── (public)/         # Rotas públicas
│   └── login/
├── api/              # API Routes
└── components/       # Componentes compartilhados
```

### Bot Health Check Pattern

```javascript
// Bots pingam a cada 60 segundos
async function heartbeat() {
  await supabase
    .from('bot_health')
    .upsert({
      group_id: GROUP_ID,
      last_heartbeat: new Date().toISOString(),
      status: 'online',
      restart_requested: false
    });
}

// Verificar se deve reiniciar
async function checkRestart() {
  const { data } = await supabase
    .from('bot_health')
    .select('restart_requested')
    .eq('group_id', GROUP_ID)
    .single();

  if (data?.restart_requested) {
    logger.info('Restart solicitado, encerrando...');
    process.exit(1);  // Render reinicia automaticamente
  }
}
```

### Enforcement Guidelines

**Todos os AI Agents DEVEM:**
1. ✅ Usar `withTenant()` em TODA API Route com dados por grupo
2. ✅ Aplicar `.eq('group_id', groupFilter)` quando `groupFilter !== null`
3. ✅ Seguir Service Response Pattern (`{ success, data/error }`)
4. ✅ Usar naming conventions (snake_case DB, camelCase JS)
5. ✅ Logar com contexto (`logger.info('Ação', { groupId, userId })`)

**Anti-Patterns (EVITAR):**
```javascript
// ❌ Query sem filtro de tenant
const members = await supabase.from('members').select('*');

// ❌ Retornar dados diretamente
return NextResponse.json(data);

// ❌ Ignorar erro de auth
const { groupFilter } = await withTenant(req);
// Esqueceu de checar error!
```

**Checklist para Code Review:**
- [ ] API Route usa `withTenant()`?
- [ ] Tratou erro de autenticação?
- [ ] Query aplica filtro de `group_id`?
- [ ] Response segue o pattern `{ success, data/error }`?

---

## Project Structure & Boundaries

### Visão Geral dos Repositórios

```
bets-estatistica/          # Repositório existente (Bots + Backend)
admin-panel/               # Novo repositório (Next.js)
```

### Bots (Existente - Adaptar para Multi-tenant)

```
bets-estatistica/
├── bot/
│   ├── index.js                    # Entry point (polling/dev)
│   ├── server.js                   # Entry point (webhook/prod)
│   ├── telegram.js                 # Singleton client
│   ├── handlers/
│   │   ├── adminGroup.js           # Comandos admin existentes
│   │   └── mpWebhook.js            # [ADAPTAR] Mercado Pago multi-tenant
│   ├── jobs/
│   │   ├── postBets.js             # [ADAPTAR] Postar só do seu grupo
│   │   ├── healthCheck.js          # [ADAPTAR] Pingar bot_health
│   │   ├── membership/
│   │   │   ├── trial-reminders.js  # [REMOVER] Trial gerenciado pelo Mercado Pago
│   │   │   └── kick-expired.js     # [ADAPTAR] Por grupo
│   │   └── ...
│   └── services/
│       ├── memberService.js        # [ADAPTAR] Filtrar por group_id
│       └── betService.js           # [ADAPTAR] Filtrar por group_id
├── lib/
│   ├── supabase.js                 # Cliente Supabase (manter)
│   ├── logger.js                   # Logging (manter)
│   └── config.js                   # [ADAPTAR] GROUP_ID do env
└── sql/
    └── migrations/
        └── 010_multitenant.sql     # [NOVO] Tabelas multi-tenant
```

### Admin Panel (Novo - Next.js)

```
admin-panel/
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── .env.local
├── .env.example
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                # Redirect para /dashboard ou /login
│   │   │
│   │   ├── (public)/
│   │   │   └── login/
│   │   │       └── page.tsx        # Login com Supabase Auth
│   │   │
│   │   ├── (auth)/                 # Rotas protegidas
│   │   │   ├── layout.tsx          # Verifica auth + carrega user
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx        # Dashboard (Super ou Group)
│   │   │   ├── groups/
│   │   │   │   ├── page.tsx        # Lista grupos (Super only)
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx    # Onboarding influencer
│   │   │   │   └── [groupId]/
│   │   │   │       └── page.tsx    # Detalhes do grupo
│   │   │   ├── members/
│   │   │   │   └── page.tsx        # Lista membros
│   │   │   ├── bets/
│   │   │   │   ├── page.tsx        # Lista apostas
│   │   │   │   └── distribute/
│   │   │   │       └── page.tsx    # Distribuir apostas (Super)
│   │   │   └── bots/
│   │   │       └── page.tsx        # Status dos bots (Super)
│   │   │
│   │   └── api/
│   │       ├── groups/
│   │       │   ├── route.ts        # GET (list), POST (create)
│   │       │   └── [groupId]/
│   │       │       ├── route.ts    # GET, PUT, DELETE
│   │       │       └── members/
│   │       │           └── route.ts
│   │       ├── members/
│   │       │   └── route.ts
│   │       ├── bets/
│   │       │   ├── route.ts
│   │       │   └── distribute/
│   │       │       └── route.ts
│   │       ├── bots/
│   │       │   ├── route.ts        # GET status
│   │       │   └── [groupId]/
│   │       │       └── restart/
│   │       │           └── route.ts
│   │       └── webhooks/
│   │           └── mercadopago/
│   │               └── route.ts    # Webhook MP
│   │
│   ├── components/
│   │   ├── ui/                     # Componentes base (Button, Input, etc)
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── NavMenu.tsx
│   │   └── features/
│   │       ├── groups/
│   │       │   ├── GroupCard.tsx
│   │       │   └── GroupForm.tsx
│   │       ├── members/
│   │       │   ├── MemberList.tsx
│   │       │   └── MemberCard.tsx
│   │       └── bots/
│   │           └── BotStatus.tsx
│   │
│   ├── lib/
│   │   ├── supabase.ts             # Cliente Supabase
│   │   ├── mercadopago.ts          # Cliente MP API
│   │   └── render.ts               # Cliente Render API
│   │
│   ├── middleware/
│   │   └── tenant.ts               # withTenant()
│   │
│   └── types/
│       ├── database.ts             # Tipos das tabelas
│       └── api.ts                  # Tipos das responses
│
└── middleware.ts                   # Next.js middleware (auth redirect)
```

### Architectural Boundaries

**API Boundaries:**
| Boundary | Responsabilidade |
|----------|------------------|
| Admin Panel API Routes | CRUD de dados, autenticação |
| Bot Webhook Handler | Recebe webhooks Mercado Pago |
| Supabase RLS | Última linha de defesa do isolamento |

**Data Flow:**
```
Mercado Pago → Webhook → Admin Panel API → Supabase → Bot lê e age
                                              ↑
                                              │
Super Admin → Admin Panel UI → API Routes ────┘
                                              │
Group Admin → Admin Panel UI → API Routes ────┘ (filtrado por group_id)
```

### Requirements to Structure Mapping

| FRs | Funcionalidade | Arquivos Principais |
|-----|----------------|---------------------|
| FR1-5 | Gestão Grupos | `admin-panel/src/app/(auth)/groups/`, `api/groups/` |
| FR6-16 | Gestão Membros | `admin-panel/src/app/(auth)/members/`, `bot/services/memberService.js` |
| FR17-25 | Gestão Apostas | `admin-panel/src/app/(auth)/bets/`, `bot/jobs/postBets.js` |
| FR26-33 | Gestão Bots | `admin-panel/src/app/(auth)/bots/`, `bot/jobs/healthCheck.js` |
| FR34-43 | Painéis Admin | `admin-panel/src/app/(auth)/dashboard/` |
| FR44-49 | Pagamentos MP | `admin-panel/src/app/api/webhooks/mercadopago/` |
| FR55-58 | Segurança | `admin-panel/src/middleware/tenant.ts`, RLS no Supabase |

### Integration Points

**Bot ↔ Supabase:**
- Leitura: apostas do grupo, membros do grupo
- Escrita: heartbeat, status de membros

**Admin Panel ↔ Supabase:**
- CRUD completo via API Routes
- Autenticação via Supabase Auth

**Admin Panel ↔ Mercado Pago API:**
- Criar produtos (onboarding)
- Receber webhooks de pagamento

**Admin Panel ↔ Render API:**
- Deploy de novos bots
- (Futuro) Restart de bots

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
| Tecnologias | Status |
|-------------|--------|
| Next.js 14+ + Supabase Auth | ✅ Integração nativa |
| Node.js 20+ + Supabase | ✅ Já funcionando em produção |
| Mercado Pago webhooks | ✅ Já implementado |
| RLS + Middleware tenant | ✅ Defesa em camadas complementares |

**Pattern Consistency:**
- ✅ Naming conventions consistentes (snake_case DB, camelCase JS)
- ✅ Service Response Pattern aplicado em todos os services
- ✅ Middleware de tenant obrigatório em todas API Routes
- ✅ Health check pattern padronizado para todos os bots

**Structure Alignment:**
- ✅ Dois repositórios com responsabilidades claras
- ✅ Boundaries bem definidos (Admin Panel ↔ Bots ↔ Supabase)
- ✅ Mapeamento FR → arquivos completo

### Requirements Coverage Validation ✅

**Functional Requirements (58 FRs):**
| Categoria | FRs | Cobertura |
|-----------|-----|-----------|
| Gestão de Grupos | FR1-5 | ✅ `api/groups/`, RLS |
| Gestão de Membros | FR6-16 | ✅ `memberService`, `api/members/` |
| Gestão de Apostas | FR17-25 | ✅ `postBets.js`, `api/bets/distribute/` |
| Gestão de Bots | FR26-33 | ✅ `bot_health`, `api/bots/` |
| Painel Super Admin | FR34-38 | ✅ `(auth)/dashboard/`, `groups/` |
| Painel Group Admin | FR39-43 | ✅ `(auth)/dashboard/`, RLS filtra |
| Pagamentos | FR44-49 | ✅ `api/webhooks/mercadopago/` |
| Notificações | FR50-54 | ✅ Jobs existentes, adaptar |
| Segurança | FR55-58 | ✅ `withTenant()`, RLS, Supabase Auth |

**Non-Functional Requirements (22 NFRs):**
| NFR | Requisito | Cobertura |
|-----|-----------|-----------|
| NFR-P2 | Acesso < 30s após pagamento | ✅ Webhook → DB → Bot lê |
| NFR-S1 | Zero vazamento entre tenants | ✅ RLS + Middleware |
| NFR-R2 | Health check ≤ 2min | ✅ `bot_health` com heartbeat |
| NFR-SC1 | 30k membros | ✅ Arquitetura adequada |

### Implementation Readiness Validation ✅

**Decision Completeness:**
- ✅ Todas as decisões críticas documentadas
- ✅ Schemas SQL definidos
- ✅ Exemplos de código para patterns críticos
- ✅ Middleware de tenant com código completo

**Structure Completeness:**
- ✅ Estrutura de diretórios completa para ambos repositórios
- ✅ Mapeamento de arquivos por funcionalidade
- ✅ Integration points documentados

**Pattern Completeness:**
- ✅ Naming conventions definidas
- ✅ API Response format padronizado
- ✅ Health check pattern com código
- ✅ Checklist de code review

### Gap Analysis Results

| Gap | Prioridade | Nota |
|-----|------------|------|
| Testes automatizados | Nice-to-have | Definir durante implementação |
| CI/CD pipeline | Nice-to-have | GitHub Actions depois |
| Rollback de migrations | Nice-to-have | Manual por agora |
| Monitoring/Alertas | Nice-to-have | UptimeRobot existente |

**Nenhum gap crítico ou bloqueante identificado.**

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context analisado (58 FRs, 22 NFRs)
- [x] Escala avaliada (MVP: 3 influencers, 9k membros)
- [x] Constraints técnicos identificados
- [x] Cross-cutting concerns mapeados

**✅ Architectural Decisions**
- [x] Multi-tenancy com group_id
- [x] Produto por grupo no Mercado Pago
- [x] Health check via Supabase
- [x] Onboarding 100% automático

**✅ Implementation Patterns**
- [x] Middleware de tenant obrigatório
- [x] Service Response Pattern
- [x] Naming conventions
- [x] API Routes patterns

**✅ Project Structure**
- [x] Estrutura de diretórios completa
- [x] Boundaries definidos
- [x] Mapeamento FR → arquivos

### Architecture Readiness Assessment

**Overall Status:** ✅ READY FOR IMPLEMENTATION

**Confidence Level:** ALTA

**Key Strengths:**
1. Multi-tenancy com defesa em camadas (RLS + Middleware)
2. Infraestrutura existente funcionando (bots, MP)
3. Patterns consistentes com projeto existente
4. Onboarding automatizado reduz trabalho manual

**Areas for Future Enhancement:**
1. Dashboard de métricas (MRR, churn)
2. Testes automatizados de isolamento
3. CI/CD com validação de RLS

---

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED ✅
**Total Steps Completed:** 8
**Date Completed:** 2026-02-05
**Document Location:** `_bmad-output/planning-artifacts/architecture-multitenant.md`

### Final Architecture Deliverables

**Complete Architecture Document:**
- 5 decisões arquiteturais principais documentadas
- Schemas SQL para novas tabelas multi-tenant
- Middleware de tenant com código completo
- Implementation patterns para consistência

**Implementation Ready Foundation:**
- Multi-tenancy com `group_id` + RLS
- Health check via Supabase
- Onboarding 100% automático
- 58 FRs + 22 NFRs suportados

**AI Agent Implementation Guide:**
- Estrutura de diretórios para ambos repositórios
- Mapeamento FR → arquivos
- Checklist de code review
- Anti-patterns documentados

### Implementation Handoff

**Para AI Agents:**
Este documento é o guia completo para implementar a plataforma SaaS multi-tenant. Seguir todas as decisões, patterns e estruturas exatamente como documentado.

**Primeira Prioridade de Implementação:**

```bash
# 1. Criar migration multi-tenant
sql/migrations/010_multitenant.sql

# 2. Aplicar no Supabase

# 3. Criar admin-panel
npx create-next-app@latest admin-panel --typescript --tailwind --eslint --app --src-dir

# 4. Adaptar bots existentes para multi-tenant
```

**Sequência de Desenvolvimento:**

1. Migration SQL (tabelas novas + group_id nas existentes)
2. RLS policies no Supabase
3. Admin Panel básico (login + dashboard)
4. Adaptar bots para filtrar por group_id
5. Onboarding automático (MP API + Render API)
6. Health check e monitoramento

### Quality Assurance Checklist

**✅ Architecture Coherence**
- [x] Todas as decisões funcionam juntas
- [x] Tecnologias compatíveis
- [x] Patterns suportam as decisões
- [x] Estrutura alinhada

**✅ Requirements Coverage**
- [x] 58 FRs suportados
- [x] 22 NFRs endereçados
- [x] Cross-cutting concerns tratados
- [x] Integration points definidos

**✅ Implementation Readiness**
- [x] Decisões específicas e acionáveis
- [x] Patterns previnem conflitos
- [x] Estrutura completa
- [x] Exemplos de código incluídos

---

**Architecture Status:** ✅ READY FOR IMPLEMENTATION

**Next Phase:** Criar Epics & Stories usando este documento como base arquitetural.

**Document Maintenance:** Atualizar quando decisões técnicas importantes forem tomadas durante implementação.

