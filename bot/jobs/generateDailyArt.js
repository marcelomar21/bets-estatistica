/**
 * Job: Generate daily hit art for each group (D+1)
 *
 * Runs every morning at 09:00 BRT. For each active group with a registered bot,
 * fetches yesterday's resolved bets, generates a PNG image with the hits,
 * and posts it to the group's public Telegram channel.
 *
 * Run: node bot/jobs/generateDailyArt.js
 * Cron: 0 9 * * * (São Paulo)
 */
require('dotenv').config();

const logger = require('../../lib/logger');
const { supabase } = require('../../lib/supabase');
const { getAllBots, sendMediaToPublic } = require('../telegram');
const { generateDailyArt, generateCaption, cleanupArtFile } = require('../services/artGeneratorService');

/**
 * Get yesterday's date boundaries in BRT (America/Sao_Paulo)
 * @returns {{ startOfDay: string, endOfDay: string, targetDate: Date }}
 */
function getYesterdayBRT() {
  const now = new Date();
  // Get "now" in São Paulo timezone
  const spFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = spFormatter.format(now); // e.g. "2026-03-28"
  const todayLocal = new Date(todayStr + 'T00:00:00-03:00');
  const yesterdayLocal = new Date(todayLocal.getTime() - 24 * 60 * 60 * 1000);

  const startOfDay = yesterdayLocal.toISOString();
  const endOfDay = todayLocal.toISOString();

  return { startOfDay, endOfDay, targetDate: yesterdayLocal };
}

/**
 * Fetch resolved bets for a group from yesterday
 * @param {string} groupId
 * @param {string} startOfDay - ISO string
 * @param {string} endOfDay - ISO string
 * @returns {Promise<{ successBets: Array, totalResolved: number }>}
 */
async function fetchResolvedBets(groupId, startOfDay, endOfDay) {
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`
      id,
      bet_market,
      bet_pick,
      odds_at_post,
      bet_result,
      result_updated_at,
      league_matches!inner (
        home_team_name,
        away_team_name
      )
    `)
    .eq('group_id', groupId)
    .in('bet_result', ['success', 'failure'])
    .gte('result_updated_at', startOfDay)
    .lt('result_updated_at', endOfDay)
    .order('result_updated_at', { ascending: true });

  if (error) {
    logger.error('[generateDailyArt] Failed to fetch resolved bets', {
      groupId,
      error: error.message,
    });
    return { successBets: [], totalResolved: 0 };
  }

  const allBets = data || [];
  const successBets = allBets
    .filter(b => b.bet_result === 'success')
    .map(b => ({
      id: b.id,
      homeTeamName: b.league_matches.home_team_name,
      awayTeamName: b.league_matches.away_team_name,
      market: b.bet_market,
      betPick: b.bet_pick,
      oddsAtPost: b.odds_at_post,
    }));

  return { successBets, totalResolved: allBets.length };
}

/**
 * Fetch active groups that have a registered bot
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
async function getActiveGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name')
    .eq('status', 'active');

  if (error) {
    logger.error('[generateDailyArt] Failed to fetch active groups', { error: error.message });
    return [];
  }

  return data || [];
}

/**
 * Main job function: generate and post daily art for all groups
 * @returns {Promise<{generated: number, sent: number, skipped: number, failed: number}>}
 */
async function runGenerateDailyArt() {
  const { startOfDay, endOfDay, targetDate } = getYesterdayBRT();
  logger.info('[generateDailyArt] Starting daily art generation', {
    startOfDay,
    endOfDay,
    targetDate: targetDate.toISOString(),
  });

  const groups = await getActiveGroups();
  const botRegistry = getAllBots();

  const result = { generated: 0, sent: 0, skipped: 0, failed: 0 };

  for (const group of groups) {
    const botCtx = botRegistry.get(group.id);
    if (!botCtx) {
      logger.debug('[generateDailyArt] No bot registered for group, skipping', {
        groupId: group.id,
        groupName: group.name,
      });
      result.skipped++;
      continue;
    }

    try {
      const { successBets, totalResolved } = await fetchResolvedBets(group.id, startOfDay, endOfDay);

      if (successBets.length === 0) {
        logger.info('[generateDailyArt] No hits yesterday, skipping group', {
          groupId: group.id,
          groupName: group.name,
          totalResolved,
        });
        result.skipped++;
        continue;
      }

      // Generate art image
      const artResult = await generateDailyArt({
        successBets,
        totalBets: totalResolved,
        groupName: group.name,
        targetDate,
      });

      if (!artResult.success) {
        logger.error('[generateDailyArt] Art generation failed for group', {
          groupId: group.id,
          error: artResult.error,
        });
        result.failed++;
        continue;
      }

      result.generated++;
      const { filePath } = artResult.data;

      // Generate caption
      const caption = generateCaption({
        successCount: successBets.length,
        totalCount: totalResolved,
        groupName: group.name,
        targetDate,
      });

      // Send to Telegram
      const sendResult = await sendMediaToPublic('image', filePath, caption, botCtx);

      if (sendResult.success) {
        logger.info('[generateDailyArt] Art posted to group', {
          groupId: group.id,
          groupName: group.name,
          hits: successBets.length,
          total: totalResolved,
          messageId: sendResult.data.messageId,
        });
        result.sent++;
      } else {
        logger.error('[generateDailyArt] Failed to send art to group', {
          groupId: group.id,
          error: sendResult.error,
        });
        result.failed++;
      }

      // Cleanup temp file
      cleanupArtFile(filePath);
    } catch (err) {
      logger.error('[generateDailyArt] Error processing group', {
        groupId: group.id,
        groupName: group.name,
        error: err.message,
      });
      result.failed++;
    }
  }

  logger.info('[generateDailyArt] Job complete', result);
  return result;
}

module.exports = { runGenerateDailyArt, getYesterdayBRT, fetchResolvedBets, getActiveGroups };

// Standalone execution
if (require.main === module) {
  const { withExecutionLogging } = require('../services/jobExecutionService');
  (async () => {
    try {
      const result = await withExecutionLogging('generate-daily-art', runGenerateDailyArt);
      console.log('Daily art generation complete:', result);
      process.exit(0);
    } catch (err) {
      console.error('Daily art generation failed:', err.message);
      process.exit(1);
    }
  })();
}
