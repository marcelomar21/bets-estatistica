/**
 * Match Service - Operations for league_matches table
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

/**
 * Get match status and scores by match ID
 * @param {number} matchId - Match ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMatchStatus(matchId) {
  try {
    const { data, error } = await supabase
      .from('league_matches')
      .select('match_id, status, home_score, away_score, home_team_name, away_team_name')
      .eq('match_id', matchId)
      .single();

    if (error) {
      logger.error('Failed to fetch match status', { matchId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    if (!data) {
      return { success: false, error: { code: 'NOT_FOUND', message: `Match ${matchId} not found` } };
    }

    return {
      success: true,
      data: {
        matchId: data.match_id,
        status: data.status,
        homeScore: data.home_score,
        awayScore: data.away_score,
        homeTeamName: data.home_team_name,
        awayTeamName: data.away_team_name,
      },
    };
  } catch (err) {
    logger.error('Error fetching match status', { matchId, error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

/**
 * Get multiple matches by IDs
 * @param {Array<number>} matchIds - Array of match IDs
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getMatchesByIds(matchIds) {
  try {
    const { data, error } = await supabase
      .from('league_matches')
      .select('match_id, status, home_score, away_score, home_team_name, away_team_name, kickoff_time')
      .in('match_id', matchIds);

    if (error) {
      logger.error('Failed to fetch matches', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const matches = (data || []).map(m => ({
      matchId: m.match_id,
      status: m.status,
      homeScore: m.home_score,
      awayScore: m.away_score,
      homeTeamName: m.home_team_name,
      awayTeamName: m.away_team_name,
      kickoffTime: m.kickoff_time,
    }));

    return { success: true, data: matches };
  } catch (err) {
    logger.error('Error fetching matches', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}

module.exports = {
  getMatchStatus,
  getMatchesByIds,
};
