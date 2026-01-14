# Story 15.6: Adicionar Metricas de Custo LLM

Status: ready-for-dev

## Story

As a operador,
I want ver quanto estou gastando em tokens,
so that possa controlar custos.

## Acceptance Criteria

1. **Given** scraping via LLM executado
   **When** chamada ao LLM completa
   **Then** contabiliza tokens usados (estimativa)
   **And** incrementa contador de chamadas

2. **Given** job de scraping conclui
   **When** metricas coletadas
   **Then** loga:
   - Total de scrapes feitos
   - Tokens usados (estimativa)
   - Cache hits vs misses
   - Tempo de execucao

3. **Given** warn de scraping enviado
   **When** formatar mensagem
   **Then** inclui resumo de custos:
   - "📊 Custo: ~X tokens | Cache: Y hits"
   - Porcentagem de cache hits

4. **Given** multiplas execucoes no dia
   **When** consultar metricas
   **Then** metricas diarias sao acumuladas
   **And** resetam a meia-noite

5. **Given** operador quer ver metricas
   **When** usar comando /metricas ou warn
   **Then** ve resumo do dia atual

## Tasks / Subtasks

- [ ] Task 1: Criar estrutura de metricas em scrapingOddsService.js (AC: #1, #4)
  - [ ] 1.1: Criar objeto scrapingMetrics com contadores
  - [ ] 1.2: Funcao incrementTokenCount(amount)
  - [ ] 1.3: Funcao incrementCacheHit()
  - [ ] 1.4: Funcao incrementCacheMiss()
  - [ ] 1.5: Funcao resetDailyMetrics()

- [ ] Task 2: Instrumentar chamadas LLM (AC: #1)
  - [ ] 2.1: Estimar tokens por chamada (~800 tokens)
  - [ ] 2.2: Contabilizar em cada scrapeBetOdds()
  - [ ] 2.3: Distinguir scraping real de cache hit

- [ ] Task 3: Coletar metricas de tempo (AC: #2)
  - [ ] 3.1: Registrar inicio do job
  - [ ] 3.2: Registrar fim do job
  - [ ] 3.3: Calcular tempo total de execucao

- [ ] Task 4: Exportar funcao getScrapingMetrics() (AC: #2, #5)
  - [ ] 4.1: Retornar objeto com todas as metricas
  - [ ] 4.2: Incluir dados do dia atual
  - [ ] 4.3: Calcular porcentagem de cache hits

- [ ] Task 5: Atualizar sendScrapingWarn para incluir metricas (AC: #3)
  - [ ] 5.1: Adicionar parametro metrics em sendScrapingWarn
  - [ ] 5.2: Formatar linha de custo no warn
  - [ ] 5.3: Mostrar cache hit rate

- [ ] Task 6: Integrar metricas no job scrapingOdds (AC: #2)
  - [ ] 6.1: Chamar getScrapingMetrics() ao final
  - [ ] 6.2: Passar metricas para sendScrapingWarn
  - [ ] 6.3: Logar metricas detalhadas

## Dev Notes

### Dependencias

**IMPORTANTE:** Esta story DEPENDE de:
- **Story 15.1:** Servico scrapingOddsService.js deve existir
- **Story 15.3:** Job scrapingOdds.js deve existir
- **Story 15.5:** Integracao com sendScrapingWarn

### Estrutura de Metricas

```javascript
// Em bot/services/scrapingOddsService.js

// Metricas globais (resetam diariamente)
let scrapingMetrics = {
  date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
  totalScrapes: 0,
  totalTokens: 0,
  cacheHits: 0,
  cacheMisses: 0,
  apiCalls: 0,  // LLM calls
  apiFallbacks: 0,  // Fallback to The Odds API
  errors: 0,
  totalTimeMs: 0,
  lastResetAt: new Date().toISOString()
};

// Estimativa de tokens por chamada LLM
const ESTIMATED_TOKENS_PER_SCRAPE = 800;

/**
 * Reset metricas diarias (chamar no inicio do primeiro job do dia)
 */
function resetDailyMetrics() {
  const today = new Date().toISOString().split('T')[0];
  if (scrapingMetrics.date !== today) {
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
    logger.info('Scraping metrics reset for new day', { date: today });
  }
}

/**
 * Incrementar contadores
 */
function incrementTokenCount(amount = ESTIMATED_TOKENS_PER_SCRAPE) {
  resetDailyMetrics();
  scrapingMetrics.totalTokens += amount;
  scrapingMetrics.apiCalls++;
}

function incrementCacheHit() {
  resetDailyMetrics();
  scrapingMetrics.cacheHits++;
  scrapingMetrics.totalScrapes++;
}

function incrementCacheMiss() {
  resetDailyMetrics();
  scrapingMetrics.cacheMisses++;
  scrapingMetrics.totalScrapes++;
}

function incrementApiFallback() {
  resetDailyMetrics();
  scrapingMetrics.apiFallbacks++;
}

function incrementError() {
  resetDailyMetrics();
  scrapingMetrics.errors++;
}

function addExecutionTime(ms) {
  resetDailyMetrics();
  scrapingMetrics.totalTimeMs += ms;
}

/**
 * Obter metricas atuais
 * @returns {object} Metricas do dia atual
 */
function getScrapingMetrics() {
  resetDailyMetrics();

  const hitRate = scrapingMetrics.totalScrapes > 0
    ? Math.round((scrapingMetrics.cacheHits / scrapingMetrics.totalScrapes) * 100)
    : 0;

  return {
    ...scrapingMetrics,
    cacheHitRate: hitRate,
    avgTimePerScrape: scrapingMetrics.totalScrapes > 0
      ? Math.round(scrapingMetrics.totalTimeMs / scrapingMetrics.totalScrapes)
      : 0,
    estimatedCostUsd: estimateCostUsd(scrapingMetrics.totalTokens)
  };
}

/**
 * Estimar custo em USD (baseado em GPT-4 pricing)
 * Input: ~$0.03/1K tokens, Output: ~$0.06/1K tokens
 * Estimativa conservadora: $0.05/1K tokens medio
 */
function estimateCostUsd(tokens) {
  return (tokens / 1000) * 0.05;
}
```

### Instrumentacao em scrapeBetOdds

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
    throw err;
  }
}
```

### Atualizacao de sendScrapingWarn

```javascript
// Em bot/jobs/jobWarn.js

/**
 * Send warn after scraping job completes (Epic 15)
 * @param {Array} updatedBets - [{id, oldOdds, newOdds}]
 * @param {Array} failedBets - [{id, error}]
 * @param {object} statusForNextPost - Summary for next posting
 * @param {object} metrics - Metricas de custo (Story 15.6)
 */
async function sendScrapingWarn(updatedBets, failedBets, statusForNextPost, metrics = null) {
  // ... formatacao existente ...

  // Adicionar metricas se disponivel
  if (metrics) {
    message += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `📊 *METRICAS DO DIA:*\n`;
    message += `🔢 Scrapes: ${metrics.totalScrapes}\n`;
    message += `💰 Tokens: ~${metrics.totalTokens.toLocaleString()}\n`;
    message += `💵 Custo: ~$${metrics.estimatedCostUsd.toFixed(4)}\n`;
    message += `📦 Cache: ${metrics.cacheHitRate}% hits (${metrics.cacheHits}/${metrics.totalScrapes})\n`;
    if (metrics.apiFallbacks > 0) {
      message += `🔄 Fallback API: ${metrics.apiFallbacks}x\n`;
    }
  }

  // ... resto da formatacao ...
}
```

### Formato do Warn com Metricas

```
🔄 *SCRAPING CONCLUIDO* ✅

━━━━━━━━━━━━━━━━━━━━

*ODDS ATUALIZADAS:*
📈 #45 Liverpool vs Arsenal
   1.85 → 1.92 (scraping)
📈 #52 Man City vs Chelsea
   1.68 → 1.71 (api fallback)

━━━━━━━━━━━━━━━━━━━━

📊 *METRICAS DO DIA:*
🔢 Scrapes: 12
💰 Tokens: ~9,600
💵 Custo: ~$0.48
📦 Cache: 67% hits (8/12)
🔄 Fallback API: 2x

━━━━━━━━━━━━━━━━━━━━

📊 *STATUS PARA POSTAGEM:*
✅ 3 apostas prontas
...
```

### Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `bot/services/scrapingOddsService.js` | MODIFICAR | Adicionar estrutura de metricas |
| `bot/jobs/jobWarn.js` | MODIFICAR | Adicionar parametro metrics em sendScrapingWarn |
| `bot/jobs/scrapingOdds.js` | MODIFICAR | Passar metricas para sendScrapingWarn |

### Consideracoes de Estimativa

- Tokens por scrape: ~800 (estimativa conservadora)
- Custo medio GPT-4: $0.05/1K tokens (media input+output)
- Metricas resetam automaticamente a meia-noite
- Valores sao estimativas, nao consumo real da API

### Project Structure Notes

- Metricas sao em memoria (nao persistem entre restarts)
- Para persistencia, considerar tabela no Supabase (futuro)
- Reset automatico baseado em data evita acumulo indefinido

### References

- [Source: bot/services/scrapingOddsService.js] - Servico a instrumentar (Story 15.1)
- [Source: bot/jobs/scrapingOdds.js] - Job que coleta metricas (Story 15.3)
- [Source: bot/jobs/jobWarn.js] - Funcao sendScrapingWarn (Story 14.2)
- [Source: _bmad-output/planning-artifacts/epics.md#story-15.6] - Definicao original

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/services/scrapingOddsService.js (modificar)
- bot/jobs/jobWarn.js (modificar)
- bot/jobs/scrapingOdds.js (modificar)
