# Story 15.8: Atualizar Schedule em bot/server.js

Status: ready-for-dev

## Story

As a sistema,
I want ter o novo schedule de jobs configurado,
so that scraping rode antes das postagens.

## Acceptance Criteria

1. **Given** bot/server.js atualizado
   **When** cron jobs configurados
   **Then** schedule inclui jobs de scraping:
   - 09:30 → `runScrapingOdds()` + warn
   - 14:30 → `runScrapingOdds()` + warn
   - 21:30 → `runScrapingOdds()` + warn

2. **Given** schedule completo configurado
   **When** verificar horarios
   **Then** sequencia e:
   - Manha: 08:00 (request links) → 09:30 (scraping) → 10:00 (post)
   - Tarde: 13:00 (request links) → 14:30 (scraping) → 15:00 (post)
   - Noite: 20:00 (request links) → 21:30 (scraping) → 22:00 (post)

3. **Given** jobs de enrichOdds antigos
   **When** atualizar schedule
   **Then** remove/ajusta enrichOdds dos horarios 08:00, 13:00, 20:00
   **And** scraping substitui enrichment como fonte primaria

4. **Given** servidor inicia
   **When** scheduler e configurado
   **Then** log mostra todos os jobs schedulados
   **And** horarios estao em timezone America/Sao_Paulo

5. **Given** job de scraping executa
   **When** conclui (sucesso ou erro)
   **Then** warn e enviado automaticamente
   **And** log registra resultado

## Tasks / Subtasks

- [ ] Task 1: Importar novo job runScrapingOdds (AC: #1)
  - [ ] 1.1: Adicionar import do job scrapingOdds.js
  - [ ] 1.2: Verificar que export existe no modulo

- [ ] Task 2: Adicionar cron jobs para scraping (AC: #1, #4)
  - [ ] 2.1: Adicionar cron 09:30 para morning-scraping
  - [ ] 2.2: Adicionar cron 14:30 para afternoon-scraping
  - [ ] 2.3: Adicionar cron 21:30 para night-scraping
  - [ ] 2.4: Usar timezone America/Sao_Paulo

- [ ] Task 3: Ajustar jobs de prep existentes (AC: #3)
  - [ ] 3.1: Remover runEnrichment() dos horarios prep (08:00, 13:00, 20:00)
  - [ ] 3.2: Manter apenas runRequestLinks() nos horarios prep
  - [ ] 3.3: Renomear jobs de morning-prep para morning-request

- [ ] Task 4: Atualizar logs de startup (AC: #4)
  - [ ] 4.1: Atualizar console.log com novo schedule
  - [ ] 4.2: Mostrar sequencia completa (request → scraping → post)
  - [ ] 4.3: Indicar timezone

- [ ] Task 5: Adicionar tratamento de erro nos novos jobs (AC: #5)
  - [ ] 5.1: Try-catch em cada job de scraping
  - [ ] 5.2: Log de erro se falhar
  - [ ] 5.3: Nao bloquear outros jobs se scraping falhar

- [ ] Task 6: Testar schedule (AC: #1-5)
  - [ ] 6.1: Verificar que jobs sao registrados
  - [ ] 6.2: Testar execucao manual de cada job
  - [ ] 6.3: Verificar logs de startup

## Dev Notes

### Dependencias

**IMPORTANTE:** Esta story DEPENDE de:
- **Story 15.3:** Job scrapingOdds.js deve existir
- **Story 15.5:** Warn pos-scraping deve estar integrado

### Schedule Completo (Antes x Depois)

**ANTES (atual):**
```
08:00 - Enrich + Request links
10:00 - Post bets (morning)
13:00 - Enrich + Request links
15:00 - Post bets (afternoon)
20:00 - Enrich + Request links
22:00 - Post bets (night)
*/5   - Health check
```

**DEPOIS (novo):**
```
08:00 - Request links (manha)
09:30 - Scraping odds (manha)
10:00 - Post bets (morning)
13:00 - Request links (tarde)
14:30 - Scraping odds (tarde)
15:00 - Post bets (afternoon)
20:00 - Request links (noite)
21:30 - Scraping odds (noite)
22:00 - Post bets (night)
*/5   - Health check
```

### Codigo Atualizado para setupScheduler()

```javascript
/**
 * Setup internal scheduler (node-cron)
 * This runs inside the web service to avoid paid cron jobs
 */
function setupScheduler() {
  const cron = require('node-cron');
  const { runScrapingOdds } = require('./jobs/scrapingOdds');
  const { runRequestLinks } = require('./jobs/requestLinks');
  const { runPostBets } = require('./jobs/postBets');
  const { runHealthCheck } = require('./jobs/healthCheck');

  const TZ = 'America/Sao_Paulo';

  // =============== MANHA ===============

  // Morning request links - 08:00 São Paulo
  cron.schedule('0 8 * * *', async () => {
    logger.info('Running morning-request job');
    try {
      await runRequestLinks('morning');
    } catch (err) {
      logger.error('morning-request failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Morning scraping - 09:30 São Paulo (Story 15.8)
  cron.schedule('30 9 * * *', async () => {
    logger.info('Running morning-scraping job');
    try {
      await runScrapingOdds();
    } catch (err) {
      logger.error('morning-scraping failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Morning post - 10:00 São Paulo
  cron.schedule('0 10 * * *', async () => {
    logger.info('Running morning-post job');
    try {
      await runPostBets('morning');
    } catch (err) {
      logger.error('morning-post failed', { error: err.message });
    }
  }, { timezone: TZ });

  // =============== TARDE ===============

  // Afternoon request links - 13:00 São Paulo
  cron.schedule('0 13 * * *', async () => {
    logger.info('Running afternoon-request job');
    try {
      await runRequestLinks('afternoon');
    } catch (err) {
      logger.error('afternoon-request failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Afternoon scraping - 14:30 São Paulo (Story 15.8)
  cron.schedule('30 14 * * *', async () => {
    logger.info('Running afternoon-scraping job');
    try {
      await runScrapingOdds();
    } catch (err) {
      logger.error('afternoon-scraping failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Afternoon post - 15:00 São Paulo
  cron.schedule('0 15 * * *', async () => {
    logger.info('Running afternoon-post job');
    try {
      await runPostBets('afternoon');
    } catch (err) {
      logger.error('afternoon-post failed', { error: err.message });
    }
  }, { timezone: TZ });

  // =============== NOITE ===============

  // Night request links - 20:00 São Paulo
  cron.schedule('0 20 * * *', async () => {
    logger.info('Running night-request job');
    try {
      await runRequestLinks('night');
    } catch (err) {
      logger.error('night-request failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Night scraping - 21:30 São Paulo (Story 15.8)
  cron.schedule('30 21 * * *', async () => {
    logger.info('Running night-scraping job');
    try {
      await runScrapingOdds();
    } catch (err) {
      logger.error('night-scraping failed', { error: err.message });
    }
  }, { timezone: TZ });

  // Night post - 22:00 São Paulo
  cron.schedule('0 22 * * *', async () => {
    logger.info('Running night-post job');
    try {
      await runPostBets('night');
    } catch (err) {
      logger.error('night-post failed', { error: err.message });
    }
  }, { timezone: TZ });

  // =============== PERIODICOS ===============

  // Health check - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.debug('Running health-check job');
    try {
      await runHealthCheck();
    } catch (err) {
      logger.error('health-check failed', { error: err.message });
    }
  }, { timezone: TZ });

  logger.info('Internal scheduler started');
  console.log('⏰ Scheduler jobs (America/Sao_Paulo):');
  console.log('   ─── MANHA ───');
  console.log('   08:00 - Request links');
  console.log('   09:30 - Scraping odds (LLM)');
  console.log('   10:00 - Post bets');
  console.log('   ─── TARDE ───');
  console.log('   13:00 - Request links');
  console.log('   14:30 - Scraping odds (LLM)');
  console.log('   15:00 - Post bets');
  console.log('   ─── NOITE ───');
  console.log('   20:00 - Request links');
  console.log('   21:30 - Scraping odds (LLM)');
  console.log('   22:00 - Post bets');
  console.log('   ─── PERIODICO ───');
  console.log('   */5   - Health check');
}
```

### Import a Adicionar

```javascript
// No topo de bot/server.js, adicionar:
const { runScrapingOdds } = require('./jobs/scrapingOdds');
```

### Remocoes Necessarias

O codigo atual em `setupScheduler()` tem chamadas de `runEnrichment()` em:
- Linha 130: morning-prep (08:00)
- Linha 151: afternoon-prep (13:00)
- Linha 172: night-prep (20:00)

Essas chamadas devem ser **removidas** pois o scraping via LLM substitui o enrichment como fonte primaria de odds.

### Fluxo por Periodo

```
┌─────────────────────────────────────────────┐
│              FLUXO MANHA                    │
├─────────────────────────────────────────────┤
│  08:00  Request Links                       │
│           ↓ (1h30 para operador responder)  │
│  09:30  Scraping Odds (LLM + Fallback API)  │
│           ↓ (30min antes da postagem)       │
│  10:00  Post Bets + Warn                    │
└─────────────────────────────────────────────┘
```

### Consideracoes

- Scraping 30min antes da postagem garante odds atualizadas
- Request links 2h antes da postagem da tempo ao operador
- EnrichOdds removido pois scraping e fonte primaria
- Fallback para API em caso de falha do scraping (Story 15.4)

### Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `bot/server.js` | MODIFICAR | Atualizar setupScheduler com novos jobs |

### Impacto da Mudanca

- **Removido:** runEnrichment() dos horarios prep
- **Adicionado:** runScrapingOdds() em 09:30, 14:30, 21:30
- **Mantido:** runRequestLinks, runPostBets, runHealthCheck
- **Resultado:** Odds mais atualizadas no momento da postagem

### Project Structure Notes

- Todos os crons usam timezone America/Sao_Paulo
- Logs indicam claramente qual job esta rodando
- Erros sao logados mas nao bloqueiam outros jobs

### References

- [Source: bot/server.js:117-208] - setupScheduler atual
- [Source: bot/jobs/scrapingOdds.js] - Job a ser schedulado (Story 15.3)
- [Source: bot/jobs/enrichOdds.js] - Job removido do schedule
- [Source: _bmad-output/planning-artifacts/epics.md#story-15.8] - Definicao original

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/server.js (modificar)
