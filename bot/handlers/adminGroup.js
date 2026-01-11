/**
 * Admin Group Message Handler
 * Handles incoming messages in the admin group, primarily for receiving deep links
 */
const { config } = require('../../lib/config');
const logger = require('../../lib/logger');
const { getBetById, updateBetLink, updateBetOdds, getAvailableBets } = require('../services/betService');
const { confirmLinkReceived } = require('../services/alertService');

// Regex to match "ID: link" pattern
const LINK_PATTERN = /^(\d+):\s*(https?:\/\/\S+)/i;

// Regex to match "/odds ID valor" command
const ODDS_PATTERN = /^\/odds\s+(\d+)\s+([\d.,]+)/i;

// Regex to match "/apostas" command (Story 8.1)
const APOSTAS_PATTERN = /^\/apostas$/i;

/**
 * Validate if URL is from a valid bookmaker
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
function isValidBookmakerUrl(url) {
  try {
    const parsed = new URL(url);
    const validDomains = config.betting.validBookmakerDomains;
    return validDomains.some(domain => parsed.hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Handle /odds command to set manual odds
 */
async function handleOddsCommand(bot, msg, betId, oddsValue) {
  // Parse odds value (handle both 1.85 and 1,85)
  const odds = parseFloat(oddsValue.replace(',', '.'));

  if (isNaN(odds) || odds < 1) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Odds inválida: ${oddsValue}\nUse um valor decimal, ex: 1.85 ou 2,10`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Find bet using betService
  const betResult = await getBetById(betId);

  if (!betResult.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Aposta #${betId} não encontrada.`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const bet = betResult.data;

  // Update bet with manual odds using betService
  const updateResult = await updateBetOdds(betId, odds, `Odds manual via admin: ${odds}`);

  if (!updateResult.success) {
    logger.error('Failed to save manual odds', { betId, error: updateResult.error.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao salvar odds: ${updateResult.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Confirm
  const match = `${bet.homeTeamName} vs ${bet.awayTeamName}`;
  await bot.sendMessage(
    msg.chat.id,
    `✅ Odds atualizada!\n\n🏟️ ${match}\n📊 ${bet.betMarket}\n💰 Odds: ${odds}\n\n_Agora envie o link: \`${betId}: URL\`_`,
    {
      reply_to_message_id: msg.message_id,
      parse_mode: 'Markdown',
    }
  );

  logger.info('Manual odds saved', { betId, odds });
}

/**
 * Handle /apostas command - List all available bets (Story 8.1)
 */
async function handleApostasCommand(bot, msg) {
  logger.info('Received /apostas command', { chatId: msg.chat.id, userId: msg.from?.id });

  const result = await getAvailableBets();

  if (!result.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao buscar apostas: ${result.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const bets = result.data;

  if (bets.length === 0) {
    await bot.sendMessage(
      msg.chat.id,
      '📋 Nenhuma aposta disponível no momento.\n\n_Aguarde a geração de novas análises._',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Format message
  const lines = [`📋 *APOSTAS DISPONÍVEIS* (${bets.length})\n`];

  bets.forEach((bet, index) => {
    const kickoff = new Date(bet.kickoffTime);
    const dateStr = kickoff.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
    const timeStr = kickoff.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const linkIcon = bet.hasLink ? '✅' : '❌';
    const statusEmoji = getStatusEmoji(bet.betStatus);
    const num = getNumberEmoji(index + 1);

    lines.push(`${num} *[ID:${bet.id}]* ${bet.homeTeamName} vs ${bet.awayTeamName}`);
    lines.push(`   📅 ${dateStr} às ${timeStr}`);
    lines.push(`   🎯 ${bet.betMarket}`);
    lines.push(`   📊 Odd: ${bet.odds?.toFixed(2) || 'N/A'} | 🔗 ${linkIcon} ${statusEmoji}`);
    lines.push('');
  });

  lines.push('💡 *Comandos:*');
  lines.push('• Adicionar link: `ID: URL`');
  lines.push('• Ajustar odd: `/odds ID valor`');

  await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });

  logger.info('Listed available bets', { count: bets.length });
}

/**
 * Get emoji for bet status
 */
function getStatusEmoji(status) {
  const statusMap = {
    generated: '🆕',
    pending_link: '⏳',
    ready: '✅',
    posted: '📤',
  };
  return statusMap[status] || '';
}

/**
 * Get number emoji
 */
function getNumberEmoji(num) {
  const emojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  if (num <= 10) return emojis[num];
  return `${num}.`;
}

/**
 * Handle messages in admin group
 * @param {TelegramBot} bot - Bot instance
 * @param {object} msg - Telegram message object
 */
async function handleAdminMessage(bot, msg) {
  const text = msg.text?.trim();
  if (!text) return;

  // Check if message is /apostas command (Story 8.1)
  if (APOSTAS_PATTERN.test(text)) {
    await handleApostasCommand(bot, msg);
    return;
  }

  // Check if message is /odds command
  const oddsMatch = text.match(ODDS_PATTERN);
  if (oddsMatch) {
    const betId = parseInt(oddsMatch[1], 10);
    const oddsValue = oddsMatch[2];
    await handleOddsCommand(bot, msg, betId, oddsValue);
    return;
  }

  // Check if message matches link pattern
  const match = text.match(LINK_PATTERN);
  if (!match) return;

  const betId = parseInt(match[1], 10);
  const deepLink = match[2];

  logger.info('Link received', { betId, link: deepLink.substring(0, 50) });

  // Validate URL
  if (!isValidBookmakerUrl(deepLink)) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Link inválido. Use links do Bet365 ou Betano.\n\nRecebido: ${deepLink}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Find bet using betService
  const betResult = await getBetById(betId);

  if (!betResult.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Aposta #${betId} não encontrada.`,
      { reply_to_message_id: msg.message_id }
    );
    logger.warn('Bet not found for link', { betId });
    return;
  }

  const bet = betResult.data;

  // If already posted, don't allow changes
  if (bet.betStatus === 'posted') {
    await bot.sendMessage(
      msg.chat.id,
      `🔒 Aposta #${betId} já foi publicada. Link não pode ser alterado.`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // If already has link and status is ready, warn but allow update
  if (bet.deepLink && bet.betStatus === 'ready') {
    await bot.sendMessage(
      msg.chat.id,
      `⚠️ Aposta #${betId} já tinha link. Atualizando...`,
      { reply_to_message_id: msg.message_id }
    );
  }

  // Update bet with link using betService
  const updateResult = await updateBetLink(betId, deepLink);

  if (!updateResult.success) {
    logger.error('Failed to save link', { betId, error: updateResult.error.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao salvar link: ${updateResult.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Confirm receipt
  await confirmLinkReceived({
    homeTeamName: bet.homeTeamName,
    awayTeamName: bet.awayTeamName,
    betMarket: bet.betMarket,
    betPick: bet.betPick,
  });

  logger.info('Link saved successfully', { betId });
}

module.exports = { handleAdminMessage };
