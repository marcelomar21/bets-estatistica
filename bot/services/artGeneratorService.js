/**
 * Art Generator Service - Generate daily "hits" celebratory images
 *
 * Uses @napi-rs/canvas (Skia bindings) to create PNG images
 * showing yesterday's successful bets for each group.
 *
 * Image format: 1080x1350 (Stories/Telegram optimized)
 */
const { createCanvas } = require('@napi-rs/canvas');
const logger = require('../../lib/logger');

// Layout constants
const WIDTH = 1080;
const HEIGHT = 1350;
const PADDING = 60;
const MAX_BETS_DISPLAY = 8;

// Color palette (default — Phase 2 will allow per-group customization)
const COLORS = {
  bgGradientStart: '#0f0c29',
  bgGradientEnd: '#302b63',
  accent: '#e94560',
  textPrimary: '#ffffff',
  textSecondary: '#b0b0b0',
  successGreen: '#00e676',
  divider: 'rgba(255, 255, 255, 0.15)',
  cardBg: 'rgba(255, 255, 255, 0.06)',
};

// Font stack (system fonts available on Render linux-x64)
const FONT_BOLD = 'bold';
const FONT_REGULAR = '';

/**
 * Format a date as "26 de marco de 2026" in pt-BR
 * @param {Date} date
 * @returns {string}
 */
function formatDatePtBr(date) {
  const months = [
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
}

/**
 * Truncate text to fit within a max pixel width on the canvas
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string}
 */
function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

/**
 * Draw the background gradient
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 */
function drawBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, COLORS.bgGradientStart);
  gradient.addColorStop(0.5, COLORS.bgGradientEnd);
  gradient.addColorStop(1, COLORS.bgGradientStart);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/**
 * Draw the header section (emoji, title, date)
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} dateStr - Formatted date string
 * @returns {number} - Y position after header
 */
function drawHeader(ctx, dateStr) {
  let y = PADDING + 80;

  // Title
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = `${FONT_BOLD} 56px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('ACERTOS DE ONTEM', WIDTH / 2, y);
  y += 50;

  // Date
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = `${FONT_REGULAR} 32px sans-serif`;
  ctx.fillText(dateStr, WIDTH / 2, y);
  y += 50;

  // Divider
  ctx.strokeStyle = COLORS.divider;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING, y);
  ctx.lineTo(WIDTH - PADDING, y);
  ctx.stroke();
  y += 40;

  return y;
}

/**
 * Draw a single bet card
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {object} bet - Bet data
 * @param {number} y - Y position
 * @returns {number} - Y position after card
 */
function drawBetCard(ctx, bet, y) {
  const cardX = PADDING;
  const cardW = WIDTH - PADDING * 2;
  const cardH = 100;
  const cardRadius = 12;

  // Card background
  ctx.fillStyle = COLORS.cardBg;
  ctx.beginPath();
  ctx.roundRect(cardX, y, cardW, cardH, cardRadius);
  ctx.fill();

  // Check icon
  ctx.fillStyle = COLORS.successGreen;
  ctx.font = `${FONT_BOLD} 28px sans-serif`;
  ctx.textAlign = 'left';
  const iconX = cardX + 20;
  const textBaseY = y + 40;

  // Match name (home x away)
  const matchName = `${bet.home_team_name} x ${bet.away_team_name}`;
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = `${FONT_BOLD} 28px sans-serif`;
  const matchX = iconX + 10;
  const maxMatchWidth = cardW - 60;
  ctx.fillText(truncateText(ctx, matchName, maxMatchWidth), matchX, textBaseY);

  // Market + Odd
  const marketLabel = bet.market || bet.bet_market || 'Mercado';
  const oddValue = bet.odds_at_post ? parseFloat(bet.odds_at_post).toFixed(2) : '—';
  const detailText = `${marketLabel} — Odd ${oddValue}`;
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = `${FONT_REGULAR} 24px sans-serif`;
  ctx.fillText(truncateText(ctx, detailText, maxMatchWidth), matchX, textBaseY + 36);

  return y + cardH + 12;
}

/**
 * Draw footer with success rate and group name
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} successCount
 * @param {number} totalCount
 * @param {string} groupName
 * @param {number} y - Y position
 */
function drawFooter(ctx, successCount, totalCount, groupName, y) {
  // Divider
  ctx.strokeStyle = COLORS.divider;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING, y);
  ctx.lineTo(WIDTH - PADDING, y);
  ctx.stroke();
  y += 50;

  // Success rate
  const rate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(0) : '0';
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.successGreen;
  ctx.font = `${FONT_BOLD} 48px sans-serif`;
  ctx.fillText(`${successCount}/${totalCount} acertos (${rate}%)`, WIDTH / 2, y);
  y += 60;

  // Group name
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = `${FONT_REGULAR} 28px sans-serif`;
  ctx.fillText(groupName, WIDTH / 2, y);
}

/**
 * Generate the daily art image as a PNG buffer
 * @param {object} params
 * @param {Array<object>} params.successBets - Bets with bet_result='success'
 * @param {number} params.totalResolved - Total resolved bets (success + failure)
 * @param {string} params.groupName - Display name of the group
 * @param {Date} params.date - The date being reported (yesterday)
 * @returns {Promise<{success: boolean, data?: {buffer: Buffer}, error?: object}>}
 */
async function generateDailyArtImage({ successBets, totalResolved, groupName, date }) {
  try {
    if (!successBets || successBets.length === 0) {
      return { success: false, error: { code: 'NO_BETS', message: 'No successful bets to render' } };
    }

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. Background
    drawBackground(ctx);

    // 2. Header
    const dateStr = formatDatePtBr(date);
    let y = drawHeader(ctx, dateStr);

    // 3. Bet cards (max 8, then "e mais X")
    const displayBets = successBets.slice(0, MAX_BETS_DISPLAY);
    const remaining = successBets.length - displayBets.length;

    for (const bet of displayBets) {
      y = drawBetCard(ctx, bet, y);
    }

    // "e mais X acertos" overflow indicator
    if (remaining > 0) {
      y += 10;
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.accent;
      ctx.font = `${FONT_BOLD} 28px sans-serif`;
      ctx.fillText(`e mais ${remaining} acerto${remaining > 1 ? 's' : ''}`, WIDTH / 2, y);
      y += 40;
    }

    // 4. Footer
    y += 20;
    drawFooter(ctx, successBets.length, totalResolved, groupName, y);

    // 5. Export PNG buffer
    const buffer = canvas.toBuffer('image/png');

    logger.info('[artGenerator] Image generated', {
      groupName,
      betsShown: displayBets.length,
      totalSuccess: successBets.length,
      totalResolved,
      bufferSize: buffer.length,
    });

    return { success: true, data: { buffer } };
  } catch (err) {
    logger.error('[artGenerator] Failed to generate image', { error: err.message, groupName });
    return { success: false, error: { code: 'CANVAS_ERROR', message: err.message } };
  }
}

/**
 * Build the caption text for the daily art post (Phase 1: fixed template)
 * @param {number} successCount
 * @param {number} totalResolved
 * @param {string} groupName
 * @param {Date} date
 * @returns {string}
 */
function buildCaption(successCount, totalResolved, groupName, date) {
  const rate = totalResolved > 0 ? ((successCount / totalResolved) * 100).toFixed(0) : '0';
  const dateStr = formatDatePtBr(date);

  return [
    `*ACERTOS DE ONTEM — ${dateStr}*`,
    '',
    `${successCount}/${totalResolved} acertos (${rate}%)`,
    '',
    `_${groupName}_`,
  ].join('\n');
}

module.exports = {
  generateDailyArtImage,
  buildCaption,
  formatDatePtBr,
  truncateText,
  // Exported for testing
  MAX_BETS_DISPLAY,
  COLORS,
  WIDTH,
  HEIGHT,
};
