---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-02-28'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/project-context.md
  - docs/project-overview.md
  - docs/architecture.md
  - docs/data-models.md
  - docs/index.md
workflowType: 'architecture'
project_name: 'bets-estatistica'
user_name: 'Marcelomendes'
date: '2026-02-27'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
44 FRs em 8 áreas de capacidade — Pool de Números (FR1-5), Gestão de Grupos (FR6-10), Gestão de Membros (FR11-18), Postagem Multi-Canal (FR19-22), Resiliência/Failover (FR23-29), Integração de Pagamentos (FR30-33), Admin Panel (FR34-39), Conexão/Sessões (FR40-44).

Arquiteturalmente, os FRs revelam 3 domínios distintos:
1. **Infraestrutura WhatsApp** (FR1-10, FR23-29, FR40-44) — Pool de números, conexão Baileys, failover automático. Componente novo, sem equivalente no Telegram.
2. **Lógica de negócio reutilizada** (FR11-22, FR30-33) — Membros, postagem, pagamentos. Mesma lógica existente, adaptada para novo transporte.
3. **Admin Panel estendido** (FR34-39) — Extensões ao painel existente para gestão de números e canal WhatsApp.

**Non-Functional Requirements:**
25 NFRs em 5 categorias que direcionam decisões arquiteturais críticas:
- **Performance:** Failover < 5min (NFR1), postagem < 30s (NFR2), rate limiting 10 msgs/min (NFR3)
- **Reliability:** Serviço 24/7 (NFR6), uptime 99.9% (NFR7), sessões sobrevivem restart (NFR8), persistência síncrona de auth state (NFR9)
- **Security:** Chaves criptografadas (NFR12), RLS estendido (NFR16), credenciais nunca logadas (NFR15)
- **Scalability:** 50+ números simultâneos (NFR17), escala horizontal possível (NFR18)
- **Integration:** Abstração de canal substituível (NFR22), Mercado Pago idêntico para ambos canais (NFR23)

**Scale & Complexity:**
- Primary domain: Backend messaging infrastructure + admin panel integration
- Complexity level: Média-Alta
- Estimated architectural components: ~8 (client, pool, session store, handlers, services, jobs, server, admin API extensions)

### Technical Constraints & Dependencies

- **Baileys é CommonJS** — mesma stack do bot/ (Node.js 20+, ES2022)
- **Rate limit implícito** — ~10-20 msgs/min por número antes de anti-spam
- **Signal keys atualizam a cada mensagem** — persistência síncrona obrigatória no Supabase
- **WebSocket persistente** — serviço não pode fazer spin-down (Render Starter $7/mês mínimo)
- **WhatsApp DM** — número precisa ter interagido previamente para enviar DM (limitação da plataforma)
- **Serviço existente inalterado** — bets-bot-unified (Telegram) não deve ser modificado; WhatsApp é serviço paralelo
- **Supabase como single source of truth** — mesmas tabelas, mesma RLS, mesmo projeto Supabase
- **Padrões existentes obrigatórios** — `{ success, data/error }` response pattern, `lib/supabase.js`, `lib/logger.js`, `createApiHandler()`

### Cross-Cutting Concerns Identified

1. **Multi-tenancy** — Estender RLS para `whatsapp_numbers` e `whatsapp_sessions`. Todas queries filtradas por `group_id`. Super admin vê tudo, group admin vê só seu grupo.
2. **Channel abstraction** — Services existentes (memberService, betService, copyService) precisam de adapter layer para rotear mensagens pro canal correto sem alterar lógica de negócio.
3. **Observabilidade** — Health check, heartbeat, alertas de ban devem integrar com tabelas existentes (`job_executions`, `notifications`, `bot_health`).
4. **Segurança** — Chaves Signal criptografadas com AES-256-GCM (mesmo padrão de `mtproto_sessions`). Credenciais nunca expostas em logs.
5. **Resiliência** — Failover automático (ban → promover backup → alocar do pool) é a feature mais crítica. Deve ser testável e confiável sem intervenção humana.

## Starter Template Evaluation

### Primary Technology Domain

**Backend messaging infrastructure** — o novo módulo `whatsapp/` é um serviço Node.js/Express que segue os mesmos padrões do `bot/` existente, usando Baileys ao invés de node-telegram-bot-api.

### Starter Options Considered

| Opção | Descrição | Avaliação |
|-------|-----------|-----------|
| **Novo projeto from scratch** | `npm init` + instalar tudo | ❌ Duplica infraestrutura já resolvida (supabase client, logger, config, service patterns) |
| **Template externo Baileys** | Boilerplates do GitHub (baileys-bot-template, etc.) | ❌ Padrões incompatíveis com o codebase. Arquiteturas simplistas (single-number, file-based auth) |
| **Estender o monorepo existente** | Novo diretório `whatsapp/` seguindo padrões do `bot/` | ✅ Selecionado. Reutiliza `lib/`, services, padrões de response, RLS, config |

### Selected: Estender Monorepo Existente

**Rationale:**
- Reutiliza 100% da infraestrutura compartilhada (`lib/supabase.js`, `lib/logger.js`, `lib/config.js`)
- Mesmos padrões de service response (`{ success, data/error }`)
- Mesma multi-tenancy via RLS
- Mesma stack de testes (Jest)
- Nenhuma duplicação de código de negócio
- Única dependência nova: `@whiskeysockets/baileys`

**Initialization:** Nenhum comando de scaffold necessário. O módulo será criado manualmente seguindo a estrutura do `bot/`.

### Architectural Decisions Provided pelo Codebase Existente

**Language & Runtime:**
- Node.js 20+, ES2022, CommonJS (`require`/`module.exports`)
- Sem TypeScript no backend (apenas admin-panel)

**Build Tooling:**
- Sem bundler no backend (execução direta via Node)
- `package.json` scripts para dev/start
- Render deploy via `npm start`

**Testing Framework:**
- Jest para testes unitários do backend
- Mocks de Supabase e APIs externas já padronizados

**Code Organization:**
```
whatsapp/
├── server.js          # Entry point (Express + lifecycle)
├── client/            # BaileyClient wrapper, connection, auth state
├── pool/              # NumberPool manager, failover logic
├── handlers/          # Message handlers (member events, commands)
├── services/          # WhatsApp-specific services
├── jobs/              # Scheduled jobs (health, heartbeat)
└── store/             # Supabase session/auth persistence
```

**Development Experience:**
- `npm run dev:whatsapp` — modo desenvolvimento local
- Mesmo `.env` pattern com variáveis adicionais para WhatsApp
- Logger compartilhado com contexto de canal

### Nova Dependência: @whiskeysockets/baileys

- **Versão atual:** v7.0.0-rc.9 (release candidate)
- **Recomendação:** Usar v6.x (última estável) para produção, com path de upgrade para v7 quando estabilizar
- **Instalação:** `npm install @whiskeysockets/baileys`
- **Compatibilidade:** CommonJS + ESM, Node.js 18+

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Auth state persistence strategy (Signal keys no Supabase)
2. Channel abstraction no banco de dados
3. Criptografia de keys
4. Channel adapter pattern (services → canal)
5. Failover state machine

**Important Decisions (Shape Architecture):**
6. Health monitoring approach

**Deferred Decisions (Post-MVP):**
- Escala horizontal (múltiplos processos WhatsApp) — NFR18 diz "possível", não obrigatório no MVP
- Rate limiting adaptativo — MVP usa 10 msgs/min fixo por número
- Webhook para WhatsApp — Baileys é WebSocket-based; webhook externo é post-MVP

### Data Architecture

**Auth State Persistence — Modelo Híbrido (creds + keys separados)**

Baileys gera auth state com dois tipos de dados:
- `creds` — credentials do dispositivo (atualizam raramente, na conexão inicial)
- Signal `keys` — chaves criptográficas (atualizam a cada mensagem enviada/recebida)

Decisão: separar em duas estruturas:
- `whatsapp_sessions.creds` (JSONB, encrypted) — atualiza raramente
- Tabela `whatsapp_keys` com colunas `number_id`, `key_type`, `key_id`, `key_data` (encrypted) — upsert granular por key

Rationale: Baileys internamente já separa creds de keys (`useMultiFileAuthState`). Permite upsert eficiente de keys individuais sem tocar no blob de credentials. Cada mensagem faz ~1-3 upserts em `whatsapp_keys`, não um UPDATE do blob inteiro.

**Channel Abstraction — Coluna `channel` + `channel_user_id` em `members`**

Decisão: adicionar `channel ENUM('telegram','whatsapp')` + `channel_user_id TEXT` à tabela `members`.
- `channel='telegram'` + `channel_user_id='123456789'` (= telegram_id atual)
- `channel='whatsapp'` + `channel_user_id='5511999887766'`

O `telegram_id` existente fica como backward-compat (não quebra queries existentes). Novos queries usam `channel` + `channel_user_id`. Migration adiciona as colunas e popula `channel='telegram'` + `channel_user_id=telegram_id::text` para membros existentes.

Affects: `members` table, `memberService`, webhook processors, admin panel member views.

### Authentication & Security

**Signal Key Encryption — AES-256-GCM**

Decisão: criptografar keys com AES-256-GCM, consistente com o padrão existente de `mtproto_sessions`.
- Key de criptografia via `WHATSAPP_ENCRYPTION_KEY` (env var)
- IV único por operação de encrypt
- Defense-in-depth: RLS + SSL + encryption at-rest

Affects: `whatsapp_keys`, `whatsapp_sessions.creds`, store module.

### API & Communication Patterns

**Channel Adapter — Interface Uniforme**

Decisão: `channelAdapter` com interface unificada que roteia para o sender correto baseado na config do grupo.

```
channelAdapter.sendMessage(groupId, text, options)
channelAdapter.sendPhoto(groupId, imageUrl, caption)
channelAdapter.getGroupMembers(groupId)
```

O adapter consulta `groups.channel` (ou config equivalente) e delega para `telegramSender` ou `whatsappSender`. Services de negócio (betService, copyService, memberService) chamam o adapter sem saber qual canal.

Rationale: mínima invasão nos services existentes. Só precisa trocar chamadas diretas ao Telegram API por chamadas ao adapter.

Affects: postBets, distributeBets, notificationService, memberService (kick/invite).

### Infrastructure & Deployment

**Failover State Machine — Estados Explícitos**

Decisão: state machine na coluna `whatsapp_numbers.status` com estados:
- `available` — no pool global, sem grupo atribuído
- `active` — conectado e operando para um grupo
- `backup` — conectado, pronto para assumir se active cair
- `banned` — detectado ban/logout (DisconnectReason 401/515)
- `cooldown` — pós-ban, aguardando período antes de reutilizar

Transições gerenciadas por `failoverService`:
1. `active` → `banned` (ban detectado)
2. `backup` → `active` (promoção automática)
3. `available` → `backup` (alocação do pool)
4. `banned` → `cooldown` (após notificação admin)
5. `cooldown` → `available` (após período definido)

Affects: `whatsapp_numbers` table, failoverService, numberPoolService, admin panel.

**Health Monitoring — Estender `bot_health` + `job_executions`**

Decisão: reutilizar tabelas existentes de monitoring:
- `bot_health` estendida com coluna `channel` — heartbeat do WhatsApp aparece no admin panel existente
- Health check executions logadas em `job_executions` como todo job
- Zero tabelas novas para monitoring

Affects: `bot_health` table, healthCheck job, admin panel bots page.

### Decision Impact Analysis

**Implementation Sequence:**
1. Migration: novas tabelas (`whatsapp_numbers`, `whatsapp_sessions`, `whatsapp_keys`) + extensões (`members.channel`, `bot_health.channel`)
2. Store: auth state persistence (creds + keys no Supabase com encryption)
3. Client: Baileys wrapper com connection lifecycle
4. Pool + Failover: state machine e gerenciamento de números
5. Channel Adapter: interface uniforme para services existentes
6. Handlers + Jobs: message handling, health check, heartbeat
7. Admin Panel: API routes + UI para gestão WhatsApp

**Cross-Component Dependencies:**
- Store → Client (client precisa do store para persistir auth)
- Client → Pool (pool gerencia múltiplos clients)
- Pool → Failover (failover opera sobre o pool)
- Channel Adapter → Client (adapter usa client para enviar)
- Admin Panel → Pool + Failover (UI de gestão)

## Implementation Patterns & Consistency Rules

### Padrões Existentes (project-context.md — 55 regras)

Todos os 55 padrões documentados em `_bmad-output/project-context.md` continuam obrigatórios. Destaques:

| Categoria | Padrão |
|-----------|--------|
| DB naming | `snake_case` (tabelas e colunas) |
| JS naming | `camelCase` (funções e variáveis) |
| File naming | `camelCase.js` (services), `kebab-case.js` (jobs) |
| API response | `{ success: true, data }` / `{ success: false, error }` |
| Error handling | Try/catch + `logger.error()` + return `{ success: false, error }` |
| Supabase | `lib/supabase.js` — nunca instanciar client diretamente |
| Logging | `lib/logger.js` — nunca `console.log` |
| Multi-tenant | Todas queries filtradas por `group_id` |
| Jobs | Log em `job_executions` via `jobExecutionService` |
| Config | `lib/config.js` — nunca hardcodar valores |

### Novos Patterns para WhatsApp

#### Naming — Tabelas e Colunas

```
✅ whatsapp_numbers      (prefixo whatsapp_)
✅ whatsapp_sessions
✅ whatsapp_keys
✅ number_id             (FK para whatsapp_numbers)
✅ phone_number           (formato E.164: +5511999887766)
✅ jid                    (Baileys JID: 5511999887766@s.whatsapp.net)

❌ wa_numbers            (abreviação inconsistente)
❌ whatsappNumbers       (camelCase em DB)
❌ phone                 (ambíguo)
```

#### Naming — Services e Files

```
✅ whatsapp/client/baileyClient.js        (wrapper do Baileys)
✅ whatsapp/services/failoverService.js    (state machine)
✅ whatsapp/services/numberPoolService.js  (pool management)
✅ whatsapp/store/authStateStore.js        (Supabase persistence)
✅ whatsapp/store/encryptionHelper.js      (AES-256-GCM)

❌ whatsapp/baileys.js                    (nome genérico)
❌ whatsapp/wa-client.js                  (prefixo wa-)
❌ whatsapp/crypto.js                     (conflito com Node crypto)
```

#### Baileys Client Lifecycle

```javascript
// PADRÃO: criar → conectar → operar → desconectar
const client = new BaileyClient(numberId, authStateStore);
await client.connect();     // carrega auth do Supabase, abre WebSocket
// ... operar ...
await client.disconnect();  // salva auth, fecha WebSocket limpo

// NUNCA: instanciar Baileys diretamente (makeWASocket)
// SEMPRE: usar BaileyClient wrapper que gerencia auth + reconnect
```

#### Auth State Persistence

```javascript
// PADRÃO: upsert granular de keys
await authStateStore.saveKey(numberId, keyType, keyId, encryptedData);
await authStateStore.saveCreds(numberId, encryptedCreds);

// PADRÃO: load completo no connect
const { creds, keys } = await authStateStore.load(numberId);

// NUNCA: salvar auth state em filesystem
// NUNCA: fazer UPDATE do blob inteiro de keys
// SEMPRE: encrypt antes de salvar, decrypt depois de carregar
```

#### Failover Service

```javascript
// PADRÃO: transições explícitas via failoverService
await failoverService.markBanned(numberId, reason);     // active → banned
await failoverService.promoteBackup(groupId);            // backup → active
await failoverService.allocateFromPool(groupId);         // available → backup
await failoverService.startCooldown(numberId);           // banned → cooldown

// NUNCA: UPDATE direto no status de whatsapp_numbers
// SEMPRE: usar failoverService para transições (validação + logging + notificação)
```

#### Channel Adapter

```javascript
// PADRÃO: services de negócio usam channelAdapter
const adapter = getChannelAdapter(group);
await adapter.sendMessage(chatId, text, options);
await adapter.sendPhoto(chatId, imageUrl, caption);

// NUNCA: chamar Telegram API ou Baileys diretamente de services de negócio
// SEMPRE: usar channelAdapter para envio de mensagens
```

#### Rate Limiting

```javascript
// PADRÃO: rate limiter por número (10 msgs/min configurável via config)
const limiter = getRateLimiter(numberId);
await limiter.waitForSlot();
await adapter.sendMessage(chatId, text);

// NUNCA: enviar em burst sem rate limiting
```

#### Phone Number Format

```javascript
// PADRÃO: armazenar E.164, converter para JID on-the-fly
const phoneE164 = '+5511999887766';                    // storage format
const jid = phoneToJid(phoneE164);                     // → '5511999887766@s.whatsapp.net'

// NUNCA: armazenar JID no banco (contém sufixo @s.whatsapp.net)
```

### Enforcement Guidelines

**All AI Agents MUST:**
1. Seguir os 55 padrões existentes do `project-context.md`
2. Usar prefixo `whatsapp_` para tabelas/colunas novas
3. Nunca instanciar Baileys diretamente — usar `BaileyClient` wrapper
4. Nunca salvar auth state em filesystem — usar `authStateStore` (Supabase)
5. Nunca fazer transição de status direto no banco — usar `failoverService`
6. Nunca enviar mensagens diretamente — usar `channelAdapter`
7. Criptografar keys com `encryptionHelper` antes de persistir

### Anti-Patterns

```javascript
// ❌ ERRADO: Baileys direto
const sock = makeWASocket({ auth: state });

// ✅ CORRETO: via wrapper
const client = new BaileyClient(numberId, store);
await client.connect();

// ❌ ERRADO: status direto no banco
await supabase.from('whatsapp_numbers').update({ status: 'banned' });

// ✅ CORRETO: via service
await failoverService.markBanned(numberId, 'DisconnectReason.loggedOut');

// ❌ ERRADO: Telegram direto em service de negócio
await bot.sendMessage(chatId, text);

// ✅ CORRETO: via adapter
const adapter = getChannelAdapter(group);
await adapter.sendMessage(chatId, text);
```

## Project Structure & Boundaries

### Requirements → Structure Mapping

| FR Area | Diretório | Descrição |
|---------|-----------|-----------|
| FR1-5 (Pool de Números) | `whatsapp/pool/` | NumberPool manager |
| FR6-10 (Gestão de Grupos) | `whatsapp/services/`, `admin-panel/src/app/api/whatsapp/` | Group-number assignment |
| FR11-18 (Membros) | `lib/channelAdapter.js`, `bot/services/memberService.js` | Channel-agnostic member ops |
| FR19-22 (Postagem Multi-Canal) | `lib/channelAdapter.js`, `whatsapp/services/whatsappSender.js` | Message routing |
| FR23-29 (Failover) | `whatsapp/services/failoverService.js`, `whatsapp/pool/` | State machine + auto-recovery |
| FR30-33 (Pagamentos) | Sem mudança — Mercado Pago via `channel_user_id` | Existing webhook |
| FR34-39 (Admin Panel) | `admin-panel/src/app/whatsapp/`, `admin-panel/src/app/api/whatsapp/` | New pages + API routes |
| FR40-44 (Conexão/Sessões) | `whatsapp/client/`, `whatsapp/store/` | Baileys wrapper + auth persistence |

### Complete Project Directory Structure

```
bets-estatistica/
├── bot/                          # [EXISTENTE — SEM ALTERAÇÃO]
│   ├── server.js
│   ├── index.js
│   ├── handlers/
│   ├── jobs/
│   └── services/
│
├── whatsapp/                     # [NOVO — Serviço WhatsApp]
│   ├── server.js                 # Entry point (Express + lifecycle)
│   ├── client/
│   │   ├── baileyClient.js       # Baileys wrapper (connect, disconnect, reconnect)
│   │   └── connectionHandler.js  # Connection events (open, close, ban detect)
│   ├── pool/
│   │   ├── numberPoolService.js  # CRUD pool, allocate, deallocate
│   │   └── numberAssignment.js   # Group ↔ number assignment logic
│   ├── store/
│   │   ├── authStateStore.js     # Supabase persistence (creds + keys)
│   │   └── encryptionHelper.js   # AES-256-GCM encrypt/decrypt
│   ├── services/
│   │   ├── failoverService.js    # State machine (active→banned→promote)
│   │   ├── whatsappSender.js     # Send messages via Baileys (adapter backend)
│   │   ├── rateLimiter.js        # Per-number rate limiting (10 msgs/min)
│   │   └── qrCodeService.js      # QR generation for number pairing
│   ├── handlers/
│   │   ├── messageHandler.js     # Incoming message routing
│   │   └── groupEventHandler.js  # Member join/leave events
│   ├── jobs/
│   │   ├── healthCheck.js        # Heartbeat + connection status
│   │   └── sessionCleanup.js     # Expired session cleanup
│   └── __tests__/
│       ├── baileyClient.test.js
│       ├── failoverService.test.js
│       ├── authStateStore.test.js
│       └── numberPoolService.test.js
│
├── lib/                          # [EXISTENTE — ESTENDIDO]
│   ├── supabase.js               # (existente)
│   ├── logger.js                 # (existente)
│   ├── config.js                 # (existente — adicionar seção whatsapp)
│   ├── channelAdapter.js         # [NOVO] Interface uniforme Telegram/WhatsApp
│   └── phoneUtils.js             # [NOVO] E.164 ↔ JID conversions
│
├── admin-panel/                  # [EXISTENTE — ESTENDIDO]
│   └── src/
│       ├── app/
│       │   ├── whatsapp/                  # [NOVO — Páginas WhatsApp]
│       │   │   ├── page.tsx               # Dashboard WhatsApp (números, status)
│       │   │   └── [numberId]/
│       │   │       └── page.tsx           # Detalhes do número (QR, logs, status)
│       │   └── api/
│       │       └── whatsapp/              # [NOVO — API Routes WhatsApp]
│       │           ├── numbers/
│       │           │   └── route.ts       # GET (list), POST (add to pool)
│       │           ├── numbers/[id]/
│       │           │   └── route.ts       # GET (detail), PATCH (assign/status), DELETE
│       │           ├── numbers/[id]/qr/
│       │           │   └── route.ts       # GET (QR code for pairing)
│       │           └── numbers/[id]/pair/
│       │               └── route.ts       # POST (confirm pairing)
│       ├── components/
│       │   └── whatsapp/                  # [NOVO — Componentes WhatsApp]
│       │       ├── NumberPoolTable.tsx     # Tabela de números com status
│       │       ├── NumberStatusBadge.tsx   # Badge colorido por status
│       │       ├── QrCodeModal.tsx         # Modal de pairing via QR
│       │       └── FailoverTimeline.tsx    # Timeline de eventos de failover
│       └── types/
│           └── whatsapp.ts                # [NOVO] Types para WhatsApp
│
├── sql/migrations/               # [EXISTENTE — NOVAS MIGRATIONS]
│   ├── 029_whatsapp_numbers.sql           # Tabela whatsapp_numbers (pool + status)
│   ├── 030_whatsapp_sessions.sql          # Tabela whatsapp_sessions (creds)
│   ├── 031_whatsapp_keys.sql              # Tabela whatsapp_keys (Signal keys)
│   ├── 032_members_channel.sql            # ADD channel + channel_user_id em members
│   ├── 033_bot_health_channel.sql         # ADD channel em bot_health
│   └── 034_whatsapp_rls.sql               # RLS policies para novas tabelas
│
├── agent/                        # [EXISTENTE — SEM ALTERAÇÃO]
├── scripts/                      # [EXISTENTE — SEM ALTERAÇÃO]
└── docs/                         # [EXISTENTE — SEM ALTERAÇÃO]
```

### Architectural Boundaries

**Service Boundaries:**
- `whatsapp/` é um serviço independente (Render Web Service separado). Não importa nada de `bot/`.
- `bot/` permanece inalterado. Não sabe que WhatsApp existe.
- `lib/` é shared — ambos os serviços importam de `lib/`.
- `admin-panel/` se comunica com ambos via Supabase (leitura) e API routes (ações).

**Data Boundaries:**
- `whatsapp_numbers`, `whatsapp_sessions`, `whatsapp_keys` — acessadas apenas pelo serviço WhatsApp e admin panel
- `members` — acessada por ambos os serviços (filtrada por `channel`)
- `groups` — acessada por ambos (config de canal)
- `bot_health`, `job_executions` — escritas por ambos, lidas pelo admin panel

**API Boundaries:**
- Admin Panel → WhatsApp: via Supabase REST (leitura) + API routes (ações como pair, assign)
- WhatsApp Service → Supabase: via `lib/supabase.js` (mesma service key)
- WhatsApp Service ← WhatsApp Web: via Baileys WebSocket (conexão persistente)

### Integration Points

**Internal:**
```
lib/channelAdapter.js
    ├── telegramSender (existing bot API calls)
    └── whatsappSender (Baileys via active client)
```

**External:**
```
WhatsApp Web ←→ Baileys WebSocket (persistent)
Supabase     ←→ lib/supabase.js (shared client)
Mercado Pago ←→ bot/webhook-server.js (existing, channel-agnostic)
```

**Data Flow (Postagem WhatsApp):**
```
distributeBets job
    → betService.getReadyBets(groupId)
    → copyService.generateCopy(bet)
    → channelAdapter.sendMessage(groupId, formattedText)
        → resolve group.channel = 'whatsapp'
        → whatsappSender.send(jid, text)
            → rateLimiter.waitForSlot(numberId)
            → baileyClient.sendMessage(jid, { text })
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
- Node.js 20+ CommonJS + Baileys CommonJS — compatível, sem conflito de module system
- Supabase PostgreSQL + auth state persistence (creds + keys) — aligned, mesma lib/supabase.js
- AES-256-GCM + mtproto_sessions pattern existente — consistente
- Channel adapter + serviços separados (bot/ e whatsapp/) — boundaries limpas
- Failover state machine + pool management — complementares
- Nenhuma contradição encontrada

**Pattern Consistency:**
- Naming: `whatsapp_` prefix DB + `camelCase.js` files — alinhado com padrões existentes
- Response: `{ success, data/error }` em todos novos services — consistente
- Logging: `lib/logger.js` em todo whatsapp/ — consistente
- Multi-tenant: RLS em todas novas tabelas — consistente

**Structure Alignment:**
- `whatsapp/` espelha organização de `bot/` — familiar para agents
- `lib/` estendido com channelAdapter e phoneUtils — shared corretamente
- admin-panel estendido com nova seção — segue padrão existente

### Requirements Coverage ✅

**Functional Requirements (44 FRs) — 100% cobertura:**

| FR Area | Status | Componente |
|---------|--------|------------|
| FR1-5 (Pool) | ✅ | numberPoolService, whatsapp_numbers, status states |
| FR6-10 (Grupos) | ✅ | numberAssignment, admin panel API |
| FR11-18 (Membros) | ✅ | channel column, channelAdapter, memberService |
| FR19-22 (Postagem) | ✅ | channelAdapter, whatsappSender, rateLimiter |
| FR23-29 (Failover) | ✅ | failoverService, state machine, connectionHandler |
| FR30-33 (Pagamentos) | ✅ | channel-agnostic via channel_user_id |
| FR34-39 (Admin Panel) | ✅ | whatsapp/ pages, API routes, components |
| FR40-44 (Conexão) | ✅ | baileyClient, authStateStore, qrCodeService |

**Non-Functional Requirements (25 NFRs) — 100% cobertura:**

| NFR | Status | Como |
|-----|--------|------|
| NFR1 (failover <5min) | ✅ | State machine auto-promote |
| NFR2 (postagem <30s) | ✅ | Rate limiter gerencia throughput |
| NFR3 (10 msgs/min) | ✅ | rateLimiter per number |
| NFR6-7 (24/7, 99.9%) | ✅ | Render Starter + failover |
| NFR8-9 (sessions survive) | ✅ | authStateStore em Supabase |
| NFR12 (encryption) | ✅ | AES-256-GCM via encryptionHelper |
| NFR15 (creds not logged) | ✅ | Enforcement guidelines |
| NFR16 (RLS) | ✅ | Migration 034_whatsapp_rls.sql |
| NFR17 (50+ numbers) | ✅ | Pool architecture N conexões |
| NFR22 (channel abstraction) | ✅ | channelAdapter |
| NFR23 (same Mercado Pago) | ✅ | channel-agnostic webhook |

### Implementation Readiness ✅

**Decision Completeness:** 6 decisões críticas documentadas com rationale e affects
**Structure Completeness:** Directory tree completa com ~25 arquivos novos mapeados
**Pattern Completeness:** 8 novos patterns com exemplos ✅ e ❌ anti-patterns

### Gap Analysis

**Gaps Encontrados e Resolvidos:**

1. **Graceful Shutdown (Important)** — `whatsapp/server.js` precisa de handler SIGTERM que itera clients e chama `disconnect()`. Segue padrão de `bot/server.js`. → Documentado como requirement de implementação.

2. **QR Code Flow (Minor)** — Admin insere número, serviço detecta via polling em `whatsapp_numbers`, inicia pairing, grava QR em `whatsapp_sessions.qr_code`, admin panel polls e exibe. Sem API direta entre serviços.

3. **WhatsApp Group Management (Minor)** — Premissa: grupos WhatsApp são criados manualmente. O `group_jid` é cadastrado no admin panel. Não é gap arquitetural.

**Nenhum gap crítico.**

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context analisado (55 regras, 27 tabelas)
- [x] Scale e complexity avaliados (Média-Alta)
- [x] 8 constraints técnicos identificados
- [x] 5 cross-cutting concerns mapeados

**✅ Architectural Decisions**
- [x] 6 decisões críticas documentadas com rationale
- [x] Stack specified (Node.js 20+, Baileys v6.x, Supabase)
- [x] Integration patterns definidos (channelAdapter)
- [x] Performance addressed (rate limiting, failover <5min)

**✅ Implementation Patterns**
- [x] 8 novos patterns para WhatsApp
- [x] Naming conventions (DB + files)
- [x] Communication patterns (adapter, lifecycle)
- [x] Anti-patterns documentados

**✅ Project Structure**
- [x] Directory structure completa
- [x] Component boundaries (3 service boundaries)
- [x] Integration points (internal + external)
- [x] FR → structure mapping (8 áreas)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Brownfield com 55 patterns maduros — reduz ambiguidade
- Zero alteração no serviço Telegram — isolamento total
- Failover state machine bem definida — feature crítica com design claro
- Channel adapter minimally invasive — services existentes mudam pouco

**Areas for Future Enhancement (Post-MVP):**
- Escala horizontal (múltiplos processos WhatsApp)
- Rate limiting adaptativo
- Monitoring dashboards dedicados

### Implementation Handoff

**AI Agent Guidelines:**
- Seguir todas decisões arquiteturais exatamente como documentadas
- Usar implementation patterns consistentemente
- Respeitar project structure e boundaries
- Consultar este documento + `project-context.md` para todas questões

**First Implementation Priority:**
1. Migrations SQL (tabelas + RLS)
2. Store (authStateStore + encryptionHelper)
3. Client (baileyClient + connectionHandler)
4. Pool + Failover (numberPoolService + failoverService)
5. Channel Adapter (lib/channelAdapter.js)
6. Handlers + Jobs
7. Admin Panel extensions
