# Story 15.3: Criar Job de Scraping (scrapingOdds.js)

Status: ready-for-dev

## Story

As a sistema,
I want ter um job de scraping que roda antes das postagens,
so that odds estejam sempre atualizadas.

## Acceptance Criteria

1. **Given** cron configurado para 09:30, 14:30, 21:30
   **When** job executa
   **Then** busca apostas elegíveis para próxima postagem

2. **Given** lista de apostas elegíveis
   **When** processando cada aposta
   **Then** para cada uma:
   1. Verifica cache
   2. Se cache miss, chama `scrapeBetOdds()`
   3. Se scraping falhar, tenta fallback API
   4. Atualiza odds no BD
   5. Registra em histórico

3. **Given** job concluído
   **When** finalizado
   **Then** envia warn com resumo via `sendScrapingWarn()`

4. **Given** job executado via CLI
   **When** chamado com `node bot/jobs/scrapingOdds.js`
   **Then** executa e retorna resultado

5. **Given** job retorna resultado
   **When** concluído
   **Then** formato inclui: updated, failed, skipped, fromCache

## Tasks / Subtasks

- [ ] Task 1: Criar estrutura do job (AC: #1, #4)
  - [ ] 1.1: Criar arquivo bot/jobs/scrapingOdds.js
  - [ ] 1.2: Importar dependências (scrapingOddsService, betService, oddsService)
  - [ ] 1.3: Criar função principal runScrapingOdds()

- [ ] Task 2: Buscar apostas elegíveis (AC: #1)
  - [ ] 2.1: Usar getFilaStatus() ou getEligibleBets()
  - [ ] 2.2: Filtrar apostas que precisam de odds
  - [ ] 2.3: Ordenar por kickoff_time

- [ ] Task 3: Implementar loop de scraping (AC: #2)
  - [ ] 3.1: Para cada aposta, chamar scrapeBetOdds()
  - [ ] 3.2: Se sucesso, atualizar odds no BD via updateBetOdds()
  - [ ] 3.3: Se falha, tentar fallback (Story 15.4)
  - [ ] 3.4: Coletar estatísticas (updated, failed, cached)

- [ ] Task 4: Registrar no histórico (AC: #2)
  - [ ] 4.1: Se odds mudou, registrar em odds_update_history (Story 14.8)
  - [ ] 4.2: Armazenar old_value e new_value

- [ ] Task 5: Enviar warn ao final (AC: #3)
  - [ ] 5.1: Importar sendScrapingWarn de jobWarn.js
  - [ ] 5.2: Passar updatedBets, failedBets, statusForNextPost
  - [ ] 5.3: Tratar erros do warn (não deve falhar job)

- [ ] Task 6: Implementar execução CLI (AC: #4, #5)
  - [ ] 6.1: Adicionar bloco if (require.main === module)
  - [ ] 6.2: Retornar estatísticas no console

## Dev Notes

### Estrutura do Job

```javascript
/**
 * Job: Scrape odds before posting
 *
 * Stories covered:
 * - 15.3: Criar job de scraping
 *
 * Run: node bot/jobs/scrapingOdds.js
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { scrapeBetOdds, getScrapingCacheMetrics } = require('../services/scrapingOddsService');
const { getEligibleBets, updateBetOdds } = require('../services/betService');
const { getOddsForBet } = require('../services/oddsService');
const { sendScrapingWarn } = require('./jobWarn');

async function runScrapingOdds() {
  const now = new Date().toISOString();
  logger.info('Starting scraping odds job', { timestamp: now });

  // Step 1: Buscar apostas elegíveis
  const eligibleResult = await getEligibleBets();
  if (!eligibleResult.success) {
    logger.error('Failed to get eligible bets', { error: eligibleResult.error?.message });
    return { updated: 0, failed: 0, skipped: 0, fromCache: 0 };
  }

  const bets = eligibleResult.data;
  logger.info('Found eligible bets', { count: bets.length });

  // Coletar resultados
  const updatedBets = [];
  const failedBets = [];
  let skipped = 0;
  let fromCache = 0;

  // Step 2: Processar cada aposta
  for (const bet of bets) {
    // ... processing logic
  }

  // Step 3: Enviar warn
  try {
    await sendScrapingWarn(updatedBets, failedBets, {
      total: bets.length,
      updated: updatedBets.length,
      failed: failedBets.length,
      cached: fromCache
    });
  } catch (warnErr) {
    logger.warn('Failed to send scraping warn', { error: warnErr.message });
  }

  // Step 4: Retornar estatísticas
  const result = {
    updated: updatedBets.length,
    failed: failedBets.length,
    skipped,
    fromCache
  };

  logger.info('Scraping odds job complete', result);
  return result;
}

// Run if called directly
if (require.main === module) {
  runScrapingOdds()
    .then(result => {
      console.log('✅ Scraping odds complete:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Scraping odds failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runScrapingOdds };
```

### Loop de Processamento

```javascript
for (const bet of bets) {
  logger.debug('Processing bet', { betId: bet.id, match: `${bet.homeTeamName} vs ${bet.awayTeamName}` });

  // 1. Tentar scraping
  const scrapingResult = await scrapeBetOdds(
    bet.homeTeamName,
    bet.awayTeamName,
    bet.betMarket,
    bet.betPick
  );

  if (scrapingResult.success) {
    if (scrapingResult.fromCache) {
      fromCache++;
    }

    // Atualizar odds no BD
    const oldOdds = bet.odds;
    const newOdds = scrapingResult.data.odds;

    if (oldOdds !== newOdds) {
      await updateBetOdds(bet.id, newOdds);
      updatedBets.push({
        id: bet.id,
        match: `${bet.homeTeamName} vs ${bet.awayTeamName}`,
        oldOdds,
        newOdds,
        source: 'scraping'
      });
    } else {
      skipped++;
    }
    continue;
  }

  // 2. Fallback para API (Story 15.4)
  logger.warn('Scraping failed, trying API fallback', { betId: bet.id });
  // ... fallback logic será implementado na Story 15.4

  failedBets.push({
    id: bet.id,
    match: `${bet.homeTeamName} vs ${bet.awayTeamName}`,
    error: scrapingResult.error?.message || 'Unknown error'
  });
}
```

### Schedule (09:30, 14:30, 21:30)

```javascript
// Em bot/server.js (Story 15.8)
cron.schedule('30 9 * * *', () => runScrapingOdds(), { timezone: 'America/Sao_Paulo' });
cron.schedule('30 14 * * *', () => runScrapingOdds(), { timezone: 'America/Sao_Paulo' });
cron.schedule('30 21 * * *', () => runScrapingOdds(), { timezone: 'America/Sao_Paulo' });
```

### Arquivos a Criar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/jobs/scrapingOdds.js` | CRIAR | Novo job de scraping |

### Dependências

- Story 15.1 (scrapingOddsService.js) - OBRIGATÓRIA
- Story 15.2 (cache) - OBRIGATÓRIA
- Story 14.2 (jobWarn.js) - Para sendScrapingWarn
- Story 15.4 (fallback) - Para resilência

### Project Structure Notes

- Seguir padrão de jobs existentes (postBets.js, enrichOdds.js)
- Exportar runScrapingOdds para uso em server.js
- Suportar execução via CLI

### References

- [Source: bot/jobs/postBets.js] - Padrão de job existente
- [Source: bot/jobs/enrichOdds.js] - Job de enriquecimento existente
- [Source: _bmad-output/planning-artifacts/epics.md#story-15.3] - Definição original

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/jobs/scrapingOdds.js (criar)
