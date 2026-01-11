/**
 * Job: Track bet results after matches finish
 * 
 * Stories covered:
 * - 5.1: Criar job tracking resultados
 * - 5.2: Detectar fim jogo (2h after kickoff, then every 5min)
 * - 5.3: Comparar resultado com aposta
 * - 5.4: Atualizar status automaticamente
 * 
 * Run: node bot/jobs/trackResults.js
 * Cron: every 5 minutes
 */
require('dotenv').config();

const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { markBetResult, getActivePostedBets } = require('../services/betService');
const { trackingResultAlert } = require('../services/alertService');

// How long after kickoff to start checking (2 hours)
const CHECK_DELAY_MS = 2 * 60 * 60 * 1000;

// Max time to keep checking (4 hours after kickoff)
const MAX_CHECK_DURATION_MS = 4 * 60 * 60 * 1000;

// Match status values that indicate completion
const COMPLETED_STATUSES = ['complete', 'finished', 'ft', 'aet', 'pen'];

/**
 * Get posted bets that need result tracking
 */
async function getBetsToTrack() {
  const result = await getActivePostedBets();
  if (!result.success) return [];

  const now = Date.now();
  
  return result.data.filter(bet => {
    const kickoff = new Date(bet.kickoffTime).getTime();
    const timeSinceKickoff = now - kickoff;
    
    // Only check if 2+ hours after kickoff
    if (timeSinceKickoff < CHECK_DELAY_MS) {
      return false;
    }
    
    // Stop checking after 4 hours
    if (timeSinceKickoff > MAX_CHECK_DURATION_MS) {
      logger.warn('Bet exceeded max tracking time', { betId: bet.id });
      return false;
    }
    
    return true;
  });
}

/**
 * Check if match is complete
 * @param {object} bet - Bet with match status
 * @returns {boolean}
 */
function isMatchComplete(bet) {
  const status = bet.matchStatus?.toLowerCase();
  return COMPLETED_STATUSES.includes(status);
}

/**
 * Evaluate if bet won based on match result
 * This is a simplified evaluation - real logic would be more complex
 * @param {object} bet - Bet object
 * @returns {boolean|null} - true=won, false=lost, null=cannot determine
 */
function evaluateBetResult(bet) {
  const { betMarket, betPick, homeScore, awayScore } = bet;
  
  if (homeScore === null || awayScore === null) {
    return null;
  }

  const totalGoals = homeScore + awayScore;
  const normalized = (betMarket || '').toLowerCase() + ' ' + (betPick || '').toLowerCase();

  // Over/Under goals
  const overMatch = normalized.match(/mais de (\d+[,.]?\d*)/);
  if (overMatch) {
    const line = parseFloat(overMatch[1].replace(',', '.'));
    return totalGoals > line;
  }

  const underMatch = normalized.match(/menos de (\d+[,.]?\d*)/);
  if (underMatch) {
    const line = parseFloat(underMatch[1].replace(',', '.'));
    return totalGoals < line;
  }

  // BTTS
  if (normalized.includes('btts') || normalized.includes('ambas marcam')) {
    const btts = homeScore > 0 && awayScore > 0;
    if (normalized.includes('sim') || normalized.includes('yes')) {
      return btts;
    }
    if (normalized.includes('não') || normalized.includes('no')) {
      return !btts;
    }
    // Default: BTTS yes
    return btts;
  }

  // Cannot determine other bet types without more data
  logger.warn('Cannot evaluate bet type', { betMarket, betPick });
  return null;
}

/**
 * Refresh match data from database
 * @param {number} matchId
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function refreshMatchData(matchId) {
  const { data, error } = await supabase
    .from('league_matches')
    .select('status, home_score, away_score')
    .eq('match_id', matchId)
    .single();

  if (error) {
    logger.error('Failed to refresh match data', { matchId, error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  return { success: true, data };
}

/**
 * Main job
 */
async function runTrackResults() {
  logger.info('Starting track results job');

  const bets = await getBetsToTrack();
  logger.info('Bets to track', { count: bets.length });

  if (bets.length === 0) {
    logger.info('No bets need tracking');
    return { tracked: 0, success: 0, failure: 0 };
  }

  let tracked = 0;
  let successCount = 0;
  let failureCount = 0;

  for (const bet of bets) {
    // Refresh match data
    const matchResult = await refreshMatchData(bet.matchId);
    if (!matchResult.success) continue;

    // Update bet with fresh data
    const updatedBet = {
      ...bet,
      matchStatus: matchResult.data.status,
      homeScore: matchResult.data.home_score,
      awayScore: matchResult.data.away_score,
    };

    // Check if match is complete
    if (!isMatchComplete(updatedBet)) {
      logger.debug('Match not complete yet', { betId: bet.id, status: matchResult.data.status });
      continue;
    }

    // Evaluate result
    const won = evaluateBetResult(updatedBet);
    
    if (won === null) {
      logger.warn('Could not evaluate bet result', { betId: bet.id });
      continue;
    }

    // Update bet status
    const updateResult = await markBetResult(bet.id, won);
    
    if (updateResult.success) {
      tracked++;
      if (won) successCount++;
      else failureCount++;

      // Send alert to admin
      await trackingResultAlert({
        homeTeamName: bet.homeTeamName,
        awayTeamName: bet.awayTeamName,
        betMarket: bet.betMarket,
        betPick: bet.betPick,
        oddsAtPost: bet.oddsAtPost,
      }, won);

      logger.info('Bet result tracked', {
        betId: bet.id,
        won,
        score: `${matchResult.data.home_score}-${matchResult.data.away_score}`,
      });
    }
  }

  logger.info('Track results complete', { tracked, success: successCount, failure: failureCount });
  return { tracked, success: successCount, failure: failureCount };
}

// Run if called directly
if (require.main === module) {
  runTrackResults()
    .then(result => {
      console.log('✅ Track results complete:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Track results failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runTrackResults, evaluateBetResult };
