/**
 * Preview Service — generates message previews using the SAME pipeline as real posting
 *
 * Reuses:
 *  - getFilaStatus()        → bot/services/betService.js
 *  - validateBetForPosting() → bot/jobs/postBets.js
 *  - formatBetMessage()      → bot/jobs/postBets.js
 *  - getRandomTemplate()     → bot/jobs/postBets.js
 */
const logger = require('../../lib/logger');
const { supabase } = require('../../lib/supabase');
const { getFilaStatus } = require('./betService');
const { formatBetMessage, validateBetForPosting, getRandomTemplate } = require('../jobs/postBets');

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
 * Load posting times for the group (needed by getFilaStatus)
 */
async function loadPostingTimes(groupId) {
  const { data, error } = await supabase
    .from('groups')
    .select('posting_schedule')
    .eq('id', groupId)
    .single();

  if (error) {
    return undefined;
  }

  const times = data?.posting_schedule?.times;
  return Array.isArray(times) && times.length > 0 ? times : undefined;
}

/**
 * Generate preview messages for a group
 * Uses the exact same pipeline as the real posting job.
 *
 * @param {string} groupId - Group UUID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function generatePreview(groupId) {
  // 1. Load tone config fresh from DB
  const toneConfig = await loadToneConfig(groupId);

  // 2. Get fila status (same as posting job)
  const postTimes = await loadPostingTimes(groupId);
  const filaResult = await getFilaStatus(groupId, postTimes);

  if (!filaResult.success) {
    return { success: false, error: { code: 'FILA_ERROR', message: filaResult.error?.message || 'Failed to get fila' } };
  }

  const { ativas, novas } = filaResult.data;
  const allBets = [...ativas, ...novas];

  // 3. Filter valid bets
  const validBets = allBets.filter(bet => validateBetForPosting(bet).valid);

  if (validBets.length === 0) {
    return { success: false, error: { code: 'NO_VALID_BETS', message: 'Nenhuma aposta válida para preview' } };
  }

  // 4. Generate preview for each bet using the real formatBetMessage
  const previews = [];
  for (const bet of validBets) {
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
      // Fallback — static template
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

  // 5. Load group name
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
