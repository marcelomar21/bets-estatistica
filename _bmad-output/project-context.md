---
project_name: 'bets-estatistica'
user_name: 'Marcelomendes'
date: '2026-01-17'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules', 'membership_rules']
status: 'complete'
rule_count: 42
optimized_for_llm: true
---

# Project Context for AI Agents

_Regras críticas que AI agents DEVEM seguir ao implementar código neste projeto._

---

## Technology Stack & Versions

| Technology | Version | Notes |
|------------|---------|-------|
| Node.js | 20+ | Runtime obrigatório |
| JavaScript | ES2022 | CommonJS modules |
| LangChain | 1.1.x | Manter versão existente |
| OpenAI | GPT-5.1 | Via LangChain |
| Zod | 4.x | Validação de schemas |
| axios | 1.x | HTTP client |
| @supabase/supabase-js | latest | Database client |
| node-telegram-bot-api | latest | Bot framework |
| node-cron | latest | Job scheduling |
| express | ^4.18 | Webhook server (Cakto) |
| express-rate-limit | ^7.x | Rate limiting |
| helmet | ^7.x | Security headers |

**Remover:**
- ❌ puppeteer - não mais necessário

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

## Bet State Machine

```
generated → pending_link → ready → posted → success
                                         ↘ failure
                               ↘ cancelled
```

**Estados válidos:**
- `generated` - Aposta criada pela IA
- `pending_link` - Link solicitado ao operador
- `ready` - Link recebido, pronta para postar
- `posted` - Enviada ao grupo público
- `success` - Jogo terminou, aposta ganhou
- `failure` - Jogo terminou, aposta perdeu
- `cancelled` - Cancelada (sem link a tempo, etc.)

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
| `CAKTO_API_ERROR` | Erro na API do Cakto |
| `WEBHOOK_INVALID_SIGNATURE` | HMAC do webhook inválido |
| `WEBHOOK_DUPLICATE` | Evento já processado (idempotency) |

---

## Webhook Processing Pattern

```javascript
// ✅ SEMPRE processar webhooks de forma assíncrona
// 1. Validar HMAC
// 2. Salvar evento raw
// 3. Responder 200 IMEDIATAMENTE
// 4. Processar via job async

app.post('/webhooks/cakto', validateSignature, async (req, res) => {
  const { event_id, event_type, data } = req.body;

  // Salvar imediatamente (idempotente)
  await supabase.from('webhook_events').insert({
    idempotency_key: event_id,
    event_type,
    payload: data,
    status: 'pending'
  });

  // Responder rápido
  res.status(200).json({ received: true });
});

// ❌ NUNCA processar síncrono
app.post('/webhook', async (req, res) => {
  await processPayment(req.body);  // ERRADO - bloqueia
  res.send('ok');
});
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
│   ├── requestLinks.js    # 8h/13h/20h
│   ├── postBets.js        # 10h/15h/22h
│   ├── enrichOdds.js      # Enriquece com odds
│   ├── healthCheck.js     # Health check
│   ├── reminders.js       # Lembretes
│   └── trackResults.js    # Tracking resultados
└── services/
    ├── betService.js      # CRUD + estados
    ├── oddsService.js     # The Odds API
    ├── alertService.js    # Alertas admin
    ├── copyService.js     # Copy LLM
    ├── matchService.js    # Queries partidas
    ├── metricsService.js  # Taxa acerto
    └── marketInterpreter.js # Interpreta mercados

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

```bash
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_GROUP_ID=
TELEGRAM_PUBLIC_GROUP_ID=

# APIs
THE_ODDS_API_KEY=
OPENAI_API_KEY=
FOOTYSTATS_API_KEY=

# Cakto Integration
CAKTO_API_URL=https://api.cakto.com.br
CAKTO_CLIENT_ID=
CAKTO_CLIENT_SECRET=
CAKTO_WEBHOOK_SECRET=
CAKTO_WEBHOOK_PORT=3001
CAKTO_PRODUCT_ID=

# Config
NODE_ENV=production
TZ=America/Sao_Paulo
```

---

## New Membership Files

```
bot/
├── webhook-server.js           # Express server :3001 (Cakto)
├── handlers/
│   └── caktoWebhook.js         # Valida HMAC, salva evento
├── jobs/
│   └── membership/
│       ├── index.js            # Registra jobs
│       ├── trial-reminders.js  # 09:00 BRT
│       ├── kick-expired.js     # 00:01 BRT
│       ├── renewal-reminders.js # 10:00 BRT
│       ├── process-webhooks.js # */30s
│       └── reconciliation.js   # 03:00 BRT
└── services/
    ├── memberService.js        # CRUD + state machine
    └── caktoService.js         # OAuth + API

lib/
└── lock.js                     # Distributed lock via Supabase

sql/migrations/
└── 005_membership_tables.sql   # members, member_notifications, webhook_events
```

---

_Última atualização: 2026-01-17_
