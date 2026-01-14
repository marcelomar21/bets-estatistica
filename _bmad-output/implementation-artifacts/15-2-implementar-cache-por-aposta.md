# Story 15.2: Implementar Cache por Aposta

Status: ready-for-dev

## Story

As a sistema,
I want cachear odds buscadas por aposta,
so that não faça scraping repetido.

## Acceptance Criteria

1. **Given** scraping de odds executado para uma aposta
   **When** mesma aposta consultada novamente
   **Then** retorna do cache se < 25 minutos

2. **Given** cache entry existente
   **When** TTL expirado (> 25 min)
   **Then** faz novo scraping

3. **Given** cache key
   **When** gerada
   **Then** formato é: `${homeTeam}_${awayTeam}_${betMarket}`

4. **Given** função de cache
   **When** chamada
   **Then** retorna `{ hit: true, data }` ou `{ hit: false }`

5. **Given** múltiplas apostas do mesmo jogo
   **When** mercados diferentes
   **Then** cada mercado tem cache separado

## Tasks / Subtasks

- [ ] Task 1: Criar estrutura de cache (AC: #1, #3)
  - [ ] 1.1: Definir Map para armazenamento in-memory
  - [ ] 1.2: Definir TTL de 25 minutos
  - [ ] 1.3: Implementar função `generateCacheKey(homeTeam, awayTeam, betMarket)`

- [ ] Task 2: Implementar getFromScrapingCache (AC: #1, #4)
  - [ ] 2.1: Verificar se key existe no cache
  - [ ] 2.2: Verificar se TTL não expirou
  - [ ] 2.3: Retornar dados ou null

- [ ] Task 3: Implementar setScrapingCache (AC: #1)
  - [ ] 3.1: Armazenar dados com timestamp
  - [ ] 3.2: Gerar key usando helper

- [ ] Task 4: Implementar limpeza periódica (AC: #2)
  - [ ] 4.1: Limpar entries expirados a cada 10 min
  - [ ] 4.2: Limitar tamanho máximo do cache

- [ ] Task 5: Integrar cache em scrapeBetOdds (AC: #1, #5)
  - [ ] 5.1: Verificar cache antes de scraping
  - [ ] 5.2: Salvar no cache após scraping bem-sucedido

- [ ] Task 6: Exportar funções de cache (AC: #4)
  - [ ] 6.1: Exportar getFromScrapingCache
  - [ ] 6.2: Exportar setScrapingCache
  - [ ] 6.3: Exportar clearScrapingCache (para testes)

## Dev Notes

### Referência: Cache Existente em oddsService.js

O projeto já tem implementação de cache in-memory:

```javascript
// oddsService.js linhas 30-61
const oddsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 500;
const CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

// Periodic cleanup
setInterval(() => {
  // ... cleanup logic
}, CACHE_CLEANUP_INTERVAL_MS).unref();
```

### Configuração de Cache para Scraping

```javascript
// Constantes para scraping cache
const SCRAPING_CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutos
const SCRAPING_CACHE_MAX_SIZE = 100; // Menor que odds cache
const SCRAPING_CACHE_CLEANUP_MS = 10 * 60 * 1000;

// Map separado para scraping
const scrapingCache = new Map();
```

### Funções de Cache

```javascript
/**
 * Generate cache key for scraping
 */
function generateScrapingCacheKey(homeTeam, awayTeam, betMarket) {
  // Normalizar nomes (lowercase, sem acentos, sem espaços extras)
  const normalize = (str) => str.toLowerCase().trim().replace(/\s+/g, '_');
  return `${normalize(homeTeam)}_${normalize(awayTeam)}_${normalize(betMarket)}`;
}

/**
 * Get from scraping cache
 * @returns {{ hit: boolean, data?: object }}
 */
function getFromScrapingCache(homeTeam, awayTeam, betMarket) {
  const key = generateScrapingCacheKey(homeTeam, awayTeam, betMarket);
  const cached = scrapingCache.get(key);

  if (!cached) {
    return { hit: false };
  }

  const now = Date.now();
  if (now - cached.timestamp > SCRAPING_CACHE_TTL_MS) {
    scrapingCache.delete(key);
    return { hit: false };
  }

  return { hit: true, data: cached.data };
}

/**
 * Set scraping cache
 */
function setScrapingCache(homeTeam, awayTeam, betMarket, data) {
  const key = generateScrapingCacheKey(homeTeam, awayTeam, betMarket);
  scrapingCache.set(key, {
    data,
    timestamp: Date.now()
  });
}
```

### Integração com scrapeBetOdds

```javascript
async function scrapeBetOdds(homeTeam, awayTeam, betMarket, betPick) {
  // 1. Verificar cache primeiro
  const cached = getFromScrapingCache(homeTeam, awayTeam, betMarket);
  if (cached.hit) {
    logger.debug('Scraping cache hit', { homeTeam, awayTeam, betMarket });
    return { success: true, data: cached.data, fromCache: true };
  }

  // 2. Fazer scraping
  logger.debug('Scraping cache miss', { homeTeam, awayTeam, betMarket });
  const result = await doActualScraping(homeTeam, awayTeam, betMarket, betPick);

  // 3. Salvar no cache se sucesso
  if (result.success) {
    setScrapingCache(homeTeam, awayTeam, betMarket, result.data);
  }

  return result;
}
```

### TTL de 25 Minutos

O TTL de 25 minutos é estratégico:
- Jobs de scraping rodam às 09:30, 14:30, 21:30
- Postagens rodam às 10:00, 15:00, 22:00
- Cache expira ANTES da próxima postagem (30 min depois)

### Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/services/scrapingOddsService.js` | MODIFICAR | Adicionar cache |

### Métricas de Cache (para Story 15.6)

```javascript
// Contadores para métricas
let cacheHits = 0;
let cacheMisses = 0;

function getScrapingCacheMetrics() {
  return {
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: cacheHits / (cacheHits + cacheMisses) || 0,
    size: scrapingCache.size
  };
}
```

### Project Structure Notes

- Cache in-memory (como oddsService)
- Normalização de keys para evitar duplicatas
- Cleanup periódico para evitar memory leak

### References

- [Source: bot/services/oddsService.js:30-61] - Cache existente como modelo
- [Source: _bmad-output/planning-artifacts/epics.md#story-15.2] - Definição original

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/services/scrapingOddsService.js (modificar)
