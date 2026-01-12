# Story 11.4: Validar Cálculo de Métricas

Status: done

## Story

As a operador,
I want ter certeza que métricas estão corretas,
So that possa confiar nos dados.

## Acceptance Criteria

1. **Given** histórico de apostas no banco
   **When** calcular métricas via `getSuccessRate()`
   **Then** taxa de acerto é calculada corretamente

2. **Given** apostas com diferentes status
   **When** contar por status
   **Then** contagem está correta para cada status

3. **Given** cálculo automático
   **When** comparar com cálculo manual
   **Then** valores batem exatamente

4. **Given** edge cases (0 apostas, só success, só failure)
   **When** calcular métricas
   **Then** não há erros e valores são corretos

## Tasks / Subtasks

- [x] **Task 1: Criar script de validação de métricas** (AC: #1, #2, #3)
  - [x] 1.1 Criar `scripts/validate-metrics.js`
  - [x] 1.2 Buscar todas as apostas do banco
  - [x] 1.3 Calcular manualmente: success, failure, total, taxa
  - [x] 1.4 Comparar com resultado de `getSuccessRate()`
  - [x] 1.5 Comparar com resultado de `getDetailedStats()`
  - [x] 1.6 Reportar discrepâncias se houver

- [x] **Task 2: Validar cálculo de taxa de acerto** (AC: #1)
  - [x] 2.1 Verificar fórmula: `(success / total) * 100`
  - [x] 2.2 Verificar filtro de 30 dias usa `result_updated_at` correto
  - [x] 2.3 Verificar que só conta `success` e `failure` (não `posted`, `cancelled`)

- [x] **Task 3: Validar contagem por status** (AC: #2)
  - [x] 3.1 Contar apostas por status manualmente
  - [x] 3.2 Comparar com `getDetailedStats().byMarket`
  - [x] 3.3 Verificar que `totalPosted` conta apenas apostas com `telegram_posted_at`

- [x] **Task 4: Testar edge cases** (AC: #4)
  - [x] 4.1 Testar com 0 apostas (deve retornar null/0, não erro)
  - [x] 4.2 Testar com apenas success (100%)
  - [x] 4.3 Testar com apenas failure (0%)
  - [x] 4.4 Testar com apostas sem `result_updated_at`

- [x] **Task 5: Documentar fórmulas de cálculo** (AC: #3)
  - [x] 5.1 Adicionar comentários nas funções explicando fórmulas
  - [x] 5.2 Criar seção no README ou docs sobre métricas

- [x] **Task 6: Adicionar comando /metricas no bot** (AC: #1, #2)
  - [x] 6.1 Criar handler para `/metricas` no grupo admin
  - [x] 6.2 Mostrar resumo detalhado de métricas
  - [x] 6.3 Incluir contagem por mercado (totals, btts, h2h)

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Task 5.2 não implementada - criar seção de métricas em docs/ ou README [docs/metrics.md criado]
- [x] [AI-Review][HIGH] Edge case tests fracos - adicionar assertions específicas para conteúdo esperado [scripts/validate-metrics.js]
- [x] [AI-Review][HIGH] Atualizar File List - docs/metrics.md e docs/index.md adicionados [story File List atualizado]
- [x] [AI-Review][MEDIUM] Null check missing para bets array - tratamento adicionado [scripts/validate-metrics.js:114]
- [x] [AI-Review][MEDIUM] Compare function edge case - null vs 0 tratados como equivalentes [scripts/validate-metrics.js:83]
- [x] [AI-Review][MEDIUM] Log detailsResult failure - logger.warn adicionado [bot/handlers/adminGroup.js:699]
- [x] [AI-Review][LOW] Magic number 25 - extraído para MAX_MARKET_NAME_LENGTH [bot/handlers/adminGroup.js:65]
- [x] [AI-Review][LOW] Emoji inconsistente - /metricas usa 📈, /overview usa 📊 [bot/handlers/adminGroup.js]

## Dev Notes

### Funções de Métricas Existentes

**metricsService.js:**
```javascript
// getSuccessRate() - Retorna:
{
  allTime: { success, total, rate },
  last30Days: { success, total, rate },
  rateAllTime: number,
  rate30Days: number
}

// getDetailedStats() - Retorna:
{
  totalPosted: number,
  totalCompleted: number,
  byMarket: { [market]: { success, failure } },
  averageOdds: number
}
```

### Script de Validação

**scripts/validate-metrics.js:**
```javascript
require('dotenv').config();
const { supabase } = require('../lib/supabase');
const { getSuccessRate, getDetailedStats } = require('../bot/services/metricsService');

async function validateMetrics() {
  console.log('🔍 Validando métricas...\n');

  // 1. Buscar dados brutos
  const { data: bets } = await supabase
    .from('suggested_bets')
    .select('id, bet_status, bet_market, result_updated_at, telegram_posted_at, odds_at_post');

  // 2. Cálculo manual
  const success = bets.filter(b => b.bet_status === 'success').length;
  const failure = bets.filter(b => b.bet_status === 'failure').length;
  const total = success + failure;
  const rate = total > 0 ? (success / total) * 100 : null;

  console.log('📊 Cálculo Manual:');
  console.log(`   Success: ${success}`);
  console.log(`   Failure: ${failure}`);
  console.log(`   Total: ${total}`);
  console.log(`   Taxa: ${rate?.toFixed(2)}%\n`);

  // 3. Comparar com getSuccessRate()
  const { data: systemStats } = await getSuccessRate();

  console.log('🤖 Sistema (getSuccessRate):');
  console.log(`   Success: ${systemStats.allTime.success}`);
  console.log(`   Total: ${systemStats.allTime.total}`);
  console.log(`   Taxa: ${systemStats.allTime.rate?.toFixed(2)}%\n`);

  // 4. Validar
  const isValid =
    systemStats.allTime.success === success &&
    systemStats.allTime.total === total;

  if (isValid) {
    console.log('✅ Métricas VÁLIDAS - Cálculos batem!');
  } else {
    console.log('❌ DISCREPÂNCIA ENCONTRADA!');
    console.log(`   Esperado: ${success}/${total}`);
    console.log(`   Sistema: ${systemStats.allTime.success}/${systemStats.allTime.total}`);
  }

  return isValid;
}

validateMetrics().then(valid => process.exit(valid ? 0 : 1));
```

### Comando /metricas

**Formato de saída:**
```
📊 MÉTRICAS DETALHADAS

📈 Taxa de Acerto:
• 30 dias: 7/10 (70.0%)
• All-time: 15/20 (75.0%)

📋 Por Mercado:
• totals: 8/12 (66.7%)
• btts: 5/6 (83.3%)
• h2h: 2/2 (100%)

💰 Odds Média: 1.82

📤 Postagens:
• Total postadas: 25
• Concluídas: 20
• Ativas: 3
```

### Edge Cases a Testar

| Cenário | Esperado |
|---------|----------|
| 0 apostas | rate = null, total = 0 |
| Só success (5/5) | rate = 100% |
| Só failure (0/5) | rate = 0% |
| Sem result_updated_at | Ignorar no cálculo de 30 dias |
| Apostas posted mas não concluídas | Não contar na taxa |

### References

- [Source: bot/services/metricsService.js] - getSuccessRate, getDetailedStats, formatStatsMessage
- [Source: _bmad-output/implementation-artifacts/11-3-criar-testes-unitarios-criticos.md] - Story anterior com testes

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Syntax check passed for all modified files
- ESLint passed with 0 errors

### Completion Notes List

- Created comprehensive validation script `scripts/validate-metrics.js` with:
  - Manual calculation of all metrics from raw database data
  - Comparison with getSuccessRate() and getDetailedStats() results
  - By-market breakdown validation
  - Edge case tests for formatStatsMessage()
- Added `npm run validate-metrics` script to package.json
- Documented formulas in metricsService.js:
  - getSuccessRate(): FORMULA rate = (success/total)*100, only counts success/failure status, uses result_updated_at for 30-day filter
  - getDetailedStats(): totalPosted uses telegram_posted_at, by-market breakdown, average odds calculation
  - formatStatsMessage(): Edge case handling for null/undefined/empty data
- Implemented `/metricas` command in adminGroup.js:
  - Shows 30-day and all-time success rates
  - By-market breakdown with success rate per market
  - Posting statistics (total posted, completed, avg odds)
  - Added to /help command list

### File List

| Arquivo | Modificação |
|---------|-------------|
| `scripts/validate-metrics.js` | Novo - script de validação completo com edge cases, null checks, assertions específicas |
| `bot/handlers/adminGroup.js` | Handler `/metricas` + METRICAS_PATTERN + MAX_MARKET_NAME_LENGTH + error logging |
| `bot/services/metricsService.js` | Documentação das fórmulas nos comentários das funções |
| `package.json` | Script `npm run validate-metrics` |
| `docs/metrics.md` | Novo - documentação completa do sistema de métricas |
| `docs/index.md` | Link para nova seção de métricas |

## Change Log

- 2026-01-12: Story DONE - approved and completed, Epic 11 finished
- 2026-01-12: All review follow-ups resolved - 8/8 issues fixed, Task 5.2 completed (docs/metrics.md), ready for final review
- 2026-01-12: Code review completed - 8 issues found (3 HIGH, 3 MEDIUM, 2 LOW), action items created
- 2026-01-12: Story implementation completed - all 6 tasks done, /metricas command added, validation script created
