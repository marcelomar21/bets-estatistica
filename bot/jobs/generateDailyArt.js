/**
 * Generate Daily Art Job (GURU-19)
 *
 * Runs at 09:00 BRT (D+1). For each active group, fetches yesterday's
 * resolved bets, generates a celebratory image with the "hits", and
 * posts it to the group's public Telegram channel.
 *
 * Skips groups with zero successful bets.
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { getAllBots } = require('../telegram');
const { generateDailyArtImage, buildCaption } = require('../services/artGeneratorService');

/**
 * Get the start and end of yesterday in BRT (America/Sao_Paulo)
 * @returns {{ start: string, end: string }} ISO strings for yesterday 00:00 and today 00:00 BRT
 */
function getYesterdayRange() {
  // Build "today 00:00" in BRT then subtract 1 day for yesterday
  const nowBrt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const todayMidnight = new Date(nowBrt.getFullYear(), nowBrt.getMonth(), nowBrt.getDate());
  const yesterdayMidnight = new Date(todayMidnight);
  yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);

  // Convert back to UTC ISO strings for DB queries
  // BRT is UTC-3, so add 3 hours to get UTC
  const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
  const start = new Date(yesterdayMidnight.getTime() + BRT_OFFSET_MS).toISOString();
  const end = new Date(todayMidnight.getTime() + BRT_OFFSET_MS).toISOString();

  return { start, end, dateForDisplay: yesterdayMidnight };
}

/**
 * Fetch resolved bets for a specific group in a date range
 * @param {string} groupId
 * @param {string} start - ISO date (inclusive)
 * @param {string} end - ISO date (exclusive)
 * @returns {Promise<{success: boolean, data?: {successBets: Array, totalResolved: number}, error?: object}>}
 */
async function fetchResolvedBets(groupId, start, end) {
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`
      id,
      bet_result,
      bet_market,
      market,
      pick,
      bet_pick,
      odds_at_post,
      result_updated_at,
      league_matches!inner(home_team_name, away_team_name)
    `)
    .eq('group_id', groupId)
    .in('bet_result', ['success', 'failure'])
    .gte('result_updated_at', start)
    .lt('result_updated_at', end)
    .order('result_updated_at', { ascending: true });

  if (error) {
    logger.error('[generateDailyArt] Failed to fetch resolved bets', {
      groupId,
      error: error.message,
    });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  // Flatten league_matches join
  const bets = (data || []).map(b => ({
    id: b.id,
    bet_result: b.bet_result,
    market: b.market || b.bet_market,
    pick: b.pick || b.bet_pick,
    odds_at_post: b.odds_at_post,
    home_team_name: b.league_matches?.home_team_name || 'Time A',
    away_team_name: b.league_matches?.away_team_name || 'Time B',
  }));

  const successBets = bets.filter(b => b.bet_result === 'success');
  const totalResolved = bets.length;

  return { success: true, data: { successBets, totalResolved } };
}

/**
 * Send the art image buffer directly to a Telegram group
 * @param {Buffer} buffer - PNG image buffer
 * @param {string} caption - Markdown caption
 * @param {object} botCtx - BotContext for the target group
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function sendArtToGroup(buffer, caption, botCtx) {
  if (!botCtx || !botCtx.bot || !botCtx.publicGroupId) {
    return { success: false, error: { code: 'INVALID_BOT_CTX', message: 'Missing bot context' } };
  }

  try {
    const message = await botCtx.bot.sendPhoto(
      botCtx.publicGroupId,
      buffer,
      { caption, parse_mode: 'Markdown' },
      { filename: 'acertos-do-dia.png', contentType: 'image/png' }
    );

    logger.info('[generateDailyArt] Art sent to group', {
      messageId: message.message_id,
      groupId: botCtx.groupId,
    });
    return { success: true, data: { messageId: message.message_id } };
  } catch (err) {
    logger.error('[generateDailyArt] Failed to send art', {
      error: err.message,
      groupId: botCtx.groupId,
    });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

/**
 * Process a single group: fetch bets, generate art, send to Telegram
 * @param {string} groupId
 * @param {object} botCtx
 * @param {string} start
 * @param {string} end
 * @param {Date} dateForDisplay
 * @returns {Promise<{status: string, successCount?: number, totalResolved?: number, error?: string}>}
 */
async function processGroup(groupId, botCtx, start, end, dateForDisplay) {
  const groupName = botCtx.groupConfig?.name || 'Grupo';

  // 1. Fetch resolved bets
  const betsResult = await fetchResolvedBets(groupId, start, end);
  if (!betsResult.success) {
    return { status: 'error', error: betsResult.error.message };
  }

  const { successBets, totalResolved } = betsResult.data;

  // 2. Skip if no successful bets
  if (successBets.length === 0) {
    logger.info('[generateDailyArt] No successful bets for group, skipping', {
      groupId,
      groupName,
      totalResolved,
    });
    return { status: 'skipped', successCount: 0, totalResolved };
  }

  // 3. Generate image
  const artResult = await generateDailyArtImage({
    successBets,
    totalResolved,
    groupName,
    date: dateForDisplay,
  });

  if (!artResult.success) {
    return { status: 'error', error: artResult.error.message };
  }

  // 4. Build caption
  const caption = buildCaption(successBets.length, totalResolved, groupName, dateForDisplay);

  // 5. Send to Telegram
  const sendResult = await sendArtToGroup(artResult.data.buffer, caption, botCtx);
  if (!sendResult.success) {
    return { status: 'error', error: sendResult.error.message };
  }

  return {
    status: 'sent',
    successCount: successBets.length,
    totalResolved,
    messageId: sendResult.data.messageId,
  };
}

/**
 * Main entry point for the daily art generation job
 * @returns {Promise<{success: boolean, data: object}>}
 */
async function runGenerateDailyArt() {
  logger.info('[generateDailyArt] Starting daily art generation');

  const { start, end, dateForDisplay } = getYesterdayRange();
  const allBots = getAllBots();

  if (allBots.size === 0) {
    logger.warn('[generateDailyArt] No bots registered');
    return { success: true, data: { sent: 0, skipped: 0, errors: 0 } };
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const [groupId, botCtx] of allBots) {
    try {
      const result = await processGroup(groupId, botCtx, start, end, dateForDisplay);

      if (result.status === 'sent') {
        sent++;
        logger.info('[generateDailyArt] Group processed', {
          groupId,
          successCount: result.successCount,
          totalResolved: result.totalResolved,
        });
      } else if (result.status === 'skipped') {
        skipped++;
      } else {
        errors++;
        logger.error('[generateDailyArt] Group failed', {
          groupId,
          error: result.error,
        });
      }
    } catch (err) {
      errors++;
      logger.error('[generateDailyArt] Unexpected error processing group', {
        groupId,
        error: err.message,
      });
    }
  }

  const summary = { sent, skipped, errors, totalGroups: allBots.size };
  logger.info('[generateDailyArt] Job complete', summary);

  return { success: true, data: summary };
}

module.exports = {
  runGenerateDailyArt,
  // Exported for testing
  getYesterdayRange,
  fetchResolvedBets,
  processGroup,
};
