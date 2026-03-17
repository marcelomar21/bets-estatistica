/**
 * Format a numeric price as BRL currency string.
 * Uses dot as thousands separator and comma as decimal separator
 * to match Intl.NumberFormat('pt-BR') output used in admin panel.
 * @param {number|null|undefined} price - Numeric price value
 * @returns {string|null} Formatted string (e.g. "R$ 1.000,00") or null if invalid
 */
function formatBRL(price) {
  if (price == null || isNaN(price)) return null;
  const parts = Number(price).toFixed(2).split('.');
  // Add thousands separator (dot) to integer part
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + parts.join(',');
}

module.exports = { formatBRL };
