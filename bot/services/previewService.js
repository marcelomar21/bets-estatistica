/**
 * Preview Service — generates message previews using the SAME pipeline as real posting
 *
 * Reuses:
 *  - formatBetMessage()      → bot/jobs/postBets.js
 *  - getRandomTemplate()     → bot/jobs/postBets.js
 *
 * The preview is for testing TONE, not for validating posting readiness.
 * It fetches any recent bets from the group (including past ones) as sample data.
 */
const logger = require('../../lib/logger');
const { supabase } = require('../../lib/supabase');
const { formatBetMessage, getRandomTemplate } = require('../jobs/postBets');

/**
 * Load copy_tone_config directly from DB (not from botCtx in memory)
 * so the preview always reflects the latest saved config from the admin panel.
 */
async function loadToneConfig(groupId) {
  const { data, error } = await supabase
    .from('groups')
    .select('copy_tone_config')
    .eq('id', groupId)
    .single();

  if (error) {
    logger.warn('[previewService] Failed to load tone config', { groupId, error: error.message });
    return null;
  }

  return data?.copy_tone_config || null;
}

/**
 * Fetch sample bets for preview — no posting-readiness filters.
 * Prefers future bets with deep_link, but falls back to any recent bet.
 * Limit to 3 for a quick preview.
 */
async function fetchSampleBets(groupId) {
  // 1st try: future bets with deep_link (ideal preview candidates)
  const now = new Date().toISOString();
  const { data: futureBets } = await supabase
    .from('suggested_bets')
    .select(`
      id, bet_market, bet_pick, odds, deep_link, reasoning, promovida_manual,
      league_matches!inner ( home_team_name, away_team_name, kickoff_time )
    `)
    .eq('group_id', groupId)
    .eq('elegibilidade', 'elegivel')
    .gt('league_matches.kickoff_time', now)
    .order('league_matches(kickoff_time)', { ascending: true })
    .limit(3);

  if (futureBets && futureBets.length > 0) {
    return futureBets;
  }

  // 2nd try: any recent bets (including past) — just for tone sample
  const { data: recentBets, error } = await supabase
    .from('suggested_bets')
    .select(`
      id, bet_market, bet_pick, odds, deep_link, reasoning, promovida_manual,
      league_matches!inner ( home_team_name, away_team_name, kickoff_time )
    `)
    .eq('group_id', groupId)
    .eq('elegibilidade', 'elegivel')
    .order('league_matches(kickoff_time)', { ascending: false })
    .limit(3);

  if (error) {
    logger.error('[previewService] Failed to fetch sample bets', { groupId, error: error.message });
    return [];
  }

  return recentBets || [];
}

/**
 * Map raw DB bet to the shape formatBetMessage expects
 */
function mapBet(raw) {
  return {
    id: raw.id,
    betMarket: raw.bet_market,
    betPick: raw.bet_pick,
    odds: raw.odds,
    deepLink: raw.deep_link,
    reasoning: raw.reasoning,
    promovidaManual: raw.promovida_manual,
    homeTeamName: raw.league_matches.home_team_name,
    awayTeamName: raw.league_matches.away_team_name,
    kickoffTime: raw.league_matches.kickoff_time,
  };
}

/**
 * Generate preview messages for a group.
 * Uses the exact same formatBetMessage() pipeline as real posting,
 * but without posting-readiness filters (kickoff, odds, deep_link).
 *
 * @param {string} groupId - Group UUID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function generatePreview(groupId) {
  // 1. Load tone config fresh from DB
  const toneConfig = await loadToneConfig(groupId);

  // 2. Fetch sample bets (no strict filters — preview is for tone testing)
  const rawBets = await fetchSampleBets(groupId);

  if (rawBets.length === 0) {
    return { success: false, error: { code: 'NO_BETS', message: 'Nenhuma aposta encontrada neste grupo para gerar preview' } };
  }

  const bets = rawBets.map(mapBet);

  // 3. Generate preview for each bet using the real formatBetMessage
  const previews = [];
  for (const bet of bets) {
    try {
      const template = getRandomTemplate();
      const preview = await formatBetMessage(bet, template, toneConfig);
      previews.push({
        betId: bet.id,
        preview,
        betInfo: {
          homeTeam: bet.homeTeamName,
          awayTeam: bet.awayTeamName,
          market: bet.betMarket,
          pick: bet.betPick,
          odds: bet.odds,
          kickoffTime: bet.kickoffTime,
          deepLink: bet.deepLink,
        },
      });
    } catch (err) {
      logger.error('[previewService] Failed to format bet', { betId: bet.id, groupId, error: err.message });
      previews.push({
        betId: bet.id,
        preview: `🎯 ${bet.homeTeamName} x ${bet.awayTeamName}\n📊 ${bet.betMarket}\n💰 Odd: ${bet.odds?.toFixed(2) || 'N/A'}\n🔗 ${bet.deepLink || ''}`,
        betInfo: {
          homeTeam: bet.homeTeamName,
          awayTeam: bet.awayTeamName,
          market: bet.betMarket,
          pick: bet.betPick,
          odds: bet.odds,
          kickoffTime: bet.kickoffTime,
          deepLink: bet.deepLink,
        },
      });
    }
  }

  // 4. Load group name
  const { data: group } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single();

  return {
    success: true,
    data: {
      groupId,
      groupName: group?.name || groupId,
      bets: previews,
    },
  };
}

module.exports = { generatePreview };
