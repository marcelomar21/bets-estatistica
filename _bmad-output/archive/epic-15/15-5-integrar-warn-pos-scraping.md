# Story 15.5: Integrar Warn Pos-Scraping

Status: ready-for-dev

## Story

As a operador,
I want receber warn apos cada scraping,
so that saiba quais odds foram atualizadas.

## Acceptance Criteria

1. **Given** job de scraping conclui (09:30, 14:30, 21:30)
   **When** resultados processados
   **Then** chama `sendScrapingWarn()` com dados coletados
   **And** warn e enviado para grupo admin

2. **Given** warn sendo enviado
   **When** formatar mensagem
   **Then** inclui lista de apostas atualizadas com:
   - ID, jogo, valor anterior e novo (old -> new)
   - Fonte usada (scraping ou fallback API)

3. **Given** warn sendo enviado
   **When** algumas apostas falharam
   **Then** lista apostas que falharam
   **And** mostra motivo do erro

4. **Given** warn sendo enviado
   **When** formatando status para proxima postagem
   **Then** mostra resumo:
   - Total de apostas prontas para postagem
   - Quantas tem link
   - Quantas precisam de acao
   - Proximo horario de postagem

5. **Given** job falhar completamente
   **When** nenhuma aposta processada
   **Then** warn indica falha total
   **And** sugere acao de recuperacao

## Tasks / Subtasks

- [ ] Task 1: Coletar dados durante execucao do job scrapingOdds (AC: #1, #2)
  - [ ] 1.1: Criar array updatedBets para armazenar apostas atualizadas
  - [ ] 1.2: Armazenar objeto com id, match, oldOdds, newOdds, source
  - [ ] 1.3: Coletar estatisticas de sucesso/falha

- [ ] Task 2: Coletar dados de falhas (AC: #3)
  - [ ] 2.1: Criar array failedBets para armazenar falhas
  - [ ] 2.2: Armazenar objeto com id, match, error, attemptedSource

- [ ] Task 3: Construir objeto statusForNextPost (AC: #4)
  - [ ] 3.1: Buscar apostas elegiveis para proxima postagem
  - [ ] 3.2: Contar apostas prontas (com link e odds)
  - [ ] 3.3: Contar apostas pendentes
  - [ ] 3.4: Calcular proximo horario de postagem

- [ ] Task 4: Integrar chamada sendScrapingWarn ao final do job (AC: #1, #5)
  - [ ] 4.1: Importar sendScrapingWarn de jobWarn.js
  - [ ] 4.2: Chamar ao final de runScrapingOdds()
  - [ ] 4.3: Passar updatedBets, failedBets, statusForNextPost
  - [ ] 4.4: Tratar erros do warn (nao deve falhar job)

- [ ] Task 5: Testar integracao (AC: #1-5)
  - [ ] 5.1: Testar job com apostas atualizadas - warn mostra lista
  - [ ] 5.2: Testar job com falhas - warn mostra erros
  - [ ] 5.3: Testar job vazio - warn indica vazio
  - [ ] 5.4: Verificar formato no grupo admin

## Dev Notes

### Dependencias

**IMPORTANTE:** Esta story DEPENDE de:
- **Story 14.2:** Modulo jobWarn.js deve existir com funcao sendScrapingWarn
- **Story 15.3:** Job scrapingOdds.js deve existir

### Estrutura de Dados

```javascript
// Array de apostas atualizadas
const updatedBets = [
  {
    id: 45,
    match: 'Liverpool vs Arsenal',
    oldOdds: 1.85,
    newOdds: 1.92,
    source: 'scraping'  // 'scraping' | 'api' | 'cache'
  },
  {
    id: 52,
    match: 'Man City vs Chelsea',
    oldOdds: 1.68,
    newOdds: 1.71,
    source: 'api'  // Fallback usado
  }
];

// Array de apostas que falharam
const failedBets = [
  {
    id: 58,
    match: 'Bayern vs Dortmund',
    error: 'Jogo nao encontrado na Betano',
    attemptedSources: ['scraping', 'api']
  }
];

// Status para proxima postagem
const statusForNextPost = {
  readyCount: 3,       // Prontas para postar
  withLink: 3,         // Com deep link
  withOdds: 3,         // Com odds >= 1.60
  pendingLink: 1,      // Sem link
  pendingOdds: 0,      // Sem odds
  nextPostTime: '10:00',
  totalEligible: 4
};
```

### Codigo de Integracao no scrapingOdds.js

```javascript
const { sendScrapingWarn } = require('./jobWarn');
const { getFilaStatus } = require('../services/betService');

async function runScrapingOdds() {
  logger.info('Starting scraping odds job');

  // Arrays para coletar dados do warn
  const updatedBets = [];
  const failedBets = [];

  // ... codigo existente de scraping ...

  // Durante o processamento de cada aposta:
  for (const bet of betsToProcess) {
    try {
      const result = await processBetOdds(bet);

      if (result.success && result.updated) {
        updatedBets.push({
          id: bet.id,
          match: `${bet.homeTeamName} vs ${bet.awayTeamName}`,
          oldOdds: bet.currentOdds,
          newOdds: result.newOdds,
          source: result.source
        });
      }
    } catch (err) {
      failedBets.push({
        id: bet.id,
        match: `${bet.homeTeamName} vs ${bet.awayTeamName}`,
        error: err.message,
        attemptedSources: ['scraping', 'api']
      });
    }
  }

  // Step final: Enviar warn para grupo admin
  try {
    // Buscar status da fila para proxima postagem
    const filaResult = await getFilaStatus();

    const statusForNextPost = {
      readyCount: filaResult.data?.ativas?.length || 0,
      withLink: filaResult.data?.filaCompleta?.filter(b => b.deepLink).length || 0,
      withOdds: filaResult.data?.filaCompleta?.filter(b => b.odds >= 1.60).length || 0,
      pendingLink: filaResult.data?.filaCompleta?.filter(b => !b.deepLink).length || 0,
      pendingOdds: filaResult.data?.filaCompleta?.filter(b => !b.odds || b.odds < 1.60).length || 0,
      nextPostTime: filaResult.data?.nextPost?.time || '10:00',
      totalEligible: filaResult.data?.filaCompleta?.length || 0
    };

    await sendScrapingWarn(updatedBets, failedBets, statusForNextPost);
  } catch (warnErr) {
    // Warn failure should not fail the job
    logger.warn('Failed to send scraping warn', { error: warnErr.message });
  }

  logger.info('Scraping odds job complete', {
    updated: updatedBets.length,
    failed: failedBets.length
  });

  return {
    updated: updatedBets.length,
    failed: failedBets.length,
    updatedBets,
    failedBets
  };
}
```

### Formato do Warn (Definido em 14.2)

```
🔄 *SCRAPING CONCLUIDO* ✅

━━━━━━━━━━━━━━━━━━━━

*ODDS ATUALIZADAS:*
📈 #45 Liverpool vs Arsenal
   1.85 → 1.92 (scraping)
📈 #52 Man City vs Chelsea
   1.68 → 1.71 (api fallback)

━━━━━━━━━━━━━━━━━━━━

⚠️ *FALHAS:*
❌ #58 Bayern vs Dortmund
   Erro: Jogo nao encontrado na Betano

━━━━━━━━━━━━━━━━━━━━

📊 *STATUS PARA POSTAGEM:*
✅ 3 apostas prontas
🔗 3 com link
⚠️ 1 sem link → /link 58 URL

💡 Proxima postagem: 10:00
```

### Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `bot/jobs/scrapingOdds.js` | MODIFICAR | Adicionar coleta de dados e chamada warn |

### Imports a Adicionar

```javascript
const { sendScrapingWarn } = require('./jobWarn');
const { getFilaStatus } = require('../services/betService');
```

### Consideracoes

- Warn e "best effort" - falha nao afeta job principal
- Usa getFilaStatus() para obter status atualizado
- Source indica metodo usado: scraping, api (fallback), cache
- Formato alinhado com outros warns do sistema

### Project Structure Notes

- Segue padrao de outros jobs com warn pos-execucao
- Usa funcoes existentes de betService para status
- Log de warning para falhas de warn (nao error)

### References

- [Source: bot/jobs/scrapingOdds.js] - Job que sera modificado (Story 15.3)
- [Source: bot/jobs/jobWarn.js] - Modulo com sendScrapingWarn (Story 14.2)
- [Source: bot/services/betService.js:997-1154] - getFilaStatus
- [Source: _bmad-output/planning-artifacts/epics.md#story-15.5] - Definicao original
- [Source: _bmad-output/implementation-artifacts/14-2-criar-modulo-warns.md] - Dependencia

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/jobs/scrapingOdds.js (modificar)
