/**
 * Admin Action Commands
 * Handles /postar, /atualizar, /trocar, /adicionar commands
 */
const logger = require('../../../lib/logger');
const { config } = require('../../../lib/config');
const { isValidBookmakerUrl } = require('../../../lib/utils');
const { createManualBet, swapPostedBet } = require('../../services/betService');
const { runEnrichment } = require('../../jobs/enrichOdds');
const { runPostBets, hasPendingConfirmation, getPendingConfirmationInfo } = require('../../jobs/postBets');
const { withExecutionLogging } = require('../../services/jobExecutionService');
const { getBotForGroup } = require('../../telegram');

// Regex patterns
const POSTAR_PATTERN = /^\/postar$/i;
const ATUALIZAR_ODDS_PATTERN = /^\/atualizar(\s+odds)?$/i;
const TROCAR_PATTERN = /^\/trocar\s+(\d+)\s+(\d+)$/i;
const ADICIONAR_PATTERN = /^\/adicionar\s+"([^"]+)"\s+"([^"]+)"\s+([\d.,]+)(?:\s+(https?:\/\/\S+))?$/i;
const ADICIONAR_HELP_PATTERN = /^\/adicionar$/i;

/**
 * Handle /postar command - Force posting (Story 8.6)
 */
async function handlePostarCommand(bot, msg) {
  logger.info('[admin:action] Received /postar command', { chatId: msg.chat.id, userId: msg.from?.id });

  // Check if there's already a pending confirmation to prevent duplicate posts
  if (hasPendingConfirmation()) {
    const pendingInfo = getPendingConfirmationInfo();
    logger.warn('[admin:action] Blocked /postar - confirmation already pending', { pendingInfo });
    await bot.sendMessage(
      msg.chat.id,
      `⚠️ *Já existe uma postagem aguardando confirmação!*\n\n` +
      `Use os botões ✅/❌ na mensagem anterior para confirmar ou cancelar.\n\n` +
      `_Se não encontrar a mensagem, aguarde 15 minutos para o timeout._`,
      { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
    );
    return;
  }

  // Send "working" message
  const workingMsg = await bot.sendMessage(msg.chat.id, '⏳ Executando postagem... Aguarde.');

  try {
    // Log execution to job_executions table for visibility
    const botCtx = getBotForGroup(config.membership.groupId);
    const result = await withExecutionLogging('post-bets-manual', () => runPostBets(false, { botCtx }));

    // Delete "working" message
    try {
      await bot.deleteMessage(msg.chat.id, workingMsg.message_id);
    } catch (e) {
      // Ignore delete errors
    }

    const totalSent = (result.reposted || 0) + (result.posted || 0);

    // If cancelled via confirmation, don't send additional message
    if (result.cancelled) {
      logger.info('[admin:action] Posting cancelled via confirmation');
      return;
    }

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

    logger.info('[admin:action] Posting completed via command', result);
  } catch (err) {
    logger.error('[admin:action] Failed to post via command', { error: err.message });

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
  logger.info('[admin:action] Received /atualizar odds command', { chatId: msg.chat.id, userId: msg.from?.id });

  // Send "working" message
  const workingMsg = await bot.sendMessage(msg.chat.id, '⏳ Atualizando odds... Aguarde.');

  try {
    // Log execution to job_executions table for visibility
    const result = await withExecutionLogging('enrich-odds-manual', () => runEnrichment());

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
      `📤 Ativas: ${result.active || 0}\n` +
      `⚠️ Precisam odd manual: ${result.needsAdminOdds || 0}`,
      { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
    );

    logger.info('[admin:action] Odds update completed via command', result);
  } catch (err) {
    logger.error('[admin:action] Failed to update odds via command', { error: err.message });

    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao atualizar odds: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

/**
 * Handle /trocar command - Swap posted bet with another (Story 10.3)
 */
async function handleTrocarCommand(bot, msg, oldBetId, newBetId) {
  logger.info('[admin:action] Received /trocar command', { chatId: msg.chat.id, oldBetId, newBetId });

  const result = await swapPostedBet(oldBetId, newBetId);

  if (!result.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ ${result.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const { oldBet, newBet } = result.data;

  await bot.sendMessage(
    msg.chat.id,
    `✅ *Apostas trocadas!*\n\n` +
    `📤 *Removida da postagem:*\n` +
    `#${oldBetId} - ${oldBet.homeTeamName} x ${oldBet.awayTeamName}\n\n` +
    `📥 *Nova aposta postável:*\n` +
    `#${newBetId} - ${newBet.homeTeamName} x ${newBet.awayTeamName}\n\n` +
    `_Use /postar para publicar ou aguarde o próximo ciclo._`,
    { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
  );

  logger.info('[admin:action] Bet swap completed', { oldBetId, newBetId });
}

/**
 * Handle /adicionar command - Create manual bet (Story 8.4)
 */
async function handleAdicionarCommand(bot, msg, matchStr, market, oddsStr, link) {
  logger.info('[admin:action] Received /adicionar command', { matchStr, market, oddsStr, hasLink: !!link });

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

  logger.info('[admin:action] Manual bet created via command', { betId: bet.id });
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

module.exports = {
  // Handlers
  handlePostarCommand,
  handleAtualizarOddsCommand,
  handleTrocarCommand,
  handleAdicionarCommand,
  showAdicionarHelp,
  // Patterns (for router)
  POSTAR_PATTERN,
  ATUALIZAR_ODDS_PATTERN,
  TROCAR_PATTERN,
  ADICIONAR_PATTERN,
  ADICIONAR_HELP_PATTERN
};
