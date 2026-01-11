/**
 * Admin Group Message Handler
 * Handles incoming messages in the admin group, primarily for receiving deep links
 */
const { config } = require('../../lib/config');
const logger = require('../../lib/logger');
const { getBetById, updateBetLink, updateBetOdds, getAvailableBets, createManualBet } = require('../services/betService');
const { confirmLinkReceived } = require('../services/alertService');
const { runEnrichment } = require('../jobs/enrichOdds');
const { runPostBets } = require('../jobs/postBets');

// Regex to match "ID: link" pattern
const LINK_PATTERN = /^(\d+):\s*(https?:\/\/\S+)/i;

// Regex to match "/odds ID valor" or "/odd ID valor" command (Story 8.2)
const ODDS_PATTERN = /^\/odds?\s+(\d+)\s+([\d.,]+)/i;

// Regex to match "/apostas" command (Story 8.1)
const APOSTAS_PATTERN = /^\/apostas$/i;

// Regex to match "/link ID URL" command (Story 8.3)
const LINK_COMMAND_PATTERN = /^\/link\s+(\d+)\s+(https?:\/\/\S+)/i;

// Regex to match "/adicionar" command (Story 8.4)
// Format: /adicionar "Time A vs Time B" "Mercado" odd [link]
const ADICIONAR_PATTERN = /^\/adicionar\s+"([^"]+)"\s+"([^"]+)"\s+([\d.,]+)(?:\s+(https?:\/\/\S+))?$/i;
// Also accept simpler format without quotes for teams
const ADICIONAR_HELP_PATTERN = /^\/adicionar$/i;

// Regex to match "/atualizar odds" command (Story 8.5)
const ATUALIZAR_ODDS_PATTERN = /^\/atualizar\s+odds$/i;

// Regex to match "/postar" command (Story 8.6)
const POSTAR_PATTERN = /^\/postar$/i;

// Regex to match "/help" command
const HELP_PATTERN = /^\/help$/i;

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
  const previousOdds = bet.odds;

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

  // Confirm with previous value (Story 8.2)
  const match = `${bet.homeTeamName} vs ${bet.awayTeamName}`;
  const oddsChange = previousOdds 
    ? `📊 ${previousOdds.toFixed(2)} → ${odds.toFixed(2)}`
    : `📊 Odds: ${odds.toFixed(2)}`;
  
  await bot.sendMessage(
    msg.chat.id,
    `✅ *Odd atualizada!*\n\n🏟️ ${match}\n🎯 ${bet.betMarket}\n${oddsChange}\n\n_Agora envie o link: \`${betId}: URL\`_`,
    {
      reply_to_message_id: msg.message_id,
      parse_mode: 'Markdown',
    }
  );

  logger.info('Manual odds saved', { betId, previousOdds, newOdds: odds });
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
 * Handle /help command - Show all admin commands
 */
async function handleHelpCommand(bot, msg) {
  const helpText = `
📚 *Comandos do Admin*

*📋 Consultas:*
/apostas - Listar apostas disponíveis
/status - Ver status do bot
/help - Ver esta ajuda

*✏️ Edição:*
/odd ID valor - Ajustar odd de aposta
/link ID URL - Adicionar link a aposta
\`ID: URL\` - Adicionar link (atalho)

*➕ Criação:*
/adicionar - Ver formato de aposta manual

*⚡ Ações:*
/atualizar odds - Forçar atualização de odds
/postar - Forçar postagem imediata

*Exemplos:*
\`/odd 45 1.90\`
\`/link 45 https://betano.com/...\`
  `.trim();

  await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
  logger.info('Help command executed');
}

/**
 * Handle /postar command - Force posting (Story 8.6)
 */
async function handlePostarCommand(bot, msg) {
  logger.info('Received /postar command', { chatId: msg.chat.id, userId: msg.from?.id });

  // Send "working" message
  const workingMsg = await bot.sendMessage(msg.chat.id, '⏳ Executando postagem... Aguarde.');

  try {
    const result = await runPostBets();

    // Delete "working" message
    try {
      await bot.deleteMessage(msg.chat.id, workingMsg.message_id);
    } catch (e) {
      // Ignore delete errors
    }

    const totalSent = (result.reposted || 0) + (result.posted || 0);

    if (totalSent === 0) {
      await bot.sendMessage(
        msg.chat.id,
        `📭 *Nenhuma aposta postada*\n\n` +
        `Não havia apostas prontas para postagem.\n\n` +
        `_Use /apostas para ver apostas disponíveis._`,
        { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
      );
    } else {
      await bot.sendMessage(
        msg.chat.id,
        `✅ *Postagem executada!*\n\n` +
        `🔄 Repostadas: ${result.reposted || 0}\n` +
        `🆕 Novas: ${result.posted || 0}\n` +
        `📤 Total enviadas: ${totalSent}`,
        { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
      );
    }

    logger.info('Posting completed via command', result);
  } catch (err) {
    logger.error('Failed to post via command', { error: err.message });

    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao executar postagem: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

/**
 * Handle /atualizar odds command - Force odds refresh (Story 8.5)
 */
async function handleAtualizarOddsCommand(bot, msg) {
  logger.info('Received /atualizar odds command', { chatId: msg.chat.id, userId: msg.from?.id });

  // Send "working" message
  const workingMsg = await bot.sendMessage(msg.chat.id, '⏳ Atualizando odds... Aguarde.');

  try {
    const result = await runEnrichment();

    // Delete "working" message
    try {
      await bot.deleteMessage(msg.chat.id, workingMsg.message_id);
    } catch (e) {
      // Ignore delete errors
    }

    await bot.sendMessage(
      msg.chat.id,
      `✅ *Odds atualizadas!*\n\n` +
      `📊 Enriquecidas: ${result.enriched || 0}\n` +
      `⏭️ Puladas: ${result.skipped || 0}\n` +
      `❌ Erros: ${result.errors || 0}`,
      { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
    );

    logger.info('Odds update completed via command', result);
  } catch (err) {
    logger.error('Failed to update odds via command', { error: err.message });

    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao atualizar odds: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

/**
 * Handle /adicionar command - Create manual bet (Story 8.4)
 */
async function handleAdicionarCommand(bot, msg, matchStr, market, oddsStr, link) {
  logger.info('Received /adicionar command', { matchStr, market, oddsStr, hasLink: !!link });

  // Parse teams from "Time A vs Time B" format
  const vsMatch = matchStr.match(/(.+?)\s+(?:vs|x|versus)\s+(.+)/i);
  if (!vsMatch) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Formato de jogo inválido.\n\nUse: "Time A vs Time B"`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const homeTeamName = vsMatch[1].trim();
  const awayTeamName = vsMatch[2].trim();

  // Parse odds
  const odds = parseFloat(oddsStr.replace(',', '.'));
  if (isNaN(odds) || odds < 1) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Odds inválida: ${oddsStr}\n\nUse um valor decimal, ex: 1.85`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Validate link if provided
  if (link && !isValidBookmakerUrl(link)) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Link inválido. Use links de casas conhecidas (Bet365, Betano, etc).`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Create manual bet
  const result = await createManualBet({
    homeTeamName,
    awayTeamName,
    betMarket: market,
    odds,
    deepLink: link || null,
  });

  if (!result.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao criar aposta: ${result.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const bet = result.data;
  const statusIcon = bet.betStatus === 'ready' ? '✅' : '⏳';
  const linkStatus = bet.deepLink ? '🔗 Com link' : '🔗 Aguardando link';

  await bot.sendMessage(
    msg.chat.id,
    `✅ *Aposta manual criada!*\n\n` +
    `🆔 ID: ${bet.id}\n` +
    `🏟️ ${homeTeamName} vs ${awayTeamName}\n` +
    `🎯 ${market}\n` +
    `📊 Odd: ${odds.toFixed(2)}\n` +
    `${statusIcon} Status: ${bet.betStatus}\n` +
    `${linkStatus}\n\n` +
    (bet.betStatus === 'pending_link' ? `_Envie o link: \`${bet.id}: URL\`_` : '_Pronta para postagem!_'),
    { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
  );

  logger.info('Manual bet created via command', { betId: bet.id });
}

/**
 * Show help for /adicionar command
 */
async function showAdicionarHelp(bot, msg) {
  await bot.sendMessage(
    msg.chat.id,
    `📝 *Comando /adicionar*\n\n` +
    `Cria uma aposta manual.\n\n` +
    `*Formato:*\n` +
    `\`/adicionar "Time A vs Time B" "Mercado" odd [link]\`\n\n` +
    `*Exemplos:*\n` +
    `\`/adicionar "Liverpool vs Arsenal" "Over 2.5 gols" 1.85\`\n\n` +
    `\`/adicionar "Real Madrid vs Barcelona" "Ambas marcam" 1.72 https://betano.com/...\``,
    { parse_mode: 'Markdown' }
  );
}

/**
 * Handle link update - shared logic for "ID: URL" pattern and "/link ID URL" command (Story 8.3)
 */
async function handleLinkUpdate(bot, msg, betId, deepLink) {
  logger.info('Link received', { betId, link: deepLink.substring(0, 50) });

  // Validate URL
  if (!isValidBookmakerUrl(deepLink)) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Link inválido. Use links de casas conhecidas (Bet365, Betano, etc).\n\nRecebido: ${deepLink}`,
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

  // Confirm receipt with match details
  const match = `${bet.homeTeamName} vs ${bet.awayTeamName}`;
  await bot.sendMessage(
    msg.chat.id,
    `✅ *Link salvo!*\n\n🏟️ ${match}\n🎯 ${bet.betMarket}\n🔗 Pronta para postagem`,
    { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
  );

  // Also trigger alertService confirmation
  await confirmLinkReceived({
    homeTeamName: bet.homeTeamName,
    awayTeamName: bet.awayTeamName,
    betMarket: bet.betMarket,
    betPick: bet.betPick,
  });

  logger.info('Link saved successfully', { betId });
}

/**
 * Handle messages in admin group
 * @param {TelegramBot} bot - Bot instance
 * @param {object} msg - Telegram message object
 */
async function handleAdminMessage(bot, msg) {
  const text = msg.text?.trim();
  if (!text) return;

  // Check if message is /help command
  if (HELP_PATTERN.test(text)) {
    await handleHelpCommand(bot, msg);
    return;
  }

  // Check if message is /apostas command (Story 8.1)
  if (APOSTAS_PATTERN.test(text)) {
    await handleApostasCommand(bot, msg);
    return;
  }

  // Check if message is /postar command (Story 8.6)
  if (POSTAR_PATTERN.test(text)) {
    await handlePostarCommand(bot, msg);
    return;
  }

  // Check if message is /atualizar odds command (Story 8.5)
  if (ATUALIZAR_ODDS_PATTERN.test(text)) {
    await handleAtualizarOddsCommand(bot, msg);
    return;
  }

  // Check if message is /adicionar help (Story 8.4)
  if (ADICIONAR_HELP_PATTERN.test(text)) {
    await showAdicionarHelp(bot, msg);
    return;
  }

  // Check if message is /adicionar command with args (Story 8.4)
  const adicionarMatch = text.match(ADICIONAR_PATTERN);
  if (adicionarMatch) {
    const [, matchStr, market, oddsStr, link] = adicionarMatch;
    await handleAdicionarCommand(bot, msg, matchStr, market, oddsStr, link);
    return;
  }

  // Check if message is /link command (Story 8.3)
  const linkCommandMatch = text.match(LINK_COMMAND_PATTERN);
  if (linkCommandMatch) {
    const betId = parseInt(linkCommandMatch[1], 10);
    const deepLink = linkCommandMatch[2];
    await handleLinkUpdate(bot, msg, betId, deepLink);
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

  // Check if message matches "ID: URL" link pattern (legacy format)
  const match = text.match(LINK_PATTERN);
  if (match) {
    const betId = parseInt(match[1], 10);
    const deepLink = match[2];
    await handleLinkUpdate(bot, msg, betId, deepLink);
    return;
  }
}

module.exports = { handleAdminMessage };
