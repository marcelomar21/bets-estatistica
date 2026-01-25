/**
 * Job Warn Module - Centralized warn functions for all jobs
 *
 * Stories covered:
 * - 14.2: Criar módulo de warns
 *
 * Provides consistent warn formatting for:
 * - Post job completion
 * - Scraping job completion
 * - Analysis job completion
 */

const { sendToAdmin } = require('../telegram');
const logger = require('../../lib/logger');
const {
  formatDateBR,
  formatTime,
  getDateKey,
  getTodayKey,
  getTomorrowKey,
} = require('../../lib/utils');

// ============================================
// Helper Functions
// ============================================

/**
 * Get period name in Portuguese
 * @param {string} period - 'morning' | 'afternoon' | 'night'
 * @returns {string}
 */
function getPeriodName(period) {
  const names = {
    morning: 'MANHA',
    afternoon: 'TARDE',
    night: 'NOITE',
  };
  return names[period] || period.toUpperCase();
}

/**
 * Get next posting time based on current hour (BRT)
 * @returns {string}
 */
function getNextPostTime() {
  const now = new Date();
  const brtString = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
  const hour = parseInt(brtString, 10);

  if (hour < 10) return '10:00';
  if (hour < 15) return '15:00';
  if (hour < 22) return '22:00';
  return '10:00 (amanha)';
}

/**
 * Get day label (HOJE/AMANHA/date) based on BRT
 * @param {Date} matchDate
 * @returns {string}
 */
function getDayLabel(matchDate) {
  const matchDayStr = getDateKey(matchDate);
  const formattedDate = formatDateBR(matchDate);

  if (matchDayStr === getTodayKey()) {
    return `HOJE - ${formattedDate}`;
  }
  if (matchDayStr === getTomorrowKey()) {
    return `AMANHA - ${formattedDate}`;
  }
  return formattedDate;
}

/**
 * Group bets by day (HOJE/AMANHA)
 * @param {Array} bets - Array of bet objects with matchTime
 * @returns {Object} - Grouped by day label
 */
function groupBetsByDay(bets) {
  const groups = {};

  for (const bet of bets) {
    const matchDate = new Date(bet.matchTime || bet.match_time);
    const dayLabel = getDayLabel(matchDate);

    if (!groups[dayLabel]) {
      groups[dayLabel] = [];
    }
    groups[dayLabel].push(bet);
  }

  return groups;
}

/**
 * Get status emoji and text for a bet
 * @param {object} bet
 * @returns {string}
 */
function getBetStatusDisplay(bet) {
  // Explicit status check first
  const status = bet.betStatus || bet.bet_status;
  if (status === 'ready') return '\u2705 Pronta';
  if (status === 'posted') return '\u2705 Postada';

  // Issue checks
  if (!bet.deepLink && !bet.deep_link) {
    return '\u26a0\ufe0f Sem link';
  }
  if (!bet.odds || bet.odds < 1.6) {
    return '\u26a0\ufe0f Odds baixa';
  }

  // Fallback safe instead of "Pronta"
  return status ? `\u2139\ufe0f ${status}` : '\u2753 Pendente';
}

/**
 * Format a single bet for warn message
 * @param {object} bet
 * @param {boolean} includeTime - Include match time
 * @returns {string}
 */
function formatBetLine(bet, includeTime = true) {
  const id = bet.id;
  const home = bet.homeTeamName || bet.home_team_name;
  const away = bet.awayTeamName || bet.away_team_name;
  const market = bet.betMarket || bet.bet_market;
  const pick = bet.betPick || bet.bet_pick;
  const odds = bet.odds ? bet.odds.toFixed(2) : '-';
  const matchTime = bet.matchTime || bet.match_time;

  let line = `\u26bd #${id} ${home} vs ${away}`;

  if (includeTime && matchTime) {
    const time = formatTime(new Date(matchTime));
    line += ` - ${time}`;
  }

  line += `\n   \ud83c\udfaf ${market}: ${pick} \u2502 \ud83d\udcc8 ${odds}`;

  return line;
}

/**
 * Format bet list for warn message (posted bets)
 * @param {Array} bets
 * @returns {string}
 */
function formatPostedBetsList(bets) {
  if (!bets || bets.length === 0) {
    return 'Nenhuma aposta postada';
  }

  return bets
    .map((bet) => {
      const id = bet.id;
      const home = bet.homeTeamName || bet.home_team_name;
      const away = bet.awayTeamName || bet.away_team_name;
      const market = bet.betMarket || bet.bet_market;
      const odds = bet.odds ? `@ ${bet.odds.toFixed(2)}` : '';
      return `\u2705 #${id} ${home} vs ${away} - ${market} ${odds}`;
    })
    .join('\n');
}

// ============================================
// Main Warn Functions
// ============================================

/**
 * Send warn after posting job completes
 * @param {string} period - 'morning' | 'afternoon' | 'night'
 * @param {Array} postedBets - Bets that were posted
 * @param {Array} upcomingBets - Bets for next 2 days
 * @param {Array} pendingActions - Actions needed (sem link, sem odds)
 * @returns {Promise<{success: boolean}>}
 */
async function sendPostWarn(period, postedBets = [], upcomingBets = [], pendingActions = []) {
  const periodName = getPeriodName(period);

  let text = `\ud83d\udce4 *POSTAGEM ${periodName} CONCLUIDA* \u2705\n\n`;
  text += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';

  // Posted bets section
  text += '*APOSTAS POSTADAS:*\n';
  text += formatPostedBetsList(postedBets);
  text += '\n\n';

  // Upcoming bets section
  if (upcomingBets && upcomingBets.length > 0) {
    text += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';
    text += '\ud83d\udcca *PROXIMOS 2 DIAS*\n\n';

    const grouped = groupBetsByDay(upcomingBets);

    for (const [dayLabel, bets] of Object.entries(grouped)) {
      text += `*${dayLabel}:*\n`;

      for (const bet of bets) {
        text += formatBetLine(bet, true);
        text += ` \u2502 ${getBetStatusDisplay(bet)}\n\n`;
      }
    }
  }

  // Pending actions section
  if (pendingActions && pendingActions.length > 0) {
    text += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';
    text += '\u26a0\ufe0f *ACOES PENDENTES:*\n';

    pendingActions.forEach((action, idx) => {
      text += `${idx + 1}. ${action}\n`;
    });
    text += '\n';
  }

  // Next post time
  text += `\ud83d\udca1 Proxima postagem: ${getNextPostTime()}`;

  logger.info('Sending post warn', { period, postedCount: postedBets.length, upcomingCount: upcomingBets.length });

  return sendToAdmin(text);
}

/**
 * Send warn after scraping job completes (Epic 15)
 * @param {Array} updatedBets - [{id, oldOdds, newOdds}]
 * @param {Array} failedBets - [{id, error}]
 * @param {object} statusForNextPost - Summary for next posting
 * @returns {Promise<{success: boolean}>}
 */
async function sendScrapingWarn(updatedBets = [], failedBets = [], statusForNextPost = {}) {
  let text = '\ud83d\udd0d *SCRAPING CONCLUIDO*\n\n';

  // Updated bets section
  if (updatedBets && updatedBets.length > 0) {
    text += '*ODDS ATUALIZADAS:*\n';
    for (const bet of updatedBets) {
      const oldOdds = bet.oldOdds ? bet.oldOdds.toFixed(2) : '-';
      const newOdds = bet.newOdds ? bet.newOdds.toFixed(2) : '-';
      text += `\ud83d\udcc8 #${bet.id}: ${oldOdds} \u2192 ${newOdds}\n`;
    }
    text += '\n';
  } else {
    text += '*ODDS ATUALIZADAS:* Nenhuma mudanca\n\n';
  }

  // Failed bets section
  if (failedBets && failedBets.length > 0) {
    text += '\u274c *FALHAS:*\n';
    for (const bet of failedBets) {
      text += `#${bet.id}: ${bet.error || 'Erro desconhecido'}\n`;
    }
    text += '\n';
  }

  // Status for next post
  if (statusForNextPost) {
    text += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';
    text += '*STATUS PARA PROXIMA POSTAGEM:*\n';
    text += `\u2705 Prontas: ${statusForNextPost.ready || 0}\n`;
    text += `\u26a0\ufe0f Sem link: ${statusForNextPost.noLink || 0}\n`;
    text += `\u26a0\ufe0f Odds baixa: ${statusForNextPost.lowOdds || 0}\n`;
  }

  logger.info('Sending scraping warn', {
    updatedCount: updatedBets.length,
    failedCount: failedBets.length,
  });

  return sendToAdmin(text);
}

/**
 * Send warn after analysis job creates new bets
 * @param {Array} newBets - Array of new bet objects or IDs
 * @returns {Promise<{success: boolean}>}
 */
async function sendAnalysisWarn(newBets = []) {
  let text = '\ud83e\udde0 *ANALISE CONCLUIDA*\n\n';

  if (newBets && newBets.length > 0) {
    text += '*NOVAS APOSTAS GERADAS:*\n';

    const ids = newBets.map((bet) => (typeof bet === 'object' ? bet.id : bet));
    text += `IDs: ${ids.join(', ')}\n\n`;
    text += `\ud83d\udcca Total: ${newBets.length} aposta(s)\n`;
  } else {
    text += 'Nenhuma nova aposta gerada\n';
  }

  text += `\n\ud83d\udca1 Proxima postagem: ${getNextPostTime()}`;

  logger.info('Sending analysis warn', { newBetsCount: newBets.length });

  return sendToAdmin(text);
}

module.exports = {
  sendPostWarn,
  sendScrapingWarn,
  sendAnalysisWarn,
  // Export helpers for testing
  getPeriodName,
  getNextPostTime,
  groupBetsByDay,
  formatBetLine,
  formatPostedBetsList,
  getBetStatusDisplay,
};
