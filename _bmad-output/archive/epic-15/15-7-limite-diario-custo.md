# Story 15.7: Configurar Limite Diario de Custo

Status: ready-for-dev

## Story

As a sistema,
I want ter limite configuravel de chamadas LLM,
so that custos nao fujam do controle.

## Acceptance Criteria

1. **Given** configuracao em `lib/config.js`
   **When** sistema inicializa
   **Then** carrega configuracoes de scraping:
   - `maxDailyScrapes` (default: 100)
   - `cacheTtlMinutes` (default: 25)
   - `fallbackToApi` (default: true)
   - `alertOnLimitReached` (default: true)

2. **Given** limite de scrapes diarios atingido
   **When** nova tentativa de scraping
   **Then** pula scraping LLM
   **And** usa apenas fallback The Odds API
   **And** loga que limite foi atingido

3. **Given** limite atingido pela primeira vez no dia
   **When** alertOnLimitReached = true
   **Then** envia alerta para grupo admin
   **And** alerta inclui contagem atual e limite

4. **Given** metricas do dia
   **When** verificar limite
   **Then** usa contador de scrapingMetrics.apiCalls
   **And** limite se aplica apenas a chamadas LLM (nao cache)

5. **Given** novo dia (apos meia-noite)
   **When** job executa
   **Then** limite e resetado junto com metricas

## Tasks / Subtasks

- [ ] Task 1: Adicionar configuracoes de scraping em lib/config.js (AC: #1)
  - [ ] 1.1: Criar objeto scraping no config
  - [ ] 1.2: Definir maxDailyScrapes com default 100
  - [ ] 1.3: Definir cacheTtlMinutes com default 25
  - [ ] 1.4: Definir fallbackToApi com default true
  - [ ] 1.5: Definir alertOnLimitReached com default true

- [ ] Task 2: Implementar verificacao de limite em scrapingOddsService.js (AC: #2, #4)
  - [ ] 2.1: Criar funcao isLimitReached()
  - [ ] 2.2: Comparar apiCalls com maxDailyScrapes
  - [ ] 2.3: Retornar boolean indicando se limite atingido

- [ ] Task 3: Modificar scrapeBetOdds para respeitar limite (AC: #2)
  - [ ] 3.1: Verificar limite antes de chamar LLM
  - [ ] 3.2: Se limite atingido, pular para fallback API
  - [ ] 3.3: Logar quando limite impede scraping

- [ ] Task 4: Implementar alerta de limite (AC: #3)
  - [ ] 4.1: Criar funcao alertLimitReached()
  - [ ] 4.2: Verificar se ja alertou hoje (evitar spam)
  - [ ] 4.3: Enviar alerta via alertAdmin()
  - [ ] 4.4: Formatar mensagem com contagem e limite

- [ ] Task 5: Integrar verificacoes no fluxo (AC: #2, #3, #5)
  - [ ] 5.1: Verificar limite em cada tentativa de scrape
  - [ ] 5.2: Alertar apenas uma vez por dia
  - [ ] 5.3: Garantir que reset diario funciona

- [ ] Task 6: Testar limites (AC: #1-5)
  - [ ] 6.1: Testar scraping dentro do limite
  - [ ] 6.2: Testar scraping apos limite - deve usar fallback
  - [ ] 6.3: Testar alerta de limite
  - [ ] 6.4: Testar reset no novo dia

## Dev Notes

### Dependencias

**IMPORTANTE:** Esta story DEPENDE de:
- **Story 15.1:** Servico scrapingOddsService.js deve existir
- **Story 15.6:** Metricas de custo devem estar implementadas

### Configuracao em lib/config.js

```javascript
const config = {
  // ... configs existentes ...

  // Scraping LLM configuration (Epic 15)
  scraping: {
    maxDailyScrapes: parseInt(process.env.MAX_DAILY_SCRAPES) || 100,
    cacheTtlMinutes: parseInt(process.env.SCRAPING_CACHE_TTL) || 25,
    fallbackToApi: process.env.SCRAPING_FALLBACK_API !== 'false', // true by default
    alertOnLimitReached: process.env.SCRAPING_ALERT_LIMIT !== 'false', // true by default
  },

  // ... resto do config ...
};
```

### Implementacao em scrapingOddsService.js

```javascript
const { config } = require('../../lib/config');
const { alertAdmin } = require('../telegram');

// Flag para evitar spam de alertas
let limitAlertSentToday = false;
let limitAlertDate = null;

/**
 * Verifica se limite diario de scrapes foi atingido
 * @returns {boolean} true se limite atingido
 */
function isLimitReached() {
  resetDailyMetrics(); // Garante metricas do dia atual

  const limit = config.scraping.maxDailyScrapes;
  const current = scrapingMetrics.apiCalls;

  return current >= limit;
}

/**
 * Envia alerta quando limite e atingido (apenas 1x por dia)
 */
async function alertLimitReached() {
  // Verificar se ja alertou hoje
  const today = new Date().toISOString().split('T')[0];
  if (limitAlertSentToday && limitAlertDate === today) {
    return; // Ja alertou hoje
  }

  // Verificar config
  if (!config.scraping.alertOnLimitReached) {
    return;
  }

  limitAlertSentToday = true;
  limitAlertDate = today;

  const limit = config.scraping.maxDailyScrapes;
  const current = scrapingMetrics.apiCalls;

  const message = `⚠️ *LIMITE DIARIO DE SCRAPING ATINGIDO*\n\n` +
    `📊 Chamadas LLM: ${current}/${limit}\n\n` +
    `O sistema usara apenas The Odds API (fallback) para o resto do dia.\n\n` +
    `_Limite reseta a meia-noite (horario de Brasilia)._`;

  await alertAdmin('WARN', 'Limite de Scraping', message);

  logger.warn('Daily scraping limit reached', {
    current,
    limit,
    date: today
  });
}

/**
 * Reset diario - inclui flag de alerta
 */
function resetDailyMetrics() {
  const today = new Date().toISOString().split('T')[0];
  if (scrapingMetrics.date !== today) {
    // Reset metricas
    scrapingMetrics = {
      date: today,
      totalScrapes: 0,
      totalTokens: 0,
      cacheHits: 0,
      cacheMisses: 0,
      apiCalls: 0,
      apiFallbacks: 0,
      errors: 0,
      totalTimeMs: 0,
      lastResetAt: new Date().toISOString()
    };

    // Reset flag de alerta
    limitAlertSentToday = false;

    logger.info('Scraping metrics reset for new day', { date: today });
  }
}
```

### Modificacao em scrapeBetOdds

```javascript
async function scrapeBetOdds(homeTeam, awayTeam, betMarket, betPick) {
  const startTime = Date.now();

  // Check cache first
  const cacheKey = `${homeTeam}_${awayTeam}_${betMarket}`;
  const cached = getFromCache(cacheKey);

  if (cached) {
    incrementCacheHit();
    logger.debug('Cache hit for odds', { cacheKey });
    return cached;
  }

  incrementCacheMiss();

  // Story 15.7: Verificar limite antes de chamar LLM
  if (isLimitReached()) {
    logger.info('Daily scraping limit reached, using fallback only', {
      current: scrapingMetrics.apiCalls,
      limit: config.scraping.maxDailyScrapes
    });

    // Alertar (apenas 1x por dia)
    await alertLimitReached();

    // Tentar fallback API se habilitado
    if (config.scraping.fallbackToApi) {
      return await fallbackToOddsApi(homeTeam, awayTeam, betMarket, betPick);
    }

    // Sem fallback, retornar null
    return null;
  }

  try {
    // Chamar LLM para scraping
    const result = await callLlmForOdds(homeTeam, awayTeam, betMarket, betPick);

    // Contabilizar tokens
    incrementTokenCount(ESTIMATED_TOKENS_PER_SCRAPE);

    // Tempo de execucao
    addExecutionTime(Date.now() - startTime);

    // Cache result
    setToCache(cacheKey, result);

    return result;

  } catch (err) {
    incrementError();
    addExecutionTime(Date.now() - startTime);

    // Tentar fallback em caso de erro
    if (config.scraping.fallbackToApi) {
      logger.warn('Scraping failed, trying fallback API', { error: err.message });
      incrementApiFallback();
      return await fallbackToOddsApi(homeTeam, awayTeam, betMarket, betPick);
    }

    throw err;
  }
}

/**
 * Fallback para The Odds API quando scraping falha ou limite atingido
 */
async function fallbackToOddsApi(homeTeam, awayTeam, betMarket, betPick) {
  const { enrichBetsWithOdds } = require('./oddsService');

  // Criar objeto bet-like para usar oddsService existente
  const mockBet = {
    homeTeamName: homeTeam,
    awayTeamName: awayTeam,
    betMarket,
    betPick
  };

  const results = await enrichBetsWithOdds([mockBet]);

  if (results.length > 0 && results[0].odds) {
    incrementApiFallback();
    return {
      bookmaker: 'the-odds-api',
      odds: results[0].odds,
      source: 'api-fallback'
    };
  }

  return null;
}
```

### Variaveis de Ambiente Opcionais

```bash
# .env.example

# Scraping LLM (Epic 15)
MAX_DAILY_SCRAPES=100         # Limite diario de chamadas LLM
SCRAPING_CACHE_TTL=25         # TTL do cache em minutos
SCRAPING_FALLBACK_API=true    # Usar The Odds API como fallback
SCRAPING_ALERT_LIMIT=true     # Alertar quando limite atingido
```

### Formato do Alerta

```
⚠️ *LIMITE DIARIO DE SCRAPING ATINGIDO*

📊 Chamadas LLM: 100/100

O sistema usara apenas The Odds API (fallback) para o resto do dia.

_Limite reseta a meia-noite (horario de Brasilia)._
```

### Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `lib/config.js` | MODIFICAR | Adicionar objeto scraping com configs |
| `bot/services/scrapingOddsService.js` | MODIFICAR | Adicionar verificacao de limite |

### Consideracoes

- Limite se aplica apenas a chamadas LLM (apiCalls), nao a cache hits
- Alerta enviado apenas 1x por dia para evitar spam
- Fallback para API e comportamento default
- Reset automatico a meia-noite (junto com metricas)

### Valores Recomendados

| Parametro | Default | Recomendado | Razao |
|-----------|---------|-------------|-------|
| maxDailyScrapes | 100 | 50-100 | ~3 jobs x 3 apostas x 3x/dia = ~27 |
| cacheTtlMinutes | 25 | 25 | Expira antes do proximo job |
| fallbackToApi | true | true | Garante odds mesmo sem LLM |
| alertOnLimitReached | true | true | Operador deve saber |

### Project Structure Notes

- Config centralizado em lib/config.js
- Variaveis de ambiente opcionais (defaults funcionais)
- Alerta usa alertAdmin existente de telegram.js

### References

- [Source: lib/config.js] - Arquivo de configuracao
- [Source: bot/services/scrapingOddsService.js] - Servico a modificar
- [Source: bot/telegram.js] - Funcao alertAdmin
- [Source: _bmad-output/planning-artifacts/epics.md#story-15.7] - Definicao original
- [Source: _bmad-output/implementation-artifacts/15-6-metricas-custo-llm.md] - Dependencia

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- lib/config.js (modificar)
- bot/services/scrapingOddsService.js (modificar)
