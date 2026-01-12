/**
 * Metrics Service - Calculate success rates and statistics
 * 
 * Stories covered:
 * - 5.5: Calcular taxa de acerto (últimos 30 dias)
 * - 5.6: Calcular taxa de acerto histórica (all-time)
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

/**
 * Get success rate statistics
 *
 * FORMULA: rate = (success / total) * 100
 * - Only counts bets with status 'success' or 'failure'
 * - Does NOT count: 'posted', 'ready', 'pending_link', 'generated', 'cancelled'
 *
 * 30-day filter: Uses result_updated_at field (not created_at or telegram_posted_at)
 * This ensures we measure when the result was known, not when the bet was created.
 *
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getSuccessRate() {
  try {
    // Get all time stats
    const { data: allTimeData, error: allTimeError } = await supabase
      .from('suggested_bets')
      .select('id, bet_status')
      .in('bet_status', ['success', 'failure']);

    if (allTimeError) {
      logger.error('Failed to fetch all-time stats', { error: allTimeError.message });
      return { success: false, error: { code: 'DB_ERROR', message: allTimeError.message } };
    }

    const allTimeSuccess = allTimeData?.filter(b => b.bet_status === 'success').length || 0;
    const allTimeTotal = allTimeData?.length || 0;
    const allTimeRate = allTimeTotal > 0 ? (allTimeSuccess / allTimeTotal) * 100 : null;

    // Get last 30 days stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentData, error: recentError } = await supabase
      .from('suggested_bets')
      .select('id, bet_status, result_updated_at')
      .in('bet_status', ['success', 'failure'])
      .gte('result_updated_at', thirtyDaysAgo.toISOString());

    if (recentError) {
      logger.error('Failed to fetch 30-day stats', { error: recentError.message });
      return { success: false, error: { code: 'DB_ERROR', message: recentError.message } };
    }

    const recentSuccess = recentData?.filter(b => b.bet_status === 'success').length || 0;
    const recentTotal = recentData?.length || 0;
    const recentRate = recentTotal > 0 ? (recentSuccess / recentTotal) * 100 : null;

    const stats = {
      allTime: {
        success: allTimeSuccess,
        total: allTimeTotal,
        rate: allTimeRate,
      },
      last30Days: {
        success: recentSuccess,
        total: recentTotal,
        rate: recentRate,
      },
      // Convenience accessors
      rateAllTime: allTimeRate,
      rate30Days: recentRate,
    };

    logger.info('Success rate calculated', {
      allTimeRate: allTimeRate?.toFixed(1),
      recentRate: recentRate?.toFixed(1),
    });

    return { success: true, data: stats };
  } catch (err) {
    logger.error('Error calculating success rate', { error: err.message });
    return { success: false, error: { code: 'CALC_ERROR', message: err.message } };
  }
}

/**
 * Get detailed betting statistics
 *
 * METRICS:
 * - totalPosted: Count of bets with telegram_posted_at (actually posted to group)
 * - totalCompleted: Count of bets with status 'success' or 'failure'
 * - byMarket: Breakdown by bet_market field, only counting completed bets
 * - averageOdds: Mean of odds_at_post for completed bets
 *
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getDetailedStats() {
  try {
    // Get all completed bets with details
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        id,
        bet_market,
        bet_status,
        odds_at_post,
        result_updated_at,
        telegram_posted_at
      `)
      .in('bet_status', ['success', 'failure', 'posted'])
      .order('telegram_posted_at', { ascending: false });

    if (error) {
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    // Calculate stats by market
    const byMarket = {};
    for (const bet of data || []) {
      if (!['success', 'failure'].includes(bet.bet_status)) continue;
      
      const market = bet.bet_market || 'unknown';
      if (!byMarket[market]) {
        byMarket[market] = { success: 0, failure: 0 };
      }
      byMarket[market][bet.bet_status]++;
    }

    // Calculate average odds
    const completedBets = data?.filter(b => ['success', 'failure'].includes(b.bet_status)) || [];
    const avgOdds = completedBets.length > 0
      ? completedBets.reduce((sum, b) => sum + (b.odds_at_post || 0), 0) / completedBets.length
      : null;

    const stats = {
      totalPosted: data?.filter(b => b.telegram_posted_at).length || 0,
      totalCompleted: completedBets.length,
      byMarket,
      averageOdds: avgOdds,
    };

    return { success: true, data: stats };
  } catch (err) {
    logger.error('Error getting detailed stats', { error: err.message });
    return { success: false, error: { code: 'CALC_ERROR', message: err.message } };
  }
}

/**
 * Format stats for display in Telegram messages
 *
 * OUTPUT FORMAT:
 * - Header: "Estatísticas de Acerto"
 * - 30 days section: "X/Y" format with percentage
 * - All-time section: "X/Y" format with percentage
 * - Edge cases: Shows "Ainda não há resultados" if no data
 *
 * EDGE CASE HANDLING:
 * - null/undefined → returns "Estatísticas não disponíveis"
 * - 0 total → shows "Ainda não há resultados registrados"
 * - Rate uses toFixed(1) for 1 decimal place
 *
 * @param {object} stats - Stats object from getSuccessRate
 * @returns {string} - Formatted Markdown string for Telegram
 */
function formatStatsMessage(stats) {
  if (!stats) return 'Estatísticas não disponíveis';

  const parts = ['📊 *Estatísticas de Acerto*', ''];

  if (stats.last30Days?.total > 0) {
    parts.push(`*Últimos 30 dias:*`);
    parts.push(`✅ Acertos: ${stats.last30Days.success}/${stats.last30Days.total}`);
    parts.push(`📈 Taxa: ${stats.last30Days.rate?.toFixed(1)}%`);
    parts.push('');
  }

  if (stats.allTime?.total > 0) {
    parts.push(`*Histórico total:*`);
    parts.push(`✅ Acertos: ${stats.allTime.success}/${stats.allTime.total}`);
    parts.push(`📈 Taxa: ${stats.allTime.rate?.toFixed(1)}%`);
  }

  if (stats.allTime?.total === 0 && stats.last30Days?.total === 0) {
    parts.push('_Ainda não há resultados registrados._');
  }

  return parts.join('\n');
}

module.exports = {
  getSuccessRate,
  getDetailedStats,
  formatStatsMessage,
};
