# Sistema de Metricas

> Documentacao das formulas e calculos de metricas do sistema de apostas.

## Visao Geral

O sistema calcula metricas de sucesso para avaliar a performance das apostas sugeridas. As metricas sao expostas via:

- **Bot Telegram:** Comando `/metricas` no grupo admin
- **Script:** `npm run validate-metrics` para validacao
- **API interna:** `metricsService.js`

## Formulas de Calculo

### Taxa de Acerto (Success Rate)

```
rate = (success / total) * 100
```

**Regras:**
- Somente apostas com status `success` ou `failure` sao contabilizadas
- Status ignorados: `posted`, `ready`, `pending_link`, `generated`, `cancelled`
- Resultado em percentual (0-100)

### Taxa de Acerto - Ultimos 30 Dias

```
rate_30d = (success_30d / total_30d) * 100
```

**Filtro temporal:**
- Usa o campo `result_updated_at` (nao `created_at` ou `telegram_posted_at`)
- Isso garante que medimos quando o resultado foi conhecido, nao quando a aposta foi criada

### Metricas Detalhadas

| Metrica | Formula | Descricao |
|---------|---------|-----------|
| `totalPosted` | COUNT WHERE telegram_posted_at IS NOT NULL | Apostas efetivamente postadas no Telegram |
| `totalCompleted` | COUNT WHERE status IN (success, failure) | Apostas com resultado final |
| `averageOdds` | AVG(odds_at_post) WHERE status IN (success, failure) | Media das odds das apostas concluidas |
| `byMarket` | GROUP BY bet_market | Breakdown por tipo de mercado |

### Por Mercado (byMarket)

Para cada mercado (totals, btts, h2h, etc.):

```javascript
{
  market_name: {
    success: COUNT WHERE bet_market = market AND bet_status = 'success',
    failure: COUNT WHERE bet_market = market AND bet_status = 'failure'
  }
}
```

## Edge Cases

| Cenario | Comportamento |
|---------|---------------|
| 0 apostas concluidas | rate = null, total = 0 |
| Apenas success (5/5) | rate = 100% |
| Apenas failure (0/5) | rate = 0% |
| Sem `result_updated_at` | Ignorar no calculo de 30 dias |
| Apostas posted mas nao concluidas | Nao contar na taxa |

## Funcoes Disponiveis

### getSuccessRate()

Retorna estatisticas de taxa de acerto.

```javascript
const { getSuccessRate } = require('./bot/services/metricsService');

const result = await getSuccessRate();
// result.data = {
//   allTime: { success: 15, total: 20, rate: 75.0 },
//   last30Days: { success: 7, total: 10, rate: 70.0 },
//   rateAllTime: 75.0,
//   rate30Days: 70.0
// }
```

### getDetailedStats()

Retorna estatisticas detalhadas incluindo breakdown por mercado.

```javascript
const { getDetailedStats } = require('./bot/services/metricsService');

const result = await getDetailedStats();
// result.data = {
//   totalPosted: 25,
//   totalCompleted: 20,
//   byMarket: {
//     'Over 2.5': { success: 8, failure: 4 },
//     'BTTS': { success: 5, failure: 1 },
//     'H2H': { success: 2, failure: 0 }
//   },
//   averageOdds: 1.82
// }
```

### formatStatsMessage()

Formata as estatisticas para exibicao no Telegram.

```javascript
const { formatStatsMessage } = require('./bot/services/metricsService');

const message = formatStatsMessage(stats);
// Retorna string formatada em Markdown para Telegram
```

## Validacao

Execute o script de validacao para garantir que os calculos estao corretos:

```bash
npm run validate-metrics
```

O script:
1. Busca dados brutos do banco
2. Calcula metricas manualmente
3. Compara com `getSuccessRate()` e `getDetailedStats()`
4. Reporta discrepancias se houver

## Comando /metricas

No grupo admin do Telegram, use `/metricas` para ver:

```
METRICAS DETALHADAS

Taxa de Acerto:
- 30 dias: 7/10 (70.0%)
- All-time: 15/20 (75.0%)

Por Mercado:
- Over 2.5: 8/12 (66.7%)
- BTTS: 5/6 (83.3%)
- H2H: 2/2 (100%)

Postagens:
- Total postadas: 25
- Concluidas: 20
- Odds media: 1.82
```

## Arquivos Relacionados

| Arquivo | Descricao |
|---------|-----------|
| `bot/services/metricsService.js` | Servico principal de metricas |
| `bot/handlers/adminGroup.js` | Handler do comando /metricas |
| `scripts/validate-metrics.js` | Script de validacao |

---

**Atualizado em:** 2026-01-12
**Story:** 11.4 - Validar Calculo de Metricas
