/**
 * Result Evaluator Service - Avalia resultados de apostas usando LLM
 * Usa withStructuredOutput para garantir JSON valido (sem regex fragil)
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
- "mais de X cartoes" = total de cartoes (amarelos + vermelhos) > X`;

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
        btts: matchData.btts === null ? 'N/D' : (matchData.btts ? 'Sim' : 'Nao'),
        betsJson: JSON.stringify(betsForPrompt, null, 2),
      });

      // withStructuredOutput ja retorna objeto validado pelo Zod
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
