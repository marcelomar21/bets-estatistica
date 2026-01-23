---
title: 'Adicionar Taxa de Acerto por Par Mercado/Liga no /apostas'
slug: 'taxa-par-mercado-liga-apostas'
created: '2026-01-23'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Node.js', 'Supabase', 'Telegram Bot API']
files_to_modify: ['bot/services/metricsService.js', 'bot/services/betService.js', 'bot/handlers/adminGroup.js']
code_patterns: ['service-response-pattern', 'supabase-client', 'categorize-market']
test_patterns: ['manual-testing']
reviewed: true
review_findings_addressed: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10']
---

# Tech-Spec: Adicionar Taxa de Acerto por Par Mercado/Liga no /apostas

**Created:** 2026-01-23

## Overview

### Problem Statement

Os admins precisam ver a taxa de acerto histórica do par mercado/liga ao avaliar apostas no `/apostas` para tomar decisões mais informadas sobre quais apostas promover ao público.

### Solution

Calcular em tempo real (uma query por chamada do comando) as estatísticas de todos os pares mercado/liga e exibir para cada aposta no `/apostas` com indicador visual de cor.

### Scope

**In Scope:**
- Nova função `getAllPairStats()` no metricsService
- Modificar `getAvailableBets()` para incluir info da liga
- Modificar display do `/apostas` com nova linha de estatísticas
- Indicador visual: 🟢 > 70%, 🟡 50-70%, 🔴 < 50%, ⚪ sem histórico

**Out of Scope:**
- Cache persistente ou tabela no banco
- Modificação do copy público (só admin)
- Alteração de outros comandos

## Context for Development

### Codebase Patterns

- Usar `{ success, data }` ou `{ success, error }` como retorno de services
- Usar `const { supabase } = require('../lib/supabase')` para acesso ao banco
- Categorização de mercados segue lógica do `scripts/showTopBottomPairs.js`
- **JSDoc obrigatório** em todas as funções novas (padrão do projeto)
- **Imports no topo** do arquivo, nunca dentro de funções

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `scripts/showTopBottomPairs.js:7-14` | Função `categorize()` - referência para metricsService |
| `bot/services/metricsService.js:22-63` | Padrão de query e retorno a seguir |
| `bot/services/betService.js:343-366` | Query atual de `getAvailableBets()` |
| `bot/handlers/adminGroup.js:238-256` | Função `formatBetForList()` a modificar |
| `bot/handlers/adminGroup.js:263` | Chamada de `formatBetListWithDays()` que usa `formatBetForList` |

### Technical Decisions

- Cálculo em tempo real (sem cache) - comando chamado ~3x/dia
- Mínimo 3 apostas para exibir taxa (igual script existente)
- Categorização: Gols, Escanteios, Cartões, BTTS, Outros
- Liga formatada como: `{country} - {league_name}` (ex: "France - France Ligue 1")
- Textos em português (projeto brasileiro)

## Implementation Plan

### Tasks

- [x] **Task 1: Adicionar função `categorizeMarket()` no metricsService**
  - File: `bot/services/metricsService.js`
  - Action: Criar função com JSDoc
  - Code:
    ```javascript
    /**
     * Categoriza mercado de aposta em categoria agregada
     * Categorias: Gols, Escanteios, Cartões, BTTS, Outros
     *
     * @param {string} market - Nome do mercado (ex: "Ambas Marcam", "Over 2.5 Gols")
     * @returns {string} - Categoria do mercado
     */
    function categorizeMarket(market) {
      const m = (market || '').toLowerCase();
      if (m.includes('escanteio') || m.includes('corner')) return 'Escanteios';
      if (m.includes('cartõ') || m.includes('cartao') || m.includes('card')) return 'Cartões';
      if (m.includes('ambas') || m.includes('btts') || m.includes('marcam') || m.includes('marcar')) return 'BTTS';
      if (m.includes('gol') || m.includes('goal')) return 'Gols';
      return 'Outros';
    }
    ```
  - Notes: Exportar no `module.exports`

- [x] **Task 2: Adicionar função `getAllPairStats()` no metricsService**
  - File: `bot/services/metricsService.js`
  - Action: Criar função com JSDoc que retorna objeto com taxa por par liga/categoria
  - Code:
    ```javascript
    /**
     * Busca estatísticas de acerto para todos os pares liga/categoria
     * Usado pelo /apostas para exibir taxa histórica
     *
     * @returns {Promise<{success: boolean, data?: Object.<string, {rate: number, wins: number, total: number}>, error?: object}>}
     */
    async function getAllPairStats() {
      try {
        const { data, error } = await supabase
          .from('suggested_bets')
          .select(`
            bet_market,
            bet_result,
            league_matches!inner (
              league_seasons!inner (league_name, country)
            )
          `)
          .in('bet_result', ['success', 'failure']);

        if (error) {
          logger.error('Failed to fetch pair stats', { error: error.message });
          return { success: false, error: { code: 'DB_ERROR', message: error.message } };
        }

        const pairs = {};
        for (const bet of data || []) {
          const leagueInfo = bet.league_matches?.league_seasons;
          if (!leagueInfo || !leagueInfo.country || !leagueInfo.league_name) continue;

          const league = `${leagueInfo.country} - ${leagueInfo.league_name}`;
          const category = categorizeMarket(bet.bet_market);
          const key = `${league}|${category}`;

          if (!pairs[key]) pairs[key] = { wins: 0, total: 0 };
          pairs[key].total++;
          if (bet.bet_result === 'success') pairs[key].wins++;
        }

        // Calcular rate e filtrar mínimo 3 apostas
        const stats = {};
        for (const [key, v] of Object.entries(pairs)) {
          if (v.total >= 3) {
            stats[key] = {
              rate: (v.wins / v.total) * 100,
              wins: v.wins,
              total: v.total
            };
          }
        }

        logger.debug('Pair stats calculated', { pairsCount: Object.keys(stats).length });
        return { success: true, data: stats };
      } catch (err) {
        logger.error('Error calculating pair stats', { error: err.message });
        return { success: false, error: { code: 'CALC_ERROR', message: err.message } };
      }
    }
    ```
  - Notes: Exportar `getAllPairStats` e `categorizeMarket` no `module.exports`

- [x] **Task 3: Modificar `getAvailableBets()` para incluir league info**
  - File: `bot/services/betService.js`
  - Action: Expandir nested join para incluir `league_seasons`
  - Change (linha 357-361):
    ```javascript
    // DE:
    league_matches!inner (
      home_team_name,
      away_team_name,
      kickoff_time
    )

    // PARA:
    league_matches!inner (
      home_team_name,
      away_team_name,
      kickoff_time,
      league_seasons!inner (league_name, country)
    )
    ```
  - Action: Adicionar campos no map (após linha 387, antes de `hasLink`):
    ```javascript
    leagueName: bet.league_matches.league_seasons?.league_name || null,
    country: bet.league_matches.league_seasons?.country || null,
    ```

- [x] **Task 4: Adicionar import e função helper no adminGroup (TOPO DO ARQUIVO)**
  - File: `bot/handlers/adminGroup.js`
  - Action: Adicionar import no topo do arquivo (junto com outros imports, ~linha 5-15)
  - Code:
    ```javascript
    const { getAllPairStats, categorizeMarket } = require('../services/metricsService');
    ```
  - Action: Adicionar função helper após os imports (antes das funções de handler)
  - Code:
    ```javascript
    /**
     * Retorna emoji indicador baseado na taxa de acerto
     * @param {number|null} rate - Taxa de acerto (0-100) ou null se sem dados
     * @returns {string} - Emoji indicador
     */
    function getRateIndicator(rate) {
      if (rate == null) return '⚪';
      if (rate > 70) return '🟢';
      if (rate >= 50) return '🟡';
      return '🔴';
    }
    ```

- [x] **Task 5: Modificar `handleApostasCommand()` para buscar pair stats**
  - File: `bot/handlers/adminGroup.js`
  - Action: Adicionar chamada de `getAllPairStats()` após `getAvailableBets()` (após linha 188)
  - Code:
    ```javascript
    // Após: const result = await getAvailableBets();
    // Adicionar:
    const pairStatsResult = await getAllPairStats();
    if (!pairStatsResult.success) {
      logger.warn('Failed to fetch pair stats, continuing without', { error: pairStatsResult.error?.message });
    }
    const pairStats = pairStatsResult.success ? pairStatsResult.data : {};
    ```

- [x] **Task 6: Modificar `formatBetForList()` para exibir taxa do par**
  - File: `bot/handlers/adminGroup.js`
  - Action: Modificar assinatura da função para receber `pairStats`
  - Action: Adicionar lógica de exibição da taxa
  - Change COMPLETO (substituir função inteira, ~linha 238-257):
    ```javascript
    // Story 14.5: Format single bet for day grouping
    // Story XX: Add pair stats display
    const formatBetForList = (bet, pairStats) => {
      const kickoff = new Date(bet.kickoffTime);
      const timeStr = kickoff.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });

      const oddsDisplay = bet.odds ? `💰 ${bet.odds.toFixed(2)}` : '⚠️ *SEM ODD*';
      const linkDisplay = bet.hasLink ? '🔗' : '❌';
      const statusLabel = getStatusLabel(bet.betStatus);

      // Taxa do par mercado/liga
      const league = bet.country && bet.leagueName
        ? `${bet.country} - ${bet.leagueName}`
        : null;
      const category = categorizeMarket(bet.betMarket);
      const pairKey = league ? `${league}|${category}` : null;
      const stats = pairKey ? pairStats[pairKey] : null;

      const indicator = getRateIndicator(stats?.rate ?? null);
      const rateDisplay = stats
        ? `${league} | ${category}: ${stats.rate.toFixed(1)}% (${stats.wins}/${stats.total})`
        : `${league || 'Liga desconhecida'} | ${category}: -- (< 3)`;

      return [
        `🆔 *#${bet.id}* │ ${statusLabel}`,
        `⚽ ${bet.homeTeamName} x ${bet.awayTeamName}`,
        `🕐 ${timeStr} │ 🎯 ${bet.betMarket}`,
        `${oddsDisplay} │ ${linkDisplay}`,
        `${indicator} *% par mercado/liga*`,
        rateDisplay,
        '', // Empty line between bets
      ].join('\n');
    };
    ```

- [x] **Task 7: Atualizar chamada de `formatBetForList` em `formatBetListWithDays`**
  - File: `bot/handlers/adminGroup.js`
  - Action: Localizar função `formatBetListWithDays` (~linha 263) e atualizar chamada
  - Change: A função `formatBetListWithDays` recebe `formatBetForList` como parâmetro. Precisamos passar `pairStats` via closure.
  - Code (modificar chamada na linha ~263):
    ```javascript
    // DE:
    const groupedContent = formatBetListWithDays(displayBets, formatBetForList);

    // PARA:
    const groupedContent = formatBetListWithDays(displayBets, (bet) => formatBetForList(bet, pairStats));
    ```

### Acceptance Criteria

- [ ] **AC 1:** Given um admin no grupo, when executa `/apostas`, then cada aposta exibe a taxa do par mercado/liga com indicador de cor
- [ ] **AC 2:** Given uma aposta com par que tem > 70% de acerto, when exibida no `/apostas`, then mostra 🟢 no subtítulo
- [ ] **AC 3:** Given uma aposta com par que tem 50-70% de acerto, when exibida no `/apostas`, then mostra 🟡 no subtítulo
- [ ] **AC 4:** Given uma aposta com par que tem < 50% de acerto, when exibida no `/apostas`, then mostra 🔴 no subtítulo
- [ ] **AC 5:** Given uma aposta com par que tem < 3 apostas históricas, when exibida no `/apostas`, then mostra ⚪ e "-- (< 3)"
- [ ] **AC 6:** Given `/apostas` executado, when há apostas disponíveis, then são feitas 2 queries paralelas (bets + stats) e não 1 query por aposta
- [ ] **AC 7:** Given `getAllPairStats()` falha, when `/apostas` é executado, then comando continua funcionando (exibe apostas sem taxa) e loga warning

## Additional Context

### Dependencies

- Nenhuma nova dependência necessária
- Requer que `league_matches` tenha relação com `league_seasons` (já existe)

### Testing Strategy

- Teste manual via comando `/apostas` no grupo admin
- Verificar visualmente:
  - Taxas exibidas corretamente
  - Cores correspondem aos ranges (🟢 > 70%, 🟡 50-70%, 🔴 < 50%)
  - Pares sem histórico mostram "⚪" e "-- (< 3)"
  - Liga desconhecida mostra "Liga desconhecida | Categoria"
- Verificar logs:
  - Warning se `getAllPairStats()` falhar
  - Debug com quantidade de pares calculados

### Notes

- Formato do display confirmado com usuário:
```
🆔 *#123* │ ✅ PRONTA
⚽ Lyon x PSG
🕐 15:30 │ 🎯 Ambas Marcam
💰 1.85 │ 🔗
🟢 *% par mercado/liga*
France - France Ligue 1 | BTTS: 100% (3/3)
```

- A função `categorizeMarket()` é exportada para uso no adminGroup
- Ordem das tasks respeita dependências: metricsService (1,2) → betService (3) → adminGroup (4,5,6,7)
- Script `showTopBottomPairs.js` mantém sua própria função `categorize()` (não vale refatorar agora, out of scope)

### Adversarial Review - Findings Addressed

| ID | Status | Resolution |
|----|--------|------------|
| F1 | ✅ | Import movido para Task 4, explicitamente no topo do arquivo |
| F2 | ✅ | Task 6 agora mostra código completo da função |
| F3 | ✅ | Task 7 adicionada para atualizar `formatBetListWithDays` |
| F4 | ✅ | Task 5 agora loga warning se falhar e continua |
| F5 | ✅ | `getRateIndicator` usa `rate == null` (cobre null e undefined) |
| F6 | ✅ | Documentado em Notes que script mantém função própria (out of scope) |
| F7 | ✅ | AC 6 corrigido para mencionar 2 queries |
| F8 | ✅ | Task 2 e Task 3 tratam null/undefined explicitamente |
| F9 | ✅ | Documentado em Technical Decisions que textos são em português |
| F10 | ✅ | Todas as funções novas têm JSDoc |

### Implementation Review Notes

- Adversarial code review completed
- Findings: 7 total, 3 fixed, 4 skipped (low impact/out of scope)
- Resolution approach: selective fix

**Fixed:**
- F2: Adicionados 12 testes unitários para `categorizeMarket()` e `getAllPairStats()`
- F3: Corrigido bug de padrões sobrepostos - removido "marcam/marcar" isolado do trigger BTTS
- F7: Adicionado null check em `stats.rate` antes de `toFixed()`

**Skipped (acknowledged):**
- F1 (Performance): Query sem limite - comando usado ~3x/dia, dados limitados
- F4 (Silent failure): Graceful degradation está funcionando conforme esperado
- F5 (Markdown injection): Ligas vêm de fonte controlada (FootyStats)
- F6 (Inner join): Comportamento esperado para garantir dados completos
