---
project_name: 'bets-estatistica'
user_name: 'Marcelomendes'
date: '2026-01-10'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules']
status: 'complete'
rule_count: 28
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
| @supabase/supabase-js | latest | Nova dependência |
| node-telegram-bot-api | latest | Nova dependência |
| node-cron | latest | Dev scheduling |

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

## File Structure Reference

```
bot/
├── index.js           # Entry point
├── telegram.js        # Singleton client
├── handlers/
│   └── adminGroup.js  # Receber links
├── jobs/
│   ├── requestLinks.js   # 8h/13h/20h
│   ├── postBets.js       # 10h/15h/22h
│   ├── reminders.js      # */30min
│   └── trackResults.js   # */5min
└── services/
    ├── oddsService.js    # The Odds API
    ├── betService.js     # CRUD + estados
    ├── metricsService.js # Taxa acerto
    └── alertService.js   # Alertas admin

lib/
├── supabase.js        # Único acesso ao DB
├── logger.js          # Logging centralizado
└── config.js          # Configurações
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

# Config
NODE_ENV=production
TZ=America/Sao_Paulo
```

---

_Última atualização: 2026-01-10_
