/**
 * Daily Wins Recap Job
 *
 * GURU-18: Generates and sends a celebratory message with yesterday's winning bets
 * for each active group, using the group's configured tone of voice.
 *
 * Schedule: Daily at 09:00 BRT (before first post of the day)
 * Mode: Runs in GROUP mode (runGroup)
 */
const logger = require('../../lib/logger');
const { getAllBots } = require('../telegram');
const { sendToPublic } = require('../telegram');
const { getYesterdayWins } = require('../services/metricsService');
const { generateWinsRecapCopy } = require('../services/copyService');

/**
 * Run daily wins recap for all active groups
 * @returns {Promise<{sent: number, skipped: number, failed: number, details: Array}>}
 */
async function runDailyWinsRecap() {
  logger.info('[daily-wins-recap] Starting daily wins recap job');

  const allBots = getAllBots();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const details = [];

  for (const [groupId, botCtx] of allBots) {
    const groupName = botCtx.groupConfig?.name || groupId;

    try {
      // 1. Fetch yesterday's wins for this group
      const winsResult = await getYesterdayWins(groupId);
      if (!winsResult.success) {
        logger.error('[daily-wins-recap] Failed to fetch wins', { groupId, error: winsResult.error });
        failed++;
        details.push({ groupId, groupName, status: 'error', error: winsResult.error.message });
        continue;
      }

      const { winCount, totalCount } = winsResult.data;

      // 2. Skip if no wins
      if (winCount === 0) {
        logger.info('[daily-wins-recap] No wins yesterday, skipping', { groupId, groupName, totalCount });
        skipped++;
        details.push({ groupId, groupName, status: 'skipped', reason: 'no_wins', totalCount });
        continue;
      }

      // 3. Generate recap copy using group's tone config
      const toneConfig = botCtx.groupConfig?.copyToneConfig || null;
      const copyResult = await generateWinsRecapCopy(winsResult.data, toneConfig);
      if (!copyResult.success) {
        logger.error('[daily-wins-recap] Failed to generate copy', { groupId, error: copyResult.error });
        failed++;
        details.push({ groupId, groupName, status: 'error', error: copyResult.error.message });
        continue;
      }

      // 4. Send to public group
      const sendResult = await sendToPublic(copyResult.data.copy, botCtx);
      if (!sendResult.success) {
        logger.error('[daily-wins-recap] Failed to send message', { groupId, error: sendResult.error });
        failed++;
        details.push({ groupId, groupName, status: 'send_failed', error: sendResult.error.message });
        continue;
      }

      sent++;
      details.push({ groupId, groupName, status: 'sent', winCount, totalCount });
      logger.info('[daily-wins-recap] Recap sent', {
        groupId, groupName, winCount, totalCount,
        messageId: sendResult.data?.messageId,
      });
    } catch (err) {
      logger.error('[daily-wins-recap] Unexpected error for group', { groupId, error: err.message });
      failed++;
      details.push({ groupId, groupName, status: 'error', error: err.message });
    }
  }

  const summary = { sent, skipped, failed, totalGroups: allBots.size };
  logger.info('[daily-wins-recap] Job complete', summary);

  return { sent, skipped, failed, details };
}

module.exports = { runDailyWinsRecap };
