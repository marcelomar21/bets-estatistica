/**
 * Job: Track bet results after matches finish
 *
 * Stories covered:
 * - 5.1: Criar job tracking resultados
 * - 5.2: Detectar fim jogo (2h after kickoff, then every 5min)
 * - 5.3: Comparar resultado com aposta
 * - 5.4: Atualizar status automaticamente
 * - Tech-Spec: Avaliar resultados com LLM (gpt-4o-mini)
 *
 * Run: node bot/jobs/trackResults.js
 * Cron: every 5 minutes
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { supabase } = require('../../lib/supabase');
const { markBetResult } = require('../services/betService');
const { trackingResultAlert } = require('../services/alertService');
const { evaluateBetsWithLLM } = require('../services/resultEvaluator');

// How long after kickoff to start checking (2 hours)
const CHECK_DELAY_MS = 2 * 60 * 60 * 1000;

// Max time to keep checking (4 hours after kickoff)
const MAX_CHECK_DURATION_MS = 4 * 60 * 60 * 1000;

// Match status values that indicate completion
const COMPLETED_STATUSES = ['complete', 'finished', 'ft', 'aet', 'pen'];

/**
 * Get posted bets that need result tracking
 * F2 FIX: Filtra por bet_result='pending' para nao re-avaliar bets ja processados
 */
async function getBetsToTrack() {
  const now = new Date();
  const checkAfter = new Date(now.getTime() - CHECK_DELAY_MS);
  const checkBefore = new Date(now.getTime() - MAX_CHECK_DURATION_MS);

  // Query direta com filtro por bet_result='pending'
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`
      id,
      match_id,
      bet_market,
      bet_pick,
      odds_at_post,
      league_matches!inner (
        home_team_name,
        away_team_name,
        kickoff_time,
        status
      )
    `)
    .eq('bet_status', 'posted')
    .eq('bet_result', 'pending')  // F2: Somente bets pendentes
    .lte('league_matches.kickoff_time', checkAfter.toISOString())  // 2h+ desde kickoff
    .gte('league_matches.kickoff_time', checkBefore.toISOString()); // Menos de 4h

  if (error) {
    logger.error('Failed to fetch bets to track', { error: error.message });
    return [];
  }

  return (data || []).map(bet => ({
    id: bet.id,
    matchId: bet.match_id,
    betMarket: bet.bet_market,
    betPick: bet.bet_pick,
    oddsAtPost: bet.odds_at_post,
    homeTeamName: bet.league_matches.home_team_name,
    awayTeamName: bet.league_matches.away_team_name,
    kickoffTime: bet.league_matches.kickoff_time,
    matchStatus: bet.league_matches.status,
  }));
}

/**
 * Check if match is complete
 * @param {string} status - Match status
 * @returns {boolean}
 */
function isMatchComplete(status) {
  const normalized = status?.toLowerCase();
  return COMPLETED_STATUSES.includes(normalized);
}

/**
 * Busca raw_match do banco para um jogo
 * @param {number} matchId - ID do jogo
 * @returns {Promise<object|null>}
 */
async function getMatchRawData(matchId) {
  const { data, error } = await supabase
    .from('league_matches')
    .select('match_id, home_team_name, away_team_name, raw_match, status')
    .eq('match_id', matchId)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Main job - usa LLM para avaliar resultados em batch por jogo
 */
async function runTrackResults() {
  logger.info('Starting track results job');

  const bets = await getBetsToTrack();
  logger.info('Bets to track', { count: bets.length });

  if (bets.length === 0) {
    logger.info('No bets need tracking');
    return { tracked: 0, success: 0, failure: 0, unknown: 0, errors: 0 };
  }

  // Agrupar bets por matchId para processar em batch
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
  let errorCount = 0;  // F13: Contabilizar erros

  // Processar cada jogo (1 chamada LLM por jogo)
  for (const [matchId, matchBets] of betsByMatch) {
    const matchData = await getMatchRawData(matchId);

    if (!matchData || !isMatchComplete(matchData.status)) {
      logger.debug('Match not complete', { matchId, status: matchData?.status });
      continue;
    }

    // F10: Verificar rawMatch antes de chamar evaluateBetsWithLLM
    if (!matchData.raw_match) {
      logger.warn('Match has no raw_match data', { matchId });
      continue;
    }

    // Preparar bets no formato esperado pelo evaluator
    const betsForEval = matchBets.map(bet => ({
      id: bet.id,
      betMarket: bet.betMarket,
      betPick: bet.betPick,
    }));

    const evalResult = await evaluateBetsWithLLM(
      {
        matchId,
        homeTeamName: matchData.home_team_name,
        awayTeamName: matchData.away_team_name,
        rawMatch: matchData.raw_match,
      },
      betsForEval
    );

    if (!evalResult.success) {
      logger.error('Failed to evaluate bets for match', { matchId, error: evalResult.error });
      continue;
    }

    // F3: Criar Set de IDs validos para validar resposta da LLM
    const validBetIds = new Set(matchBets.map(b => b.id));

    // Atualizar cada bet com o resultado
    for (const result of evalResult.data) {
      // F3: Validar que o ID retornado pela LLM existe no input
      if (!validBetIds.has(result.id)) {
        logger.warn('LLM returned invalid bet ID, skipping', {
          matchId,
          invalidId: result.id,
          validIds: Array.from(validBetIds),
        });
        continue;
      }

      const updateResult = await markBetResult(result.id, result.result, result.reason);

      if (updateResult.success) {
        tracked++;
        if (result.result === 'success') successCount++;
        else if (result.result === 'failure') failureCount++;
        else unknownCount++;

        // Alertar admin apenas para success/failure (nao para unknown)
        if (result.result !== 'unknown') {
          // F6: Verificar que bet existe antes de usar
          const bet = matchBets.find(b => b.id === result.id);
          if (bet) {
            // F5: try/catch para nao quebrar o loop se alerta falhar
            try {
              await trackingResultAlert({
                homeTeamName: matchData.home_team_name,
                awayTeamName: matchData.away_team_name,
                betMarket: bet.betMarket,
                betPick: bet.betPick,
                oddsAtPost: bet.oddsAtPost,
              }, result.result === 'success');
            } catch (alertErr) {
              logger.warn('Failed to send tracking alert', {
                betId: result.id,
                error: alertErr.message,
              });
            }
          }
        }

        logger.info('Bet result tracked', {
          betId: result.id,
          result: result.result,
          reason: result.reason,
        });
      } else {
        // F13: Logar quando markBetResult falha
        errorCount++;
        logger.error('Failed to update bet result', {
          betId: result.id,
          result: result.result,
          error: updateResult.error,
        });
      }
    }
  }

  logger.info('Track results complete', {
    tracked,
    success: successCount,
    failure: failureCount,
    unknown: unknownCount,
    errors: errorCount,
  });

  return { tracked, success: successCount, failure: failureCount, unknown: unknownCount, errors: errorCount };
}

// Run if called directly
if (require.main === module) {
  runTrackResults()
    .then(result => {
      console.log('Track results complete:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('Track results failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runTrackResults };
