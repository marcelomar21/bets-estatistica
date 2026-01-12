/**
 * Admin Group Message Handler
 * Handles incoming messages in the admin group, primarily for receiving deep links
 */
const { config } = require('../../lib/config');
const logger = require('../../lib/logger');
const { getBetById, updateBetLink, updateBetOdds, getAvailableBets, createManualBet, getOverviewStats, swapPostedBet, getBetsReadyForPosting, getActiveBetsForRepost } = require('../services/betService');
const { confirmLinkReceived } = require('../services/alertService');
const { runEnrichment } = require('../jobs/enrichOdds');
const { runPostBets } = require('../jobs/postBets');
const { generateBetCopy, clearBetCache } = require('../services/copyService');
const { getSuccessRate } = require('../services/metricsService');

// Regex to match "ID: link" pattern
const LINK_PATTERN = /^(\d+):\s*(https?:\/\/\S+)/i;

// Regex to match "/odds ID valor" or "/odd ID valor" command (Story 8.2)
const ODDS_PATTERN = /^\/odds?\s+(\d+)\s+([\d.,]+)/i;

// Regex to match "/apostas" or "/apostas N" for pagination (Story 8.1)
const APOSTAS_PATTERN = /^\/apostas(?:\s+(\d+))?$/i;

// Regex to match "/link ID URL" command (Story 8.3)
const LINK_COMMAND_PATTERN = /^\/link\s+(\d+)\s+(https?:\/\/\S+)/i;

// Regex to match "/adicionar" command (Story 8.4)
// Format: /adicionar "Time A vs Time B" "Mercado" odd [link]
const ADICIONAR_PATTERN = /^\/adicionar\s+"([^"]+)"\s+"([^"]+)"\s+([\d.,]+)(?:\s+(https?:\/\/\S+))?$/i;
// Also accept simpler format without quotes for teams
const ADICIONAR_HELP_PATTERN = /^\/adicionar$/i;

// Regex to match "/atualizar odds" command (Story 8.5)
// Accept both "/atualizar odds" and just "/atualizar"
const ATUALIZAR_ODDS_PATTERN = /^\/atualizar(\s+odds)?$/i;

// Regex to match "/postar" command (Story 8.6)
const POSTAR_PATTERN = /^\/postar$/i;

// Regex to match "/help" command
const HELP_PATTERN = /^\/help$/i;

// Regex to match "/status" command
const STATUS_PATTERN = /^\/status$/i;

// Regex to match "/overview" command (Story 10.3)
const OVERVIEW_PATTERN = /^\/overview$/i;

// Regex to match "/trocar ID_ANTIGO ID_NOVO" command (Story 10.3)
const TROCAR_PATTERN = /^\/trocar\s+(\d+)\s+(\d+)$/i;

// Regex to match "/filtrar [tipo]" command (Story 12.5)
const FILTRAR_PATTERN = /^\/filtrar(?:\s+(sem_odds|sem_link|com_link|com_odds|prontas))?$/i;

// Regex to match "/simular [novo|ID]" command (Story 12.6)
const SIMULAR_PATTERN = /^\/simular(?:\s+(novo|\d+))?$/i;

// Regex to match "/promover ID" command (FEAT-011)
const PROMOVER_PATTERN = /^\/promover\s+(\d+)$/i;

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
 * Handle /apostas command - List available bets with pagination (Story 8.1)
 * Usage: /apostas or /apostas 2 (for page 2)
 */
async function handleApostasCommand(bot, msg, page = 1) {
  logger.info('Received /apostas command', { chatId: msg.chat.id, userId: msg.from?.id, page });

  const result = await getAvailableBets();

  if (!result.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao buscar apostas: ${result.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  let bets = result.data;

  if (bets.length === 0) {
    await bot.sendMessage(
      msg.chat.id,
      '📋 Nenhuma aposta disponível no momento.\n\n_Aguarde a geração de novas análises._',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Sort: posted first, then by date (nearest first), then by odds (higher first)
  bets = bets.sort((a, b) => {
    // Posted comes first
    if (a.betStatus === 'posted' && b.betStatus !== 'posted') return -1;
    if (b.betStatus === 'posted' && a.betStatus !== 'posted') return 1;

    // Then by kickoff time (nearest first)
    const dateA = new Date(a.kickoffTime).getTime();
    const dateB = new Date(b.kickoffTime).getTime();
    if (dateA !== dateB) return dateA - dateB;

    // Then by odds (higher first)
    const oddsA = a.odds || 0;
    const oddsB = b.odds || 0;
    return oddsB - oddsA;
  });

  // Pagination (10 per page for better formatting)
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(bets.length / PAGE_SIZE);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const endIdx = startIdx + PAGE_SIZE;
  const displayBets = bets.slice(startIdx, endIdx);

  // Status labels for business users
  const getStatusLabel = (status) => {
    switch (status) {
      case 'posted': return '📤 POSTADA';
      case 'ready': return '✅ PRONTA';
      case 'pending_link': return '⏳ AGUARDA LINK';
      case 'generated': return '🆕 NOVA';
      default: return '❓ ' + status;
    }
  };

  // Format message with clear visual separation
  const lines = [`📋 *APOSTAS DISPONÍVEIS*`, `Página ${currentPage} de ${totalPages} • Total: ${bets.length}\n`];

  displayBets.forEach((bet) => {
    const kickoff = new Date(bet.kickoffTime);
    const timeStr = kickoff.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
    const dateStr = kickoff.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    // Clear indicators for missing data
    const oddsDisplay = bet.odds ? `💰 ${bet.odds.toFixed(2)}` : '⚠️ *SEM ODD*';
    const linkDisplay = bet.hasLink ? '🔗 Com link' : '❌ *SEM LINK*';
    const statusLabel = getStatusLabel(bet.betStatus);

    lines.push(`━━━━━━━━━━━━━━━━━━`);
    lines.push(`🆔 *#${bet.id}* │ ${statusLabel}`);
    lines.push(`⚽ ${bet.homeTeamName} x ${bet.awayTeamName}`);
    lines.push(`📅 ${dateStr} às ${timeStr}`);
    lines.push(`🎯 ${bet.betMarket}`);
    lines.push(`${oddsDisplay} │ ${linkDisplay}`);
  });

  lines.push(`━━━━━━━━━━━━━━━━━━`);

  // Navigation hints
  if (totalPages > 1) {
    lines.push('');
    const navParts = [];
    if (currentPage > 1) navParts.push(`⬅️ \`/apostas ${currentPage - 1}\``);
    if (currentPage < totalPages) navParts.push(`➡️ \`/apostas ${currentPage + 1}\``);
    lines.push(navParts.join('  │  '));
  }

  // Quick commands hint
  lines.push('');
  lines.push('💡 `/odd ID valor` │ `/link ID url`');

  await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });

  logger.info('Listed available bets', { count: displayBets.length, page: currentPage, totalPages });
}

/**
 * Handle /status command - Show bot status
 */
async function handleStatusCommand(bot, msg) {
  const statusText = `
🤖 *Status do Bot*

✅ Bot online (webhook mode)
📊 Ambiente: ${config.env}
🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
  `.trim();

  await bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'Markdown' });
  logger.info('Status command executed');
}

/**
 * Handle /overview command - Show bets overview stats (Story 10.3)
 */
async function handleOverviewCommand(bot, msg) {
  logger.info('Received /overview command', { chatId: msg.chat.id, userId: msg.from?.id });

  const result = await getOverviewStats();

  if (!result.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao buscar estatísticas: ${result.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const stats = result.data;

  // Format posted IDs list
  const postedIdsList = stats.postedIds.length > 0
    ? stats.postedIds.map(item => `#${item.id}`).join(', ')
    : 'Nenhuma';

  // Format IDs without odds
  const withoutOddsIds = stats.withoutOddsIds.length > 0
    ? stats.withoutOddsIds.slice(0, 10).map(id => `#${id}`).join(', ') + (stats.withoutOddsIds.length > 10 ? '...' : '')
    : 'Nenhuma';

  // Format IDs without links
  const withoutLinksIds = stats.withoutLinksIds.length > 0
    ? stats.withoutLinksIds.slice(0, 10).map(id => `#${id}`).join(', ') + (stats.withoutLinksIds.length > 10 ? '...' : '')
    : 'Nenhuma';

  // Format next game
  let nextGameText = 'Nenhum próximo';
  if (stats.nextGame) {
    const kickoff = new Date(stats.nextGame.kickoff);
    const now = new Date();
    const diffMs = kickoff - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const timeUntil = diffHours > 0 ? `${diffHours}h ${diffMins}m` : `${diffMins}m`;
    const dateStr = kickoff.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const timeStr = kickoff.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    nextGameText = `#${stats.nextGame.id} ${stats.nextGame.homeTeam} x ${stats.nextGame.awayTeam}\n📅 ${dateStr} às ${timeStr} (em ${timeUntil})`;
  }

  // Format last posting
  let lastPostingText = 'Nenhuma';
  if (stats.lastPosting) {
    const postDate = new Date(stats.lastPosting);
    const now = new Date();
    const isToday = postDate.toDateString() === now.toDateString();
    const timeStr = postDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    lastPostingText = isToday ? `Hoje às ${timeStr}` : postDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ` às ${timeStr}`;
  }

  // Format success rate
  let successRateText = 'Sem dados';
  if (stats.successRate) {
    successRateText = `${stats.successRate.percentage}% (${stats.successRate.wins}/${stats.successRate.total})`;
  }

  const overviewText = `
📊 *OVERVIEW - APOSTAS*

*Status Atual:*
🆕 Geradas: ${stats.statusCounts.generated}
⏳ Aguardando link: ${stats.statusCounts.pending_link}
✅ Prontas: ${stats.statusCounts.ready}
📤 Postadas: ${stats.postedActive} (${postedIdsList})

*Próximo Jogo:*
⚽ ${nextGameText}

*Última Postagem:*
🕐 ${lastPostingText}

*Pendências:*
⚠️ Sem odds: ${withoutOddsIds}
❌ Sem link: ${withoutLinksIds}

*Métricas (30 dias):*
📈 Taxa: ${successRateText}

💡 /filtrar | /simular | /postar
  `.trim();

  await bot.sendMessage(msg.chat.id, overviewText, { parse_mode: 'Markdown' });
  logger.info('Overview command executed', { total: stats.totalAnalyzed, posted: stats.postedActive });
}

/**
 * Handle /trocar command - Swap posted bet with another (Story 10.3)
 */
async function handleTrocarCommand(bot, msg, oldBetId, newBetId) {
  logger.info('Received /trocar command', { chatId: msg.chat.id, oldBetId, newBetId });

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

  logger.info('Bet swap completed', { oldBetId, newBetId });
}

/**
 * Handle /filtrar command - Filter bets by criteria (Story 12.5)
 */
async function handleFiltrarCommand(bot, msg, filterType) {
  logger.info('Received /filtrar command', { chatId: msg.chat.id, filterType });

  // Se não passou filtro, mostrar ajuda
  if (!filterType) {
    const helpText = `
📋 *Comando /filtrar*

Filtra apostas por critério específico.

*Filtros disponíveis:*
\`/filtrar sem_odds\` - Apostas sem odd definida
\`/filtrar sem_link\` - Apostas sem link
\`/filtrar com_link\` - Apostas com link
\`/filtrar com_odds\` - Apostas com odd definida
\`/filtrar prontas\` - Apostas prontas (ready)

*Exemplo:*
\`/filtrar sem_odds\`
    `.trim();

    await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
    return;
  }

  // Buscar apostas disponíveis
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

  // Aplicar filtro
  let filtered = [];
  let filterLabel = '';
  let hint = '';

  switch (filterType.toLowerCase()) {
    case 'sem_odds':
      filtered = bets.filter(b => !b.odds || b.odds === 0);
      filterLabel = 'SEM ODDS';
      hint = '💡 Use `/odd ID valor` para definir odds';
      break;
    case 'sem_link':
      filtered = bets.filter(b => !b.deepLink && !['posted', 'success', 'failure'].includes(b.betStatus));
      filterLabel = 'SEM LINK';
      hint = '💡 Use `/link ID url` para adicionar link';
      break;
    case 'com_link':
      filtered = bets.filter(b => !!b.deepLink);
      filterLabel = 'COM LINK';
      hint = '';
      break;
    case 'com_odds':
      filtered = bets.filter(b => b.odds && b.odds > 0);
      filterLabel = 'COM ODDS';
      hint = '';
      break;
    case 'prontas':
      filtered = bets.filter(b => b.betStatus === 'ready');
      filterLabel = 'PRONTAS';
      hint = '💡 Use `/postar` para publicar';
      break;
    default:
      await bot.sendMessage(
        msg.chat.id,
        `❌ Filtro desconhecido: ${filterType}\n\nUse \`/filtrar\` para ver opções.`,
        { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
      );
      return;
  }

  // Ordenar por data do jogo (mais próximo primeiro) - FR-F7
  filtered.sort((a, b) => new Date(a.kickoffTime) - new Date(b.kickoffTime));

  if (filtered.length === 0) {
    await bot.sendMessage(
      msg.chat.id,
      `📋 *APOSTAS ${filterLabel}* (0)\n\n_Nenhuma aposta encontrada com este filtro._`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Limitar a 15 para não estourar limite do Telegram (4096 chars)
  const MAX_DISPLAY = 15;
  const hasMore = filtered.length > MAX_DISPLAY;
  const displayBets = filtered.slice(0, MAX_DISPLAY);

  // Formatar lista
  const lines = [`📋 *APOSTAS ${filterLabel}* (${filtered.length})`, ''];

  displayBets.forEach((bet) => {
    const kickoff = new Date(bet.kickoffTime);
    const timeStr = kickoff.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
    const dateStr = kickoff.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const oddsDisplay = bet.odds ? `💰 ${bet.odds.toFixed(2)}` : '⚠️ SEM ODD';
    const linkDisplay = bet.deepLink ? '🔗 Com link' : '❌ SEM LINK';

    lines.push(`━━━━━━━━━━━━━━━━━━`);
    lines.push(`🆔 *#${bet.id}* ${bet.homeTeamName} x ${bet.awayTeamName}`);
    lines.push(`🎯 ${bet.betMarket}`);
    lines.push(`📅 ${dateStr} às ${timeStr}`);
    lines.push(`${oddsDisplay} │ ${linkDisplay}`);
  });

  lines.push(`━━━━━━━━━━━━━━━━━━`);

  if (hasMore) {
    lines.push(`\n⚠️ _+${filtered.length - MAX_DISPLAY} apostas não exibidas_`);
  }

  if (hint) {
    lines.push('');
    lines.push(hint);
  }

  await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
  logger.info('Filter command executed', { filterType, count: filtered.length });
}

/**
 * Handle /simular command - Preview next posting (Story 12.6)
 */
async function handleSimularCommand(bot, msg, arg) {
  logger.info('Received /simular command', { chatId: msg.chat.id, arg });

  // Send working message
  const workingMsg = await bot.sendMessage(msg.chat.id, '⏳ Gerando preview... Aguarde.');

  try {
    // Check if "novo" - regenerate copy
    const isNovo = arg?.toLowerCase() === 'novo';
    const specificBetId = arg && !isNovo ? parseInt(arg, 10) : null;

    // Get bets to preview
    let betsToPreview = [];

    if (specificBetId) {
      // Preview specific bet
      const betResult = await getBetById(specificBetId);
      if (!betResult.success) {
        await bot.deleteMessage(msg.chat.id, workingMsg.message_id).catch(() => {});
        await bot.sendMessage(msg.chat.id, `❌ Aposta #${specificBetId} não encontrada.`, { reply_to_message_id: msg.message_id });
        return;
      }
      betsToPreview = [betResult.data];
    } else {
      // Get active posted bets first, then ready bets
      const activeResult = await getActiveBetsForRepost();
      const readyResult = await getBetsReadyForPosting();

      if (activeResult.success && activeResult.data.length > 0) {
        betsToPreview = activeResult.data.slice(0, 3);
      } else if (readyResult.success && readyResult.data.length > 0) {
        betsToPreview = readyResult.data.slice(0, 3);
      }
    }

    if (betsToPreview.length === 0) {
      await bot.deleteMessage(msg.chat.id, workingMsg.message_id).catch(() => {});
      await bot.sendMessage(
        msg.chat.id,
        `📭 *Nenhuma aposta para preview*\n\n_Não há apostas prontas ou ativas para simular._\n\n💡 Use \`/apostas\` para ver apostas disponíveis.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // If "novo", clear cache for these bets
    if (isNovo) {
      betsToPreview.forEach(bet => clearBetCache(bet.id));
      logger.info('Cleared cache for preview bets', { count: betsToPreview.length });
    }

    // Get success rate
    let successRate = null;
    try {
      const rateResult = await getSuccessRate();
      if (rateResult.success) {
        successRate = rateResult.data.rate30d;
      }
    } catch (e) {
      logger.debug('Could not get success rate for preview');
    }

    // Generate preview
    const lines = ['📤 *PREVIEW - PRÓXIMA POSTAGEM*', '', '━━━━━━━━━━━━━━━━━━━━'];

    for (const bet of betsToPreview) {
      // Generate copy
      let copyText = bet.reasoning || 'Aposta de alto valor estatístico';
      try {
        const copyResult = await generateBetCopy(bet);
        if (copyResult.success && copyResult.data?.copy) {
          copyText = copyResult.data.copy;
        }
      } catch (e) {
        logger.debug('Failed to generate copy for preview', { betId: bet.id });
      }

      const kickoffDate = new Date(bet.kickoffTime);
      const kickoffStr = kickoffDate.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

      lines.push('');
      lines.push(`⚽ *${bet.homeTeamName} x ${bet.awayTeamName}*`);
      lines.push(`🗓 ${kickoffStr}`);
      lines.push('');
      lines.push(`📊 *${bet.betMarket}*: ${bet.betPick || ''}`);
      lines.push(`💰 Odd: *${bet.odds?.toFixed(2) || bet.oddsAtPost?.toFixed(2) || 'N/A'}*`);
      lines.push('');
      lines.push(`📝 _${copyText}_`);

      if (bet.deepLink) {
        lines.push('');
        lines.push(`🔗 [Apostar Agora](${bet.deepLink})`);
      } else {
        lines.push('');
        lines.push(`⚠️ _Sem link cadastrado_`);
      }

      lines.push('');
      lines.push('━━━━━━━━━━━━━━━━━━━━');
    }

    // Add success rate if available
    if (successRate !== null && successRate >= 0) {
      lines.push('');
      lines.push(`📈 Taxa de acerto: *${successRate.toFixed(0)}%*`);
    }

    lines.push('');
    lines.push('⚠️ Este é apenas um preview.');
    lines.push('💡 `/postar` para publicar │ `/simular novo` para regenerar');

    // Delete working message and send preview
    await bot.deleteMessage(msg.chat.id, workingMsg.message_id).catch(() => {});
    await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown', disable_web_page_preview: true });

    logger.info('Preview generated', { betsCount: betsToPreview.length, isNovo });
  } catch (err) {
    logger.error('Failed to generate preview', { error: err.message });
    await bot.deleteMessage(msg.chat.id, workingMsg.message_id).catch(() => {});
    await bot.sendMessage(msg.chat.id, `❌ Erro ao gerar preview: ${err.message}`, { reply_to_message_id: msg.message_id });
  }
}

/**
 * Handle /promover command - Promote bet to ready for posting (FEAT-011)
 */
async function handlePromoverCommand(bot, msg, betId) {
  logger.info('Received /promover command', { chatId: msg.chat.id, betId });

  const betResult = await getBetById(betId);
  if (!betResult.success) {
    await bot.sendMessage(msg.chat.id, `❌ Aposta #${betId} não encontrada.`, { reply_to_message_id: msg.message_id });
    return;
  }

  const bet = betResult.data;

  // Validações
  if (bet.betStatus === 'posted') {
    await bot.sendMessage(msg.chat.id, `⚠️ Aposta #${betId} já está postada.`, { reply_to_message_id: msg.message_id });
    return;
  }

  if (bet.betStatus === 'ready') {
    await bot.sendMessage(msg.chat.id, `✅ Aposta #${betId} já está pronta para postagem.`, { reply_to_message_id: msg.message_id });
    return;
  }

  if (!bet.odds || bet.odds < 1.60) {
    await bot.sendMessage(msg.chat.id, `❌ Aposta #${betId} precisa de odds >= 1.60.\nUse: \`/odd ${betId} valor\``, { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' });
    return;
  }

  if (!bet.deepLink) {
    await bot.sendMessage(msg.chat.id, `❌ Aposta #${betId} precisa de link.\nUse: \`/link ${betId} URL\``, { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' });
    return;
  }

  // Promover para ready
  const { updateBetStatus } = require('../services/betService');
  const updateResult = await updateBetStatus(betId, 'ready');

  if (!updateResult.success) {
    await bot.sendMessage(msg.chat.id, `❌ Erro ao promover: ${updateResult.error.message}`, { reply_to_message_id: msg.message_id });
    return;
  }

  await bot.sendMessage(
    msg.chat.id,
    `✅ *Aposta promovida!*\n\n🆔 #${betId}\n⚽ ${bet.homeTeamName} x ${bet.awayTeamName}\n🎯 ${bet.betMarket}\n💰 Odd: ${bet.odds.toFixed(2)}\n\n_Use /postar para publicar._`,
    { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
  );

  logger.info('Bet promoted to ready', { betId });
}

/**
 * Handle /help command - Show all admin commands
 */
async function handleHelpCommand(bot, msg) {
  const helpText = `
📚 *Comandos do Admin*

*📋 Consultas:*
/apostas - Listar apostas disponíveis
/filtrar - Filtrar apostas por critério
/simular - Preview da próxima postagem
/overview - Resumo com estatísticas
/status - Ver status do bot
/help - Ver esta ajuda

*✏️ Edição:*
/odd ID valor - Ajustar odd de aposta
/link ID URL - Adicionar link a aposta
/trocar ID1 ID2 - Trocar aposta postada
/promover ID - Marcar aposta como pronta
\`ID: URL\` - Adicionar link (atalho)

*➕ Criação:*
/adicionar - Ver formato de aposta manual

*⚡ Ações:*
/atualizar - Forçar atualização de odds
/postar - Forçar postagem imediata

*Exemplos:*
\`/odd 45 1.90\`
\`/filtrar sem_odds\`
\`/trocar 45 67\` _(troca #45 por #67)_
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
      `📤 Ativas: ${result.active || 0}\n` +
      `⚠️ Precisam odd manual: ${result.needsAdminOdds || 0}`,
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

  // Check if message is /status command
  if (STATUS_PATTERN.test(text)) {
    await handleStatusCommand(bot, msg);
    return;
  }

  // Check if message is /overview command (Story 10.3)
  if (OVERVIEW_PATTERN.test(text)) {
    await handleOverviewCommand(bot, msg);
    return;
  }

  // Check if message is /trocar command (Story 10.3)
  const trocarMatch = text.match(TROCAR_PATTERN);
  if (trocarMatch) {
    const oldBetId = parseInt(trocarMatch[1], 10);
    const newBetId = parseInt(trocarMatch[2], 10);
    await handleTrocarCommand(bot, msg, oldBetId, newBetId);
    return;
  }

  // Check if message is /filtrar command (Story 12.5)
  const filtrarMatch = text.match(FILTRAR_PATTERN);
  if (filtrarMatch) {
    const filterType = filtrarMatch[1] || null;
    await handleFiltrarCommand(bot, msg, filterType);
    return;
  }

  // Check if message is /simular command (Story 12.6)
  const simularMatch = text.match(SIMULAR_PATTERN);
  if (simularMatch) {
    const arg = simularMatch[1] || null;
    await handleSimularCommand(bot, msg, arg);
    return;
  }

  // Check if message is /promover command (FEAT-011)
  const promoverMatch = text.match(PROMOVER_PATTERN);
  if (promoverMatch) {
    const betId = parseInt(promoverMatch[1], 10);
    await handlePromoverCommand(bot, msg, betId);
    return;
  }

  // Check if message is /help command
  if (HELP_PATTERN.test(text)) {
    await handleHelpCommand(bot, msg);
    return;
  }

  // Check if message is /apostas command with optional page (Story 8.1)
  const apostasMatch = text.match(APOSTAS_PATTERN);
  if (apostasMatch) {
    const page = apostasMatch[1] ? parseInt(apostasMatch[1], 10) : 1;
    await handleApostasCommand(bot, msg, page);
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
