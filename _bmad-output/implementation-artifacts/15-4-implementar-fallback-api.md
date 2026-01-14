# Story 15.4: Implementar Fallback para The Odds API

Status: ready-for-dev

## Story

As a sistema,
I want ter fallback para API se scraping falhar,
so that não fique sem odds.

## Acceptance Criteria

1. **Given** scraping de uma aposta falha
   **When** sistema detecta erro
   **Then** tenta buscar via The Odds API (comportamento atual)

2. **Given** ambos scraping e API falharem
   **When** sem odds disponíveis
   **Then** marca aposta como "sem odds"
   **And** loga qual método foi usado

3. **Given** hierarquia de busca
   **When** buscando odds
   **Then** ordem é:
   1. Cache (se disponível e < 25 min)
   2. Scraping Betano
   3. The Odds API (fallback)
   4. Sem odds (último recurso)

4. **Given** odds obtidas
   **When** retornar resultado
   **Then** indica source: 'cache', 'scraping' ou 'api'

5. **Given** fallback para API
   **When** API encontra odds
   **Then** NÃO salva no scraping cache (caches separados)

## Tasks / Subtasks

- [ ] Task 1: Criar função de busca com fallback (AC: #1, #3)
  - [ ] 1.1: Criar função getOddsWithFallback(bet)
  - [ ] 1.2: Implementar hierarquia: cache → scraping → API
  - [ ] 1.3: Retornar resultado com source identificado

- [ ] Task 2: Integrar getOddsForBet como fallback (AC: #1)
  - [ ] 2.1: Chamar getOddsForBet existente de oddsService.js
  - [ ] 2.2: Tratar erros da API
  - [ ] 2.3: Logar quando usar fallback

- [ ] Task 3: Tratar falha total (AC: #2)
  - [ ] 3.1: Se todos métodos falharem, retornar sem odds
  - [ ] 3.2: Logar detalhes da falha
  - [ ] 3.3: Incluir na lista de failedBets

- [ ] Task 4: Identificar source no resultado (AC: #4)
  - [ ] 4.1: Adicionar campo source ao retorno
  - [ ] 4.2: Valores: 'cache', 'scraping', 'api', 'none'

- [ ] Task 5: Garantir separação de caches (AC: #5)
  - [ ] 5.1: Scraping cache é separado do odds API cache
  - [ ] 5.2: API já tem seu próprio cache (5 min TTL)

- [ ] Task 6: Atualizar job de scraping (AC: #1-4)
  - [ ] 6.1: Usar getOddsWithFallback no loop de processamento
  - [ ] 6.2: Coletar estatísticas por source

## Dev Notes

### Função getOddsWithFallback

```javascript
/**
 * Get odds with fallback hierarchy
 * Order: Cache → Scraping → API → None
 *
 * @param {object} bet - Bet object with homeTeamName, awayTeamName, betMarket, betPick
 * @returns {Promise<{success: boolean, data?: object, source: string, error?: object}>}
 */
async function getOddsWithFallback(bet) {
  const { homeTeamName, awayTeamName, betMarket, betPick } = bet;

  // 1. Verificar scraping cache
  const cached = getFromScrapingCache(homeTeamName, awayTeamName, betMarket);
  if (cached.hit) {
    logger.debug('Odds from scraping cache', { betId: bet.id });
    return { success: true, data: cached.data, source: 'cache' };
  }

  // 2. Tentar scraping
  try {
    const scrapingResult = await scrapeBetOdds(homeTeamName, awayTeamName, betMarket, betPick);
    if (scrapingResult.success) {
      logger.debug('Odds from scraping', { betId: bet.id });
      return { success: true, data: scrapingResult.data, source: 'scraping' };
    }
  } catch (scrapingErr) {
    logger.warn('Scraping failed', { betId: bet.id, error: scrapingErr.message });
  }

  // 3. Fallback para The Odds API
  logger.info('Using API fallback', { betId: bet.id });
  try {
    const apiResult = await getOddsForBet(bet);
    if (apiResult.success) {
      logger.debug('Odds from API fallback', { betId: bet.id });
      return { success: true, data: apiResult.data, source: 'api' };
    }
  } catch (apiErr) {
    logger.warn('API fallback failed', { betId: bet.id, error: apiErr.message });
  }

  // 4. Nenhum método funcionou
  logger.error('All odds methods failed', { betId: bet.id });
  return {
    success: false,
    source: 'none',
    error: {
      code: 'NO_ODDS',
      message: 'Scraping e API falharam'
    }
  };
}
```

### Integração no Job de Scraping

```javascript
// Em scrapingOdds.js
const { getOddsWithFallback } = require('../services/scrapingOddsService');

for (const bet of bets) {
  const result = await getOddsWithFallback(bet);

  // Coletar estatísticas por source
  sourceStats[result.source] = (sourceStats[result.source] || 0) + 1;

  if (result.success) {
    const oldOdds = bet.odds;
    const newOdds = result.data.odds;

    if (oldOdds !== newOdds) {
      await updateBetOdds(bet.id, newOdds);
      updatedBets.push({
        id: bet.id,
        match: `${bet.homeTeamName} vs ${bet.awayTeamName}`,
        oldOdds,
        newOdds,
        source: result.source
      });
    }
  } else {
    failedBets.push({
      id: bet.id,
      match: `${bet.homeTeamName} vs ${bet.awayTeamName}`,
      error: result.error?.message
    });
  }
}
```

### Hierarquia de Busca

```
┌─────────────────────────────────────────┐
│     1. SCRAPING CACHE (TTL: 25 min)     │
│     ↓ se miss ou expirado               │
├─────────────────────────────────────────┤
│     2. SCRAPING BETANO (LLM)            │
│     ↓ se falhar                         │
├─────────────────────────────────────────┤
│     3. THE ODDS API (fallback)          │
│     ↓ se falhar                         │
├─────────────────────────────────────────┤
│     4. SEM ODDS (último recurso)        │
└─────────────────────────────────────────┘
```

### Separação de Caches

| Cache | Localização | TTL | Propósito |
|-------|-------------|-----|-----------|
| Scraping Cache | scrapingOddsService.js | 25 min | Odds do scraping |
| Odds API Cache | oddsService.js | 5 min | Odds da API |

**Importante:** São caches separados. Odds da API NÃO populam o scraping cache.

### Logging de Source

```javascript
// Log detalhado para análise
logger.info('Bet odds result', {
  betId: bet.id,
  source: result.source,
  odds: result.data?.odds,
  bookmaker: result.data?.bookmaker
});
```

### Estatísticas para Warn

```javascript
// Ao final do job
const sourceStats = {
  cache: 0,
  scraping: 0,
  api: 0,
  none: 0
};

// Incluir no warn
await sendScrapingWarn(updatedBets, failedBets, {
  ...statusForNextPost,
  sources: sourceStats
});
```

### Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/services/scrapingOddsService.js` | MODIFICAR | Adicionar getOddsWithFallback |
| `bot/jobs/scrapingOdds.js` | MODIFICAR | Usar getOddsWithFallback |

### Dependências

- Story 15.1 (scrapingOddsService.js) - scrapeBetOdds
- Story 15.2 (cache) - getFromScrapingCache
- `bot/services/oddsService.js` - getOddsForBet existente

### Project Structure Notes

- Reutilizar getOddsForBet existente
- Manter caches separados
- Logar source para debugging e análise

### References

- [Source: bot/services/oddsService.js:482-550] - getOddsForBet existente
- [Source: bot/services/oddsService.js:30-61] - Cache da API existente
- [Source: _bmad-output/planning-artifacts/epics.md#story-15.4] - Definição original

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/services/scrapingOddsService.js (modificar)
- bot/jobs/scrapingOdds.js (modificar)
