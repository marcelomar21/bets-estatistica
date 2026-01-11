/**
 * Bet Service - CRUD operations and state management for bets
 */
const { supabase } = require('../../lib/supabase');
const { config } = require('../../lib/config');
const logger = require('../../lib/logger');

/**
 * Get eligible bets for posting (Story 6.3: ≤2 days, eligible, odds >= 1.60)
 * @param {number} limit - Max number of bets to return
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getEligibleBets(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds,
        confidence,
        reasoning,
        risk_level,
        bet_status,
        deep_link,
        eligible,
        created_at,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time,
          status
        )
      `)
      .eq('eligible', true)
      .eq('bet_category', 'SAFE')
      .in('bet_status', ['generated', 'pending_link', 'ready'])
      .gte('odds', config.betting.minOdds)
      .gte('league_matches.kickoff_time', new Date().toISOString())
      .lte('league_matches.kickoff_time', new Date(Date.now() + config.betting.maxDaysAhead * 24 * 60 * 60 * 1000).toISOString())
      .order('odds', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Failed to fetch eligible bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    // Flatten the response
    const bets = (data || []).map(bet => ({
      id: bet.id,
      matchId: bet.match_id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      odds: bet.odds,
      confidence: bet.confidence,
      reasoning: bet.reasoning,
      riskLevel: bet.risk_level,
      betStatus: bet.bet_status,
      deepLink: bet.deep_link,
      eligible: bet.eligible,
      createdAt: bet.created_at,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
      matchStatus: bet.league_matches.status,
    }));

    logger.info('Fetched eligible bets', { count: bets.length });
    return { success: true, data: bets };
  } catch (err) {
    logger.error('Error fetching eligible bets', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Get bets ready for posting (have deep_link and status='ready')
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getBetsReadyForPosting() {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds,
        reasoning,
        deep_link,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('bet_status', 'ready')
      .eq('eligible', true)
      .not('deep_link', 'is', null)
      .gte('league_matches.kickoff_time', new Date().toISOString())
      .order('odds', { ascending: false })
      .limit(config.betting.maxActiveBets);

    if (error) {
      logger.error('Failed to fetch ready bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const bets = (data || []).map(bet => ({
      id: bet.id,
      matchId: bet.match_id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      odds: bet.odds,
      reasoning: bet.reasoning,
      deepLink: bet.deep_link,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
    }));

    return { success: true, data: bets };
  } catch (err) {
    logger.error('Error fetching ready bets', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Get bets pending links (status='pending_link')
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getBetsPendingLinks() {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds,
        reasoning,
        created_at,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('bet_status', 'pending_link')
      .eq('eligible', true)
      .gte('league_matches.kickoff_time', new Date().toISOString())
      .order('odds', { ascending: false });

    if (error) {
      logger.error('Failed to fetch pending bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const bets = (data || []).map(bet => ({
      id: bet.id,
      matchId: bet.match_id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      odds: bet.odds,
      reasoning: bet.reasoning,
      createdAt: bet.created_at,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
    }));

    return { success: true, data: bets };
  } catch (err) {
    logger.error('Error fetching pending bets', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Get active posted bets (status='posted')
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getActivePostedBets() {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds_at_post,
        telegram_posted_at,
        telegram_message_id,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time,
          status,
          home_score,
          away_score
        )
      `)
      .eq('bet_status', 'posted')
      .order('telegram_posted_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch active posted bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const bets = (data || []).map(bet => ({
      id: bet.id,
      matchId: bet.match_id,
      betMarket: bet.bet_market,
      betPick: bet.bet_pick,
      oddsAtPost: bet.odds_at_post,
      telegramPostedAt: bet.telegram_posted_at,
      telegramMessageId: bet.telegram_message_id,
      homeTeamName: bet.league_matches.home_team_name,
      awayTeamName: bet.league_matches.away_team_name,
      kickoffTime: bet.league_matches.kickoff_time,
      matchStatus: bet.league_matches.status,
      homeScore: bet.league_matches.home_score,
      awayScore: bet.league_matches.away_score,
    }));

    return { success: true, data: bets };
  } catch (err) {
    logger.error('Error fetching active posted bets', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Update bet status
 * @param {number} betId - Bet ID
 * @param {string} status - New status
 * @param {object} extraFields - Additional fields to update
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function updateBetStatus(betId, status, extraFields = {}) {
  try {
    const updateData = {
      bet_status: status,
      ...extraFields,
    };

    const { error } = await supabase
      .from('suggested_bets')
      .update(updateData)
      .eq('id', betId);

    if (error) {
      logger.error('Failed to update bet status', { betId, status, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet status updated', { betId, status });
    return { success: true };
  } catch (err) {
    logger.error('Error updating bet status', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}

/**
 * Mark bet as posted
 * @param {number} betId - Bet ID
 * @param {number} messageId - Telegram message ID
 * @param {number} oddsAtPost - Odds at time of posting
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function markBetAsPosted(betId, messageId, oddsAtPost) {
  return updateBetStatus(betId, 'posted', {
    telegram_posted_at: new Date().toISOString(),
    telegram_message_id: messageId,
    odds_at_post: oddsAtPost,
  });
}

/**
 * Mark bet as success or failure
 * @param {number} betId - Bet ID
 * @param {boolean} won - Whether bet won
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function markBetResult(betId, won) {
  return updateBetStatus(betId, won ? 'success' : 'failure', {
    result_updated_at: new Date().toISOString(),
  });
}

/**
 * Mark bets with low odds as ineligible (Story 4.4)
 * @param {number} minOdds - Minimum odds threshold
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function markLowOddsBetsIneligible(minOdds = config.betting.minOdds) {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .update({ eligible: false })
      .lt('odds', minOdds)
      .eq('eligible', true)
      .in('bet_status', ['generated', 'pending_link'])
      .select('id');

    if (error) {
      logger.error('Failed to mark low odds bets', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const count = data?.length || 0;
    if (count > 0) {
      logger.info('Marked low odds bets as ineligible', { count, minOdds });
    }
    return { success: true, data: { markedCount: count } };
  } catch (err) {
    logger.error('Error marking low odds bets', { error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}

/**
 * Get a single bet by ID with match info
 * @param {number} betId - Bet ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getBetById(betId) {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        match_id,
        bet_market,
        bet_pick,
        odds,
        bet_status,
        deep_link,
        eligible,
        league_matches!inner (
          home_team_name,
          away_team_name,
          kickoff_time
        )
      `)
      .eq('id', betId)
      .single();

    if (error) {
      logger.error('Failed to fetch bet by ID', { betId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    if (!data) {
      return { success: false, error: { code: 'NOT_FOUND', message: `Bet ${betId} not found` } };
    }

    const bet = {
      id: data.id,
      matchId: data.match_id,
      betMarket: data.bet_market,
      betPick: data.bet_pick,
      odds: data.odds,
      betStatus: data.bet_status,
      deepLink: data.deep_link,
      eligible: data.eligible,
      homeTeamName: data.league_matches.home_team_name,
      awayTeamName: data.league_matches.away_team_name,
      kickoffTime: data.league_matches.kickoff_time,
    };

    return { success: true, data: bet };
  } catch (err) {
    logger.error('Error fetching bet by ID', { betId, error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Update bet with deep link and set status to 'ready'
 * @param {number} betId - Bet ID
 * @param {string} deepLink - Deep link URL
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function updateBetLink(betId, deepLink) {
  try {
    const { error } = await supabase
      .from('suggested_bets')
      .update({
        deep_link: deepLink,
        bet_status: 'ready',
      })
      .eq('id', betId);

    if (error) {
      logger.error('Failed to update bet link', { betId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet link updated', { betId });
    return { success: true };
  } catch (err) {
    logger.error('Error updating bet link', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}

/**
 * Update bet odds (manual or from API)
 * @param {number} betId - Bet ID
 * @param {number} odds - New odds value
 * @param {string} notes - Optional notes about the update
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function updateBetOdds(betId, odds, notes = null) {
  try {
    const updateData = { odds };
    if (notes) {
      updateData.notes = notes;
    }

    const { error } = await supabase
      .from('suggested_bets')
      .update(updateData)
      .eq('id', betId);

    if (error) {
      logger.error('Failed to update bet odds', { betId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet odds updated', { betId, odds });
    return { success: true };
  } catch (err) {
    logger.error('Error updating bet odds', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}

/**
 * Set bet status to pending_link with a note
 * @param {number} betId - Bet ID
 * @param {string} note - Note explaining why
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function setBetPendingWithNote(betId, note) {
  try {
    const { error } = await supabase
      .from('suggested_bets')
      .update({
        bet_status: 'pending_link',
        notes: note,
      })
      .eq('id', betId);

    if (error) {
      logger.error('Failed to set bet pending', { betId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet set to pending_link', { betId });
    return { success: true };
  } catch (err) {
    logger.error('Error setting bet pending', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}

/**
 * Request links for top N eligible bets (changes status to pending_link)
 * @param {number} count - Number of bets to request links for
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function requestLinksForTopBets(count = config.betting.maxActiveBets) {
  // First, get top eligible bets that need links
  const result = await getEligibleBets(count);
  if (!result.success) return result;

  const betsToRequest = result.data.filter(bet => bet.betStatus === 'generated');
  
  if (betsToRequest.length === 0) {
    logger.info('No new bets need link requests');
    return { success: true, data: [] };
  }

  // Update their status to pending_link
  const ids = betsToRequest.map(b => b.id);
  const { error } = await supabase
    .from('suggested_bets')
    .update({ bet_status: 'pending_link' })
    .in('id', ids);

  if (error) {
    logger.error('Failed to update bets to pending_link', { error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  // Return the bets with updated status
  const updatedBets = betsToRequest.map(b => ({ ...b, betStatus: 'pending_link' }));
  logger.info('Requested links for bets', { count: updatedBets.length });
  return { success: true, data: updatedBets };
}

module.exports = {
  // Query functions
  getEligibleBets,
  getBetsReadyForPosting,
  getBetsPendingLinks,
  getActivePostedBets,
  getBetById,

  // Update functions
  updateBetStatus,
  updateBetLink,
  updateBetOdds,
  setBetPendingWithNote,
  markBetAsPosted,
  markBetResult,
  markLowOddsBetsIneligible,
  requestLinksForTopBets,
};
