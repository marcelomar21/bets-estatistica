---
project_name: 'bets-estatistica'
user_name: 'Marcelomendes'
date: '2026-02-05'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules', 'membership_rules', 'multitenant_rules']
status: 'complete'
rule_count: 52
optimized_for_llm: true
---

# Project Context for AI Agents

_Regras críticas que AI agents DEVEM seguir ao implementar código neste projeto._

---

## Technology Stack & Versions

| Technology | Version | Notes |
|------------|---------|-------|
| Node.js | 20+ | Runtime obrigatório (bots) |
| JavaScript | ES2022 | CommonJS modules (bots) |
| TypeScript | 5.x | Admin panel (Next.js) |
| Next.js | 16.x | Admin panel (App Router) |
| Supabase Auth | latest | Autenticação admin panel |
| LangChain | 1.1.x | Manter versão existente |
| OpenAI | GPT-5.1 | Via LangChain |
| Zod | 4.x | Validação de schemas |
| axios | 1.x | HTTP client |
| @supabase/supabase-js | latest | Database client |
| node-telegram-bot-api | latest | Bot framework |
| node-cron | latest | Job scheduling |
| Tailwind CSS | 4.x | Styling admin panel |

**Repositórios:**
- `bets-estatistica/` - Bots + Backend (Node.js)
- `admin-panel/` - Admin Panel (Next.js)

---

## Critical Implementation Rules

### Supabase Access Pattern

```javascript
// ✅ SEMPRE usar lib/supabase.js
const { supabase } = require('../lib/supabase');

// ❌ NUNCA instanciar cliente diretamente
const { createClient } = require('@supabase/supabase-js'); // ERRADO
```

### Service Response Pattern

```javascript
// ✅ SEMPRE retornar este formato
return { success: true, data: { ... } };
return { success: false, error: { code: 'API_ERROR', message: '...' } };

// ❌ NUNCA retornar dados diretamente
return result; // ERRADO
throw new Error('...'); // EVITAR - usar pattern acima
```

### Error Handling Pattern

```javascript
// ✅ SEMPRE usar retry com backoff para APIs externas
async function fetchWithRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return { success: true, data: await fn() };
    } catch (err) {
      logger.warn('Retry', { attempt, error: err.message });
      if (attempt === maxRetries) {
        await alertAdmin('API_ERROR', `Falhou após ${maxRetries} tentativas`);
        return { success: false, error: { code: 'API_ERROR', message: err.message } };
      }
      await sleep(1000 * attempt);
    }
  }
}
```

### Logging Pattern

```javascript
const logger = require('../lib/logger');

// ✅ Níveis corretos
logger.info('Postagem enviada', { betId: 123 });
logger.warn('Lembrete enviado', { betId: 123, attempt: 2 });
logger.error('Falha API', { service: 'odds', error: err.message });

// ❌ NUNCA usar console.log em produção
console.log('debug'); // ERRADO
```

---

## Naming Conventions

| Context | Pattern | Example |
|---------|---------|---------|
| Tabelas DB | snake_case, plural | `suggested_bets` |
| Colunas DB | snake_case | `bet_status` |
| Arquivos JS | camelCase | `betService.js` |
| Funções | camelCase | `getBetsByStatus()` |
| Constantes | UPPER_SNAKE | `MAX_RETRIES` |
| Env vars | UPPER_SNAKE | `TELEGRAM_BOT_TOKEN` |

---

## Bet State Machines

### bet_status (fluxo de publicação)

```
generated → pending_link ──→ ready → posted
    │              ↑            ↑
    └──→ pending_odds ──────────┘
```

**Estados válidos:**
- `generated` - Aposta criada, sem odds nem link
- `pending_link` - Com odds, aguardando link
- `pending_odds` - Com link, aguardando odds (mercados manuais)
- `ready` - Com odds E link, pronta para postar
- `posted` - Enviada ao grupo público (NUNCA regride)

**Lógica de determinação:**
```javascript
function determineStatus(currentStatus, odds, deepLink) {
  if (currentStatus === 'posted') return 'posted';
  const hasOdds = odds && odds >= MIN_ODDS;
  const hasLink = !!deepLink;
  if (hasOdds && hasLink) return 'ready';
  if (hasOdds && !hasLink) return 'pending_link';
  if (!hasOdds && hasLink) return 'pending_odds';
  return 'generated';
}
```

### bet_result (resultado do jogo)

```
pending → success
       ↘ failure
       ↘ cancelled
       ↘ unknown
```

**Resultados válidos:**
- `pending` - Aguardando resultado (default)
- `success` - Jogo terminou, aposta ganhou
- `failure` - Jogo terminou, aposta perdeu
- `cancelled` - Cancelada manualmente
- `unknown` - LLM não conseguiu avaliar (dados insuficientes)

**Coluna adicional:**
- `result_reason` - Justificativa da LLM para o resultado

---

## Member State Machine

```
trial ──────► ativo ──────► inadimplente
  │             │                │
  │             │                ▼
  └─────────────┴──────────► removido
```

**Estados válidos:**
- `trial` - Período de teste (7 dias)
- `ativo` - Pagamento confirmado, acesso liberado
- `inadimplente` - Pagamento falhou, em cobrança
- `removido` - Removido do grupo (estado final)

**Transições válidas:**
| De | Para | Trigger |
|----|------|---------|
| `trial` | `ativo` | `purchase_approved` webhook |
| `trial` | `removido` | Trial expirado (dia 8) |
| `ativo` | `inadimplente` | `subscription_renewal_refused` webhook |
| `ativo` | `removido` | `subscription_canceled` webhook |
| `inadimplente` | `ativo` | `subscription_renewed` webhook |
| `inadimplente` | `removido` | Após período de cobrança |

**Validação obrigatória:**
```javascript
const VALID_TRANSITIONS = {
  trial: ['ativo', 'removido'],
  ativo: ['inadimplente', 'removido'],
  inadimplente: ['ativo', 'removido'],
  removido: []  // Estado final
};

// ✅ SEMPRE validar antes de transicionar
function canTransition(currentStatus, newStatus) {
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}
```

---

## Membership Error Codes

| Code | Quando usar |
|------|-------------|
| `MEMBER_NOT_FOUND` | Membro não existe no banco |
| `MEMBER_ALREADY_EXISTS` | Telegram ID já cadastrado |
| `INVALID_MEMBER_STATUS` | Transição de estado inválida |
| `MP_API_ERROR` | Erro na API do Mercado Pago |
| `WEBHOOK_INVALID_SIGNATURE` | HMAC do webhook inválido |
| `WEBHOOK_DUPLICATE` | Evento já processado (idempotency) |
| `TENANT_NOT_FOUND` | Grupo não encontrado |
| `UNAUTHORIZED_TENANT` | Tentativa de acessar outro grupo |

---

## Multi-Tenant Rules (CRÍTICO)

### Isolamento por group_id

```javascript
// ✅ TODA query que envolve dados de grupo DEVE filtrar por group_id
const members = await supabase
  .from('members')
  .select('*')
  .eq('group_id', groupId);

// ❌ NUNCA fazer query sem filtro de grupo
const members = await supabase
  .from('members')
  .select('*');  // VAZAMENTO DE DADOS!
```

### Middleware de Tenant (Admin Panel)

```typescript
// middleware/tenant.ts - OBRIGATÓRIO em toda API Route
export async function withTenant(req) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'UNAUTHORIZED', groupFilter: null };
  }

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

### Uso em API Routes

```typescript
// ✅ SEMPRE usar withTenant em rotas com dados por grupo
export async function GET(req) {
  const { error, groupFilter } = await withTenant(req);

  if (error) {
    return NextResponse.json({ success: false, error }, { status: 401 });
  }

  let query = supabase.from('members').select('*');

  // 🔒 CRÍTICO: Sempre filtrar se não for super_admin
  if (groupFilter) {
    query = query.eq('group_id', groupFilter);
  }

  const { data } = await query;
  return NextResponse.json({ success: true, data });
}
```

### Tabelas com group_id

| Tabela | group_id | Notas |
|--------|----------|-------|
| `groups` | É a própria PK | Tabela de tenants |
| `members` | ✅ FK | Filtrar sempre |
| `admin_users` | ✅ FK (null = super) | RLS |
| `suggested_bets` | ✅ Após distribuição | Pool global → distribuído |
| `bot_health` | ✅ FK | Status por bot |
| `league_matches` | ❌ | Dados globais |
| `game_analysis` | ❌ | Dados globais |

### Checklist de Code Review Multi-tenant

- [ ] API Route usa `withTenant()`?
- [ ] Tratou erro de autenticação?
- [ ] Query aplica `.eq('group_id', groupFilter)` quando necessário?
- [ ] RLS está configurado na tabela?
- [ ] Não tem query sem filtro em tabelas com group_id?

---

## Webhook Processing Pattern (Mercado Pago)

```javascript
// ✅ SEMPRE processar webhooks de forma assíncrona
// 1. Validar HMAC
// 2. Salvar evento raw
// 3. Responder 200 IMEDIATAMENTE
// 4. Processar via job async

// Next.js API Route
export async function POST(req) {
  const body = await req.json();
  const signature = req.headers.get('x-signature');

  // Validar HMAC
  if (!validateMPSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Salvar imediatamente (idempotente)
  await supabase.from('webhook_events').insert({
    idempotency_key: body.id,
    event_type: body.type,
    payload: body.data,
    status: 'pending'
  });

  // Responder rápido
  return NextResponse.json({ received: true });
}

// ❌ NUNCA processar síncrono
export async function POST(req) {
  await processPayment(body);  // ERRADO - bloqueia
  return NextResponse.json({ ok: true });
}
```

---

## Job Execution Pattern

```javascript
// ✅ SEMPRE usar wrapper com lock para jobs de membership
async function runJob(jobName, fn) {
  const startTime = Date.now();
  logger.info(`[${jobName}] Iniciando`);

  try {
    const result = await withLock(jobName, 300, fn);
    if (result === null) {
      logger.warn(`[${jobName}] Lock não adquirido, pulando`);
      return;
    }
    logger.info(`[${jobName}] Concluído`, {
      duration: Date.now() - startTime,
      ...result
    });
  } catch (err) {
    logger.error(`[${jobName}] Erro`, { error: err.message });
    await alertAdmin(`Job ${jobName} falhou: ${err.message}`);
  }
}

// ✅ Logs SEMPRE com prefixo [module:job-name]
logger.info('[membership:trial-reminders] Verificando trials');
logger.info('[membership:kick-expired] Membro removido', { memberId });
```

---

## Telegram Bot Rules

```javascript
// ✅ IDs de grupo são números negativos
const ADMIN_GROUP_ID = process.env.TELEGRAM_ADMIN_GROUP_ID; // ex: -1001234567890
const PUBLIC_GROUP_ID = process.env.TELEGRAM_PUBLIC_GROUP_ID;

// ✅ Formato de mensagem pública
const message = `
🎯 *APOSTA DO DIA*

⚽ ${homeTeam} x ${awayTeam}
📊 ${betMarket}: ${betPick}
💰 Odd: ${odds}

📝 ${reasoning}

🔗 [Apostar Agora](${deepLink})
`;

// ✅ Formato de alerta admin
const alert = `
⚠️ ALERTA: [TIPO]

📋 Técnico: ${technicalMessage}

💬 Resumo: ${simpleExplanation}

🕐 ${timestamp}
`;
```

---

## The Odds API Integration

```javascript
// ✅ Market mapping
const MARKET_MAP = {
  'over_gols': 'totals',
  'under_gols': 'totals',
  'btts': 'btts',
  'escanteios': 'totals_corners',
  'cartoes': 'totals_bookings',
  'chutes_gol': 'player_shots_on_target'
};

// ✅ Bookmaker targets
const TARGET_BOOKMAKERS = ['bet365', 'betano'];

// ✅ Minimum odds filter
const MIN_ODDS = 1.60;
```

---

## Critical Don't-Miss Rules

### Security
- ❌ NUNCA hardcode API keys
- ❌ NUNCA commitar .env
- ✅ SEMPRE usar process.env

### Performance
- ✅ Cold start OK - bot não precisa estar 24/7
- ✅ Jobs pontuais (10h, 15h, 22h)
- ❌ NUNCA manter conexões abertas indefinidamente

### Data
- ✅ SEMPRE validar deep links antes de postar
- ✅ SEMPRE verificar odds >= 1.60
- ❌ NUNCA postar sem link válido

### Fallback
- ✅ Se The Odds API falhar 3x → alertar admin
- ✅ Se Supabase falhar → alertar admin
- ✅ Se operador não responder (3 lembretes) → pedir 1/1h
- ✅ Na hora de postar → pular apostas sem link

---

## Git Workflow Rules

### Branch Strategy
```bash
# ✅ SEMPRE criar branch nova antes de implementar
git checkout -b feature/story-X.Y   # Para novas features
git checkout -b fix/descricao-bug   # Para bug fixes

# ❌ NUNCA implementar diretamente na master/main
```

### Commit Rules
```bash
# ✅ SEMPRE validar antes de commitar
1. Rodar testes: npm test
2. Verificar build: npm run build (se aplicável)
3. Só então commitar

# ✅ Commit após sucesso
git add .
git commit -m "feat(scope): descrição clara"
git push -u origin feature/story-X.Y

# ❌ NUNCA commitar código quebrado ou não testado
```

### Fluxo Obrigatório
1. **Criar branch** → `feature/story-X.Y` ou `fix/issue-name`
2. **Implementar** → seguir story/spec
3. **Testar** → garantir que passa
4. **Commit + Push** → só após testes bem-sucedidos
5. **PR para merge** → code review quando aplicável

---

## File Structure Reference

```
agent/                     # Módulo de análise IA
├── pipeline.js            # Orquestrador do pipeline completo
├── db.js                  # Shim → lib/db.js
├── tools.js               # Tools LangChain
├── analysis/
│   ├── runAnalysis.js     # Core da análise IA
│   ├── prompt.js          # Prompts
│   └── schema.js          # Schemas Zod
├── persistence/
│   ├── main.js            # Persistência
│   ├── saveOutputs.js     # Salva no DB
│   └── reportService.js   # Gera relatórios HTML
└── shared/
    └── naming.js          # Convenções de nomes

bot/                       # Módulo Telegram Bot
├── index.js               # Entry point (polling/dev)
├── server.js              # Entry point (webhook/prod)
├── telegram.js            # Singleton client
├── handlers/
│   └── adminGroup.js      # Comandos admin
├── jobs/
│   ├── requestLinks.js    # 8h
│   ├── postBets.js        # 10h
│   ├── enrichOdds.js      # 8h (enriquece com odds)
│   ├── healthCheck.js     # */5min
│   ├── reminders.js       # 9h (follow-up links)
│   └── trackResults.js    # 2h (tracking resultados)
└── services/
    ├── betService.js      # CRUD + estados
    ├── oddsService.js     # The Odds API
    ├── alertService.js    # Alertas admin
    ├── copyService.js     # Copy LLM
    ├── matchService.js    # Queries partidas
    ├── metricsService.js  # Taxa acerto
    ├── marketInterpreter.js # Interpreta mercados
    └── jobExecutionService.js # Logging de execução de jobs

lib/                       # Bibliotecas compartilhadas
├── db.js                  # PostgreSQL Pool (fonte única)
├── supabase.js            # Cliente REST Supabase
├── logger.js              # Logging centralizado
└── config.js              # Configurações

scripts/                   # ETL e manutenção
├── pipeline.js            # Pipeline ETL unificado
├── daily_update.js        # Atualização diária
├── check_analysis_queue.js
├── syncSeasons.js
├── fetch*.js              # Busca dados da API
├── load*.js               # Carrega no banco
├── lib/
│   ├── db.js              # Shim → lib/db.js
│   └── matchScreening.js
└── tests/                 # Scripts de teste
    └── test-*.js
```

---

## Environment Variables

### Bots (bets-estatistica)

```bash
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Telegram (por bot - cada bot tem seu próprio)
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_GROUP_ID=
TELEGRAM_PUBLIC_GROUP_ID=

# Multi-tenant (NOVO)
GROUP_ID=  # UUID do grupo que este bot atende

# APIs
THE_ODDS_API_KEY=
OPENAI_API_KEY=
FOOTYSTATS_API_KEY=

# Config
NODE_ENV=production
TZ=America/Sao_Paulo
```

### Admin Panel (admin-panel)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=

# Render API (para deploy de bots)
RENDER_API_KEY=
RENDER_BLUEPRINT_ID=

# Config
NODE_ENV=production
```

---

## Multi-tenant File Structure

### Bots (bets-estatistica) - Adaptações

```
bot/
├── jobs/
│   ├── postBets.js             # [ADAPTAR] Filtrar por GROUP_ID
│   ├── healthCheck.js          # [ADAPTAR] Pingar bot_health
│   └── membership/
│       ├── trial-reminders.js  # [ADAPTAR] Por grupo
│       └── kick-expired.js     # [ADAPTAR] Por grupo
└── services/
    └── memberService.js        # [ADAPTAR] Filtrar por GROUP_ID

lib/
└── config.js                   # [ADAPTAR] Carregar GROUP_ID do env

sql/migrations/
└── 010_multitenant.sql         # Novas tabelas: groups, admin_users, bot_pool, bot_health
```

### Admin Panel (admin-panel) - Novo

```
admin-panel/
├── src/
│   ├── app/
│   │   ├── (public)/login/     # Login Supabase Auth
│   │   ├── (auth)/             # Rotas protegidas
│   │   │   ├── dashboard/
│   │   │   ├── groups/         # Super Admin only
│   │   │   ├── members/
│   │   │   ├── bets/
│   │   │   └── bots/
│   │   └── api/
│   │       ├── groups/
│   │       ├── members/
│   │       ├── bets/
│   │       ├── bots/
│   │       └── webhooks/mercadopago/
│   ├── components/
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── mercadopago.ts
│   │   └── render.ts
│   └── middleware/
│       └── tenant.ts           # withTenant() OBRIGATÓRIO
└── middleware.ts               # Auth redirect
```

---

## Monitoramento & Infraestrutura

### Hosting
- **Bots:** Render.com (1 serviço por bot/influencer)
- **Admin Panel:** Vercel
- **Database:** Supabase (PostgreSQL)
- **Pipeline:** GitHub Actions (daily-pipeline.yml, 06:00 BRT)

### Health Check Multi-tenant

```javascript
// Cada bot pinga sua entrada em bot_health a cada 60s
async function heartbeat() {
  await supabase
    .from('bot_health')
    .upsert({
      group_id: process.env.GROUP_ID,
      last_heartbeat: new Date().toISOString(),
      status: 'online',
      restart_requested: false
    });
}

// Admin panel verifica: se last_heartbeat > 2 min → OFFLINE
```

### Restart Remoto

```javascript
// Admin marca restart_requested = true
// Bot verifica no health check e faz process.exit(1)
// Render reinicia automaticamente
```

### Alertas Automáticos
| Evento | Quem alerta | Canal |
|--------|-------------|-------|
| Bot offline | Admin Panel (bot_health) | Telegram Super Admin |
| DB offline | healthCheck | Telegram Admin |
| Job falhou | jobFailureAlert | Telegram Admin |
| Pipeline falhou | GitHub Actions | Telegram Admin |

---

_Última atualização: 2026-02-05_
