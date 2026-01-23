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
 * Get success rate for last N days (or all-time if days is null)
 *
 * FORMULA: rate = (success / total) * 100
 * - Only counts bets with bet_result 'success' or 'failure'
 * - Does NOT count: bet_result 'pending', 'cancelled', or 'unknown'
 * - Uses result_updated_at for date filtering
 *
 * @param {number|null} days - Number of days to look back (null = all-time)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getSuccessRateForDays(days = null) {
  try {
    let query = supabase
      .from('suggested_bets')
      .select('id, bet_result')
      .in('bet_result', ['success', 'failure']);

    // Apply date filter only if days is specified
    if (days !== null) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      query = query.gte('result_updated_at', startDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      const label = days !== null ? `${days}-day` : 'all-time';
      logger.error(`Failed to fetch ${label} stats`, { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const successCount = data?.filter(b => b.bet_result === 'success').length || 0;
    const total = data?.length || 0;
    const rate = total > 0 ? (successCount / total) * 100 : null;

    return {
      success: true,
      data: {
        successCount,
        failureCount: total - successCount,
        total,
        rate,
        days, // null = all-time
      },
    };
  } catch (err) {
    const label = days !== null ? `${days}-day` : 'all-time';
    logger.error(`Error calculating ${label} success rate`, { error: err.message });
    return { success: false, error: { code: 'CALC_ERROR', message: err.message } };
  }
}

/**
 * Get full success rate stats (30 days + all-time)
 * Used by /metricas command for detailed display
 *
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getSuccessRateStats() {
  try {
    const [thirtyDayResult, allTimeResult] = await Promise.all([
      getSuccessRateForDays(30),
      getSuccessRateForDays(null),
    ]);

    if (!thirtyDayResult.success) return thirtyDayResult;
    if (!allTimeResult.success) return allTimeResult;

    const stats = {
      allTime: {
        success: allTimeResult.data.successCount,
        total: allTimeResult.data.total,
        rate: allTimeResult.data.rate,
      },
      last30Days: {
        success: thirtyDayResult.data.successCount,
        total: thirtyDayResult.data.total,
        rate: thirtyDayResult.data.rate,
      },
      // Convenience accessors
      rateAllTime: allTimeResult.data.rate,
      rate30Days: thirtyDayResult.data.rate,
    };

    logger.info('Success rate calculated', {
      allTimeRate: allTimeResult.data.rate?.toFixed(1),
      recentRate: thirtyDayResult.data.rate?.toFixed(1),
    });

    return { success: true, data: stats };
  } catch (err) {
    logger.error('Error calculating success rate stats', { error: err.message });
    return { success: false, error: { code: 'CALC_ERROR', message: err.message } };
  }
}

/**
 * Get detailed betting statistics
 *
 * METRICS:
 * - totalPosted: Count of bets with telegram_posted_at (actually posted to group)
 * - totalCompleted: Count of bets with bet_result 'success' or 'failure'
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
        bet_result,
        odds_at_post,
        result_updated_at,
        telegram_posted_at
      `)
      .eq('bet_status', 'posted')
      .order('telegram_posted_at', { ascending: false });

    if (error) {
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    // Calculate stats by market
    const byMarket = {};
    for (const bet of data || []) {
      if (!['success', 'failure'].includes(bet.bet_result)) continue;

      const market = bet.bet_market || 'unknown';
      if (!byMarket[market]) {
        byMarket[market] = { success: 0, failure: 0 };
      }
      byMarket[market][bet.bet_result]++;
    }

    // Calculate average odds
    const completedBets = data?.filter(b => ['success', 'failure'].includes(b.bet_result)) || [];
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
 * @param {object} stats - Stats object from getSuccessRateStats
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

/**
 * Categoriza mercado de aposta em categoria agregada
 * Categorias: Gols, Escanteios, Cartões, BTTS, Outros
 *
 * @param {string} market - Nome do mercado (ex: "Ambas Marcam", "Over 2.5 Gols")
 * @returns {string} - Categoria do mercado
 */
function categorizeMarket(market) {
  const m = (market || '').toLowerCase();
  if (m.includes('escanteio') || m.includes('corner')) return 'Escanteios';
  if (m.includes('cartõ') || m.includes('cartao') || m.includes('cartoe') || m.includes('card')) return 'Cartões';
  // BTTS: requer "ambas" ou "btts" - evita falso positivo com "marcam" isolado
  if (m.includes('ambas') || m.includes('btts')) return 'BTTS';
  if (m.includes('gol') || m.includes('goal')) return 'Gols';
  return 'Outros';
}

/**
 * Busca estatísticas de acerto para todos os pares liga/categoria
 * Usado pelo /apostas para exibir taxa histórica
 *
 * @returns {Promise<{success: boolean, data?: Object.<string, {rate: number, wins: number, total: number}>, error?: object}>}
 */
async function getAllPairStats() {
  try {
    const { data, error } = await supabase
      .from('suggested_bets')
      .select(`
        bet_market,
        bet_result,
        league_matches!inner (
          league_seasons!inner (league_name, country)
        )
      `)
      .in('bet_result', ['success', 'failure']);

    if (error) {
      logger.error('Failed to fetch pair stats', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const pairs = {};
    for (const bet of data || []) {
      const leagueInfo = bet.league_matches?.league_seasons;
      if (!leagueInfo || !leagueInfo.country || !leagueInfo.league_name) continue;

      const league = `${leagueInfo.country} - ${leagueInfo.league_name}`;
      const category = categorizeMarket(bet.bet_market);
      const key = `${league}|${category}`;

      if (!pairs[key]) pairs[key] = { wins: 0, total: 0 };
      pairs[key].total++;
      if (bet.bet_result === 'success') pairs[key].wins++;
    }

    // Calcular rate e filtrar mínimo 3 apostas
    const stats = {};
    for (const [key, v] of Object.entries(pairs)) {
      if (v.total >= 3) {
        stats[key] = {
          rate: (v.wins / v.total) * 100,
          wins: v.wins,
          total: v.total
        };
      }
    }

    logger.debug('Pair stats calculated', { pairsCount: Object.keys(stats).length });
    return { success: true, data: stats };
  } catch (err) {
    logger.error('Error calculating pair stats', { error: err.message });
    return { success: false, error: { code: 'CALC_ERROR', message: err.message } };
  }
}

module.exports = {
  getSuccessRateForDays,
  getSuccessRateStats,
  getDetailedStats,
  formatStatsMessage,
  categorizeMarket,
  getAllPairStats,
};
