---
title: 'Avaliar Resultados de Bets com LLM'
slug: 'avaliar-resultados-llm'
created: '2026-01-22'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Node.js 20+'
  - 'JavaScript ES2022 (CommonJS)'
  - '@langchain/openai'
  - '@langchain/core'
  - 'zod 4.x'
  - 'gpt-4o-mini'
  - '@supabase/supabase-js'
files_to_modify:
  - 'bot/jobs/trackResults.js'
  - 'bot/services/betService.js'
  - 'bot/services/resultEvaluator.js (NOVO)'
  - 'sql/migrations/016_add_result_reason_and_unknown.sql (NOVO)'
  - 'lib/config.js'
code_patterns:
  - 'LangChain ChatOpenAI (igual runAnalysis.js)'
  - 'Zod schema para structured output'
  - 'Service Response Pattern { success, data/error }'
  - 'Supabase via lib/supabase.js singleton'
  - 'Logger via lib/logger.js'
test_patterns:
  - 'Jest com mocks de supabase/config/logger'
  - '__tests__/services/*.test.js'
---

# Tech-Spec: Avaliar Resultados de Bets com LLM

**Created:** 2026-01-22

## Overview

### Problem Statement

O job `trackResults.js` não consegue avaliar apostas com frases descritivas complexas em português. A função `evaluateBetResult()` usa regex que só funciona para casos simples como "Mais de X gols" ou "BTTS", mas falha para apostas como:

- "Busque cenário de pelo menos um time sem marcar"
- "Explore o cenário de apenas uma equipe marcar"
- "Segure cenário em que ambas as equipes não marcam"

Além disso, não consegue avaliar apostas de escanteios e cartões, mesmo tendo esses dados disponíveis no `raw_match`.

**Resultado:** Bets ficam com `bet_result: pending` mesmo após os jogos terminarem.

### Solution

Substituir a função `evaluateBetResult()` por uma chamada à LLM (`gpt-4o-mini`) que:

1. Recebe dados completos do jogo (placar, escanteios, cartões) do campo `raw_match`
2. Recebe todas as apostas daquele jogo em batch (1 chamada = N apostas)
3. Retorna resultado estruturado via Zod schema com 3 estados possíveis
4. **Nunca chuta** - se não tiver certeza, retorna `unknown`

### Scope

**In Scope:**
- Modificar avaliação de resultados em `trackResults.js`
- Criar função para extrair dados relevantes do `raw_match`
- Implementar chamada LLM com LangChain (padrão do projeto)
- Usar Zod schema para structured output
- Criar coluna `result_reason` na tabela `suggested_bets`
- Atualizar `betService.js` para salvar o `result_reason`
- Suportar 3 estados: `success`, `failure`, `unknown`

**Out of Scope:**
- Estrutura de cron (já existe e funciona)
- Fonte de dados dos jogos (já funciona - dados estão no Supabase)
- Alterar outras partes do job `trackResults.js`

## Context for Development

### Codebase Patterns

**LangChain Pattern (com withStructuredOutput):**
```javascript
const { ChatOpenAI } = require('@langchain/openai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { z } = require('zod');
const { config } = require('../../lib/config');

const llm = new ChatOpenAI({
  apiKey: config.apis.openaiApiKey,
  model: config.llm.resultEvaluatorModel,
  temperature: 0,
});

// withStructuredOutput garante JSON válido e validado pelo Zod
const structuredLlm = llm.withStructuredOutput(myZodSchema);
const chain = prompt.pipe(structuredLlm);
const response = await chain.invoke({ ...params }); // já retorna objeto validado
```

**Service Response Pattern (de `betService.js`):**
```javascript
// Sucesso
return { success: true, data: { ... } };

// Erro
return { success: false, error: { code: 'ERROR_CODE', message: '...' } };
```

**Dados disponíveis no `raw_match`:**
| Campo | Descrição |
|-------|-----------|
| `homeGoalCount`, `awayGoalCount` | Gols por time |
| `totalGoalCount` | Total de gols |
| `team_a_corners`, `team_b_corners` | Escanteios por time |
| `totalCornerCount` | Total de escanteios |
| `team_a_yellow_cards`, `team_b_yellow_cards` | Cartões amarelos |
| `team_a_red_cards`, `team_b_red_cards` | Cartões vermelhos |
| `btts` | Boolean se ambos marcaram |

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `bot/jobs/trackResults.js` | Job atual que será modificado |
| `bot/services/betService.js` | Service de bets (adicionar `result_reason`) |
| `bot/services/matchService.js` | Service de matches (referência) |
| `agent/analysis/runAnalysis.js` | Padrão LangChain do projeto |
| `sql/league_schema.sql` | Schema da tabela `league_matches` |

### Technical Decisions

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| Modelo LLM | `gpt-4o-mini` | Barato, rápido, suficiente para tarefa estruturada |
| Abordagem | Batch por jogo | 1 chamada = N apostas, muito mais econômico |
| Output | Zod schema | Garante formato estruturado |
| Estados | 3 (success/failure/unknown) | LLM não pode chutar |
| Storage reason | Nova coluna `result_reason` | Obrigatório para TODOS os estados (auditoria) |
| Configuração | `lib/config.js` seção `llm` | Centralizado, sem segredo |

## Implementation Plan

### Tasks

#### Task 1: Adicionar configuração no `lib/config.js` (PRIMEIRO!)

**Arquivo:** `lib/config.js`

**Adicionar seção `llm` ANTES das outras tasks para evitar erros de runtime:**

```javascript
// LLM configurations (não são segredos, são constantes)
llm: {
  resultEvaluatorModel: 'gpt-4o-mini',
},
```

---

#### Task 2: Migration - Criar coluna `result_reason` e estado `unknown`

**Arquivo:** `sql/migrations/016_add_result_reason_and_unknown.sql`

```sql
-- ================================================
-- Migration: 016_add_result_reason_and_unknown.sql
-- Adiciona coluna result_reason e estado 'unknown' para avaliação LLM
-- Data: 2026-01-22
-- ================================================

-- 1. Adicionar coluna result_reason
ALTER TABLE suggested_bets
  ADD COLUMN IF NOT EXISTS result_reason TEXT;

COMMENT ON COLUMN suggested_bets.result_reason IS 'Justificativa da LLM para o resultado da aposta';

-- 2. Remover constraint antiga de bet_result
ALTER TABLE suggested_bets
  DROP CONSTRAINT IF EXISTS suggested_bets_result_check;

-- 3. Adicionar nova constraint COM 'unknown'
ALTER TABLE suggested_bets
  ADD CONSTRAINT suggested_bets_result_check
  CHECK (bet_result IN ('pending', 'success', 'failure', 'cancelled', 'unknown'));

-- 4. Criar índice para result_reason (para queries de auditoria)
CREATE INDEX IF NOT EXISTS idx_suggested_bets_result_reason
  ON suggested_bets (result_reason) WHERE result_reason IS NOT NULL;
```

**Ação:** Rodar migration no Supabase Dashboard

---

#### Task 3: Atualizar `betService.js` - Suportar `result_reason`

**Arquivo:** `bot/services/betService.js`

**Modificar função `markBetResult` COM BACKWARD COMPATIBILITY:**

A assinatura atual é `markBetResult(betId, won)` onde `won` é boolean.
Nova assinatura: `markBetResult(betId, resultOrWon, reason = null)`

```javascript
/**
 * Mark bet result (success, failure, or unknown)
 * BACKWARD COMPATIBLE: aceita boolean (won) ou string (result)
 *
 * @param {number} betId - Bet ID
 * @param {boolean|string} resultOrWon - boolean (true=success, false=failure) ou string ('success'|'failure'|'unknown')
 * @param {string} reason - Justificativa da LLM (opcional)
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function markBetResult(betId, resultOrWon, reason = null) {
  try {
    // Backward compatibility: converter boolean para string
    let result;
    if (typeof resultOrWon === 'boolean') {
      result = resultOrWon ? 'success' : 'failure';
    } else {
      result = resultOrWon;
    }

    // Validar resultado
    const validResults = ['success', 'failure', 'unknown', 'cancelled'];
    if (!validResults.includes(result)) {
      logger.error('Invalid bet result', { betId, result });
      return { success: false, error: { code: 'INVALID_RESULT', message: `Invalid result: ${result}` } };
    }

    const updateData = {
      bet_result: result,
      result_updated_at: new Date().toISOString(),
    };

    // Só atualizar reason se fornecido (não sobrescrever com null)
    if (reason !== null) {
      updateData.result_reason = reason;
    }

    const { error } = await supabase
      .from('suggested_bets')
      .update(updateData)
      .eq('id', betId);

    if (error) {
      logger.error('Failed to update bet result', { betId, result, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet result updated', { betId, result, hasReason: !!reason });
    return { success: true };
  } catch (err) {
    logger.error('Error updating bet result', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}
```

**Nota:** O caller existente `markBetResult(bet.id, won)` continua funcionando!

---

#### Task 4: Criar módulo de avaliação com LLM

**Arquivo:** `bot/services/resultEvaluator.js` (NOVO)

```javascript
/**
 * Result Evaluator Service - Avalia resultados de apostas usando LLM
 * Usa withStructuredOutput para garantir JSON válido (sem regex frágil)
 */
const { ChatOpenAI } = require('@langchain/openai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { z } = require('zod');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');

// Schema Zod para output estruturado
const betResultSchema = z.object({
  id: z.number().describe('ID da aposta'),
  result: z.enum(['success', 'failure', 'unknown']).describe('Resultado da aposta'),
  reason: z.string().min(1).describe('Justificativa curta do resultado (obrigatório)'),
});

const evaluationResponseSchema = z.object({
  results: z.array(betResultSchema),
});

// Prompt do sistema
const SYSTEM_PROMPT = `Você é um avaliador de apostas esportivas. Sua tarefa é determinar se cada aposta ganhou ou perdeu baseado nos dados REAIS do jogo.

REGRAS CRÍTICAS:
1. Analise APENAS os dados fornecidos - não invente informações
2. Se os dados forem insuficientes para avaliar (ex: "N/D"), retorne "unknown"
3. NUNCA chute - se tiver dúvida, retorne "unknown"
4. Interprete o texto da aposta em português brasileiro
5. Seja preciso com números (ex: "mais de 2.5" significa 3+ gols)
6. SEMPRE forneça uma justificativa curta no campo "reason"

TIPOS DE APOSTAS COMUNS:
- "mais de X gols" / "over X" = total de gols > X
- "menos de X gols" / "under X" = total de gols < X
- "ambas marcam" / "BTTS sim" = os dois times marcaram pelo menos 1 gol
- "ambas não marcam" = pelo menos um time não marcou
- "mais de X escanteios" = total de escanteios > X
- "mais de X cartões" = total de cartões (amarelos + vermelhos) > X`;

const HUMAN_TEMPLATE = `DADOS DO JOGO:
- Partida: {homeTeam} {homeScore} x {awayScore} {awayTeam}
- Total de gols: {totalGoals}
- Escanteios: {homeCorners} (casa) x {awayCorners} (fora) = {totalCorners} total
- Cartões amarelos: {homeYellow} (casa) x {awayYellow} (fora) = {totalYellow} total
- Cartões vermelhos: {homeRed} (casa) x {awayRed} (fora) = {totalRed} total
- Total de cartões: {totalCards}
- Ambas marcaram: {btts}

APOSTAS PARA AVALIAR:
{betsJson}

Para cada aposta, determine se ganhou (success), perdeu (failure), ou se não é possível avaliar (unknown).`;

/**
 * Extrai dados relevantes do raw_match
 * @param {object} rawMatch - Objeto raw_match da tabela league_matches
 * @returns {object} Dados estruturados do jogo
 */
function extractMatchData(rawMatch) {
  const homeScore = rawMatch.homeGoalCount ?? rawMatch.home_score ?? null;
  const awayScore = rawMatch.awayGoalCount ?? rawMatch.away_score ?? null;
  const homeYellow = rawMatch.team_a_yellow_cards ?? null;
  const awayYellow = rawMatch.team_b_yellow_cards ?? null;
  const homeRed = rawMatch.team_a_red_cards ?? null;
  const awayRed = rawMatch.team_b_red_cards ?? null;

  // Calcular totais de cartões
  const totalYellow = (homeYellow !== null && awayYellow !== null) ? homeYellow + awayYellow : null;
  const totalRed = (homeRed !== null && awayRed !== null) ? homeRed + awayRed : null;
  const totalCards = (totalYellow !== null && totalRed !== null) ? totalYellow + totalRed : null;

  // BTTS: usar valor da API se existir, senão calcular
  // Se rawMatch.btts for false mas os scores mostram que ambos marcaram, usar o cálculo
  const calculatedBtts = homeScore > 0 && awayScore > 0;
  const btts = rawMatch.btts !== undefined ? rawMatch.btts : calculatedBtts;

  return {
    homeScore,
    awayScore,
    totalGoals: rawMatch.totalGoalCount ?? (homeScore !== null && awayScore !== null ? homeScore + awayScore : null),
    homeCorners: rawMatch.team_a_corners ?? null,
    awayCorners: rawMatch.team_b_corners ?? null,
    totalCorners: rawMatch.totalCornerCount ?? null,
    homeYellow,
    awayYellow,
    totalYellow,
    homeRed,
    awayRed,
    totalRed,
    totalCards,
    btts,
  };
}

/**
 * Sleep helper para retry
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Avalia múltiplas apostas de um mesmo jogo usando LLM
 * @param {object} matchInfo - Informações do jogo
 * @param {string} matchInfo.homeTeamName - Nome do time da casa
 * @param {string} matchInfo.awayTeamName - Nome do time visitante
 * @param {object} matchInfo.rawMatch - Dados brutos do jogo
 * @param {Array} bets - Array de apostas [{id, betMarket, betPick}]
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function evaluateBetsWithLLM(matchInfo, bets) {
  if (!bets || bets.length === 0) {
    return { success: true, data: [] };
  }

  const matchData = extractMatchData(matchInfo.rawMatch);

  // Validar se temos dados mínimos
  if (matchData.homeScore === null || matchData.awayScore === null) {
    logger.warn('Match data incomplete for evaluation', {
      homeTeam: matchInfo.homeTeamName,
      awayTeam: matchInfo.awayTeamName
    });
    return {
      success: true,
      data: bets.map(bet => ({
        id: bet.id,
        result: 'unknown',
        reason: 'Dados do jogo incompletos - placar não disponível',
      })),
    };
  }

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const llm = new ChatOpenAI({
        apiKey: config.apis.openaiApiKey,
        model: config.llm.resultEvaluatorModel,
        temperature: 0,
      });

      // Usar withStructuredOutput para garantir JSON válido
      const structuredLlm = llm.withStructuredOutput(evaluationResponseSchema);

      const prompt = ChatPromptTemplate.fromMessages([
        ['system', SYSTEM_PROMPT],
        ['human', HUMAN_TEMPLATE],
      ]);

      const betsForPrompt = bets.map(bet => ({
        id: bet.id,
        aposta: `${bet.betMarket} - ${bet.betPick}`,
      }));

      const chain = prompt.pipe(structuredLlm);

      const response = await chain.invoke({
        homeTeam: matchInfo.homeTeamName,
        awayTeam: matchInfo.awayTeamName,
        homeScore: matchData.homeScore,
        awayScore: matchData.awayScore,
        totalGoals: matchData.totalGoals,
        homeCorners: matchData.homeCorners ?? 'N/D',
        awayCorners: matchData.awayCorners ?? 'N/D',
        totalCorners: matchData.totalCorners ?? 'N/D',
        homeYellow: matchData.homeYellow ?? 'N/D',
        awayYellow: matchData.awayYellow ?? 'N/D',
        totalYellow: matchData.totalYellow ?? 'N/D',
        homeRed: matchData.homeRed ?? 'N/D',
        awayRed: matchData.awayRed ?? 'N/D',
        totalRed: matchData.totalRed ?? 'N/D',
        totalCards: matchData.totalCards ?? 'N/D',
        btts: matchData.btts ? 'Sim' : 'Não',
        betsJson: JSON.stringify(betsForPrompt, null, 2),
      });

      // withStructuredOutput já retorna objeto validado pelo Zod
      logger.info('Bets evaluated with LLM', {
        matchId: matchInfo.matchId,
        betsCount: bets.length,
        results: response.results.map(r => r.result),
        attempt,
      });

      return { success: true, data: response.results };

    } catch (err) {
      logger.warn('LLM evaluation attempt failed', {
        attempt,
        maxRetries: MAX_RETRIES,
        error: err.message,
      });

      if (attempt === MAX_RETRIES) {
        logger.error('LLM evaluation failed after retries', { error: err.message });
        return {
          success: false,
          error: { code: 'LLM_ERROR', message: err.message },
        };
      }

      // Backoff exponencial: 1s, 2s, 4s
      await sleep(1000 * Math.pow(2, attempt - 1));
    }
  }
}

module.exports = {
  evaluateBetsWithLLM,
  extractMatchData,
};
```

**Melhorias aplicadas:**
- Usa `withStructuredOutput()` ao invés de regex frágil para parsing JSON
- Retry com backoff exponencial (3 tentativas)
- `totalCards` calculado e passado para LLM avaliar apostas de cartões
- BTTS corrigido: usa valor da API se existir, senão calcula
- `reason` obrigatório no schema (`.min(1)`)

---

#### Task 5: Modificar `trackResults.js` - Integrar LLM

**Arquivo:** `bot/jobs/trackResults.js`

**Principais mudanças:**

1. Adicionar import do supabase
2. Importar o novo evaluator
3. Agrupar bets por jogo (batch)
4. Buscar `raw_match` para cada jogo
5. Chamar LLM uma vez por jogo
6. Atualizar resultados com `result_reason`

```javascript
// Adicionar imports NO TOPO DO ARQUIVO
const { supabase } = require('../../lib/supabase');
const { evaluateBetsWithLLM } = require('../services/resultEvaluator');

// Nova função para buscar raw_match
async function getMatchRawData(matchId) {
  const { data, error } = await supabase
    .from('league_matches')
    .select('match_id, home_team_name, away_team_name, raw_match, status')
    .eq('match_id', matchId)
    .single();

  if (error || !data) return null;
  return data;
}

// Modificar runTrackResults para usar batch por jogo
async function runTrackResults() {
  logger.info('Starting track results job');

  const bets = await getBetsToTrack();
  logger.info('Bets to track', { count: bets.length });

  if (bets.length === 0) {
    logger.info('No bets need tracking');
    return { tracked: 0, success: 0, failure: 0, unknown: 0 };
  }

  // Agrupar bets por matchId
  const betsByMatch = new Map();
  for (const bet of bets) {
    const matchId = bet.matchId;
    if (!betsByMatch.has(matchId)) {
      betsByMatch.set(matchId, []);
    }
    betsByMatch.get(matchId).push(bet);
  }

  let tracked = 0;
  let successCount = 0;
  let failureCount = 0;
  let unknownCount = 0;

  // Processar cada jogo (1 chamada LLM por jogo)
  for (const [matchId, matchBets] of betsByMatch) {
    const matchData = await getMatchRawData(matchId);

    if (!matchData || matchData.status !== 'complete') {
      logger.debug('Match not complete', { matchId, status: matchData?.status });
      continue;
    }

    const evalResult = await evaluateBetsWithLLM(
      {
        matchId,
        homeTeamName: matchData.home_team_name,
        awayTeamName: matchData.away_team_name,
        rawMatch: matchData.raw_match,
      },
      matchBets
    );

    if (!evalResult.success) {
      logger.error('Failed to evaluate bets for match', { matchId, error: evalResult.error });
      continue;
    }

    // Atualizar cada bet com o resultado
    for (const result of evalResult.data) {
      const updateResult = await markBetResult(result.id, result.result, result.reason);

      if (updateResult.success) {
        tracked++;
        if (result.result === 'success') successCount++;
        else if (result.result === 'failure') failureCount++;
        else unknownCount++;

        // Alertar admin apenas para success/failure
        if (result.result !== 'unknown') {
          const bet = matchBets.find(b => b.id === result.id);
          await trackingResultAlert({
            homeTeamName: matchData.home_team_name,
            awayTeamName: matchData.away_team_name,
            betMarket: bet.betMarket,
            betPick: bet.betPick,
            oddsAtPost: bet.oddsAtPost,
          }, result.result === 'success');
        }

        logger.info('Bet result tracked', {
          betId: result.id,
          result: result.result,
          reason: result.reason,
        });
      }
    }
  }

  logger.info('Track results complete', {
    tracked,
    success: successCount,
    failure: failureCount,
    unknown: unknownCount
  });

  return { tracked, success: successCount, failure: failureCount, unknown: unknownCount };
}
```

### Acceptance Criteria

**AC1: Migration executada**
- Given: Banco de dados atual
- When: Rodar migration `016_add_result_reason_and_unknown.sql`
- Then: Coluna `result_reason` existe e estado `unknown` é válido no `bet_result`

**AC2: Avaliação correta de apostas simples**
- Given: Jogo Flamengo 1x0 Vasco (complete)
- And: Aposta "mais de 1,5 gols no jogo"
- When: Job roda
- Then: `bet_result = 'failure'` e `result_reason` contém justificativa

**AC3: Avaliação correta de escanteios**
- Given: Jogo com 8 escanteios totais
- And: Aposta "mais de 7,5 escanteios"
- When: Job roda
- Then: `bet_result = 'success'`

**AC4: Retorno unknown quando dados insuficientes**
- Given: Jogo sem dados de escanteios no raw_match
- And: Aposta sobre escanteios
- When: Job roda
- Then: `bet_result = 'unknown'` e `result_reason` explica

**AC5: Batch funciona corretamente**
- Given: 4 apostas para o mesmo jogo
- When: Job roda
- Then: Apenas 1 chamada LLM é feita para esse jogo

**AC6: Apostas descritivas são avaliadas**
- Given: Aposta "Busque cenário de pelo menos um time sem marcar"
- And: Jogo terminou 2x0
- When: Job roda
- Then: `bet_result = 'success'` (um time não marcou)

**AC7: Reason preenchido para todos os estados**
- Given: Qualquer aposta avaliada (success, failure ou unknown)
- When: Job roda e atualiza o resultado
- Then: `result_reason` contém justificativa (nunca é null/vazio)

## Additional Context

### Dependencies

**Existentes (já instaladas):**
- `@langchain/openai` - Client OpenAI
- `@langchain/core` - Prompts e parsers
- `zod` - Schema validation

**Nenhuma dependência nova necessária.**

### Testing Strategy

**Padrão do projeto:** Jest com mocks (ver `__tests__/services/betService.test.js`)

**Arquivo de teste:** `__tests__/services/resultEvaluator.test.js`

```javascript
// Mock supabase
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock config (IMPORTANTE: necessário para config.apis e config.llm)
jest.mock('../../lib/config', () => ({
  config: {
    apis: {
      openaiApiKey: 'test-api-key',
    },
    llm: {
      resultEvaluatorModel: 'gpt-4o-mini',
    },
  },
}));

// Mock LangChain com withStructuredOutput
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnThis(),
      invoke: jest.fn().mockResolvedValue({
        results: [{ id: 1, result: 'success', reason: 'Placar 2x1, total 3 gols > 2.5' }]
      }),
    }),
  })),
}));

// Mock ChatPromptTemplate
jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockReturnValue({
      pipe: jest.fn().mockImplementation((llm) => llm),
    }),
  },
}));
```

**Casos de teste unitário:**
1. `extractMatchData` extrai dados corretamente do raw_match
2. `evaluateBetsWithLLM` retorna unknown quando dados incompletos
3. `evaluateBetsWithLLM` parseia resposta JSON corretamente
4. `evaluateBetsWithLLM` valida schema Zod
5. `evaluateBetsWithLLM` lida com erro de API

**Teste manual:**
- Rodar `node bot/jobs/trackResults.js`
- Verificar logs e resultados no Supabase

### Notes

- O modelo `gpt-4o-mini` é suficiente para essa tarefa estruturada
- Custo estimado: ~$0.0001 por jogo (muito baixo)
- Se precisar mais assertividade, trocar para `gpt-4o` alterando `config.llm.resultEvaluatorModel`
- O campo `result_reason` é útil para auditoria e debug
- Bets com `unknown` podem ser reavaliadas manualmente se necessário

**Estado `unknown` do bet_result:**
- Estados atuais: `pending`, `success`, `failure`, `cancelled`
- Novo estado: `unknown` (LLM não conseguiu avaliar)
- Migration 016 já adiciona `unknown` à constraint do banco
- Atualizar `project-context.md` com o novo estado após implementação

**Correções aplicadas após Adversarial Review:**
- F1: Migration 016 atualiza constraint para incluir `unknown`
- F2: `markBetResult` com backward compatibility (aceita boolean ou string)
- F3: Usa `withStructuredOutput()` ao invés de regex frágil
- F4: Task 1 agora é config (executa antes do código que usa)
- F5: Import de `supabase` adicionado em trackResults
- F7: Retry com backoff exponencial (3 tentativas)
- F8: `totalCards` calculado e passado para LLM
- F10: Mock de `config` adicionado nos testes
- F11: BTTS usa valor da API se existir
- F12: Migration renumerada para 016

**Arquivos de referência investigados:**
- `bot/jobs/trackResults.js:73-112` - função `evaluateBetResult()` atual (será substituída)
- `bot/services/betService.js:521-543` - função `markBetResult()` atual
- `sql/migrations/013_separate_status_result.sql` - constraint atual do bet_result
- `agent/analysis/runAnalysis.js` - padrão LangChain do projeto
- `_bmad-output/project-context.md` - regras e convenções
- `__tests__/services/betService.test.js` - padrão de testes
