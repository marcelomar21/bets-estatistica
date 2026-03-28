/**
 * Art Generator Service - Generate daily hit images using @napi-rs/canvas
 *
 * Creates PNG images showing yesterday's successful bets for each group.
 * Image format: 1080x1350 (Stories/Telegram optimized)
 */
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../../lib/logger');

// Image dimensions (Stories/Telegram format)
const WIDTH = 1080;
const HEIGHT = 1350;

// Color palette (Phase 1: fixed for all groups)
const COLORS = {
  bgTop: '#0f0c29',
  bgMiddle: '#302b63',
  bgBottom: '#24243e',
  accent: '#e94560',
  textPrimary: '#ffffff',
  textSecondary: '#b8b8d0',
  cardBg: 'rgba(255, 255, 255, 0.06)',
  cardBorder: 'rgba(255, 255, 255, 0.12)',
  success: '#4ade80',
  divider: 'rgba(255, 255, 255, 0.15)',
};

// Layout constants
const PADDING = 60;
const MAX_BETS_SHOWN = 8;

/**
 * Format date in Brazilian Portuguese
 * @param {Date} date
 * @returns {string} e.g. "26 de março de 2026"
 */
function formatDatePtBr(date) {
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

/**
 * Draw a vertical gradient background
 * @param {CanvasRenderingContext2D} ctx
 */
function drawBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, COLORS.bgTop);
  gradient.addColorStop(0.5, COLORS.bgMiddle);
  gradient.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/**
 * Draw the header section (title + date)
 * @param {CanvasRenderingContext2D} ctx
 * @param {Date} targetDate - The date of the results (yesterday)
 * @returns {number} Y position after header
 */
function drawHeader(ctx, targetDate) {
  let y = PADDING + 40;

  // Emoji + title
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🎯 ACERTOS DE ONTEM', WIDTH / 2, y);
  y += 50;

  // Date
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '32px sans-serif';
  ctx.fillText(formatDatePtBr(targetDate), WIDTH / 2, y);
  y += 50;

  // Divider line
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
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} bet - Bet data
 * @param {number} y - Y position
 * @returns {number} Y position after card
 */
function drawBetCard(ctx, bet, y) {
  const cardX = PADDING;
  const cardW = WIDTH - PADDING * 2;
  const cardH = 110;
  const cardR = 16;

  // Card background
  ctx.fillStyle = COLORS.cardBg;
  ctx.beginPath();
  ctx.roundRect(cardX, y, cardW, cardH, cardR);
  ctx.fill();

  // Card border
  ctx.strokeStyle = COLORS.cardBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cardX, y, cardW, cardH, cardR);
  ctx.stroke();

  // Success indicator
  ctx.fillStyle = COLORS.success;
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('✅', cardX + 20, y + 45);

  // Match name (truncate if needed)
  const matchText = `${bet.homeTeamName} x ${bet.awayTeamName}`;
  const displayMatch = matchText.length > 35 ? matchText.substring(0, 32) + '...' : matchText;
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(displayMatch, cardX + 65, y + 45);

  // Market + Odd
  const marketText = bet.market || bet.betMarket || 'Mercado';
  const oddText = bet.oddsAtPost ? `Odd ${Number(bet.oddsAtPost).toFixed(2)}` : '';
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '26px sans-serif';
  ctx.fillText(`${marketText} — ${oddText}`, cardX + 65, y + 85);

  return y + cardH + 12;
}

/**
 * Draw the footer section (success rate + group name)
 * @param {CanvasRenderingContext2D} ctx
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
  const rate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;
  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`📊 ${successCount}/${totalCount} acertos (${rate}%)`, WIDTH / 2, y);
  y += 60;

  // Group name
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '28px sans-serif';
  ctx.fillText(groupName, WIDTH / 2, y);
}

/**
 * Generate a daily hits art image
 * @param {object} params
 * @param {Array<object>} params.successBets - Successful bets from yesterday
 * @param {number} params.totalBets - Total resolved bets (success + failure)
 * @param {string} params.groupName - Name of the group
 * @param {Date} params.targetDate - The date being reported (yesterday)
 * @returns {Promise<{success: boolean, data?: {filePath: string}, error?: object}>}
 */
async function generateDailyArt({ successBets, totalBets, groupName, targetDate }) {
  try {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. Background
    drawBackground(ctx);

    // 2. Header
    let y = drawHeader(ctx, targetDate);

    // 3. Bet cards (max 8)
    const betsToShow = successBets.slice(0, MAX_BETS_SHOWN);
    for (const bet of betsToShow) {
      y = drawBetCard(ctx, bet, y);
    }

    // "e mais X acertos" if truncated
    if (successBets.length > MAX_BETS_SHOWN) {
      const extra = successBets.length - MAX_BETS_SHOWN;
      y += 10;
      ctx.fillStyle = COLORS.accent;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`e mais ${extra} acerto${extra > 1 ? 's' : ''}!`, WIDTH / 2, y);
      y += 40;
    }

    // 4. Footer — push to bottom with minimum spacing
    const footerY = Math.max(y + 30, HEIGHT - 200);
    drawFooter(ctx, successBets.length, totalBets, groupName, footerY);

    // 5. Export PNG to tmp file
    const fileName = `daily-art-${groupName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.png`;
    const filePath = path.join(os.tmpdir(), fileName);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);

    logger.info('[artGenerator] Image generated', {
      filePath,
      betsShown: betsToShow.length,
      totalSuccess: successBets.length,
      totalBets,
    });

    return { success: true, data: { filePath } };
  } catch (err) {
    logger.error('[artGenerator] Failed to generate image', { error: err.message, groupName });
    return { success: false, error: { code: 'ART_GENERATION_ERROR', message: err.message } };
  }
}

/**
 * Generate the caption text for the daily art post
 * @param {object} params
 * @param {number} params.successCount
 * @param {number} params.totalCount
 * @param {string} params.groupName
 * @param {Date} params.targetDate
 * @returns {string}
 */
function generateCaption({ successCount, totalCount, groupName, targetDate }) {
  const rate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;
  const dateStr = formatDatePtBr(targetDate);
  return [
    `🎯 *Acertos de ${dateStr}*`,
    '',
    `📊 ${successCount}/${totalCount} apostas certas *(${rate}%)*`,
    '',
    `🔥 Bora pra cima! Amanhã tem mais!`,
    '',
    `_${groupName}_`,
  ].join('\n');
}

/**
 * Cleanup a temporary art file
 * @param {string} filePath
 */
function cleanupArtFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logger.warn('[artGenerator] Failed to cleanup temp file', { filePath, error: err.message });
  }
}

module.exports = {
  generateDailyArt,
  generateCaption,
  cleanupArtFile,
  formatDatePtBr,
  // Exported for testing
  COLORS,
  MAX_BETS_SHOWN,
};
