/**
 * Formatters Module - Shared formatting helpers for Telegram messages
 *
 * Stories covered:
 * - 14.5: Implementar agrupamento por dia
 *
 * Provides consistent bet list formatting with day grouping for:
 * - /apostas command
 * - /filtrar command
 * - /fila command
 */

/**
 * Get day label (HOJE/AMANHA/date with weekday)
 * @param {string} dateKey - Date in YYYY-MM-DD format
 * @returns {string}
 */
function getDayLabel(dateKey) {
  const date = new Date(dateKey + 'T12:00:00'); // Avoid timezone issues
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const formatted = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  if (isToday) return `HOJE - ${formatted}`;
  if (isTomorrow) return `AMANHA - ${formatted}`;

  const weekday = date.toLocaleDateString('pt-BR', {
    weekday: 'short',
    timeZone: 'America/Sao_Paulo',
  });
  return `${formatted} (${weekday})`;
}

/**
 * Group bets by day (YYYY-MM-DD key)
 * @param {Array} bets - Array of bet objects (must have kickoffTime)
 * @returns {Object} - { 'YYYY-MM-DD': [bets] } sorted by date
 */
function groupBetsByDay(bets) {
  const grouped = {};

  for (const bet of bets) {
    const kickoff = new Date(bet.kickoffTime);
    const dateKey = kickoff.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(bet);
  }

  // Sort keys chronologically
  const sortedKeys = Object.keys(grouped).sort();
  const sortedGrouped = {};
  for (const key of sortedKeys) {
    sortedGrouped[key] = grouped[key];
  }

  return sortedGrouped;
}

/**
 * Format bet list with day grouping
 * @param {Array} bets - Array of bet objects (must have kickoffTime)
 * @param {Function} formatBetFn - Function to format single bet (bet) => string
 * @returns {string} Formatted message with day headers
 */
function formatBetListWithDays(bets, formatBetFn) {
  if (!bets || bets.length === 0) {
    return 'Nenhuma aposta encontrada.';
  }

  const grouped = groupBetsByDay(bets);
  const lines = [];
  let isFirst = true;

  for (const [dateKey, dayBets] of Object.entries(grouped)) {
    const dayLabel = getDayLabel(dateKey);

    // Add separator between day groups
    if (!isFirst) {
      lines.push('');
    }
    lines.push(`━━━━ *${dayLabel}* ━━━━`);
    lines.push('');

    for (const bet of dayBets) {
      lines.push(formatBetFn(bet));
    }

    isFirst = false;
  }

  return lines.join('\n').trim();
}

module.exports = {
  getDayLabel,
  groupBetsByDay,
  formatBetListWithDays,
};
