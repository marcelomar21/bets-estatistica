/**
 * Result Evaluator Service - Avalia resultados de apostas usando LLM
 * Usa withStructuredOutput para garantir JSON valido (sem regex fragil)
 */
const { ChatOpenAI } = require('@langchain/openai');
const { ChatAnthropic } = require('@langchain/anthropic');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { z } = require('zod');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');

// Schema Zod para output estruturado
const betResultSchema = z.object({
  id: z.number().describe('ID da aposta'),
  result: z.enum(['success', 'failure', 'unknown']).describe('Resultado da aposta'),
  reason: z.string().min(1).describe('Justificativa curta do resultado (obrigatorio)'),
});

const evaluationResponseSchema = z.object({
  results: z.array(betResultSchema),
});

// Prompt do sistema
const SYSTEM_PROMPT = `Voce e um avaliador de apostas esportivas. Sua tarefa e determinar se cada aposta ganhou ou perdeu baseado nos dados REAIS do jogo.

REGRAS CRITICAS:
1. Analise APENAS os dados fornecidos - nao invente informacoes
2. Se os dados forem insuficientes para avaliar (ex: "N/D"), retorne "unknown"
3. NUNCA chute - se tiver duvida, retorne "unknown"
4. Interprete o texto da aposta em portugues brasileiro
5. Seja preciso com numeros (ex: "mais de 2.5" significa 3+ gols)
6. SEMPRE forneca uma justificativa curta no campo "reason"

TIPOS DE APOSTAS COMUNS:
- "mais de X gols" / "over X" = total de gols > X
- "menos de X gols" / "under X" = total de gols < X
- "ambas marcam" / "BTTS sim" = os dois times marcaram pelo menos 1 gol
- "ambas nao marcam" = pelo menos um time nao marcou
- "pelo menos um time sem marcar" = pelo menos um time nao marcou (mesmo que BTTS nao)
- "apenas uma equipe marca" = exatamente um time marcou (nao empate 0x0)
- "mais de X escanteios" = total de escanteios > X
- "mais de X cartoes" = total de cartoes (amarelos + vermelhos) > X
- "handicap asiatico -X" = time vence por mais de X gols de diferenca
- "handicap asiatico +X" = time nao perde por mais de X gols de diferenca
- "handicap europeu -X" = resultado final com handicap aplicado (ex: -1 = precisa vencer por 2+)
- "resultado exato X-Y" = placar final exatamente X a Y
- "intervalo de gols X-Y" = total de gols entre X e Y (inclusive)
- "cartoes por equipe mais de X" = time especifico recebe mais de X cartoes
- "escanteios por equipe mais de X" = time especifico tem mais de X escanteios
- "jogador marca gol" / "anytime scorer" = jogador especifico marcou pelo menos 1 gol
- "1X2" / "resultado final" = 1 (casa vence), X (empate), 2 (fora vence)
- "dupla chance" = 1X (casa ou empate), 12 (casa ou fora), X2 (empate ou fora)

IMPORTANTE: Se o mercado da aposta NAO esta na lista acima e voce nao tem certeza absoluta de como avalia-lo, retorne "unknown". Nunca tente interpretar mercados desconhecidos.`;

const HUMAN_TEMPLATE = `DADOS DO JOGO:
- Partida: {homeTeam} {homeScore} x {awayScore} {awayTeam}
- Total de gols: {totalGoals}
- Escanteios: {homeCorners} (casa) x {awayCorners} (fora) = {totalCorners} total
- Cartoes amarelos: {homeYellow} (casa) x {awayYellow} (fora) = {totalYellow} total
- Cartoes vermelhos: {homeRed} (casa) x {awayRed} (fora) = {totalRed} total
- Total de cartoes: {totalCards}
- Ambas marcaram: {btts}

APOSTAS PARA AVALIAR:
{betsJson}

Para cada aposta, determine se ganhou (success), perdeu (failure), ou se nao e possivel avaliar (unknown).`;

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

  // Calcular totais de cartoes
  const totalYellow = (homeYellow !== null && awayYellow !== null) ? homeYellow + awayYellow : null;
  const totalRed = (homeRed !== null && awayRed !== null) ? homeRed + awayRed : null;
  const totalCards = (totalYellow !== null && totalRed !== null) ? totalYellow + totalRed : null;

  // F15 FIX: BTTS retorna null quando scores sao null (nao false)
  // Se nao temos placar, nao podemos calcular BTTS
  let btts = null;
  if (rawMatch.btts !== undefined) {
    btts = rawMatch.btts;
  } else if (homeScore !== null && awayScore !== null) {
    btts = homeScore > 0 && awayScore > 0;
  }

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
 * Deterministic evaluation for simple markets
 * Returns result directly without LLM for markets that can be computed from scores
 * @param {object} bet - { id, betMarket, betPick }
 * @param {object} matchData - extracted match data from extractMatchData()
 * @returns {{ result: string, reason: string } | null} - null if market needs LLM
 */
function evaluateDeterministic(bet, matchData) {
  const { homeScore, awayScore, totalGoals, btts } = matchData;

  if (homeScore === null || awayScore === null) return null;

  const market = (bet.betMarket || '').toLowerCase();
  const pick = (bet.betPick || '').toLowerCase();
  const combined = `${market} ${pick}`.toLowerCase();

  // Corners over/under
  const cornersOverMatch = combined.match(/(?:over|mais de|acima de)\s*(\d+(?:[.,]\d+)?)\s*(?:escanteios?|corners?)/);
  if (cornersOverMatch) {
    const threshold = parseFloat(cornersOverMatch[1].replace(',', '.'));
    const { totalCorners } = matchData;
    if (totalCorners === null || totalCorners === undefined) return null;
    const won = totalCorners > threshold;
    return {
      result: won ? 'success' : 'failure',
      reason: `Total de escanteios: ${totalCorners} ${won ? '>' : '<='} ${threshold} (deterministic)`,
    };
  }

  const cornersUnderMatch = combined.match(/(?:under|menos de|abaixo de)\s*(\d+(?:[.,]\d+)?)\s*(?:escanteios?|corners?)/);
  if (cornersUnderMatch) {
    const threshold = parseFloat(cornersUnderMatch[1].replace(',', '.'));
    const { totalCorners } = matchData;
    if (totalCorners === null || totalCorners === undefined) return null;
    const won = totalCorners < threshold;
    return {
      result: won ? 'success' : 'failure',
      reason: `Total de escanteios: ${totalCorners} ${won ? '<' : '>='} ${threshold} (deterministic)`,
    };
  }

  // Also match "X+ escanteios" or "X ou mais escanteios" patterns
  const cornersPlus = combined.match(/(\d+)\+?\s*(?:ou\s*mais\s*)?escanteios?/);
  if (cornersPlus && !cornersOverMatch && !cornersUnderMatch) {
    const threshold = parseFloat(cornersPlus[1]);
    const { totalCorners } = matchData;
    if (totalCorners === null || totalCorners === undefined) return null;
    const won = totalCorners >= threshold;
    return {
      result: won ? 'success' : 'failure',
      reason: `Total de escanteios: ${totalCorners} ${won ? '>=' : '<'} ${threshold} (deterministic)`,
    };
  }

  // Cards over/under
  const cardsOverMatch = combined.match(/(?:over|mais de|acima de)\s*(\d+(?:[.,]\d+)?)\s*(?:cart[oõ](?:es|ns)?|cards?)/);
  if (cardsOverMatch) {
    const threshold = parseFloat(cardsOverMatch[1].replace(',', '.'));
    const { totalCards } = matchData;
    if (totalCards === null || totalCards === undefined) return null;
    const won = totalCards > threshold;
    return {
      result: won ? 'success' : 'failure',
      reason: `Total de cartões: ${totalCards} ${won ? '>' : '<='} ${threshold} (deterministic)`,
    };
  }

  const cardsUnderMatch = combined.match(/(?:under|menos de|abaixo de)\s*(\d+(?:[.,]\d+)?)\s*(?:cart[oõ](?:es|ns)?|cards?)/);
  if (cardsUnderMatch) {
    const threshold = parseFloat(cardsUnderMatch[1].replace(',', '.'));
    const { totalCards } = matchData;
    if (totalCards === null || totalCards === undefined) return null;
    const won = totalCards < threshold;
    return {
      result: won ? 'success' : 'failure',
      reason: `Total de cartões: ${totalCards} ${won ? '<' : '>='} ${threshold} (deterministic)`,
    };
  }

  // Over/Under X goals (must NOT match corners/cards — check those first above)
  const overUnderMatch = combined.match(/(?:over|mais de|acima de)\s*(\d+(?:[.,]\d+)?)\s*(?:gols?|goals?)?/);
  if (overUnderMatch && !/escanteio|corner|cart[oõ]/i.test(combined)) {
    const threshold = parseFloat(overUnderMatch[1].replace(',', '.'));
    const won = totalGoals > threshold;
    return {
      result: won ? 'success' : 'failure',
      reason: `Total de gols: ${totalGoals} ${won ? '>' : '<='} ${threshold} (deterministic)`,
    };
  }

  const underMatch = combined.match(/(?:under|menos de|abaixo de)\s*(\d+(?:[.,]\d+)?)\s*(?:gols?|goals?)?/);
  if (underMatch && !/escanteio|corner|cart[oõ]/i.test(combined)) {
    const threshold = parseFloat(underMatch[1].replace(',', '.'));
    const won = totalGoals < threshold;
    return {
      result: won ? 'success' : 'failure',
      reason: `Total de gols: ${totalGoals} ${won ? '<' : '>='} ${threshold} (deterministic)`,
    };
  }

  // BTTS (Both Teams To Score)
  if (/btts|ambas?\s*(?:marcam|marcar|equipes?\s*marcam)/.test(combined)) {
    if (btts === null) return null;
    const expectYes = /sim|yes/.test(combined) || !/n[aã]o|no/.test(combined);
    const won = expectYes ? btts : !btts;
    return {
      result: won ? 'success' : 'failure',
      reason: `BTTS: ${btts ? 'Sim' : 'Nao'}, aposta: ${expectYes ? 'Sim' : 'Nao'} (deterministic)`,
    };
  }

  // 1X2 (Match Result)
  if (/resultado\s*final|1x2|match\s*result|moneyline/.test(market)) {
    let expectedResult;
    if (/casa|home|1(?!\d)/.test(pick) && !/empate|draw|x/i.test(pick)) {
      expectedResult = 'home';
    } else if (/empate|draw|x(?!\d)/i.test(pick) && !/casa|home|fora|away/.test(pick)) {
      expectedResult = 'draw';
    } else if (/fora|away|2(?!\d)/.test(pick) && !/empate|draw|x/i.test(pick)) {
      expectedResult = 'away';
    }

    if (expectedResult) {
      const actualResult = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw';
      const won = actualResult === expectedResult;
      return {
        result: won ? 'success' : 'failure',
        reason: `Placar: ${homeScore}x${awayScore}, resultado: ${actualResult}, aposta: ${expectedResult} (deterministic)`,
      };
    }
  }

  return null; // Market needs LLM evaluation
}

/**
 * Run multi-LLM consensus evaluation for complex markets
 * Uses 3 distinct providers: OpenAI, Anthropic, Moonshot
 * @param {object} matchInfo - Match data for the prompt
 * @param {Array} bets - Bets needing LLM evaluation
 * @param {object} matchData - Extracted match data
 * @returns {Promise<{results: Array, confidence: string}>}
 */
async function evaluateWithConsensus(matchInfo, bets, matchData) {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', SYSTEM_PROMPT],
    ['human', HUMAN_TEMPLATE],
  ]);

  const promptInput = {
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
    btts: matchData.btts === null ? 'N/D' : (matchData.btts ? 'Sim' : 'Nao'),
    betsJson: JSON.stringify(bets.map(b => ({ id: b.id, aposta: `${b.betMarket} - ${b.betPick}` })), null, 2),
  };

  // Create 3 LLM chains with distinct providers
  const providers = [];

  // Provider A: OpenAI (GPT-5.1-mini)
  if (config.apis.openaiApiKey) {
    try {
      const modelA = process.env.EVALUATOR_MODEL_OPENAI || 'gpt-5.1-mini';
      const llmA = new ChatOpenAI({ apiKey: config.apis.openaiApiKey, model: modelA, temperature: 0 });
      providers.push({ name: 'openai', chain: prompt.pipe(llmA.withStructuredOutput(evaluationResponseSchema)) });
    } catch (err) {
      logger.warn('Failed to create OpenAI evaluator chain', { error: err.message });
    }
  }

  // Provider B: Anthropic (Claude Sonnet 4.6)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const modelB = process.env.EVALUATOR_MODEL_ANTHROPIC || 'claude-sonnet-4-6-20250514';
      const llmB = new ChatAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, model: modelB, temperature: 0 });
      providers.push({ name: 'anthropic', chain: prompt.pipe(llmB.withStructuredOutput(evaluationResponseSchema)) });
    } catch (err) {
      logger.warn('Failed to create Anthropic evaluator chain', { error: err.message });
    }
  }

  // Provider C: Moonshot (Kimi 2.5) via OpenAI-compatible API
  if (process.env.MOONSHOT_API_KEY) {
    try {
      const modelC = process.env.EVALUATOR_MODEL_MOONSHOT || 'kimi-2.5';
      const llmC = new ChatOpenAI({
        apiKey: process.env.MOONSHOT_API_KEY,
        model: modelC,
        temperature: 0,
        configuration: { baseURL: 'https://api.moonshot.cn/v1' },
      });
      providers.push({ name: 'moonshot', chain: prompt.pipe(llmC.withStructuredOutput(evaluationResponseSchema)) });
    } catch (err) {
      logger.warn('Failed to create Moonshot evaluator chain', { error: err.message });
    }
  }

  if (providers.length === 0) {
    logger.error('No LLM providers available for consensus evaluation');
    return { results: bets.map(b => ({ id: b.id, result: 'unknown', reason: 'No LLM providers configured' })), confidence: 'low' };
  }

  // Execute all providers in parallel
  const providerResults = await Promise.allSettled(
    providers.map(p => p.chain.invoke(promptInput))
  );

  // Collect successful results
  const successfulResults = [];
  for (let i = 0; i < providerResults.length; i++) {
    const pr = providerResults[i];
    if (pr.status === 'fulfilled') {
      successfulResults.push({ name: providers[i].name, results: pr.value.results });
      logger.info('LLM provider succeeded', { provider: providers[i].name, results: pr.value.results.map(r => r.result) });
    } else {
      logger.warn('LLM provider failed', { provider: providers[i].name, error: pr.reason?.message || String(pr.reason) });
    }
  }

  // Apply consensus logic per bet
  const consensusResults = [];
  for (const bet of bets) {
    const votes = [];
    for (const sr of successfulResults) {
      const betResult = sr.results.find(r => r.id === bet.id);
      if (betResult) {
        votes.push({ provider: sr.name, result: betResult.result, reason: betResult.reason });
      }
    }

    if (votes.length === 0) {
      consensusResults.push({
        id: bet.id,
        result: 'unknown',
        reason: 'All LLM providers failed',
        confidence: 'low',
        votes: [],
      });
      continue;
    }

    // Count results
    const resultCounts = {};
    for (const v of votes) {
      resultCounts[v.result] = (resultCounts[v.result] || 0) + 1;
    }

    // Find majority result
    let majorityResult = 'unknown';
    let majorityCount = 0;
    for (const [result, count] of Object.entries(resultCounts)) {
      if (count > majorityCount) {
        majorityResult = result;
        majorityCount = count;
      }
    }

    // Determine confidence
    let confidence;
    const totalVotes = votes.length;
    const totalProviders = providers.length;

    if (totalVotes >= 3 && majorityCount === totalVotes) {
      confidence = 'high'; // All agree
    } else if (majorityCount >= 2) {
      confidence = totalProviders === totalVotes ? 'medium' : 'medium'; // Majority agrees
    } else if (totalVotes === 1) {
      confidence = 'low'; // Only one provider responded
    } else {
      confidence = 'low'; // No majority
      majorityResult = 'unknown';
    }

    // Use the reason from the majority provider
    const majorityVote = votes.find(v => v.result === majorityResult);
    const reason = majorityVote ? majorityVote.reason : 'Consensus unclear';

    consensusResults.push({
      id: bet.id,
      result: majorityResult,
      reason: `[consensus:${confidence}] ${reason}`,
      confidence,
      votes,
    });
  }

  const overallConfidence = consensusResults.every(r => r.confidence === 'high') ? 'high'
    : consensusResults.some(r => r.confidence === 'low') ? 'low'
    : 'medium';

  logger.info('Multi-LLM consensus complete', {
    matchId: matchInfo.matchId,
    providersTotal: providers.length,
    providersSucceeded: successfulResults.length,
    overallConfidence,
    results: consensusResults.map(r => ({ id: r.id, result: r.result, confidence: r.confidence })),
  });

  return { results: consensusResults, confidence: overallConfidence };
}

/**
 * Avalia multiplas apostas de um mesmo jogo usando LLM
 * @param {object} matchInfo - Informacoes do jogo
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

  // F9 FIX: Validar OpenAI API key antes de usar
  if (!config.apis.openaiApiKey) {
    logger.error('OpenAI API key not configured');
    return {
      success: false,
      error: { code: 'CONFIG_ERROR', message: 'OpenAI API key not configured' },
    };
  }

  const matchData = extractMatchData(matchInfo.rawMatch);

  // Validar se temos dados minimos
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
        reason: 'Dados do jogo incompletos - placar nao disponivel',
      })),
    };
  }

  // Deterministic first-pass: evaluate simple markets without LLM
  const deterministicResults = [];
  const betsNeedingLLM = [];

  for (const bet of bets) {
    const deterResult = evaluateDeterministic(bet, matchData);
    if (deterResult) {
      deterministicResults.push({
        id: bet.id,
        result: deterResult.result,
        reason: deterResult.reason,
      });
      logger.info('Bet evaluated deterministically', {
        betId: bet.id,
        market: bet.betMarket,
        result: deterResult.result,
      });
    } else {
      betsNeedingLLM.push(bet);
    }
  }

  // If all bets were evaluated deterministically, skip LLM entirely
  if (betsNeedingLLM.length === 0) {
    logger.info('All bets evaluated deterministically, skipping LLM', {
      matchId: matchInfo.matchId,
      count: deterministicResults.length,
    });
    return { success: true, data: deterministicResults };
  }

  logger.info('Deterministic evaluation partial', {
    matchId: matchInfo.matchId,
    deterministic: deterministicResults.length,
    needLLM: betsNeedingLLM.length,
  });

  // Use multi-LLM consensus if multiple providers are configured
  const hasMultipleProviders = config.apis.openaiApiKey &&
    (process.env.ANTHROPIC_API_KEY || process.env.MOONSHOT_API_KEY);

  if (hasMultipleProviders) {
    try {
      const consensusResult = await evaluateWithConsensus(matchInfo, betsNeedingLLM, matchData);
      return { success: true, data: [...deterministicResults, ...consensusResult.results] };
    } catch (err) {
      logger.error('Consensus evaluation failed, falling back to single LLM', { error: err.message });
      // Fall through to single-LLM below
    }
  }

  // Single-LLM fallback (original behavior)
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const llm = new ChatOpenAI({
        apiKey: config.apis.openaiApiKey,
        model: config.llm.resultEvaluatorModel,
        temperature: 0,
      });

      // Usar withStructuredOutput para garantir JSON valido
      const structuredLlm = llm.withStructuredOutput(evaluationResponseSchema);

      const prompt = ChatPromptTemplate.fromMessages([
        ['system', SYSTEM_PROMPT],
        ['human', HUMAN_TEMPLATE],
      ]);

      const betsForPrompt = betsNeedingLLM.map(bet => ({
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
        btts: matchData.btts === null ? 'N/D' : (matchData.btts ? 'Sim' : 'Nao'),
        betsJson: JSON.stringify(betsForPrompt, null, 2),
      });

      // withStructuredOutput ja retorna objeto validado pelo Zod
      logger.info('Bets evaluated with LLM', {
        matchId: matchInfo.matchId,
        betsCount: betsNeedingLLM.length,
        results: response.results.map(r => r.result),
        attempt,
      });

      return { success: true, data: [...deterministicResults, ...response.results] };

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
  evaluateDeterministic,
  evaluateWithConsensus,
};
