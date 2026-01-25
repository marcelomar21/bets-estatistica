/**
 * Admin Bet Commands
 * Handles /apostas, /odd, /link, /filtrar, /fila, /promover, /remover commands
 *
 * Note: parse_mode: 'Markdown' is used consistently throughout handlers.
 * A utility wrapper could centralize this, but explicit is kept for clarity.
 */
const { config } = require('../../../lib/config');
const logger = require('../../../lib/logger');
const { isValidBookmakerUrl } = require('../../../lib/utils');
const { getBetById, updateBetLink, updateBetOdds, getAvailableBets, promoverAposta, removerAposta, getFilaStatus } = require('../../services/betService');
const { getAllPairStats, categorizeMarket } = require('../../services/metricsService');
const { formatBetListWithDays, paginateResults, formatPaginationFooter } = require('../../utils/formatters');

// Regex patterns
// TODO: Add unit tests for edge cases (unicode, escaped quotes, etc.) - see Story 17.2
const LINK_PATTERN = /^(\d+):\s*(https?:\/\/\S+)/i;
const ODDS_PATTERN = /^\/odds?\s+(\d+)\s+([\d.,]+)/i;
const APOSTAS_PATTERN = /^\/apostas(?:\s+(\d+))?$/i;
const LINK_COMMAND_PATTERN = /^\/link\s+(\d+)\s+(https?:\/\/\S+)/i;
const FILTRAR_PATTERN = /^\/filtrar(?:\s+(sem_odds|sem_link|com_link|com_odds|prontas))?(?:\s+(\d+))?$/i;
const PROMOVER_PATTERN = /^\/promover(?:\s+(\d+))?$/i;
const REMOVER_PATTERN = /^\/remover(?:\s+(\d+))?$/i;
const FILA_PATTERN = /^\/fila(?:\s+(\d+))?$/i;

// Valid filter types for /filtrar command
const VALID_FILTER_TYPES = ['sem_odds', 'sem_link', 'com_link', 'com_odds', 'prontas'];

/**
 * Retorna emoji indicador baseado na taxa de acerto
 * @param {number|null} rate - Taxa de acerto (0-100) ou null se sem dados
 * @returns {string} - Emoji indicador
 */
function getRateIndicator(rate) {
  if (rate == null) return '⚪';
  if (rate > 70) return '🟢';
  if (rate >= 50) return '🟡';
  return '🔴';
}

/**
 * Handle /odds command to set manual odds
 */
async function handleOddsCommand(bot, msg, betId, oddsValue) {
  try {
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
    // Story 14.8: Passar jobName para registro no historico
    const updateResult = await updateBetOdds(betId, odds, `Odds manual via admin: ${odds}`, 'manual_admin_/odds');

    if (!updateResult.success) {
      logger.error('[admin:bet] Failed to save manual odds', { betId, error: updateResult.error.message });
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

    // Check if auto-promoted
    const promotedMsg = updateResult.promoted
      ? `\n\n🚀 *Auto-promovida para PRONTA!*`
      : `\n\n_Agora envie o link: \`${betId}: URL\`_`;

    await bot.sendMessage(
      msg.chat.id,
      `✅ *Odd atualizada!*\n\n🏟️ ${match}\n🎯 ${bet.betMarket}\n${oddsChange}${promotedMsg}`,
      {
        reply_to_message_id: msg.message_id,
        parse_mode: 'Markdown',
      }
    );

    logger.info('[admin:bet] Manual odds saved', { betId, previousOdds, newOdds: odds });
  } catch (err) {
    logger.error('[admin:bet] Unexpected error in handleOddsCommand', { betId, error: err.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro inesperado: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    ).catch(() => {}); // Ignore send errors
  }
}

/**
 * Handle /apostas command - List available bets with pagination (Story 8.1)
 * Usage: /apostas or /apostas 2 (for page 2)
 */
async function handleApostasCommand(bot, msg, page = 1) {
  logger.info('[admin:bet] Received /apostas command', { chatId: msg.chat.id, userId: msg.from?.id, page });

  const result = await getAvailableBets();

  if (!result.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao buscar apostas: ${result.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Buscar estatísticas de pares mercado/liga
  const pairStatsResult = await getAllPairStats();
  if (!pairStatsResult.success) {
    logger.warn('[admin:bet] Failed to fetch pair stats, continuing without', { error: pairStatsResult.error?.message });
  }
  const pairStats = pairStatsResult.success ? pairStatsResult.data : {};

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

  // Story 14.5: Format single bet for day grouping
  // Story 14.5: Add pair stats display with market/league rate
  const formatBetForList = (bet, pairStats) => {
    const kickoff = new Date(bet.kickoffTime);
    const timeStr = kickoff.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const oddsDisplay = bet.odds ? `💰 ${bet.odds.toFixed(2)}` : '⚠️ *SEM ODD*';
    const linkDisplay = bet.hasLink ? '🔗' : '❌';
    const statusLabel = getStatusLabel(bet.betStatus);

    // Taxa do par mercado/liga
    const league = bet.country && bet.leagueName
      ? `${bet.country} - ${bet.leagueName}`
      : null;
    const category = categorizeMarket(bet.betMarket);
    const pairKey = league ? `${league}|${category}` : null;
    const stats = pairKey ? pairStats[pairKey] : null;

    const indicator = getRateIndicator(stats?.rate ?? null);
    const rateDisplay = stats && stats.rate != null
      ? `${league} | ${category}: ${stats.rate.toFixed(1)}% (${stats.wins}/${stats.total})`
      : `${league || 'Liga desconhecida'} | ${category}: -- (< 3)`;

    return [
      `🆔 *#${bet.id}* │ ${statusLabel}`,
      `⚽ ${bet.homeTeamName} x ${bet.awayTeamName}`,
      `🕐 ${timeStr} │ 🎯 ${bet.betMarket}`,
      `${oddsDisplay} │ ${linkDisplay}`,
      `${indicator} *% par mercado/liga*`,
      rateDisplay,
      '', // Empty line between bets
    ].join('\n');
  };

  // Format message with day grouping (Story 14.5)
  const lines = [`📋 *APOSTAS DISPONÍVEIS*`, `Página ${currentPage} de ${totalPages} • Total: ${bets.length}`, ''];

  // Add day-grouped bets
  const groupedContent = formatBetListWithDays(displayBets, (bet) => formatBetForList(bet, pairStats));
  lines.push(groupedContent);

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

  logger.info('[admin:bet] Listed available bets', { count: displayBets.length, page: currentPage, totalPages });
}

/**
 * Handle link update - shared logic for "ID: URL" pattern and "/link ID URL" command (Story 8.3)
 */
async function handleLinkUpdate(bot, msg, betId, deepLink) {
  try {
    logger.info('[admin:bet] Link received', { betId, link: deepLink.substring(0, 50) });

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
      logger.warn('[admin:bet] Bet not found for link', { betId });
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
      logger.error('[admin:bet] Failed to save link', { betId, error: updateResult.error.message });
      await bot.sendMessage(
        msg.chat.id,
        `❌ Erro ao salvar link: ${updateResult.error.message}`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    // Confirm receipt with match details
    const match = `${bet.homeTeamName} vs ${bet.awayTeamName}`;
    const statusMsg = updateResult.promoted
      ? `🚀 *Auto-promovida para PRONTA!*`
      : `⚠️ Aguardando odds >= 1.60 para ficar pronta`;

    await bot.sendMessage(
      msg.chat.id,
      `✅ *Link salvo!*\n\n🏟️ ${match}\n🎯 ${bet.betMarket}\n${statusMsg}`,
      { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
    );

    logger.info('[admin:bet] Link saved successfully', { betId });
  } catch (err) {
    logger.error('[admin:bet] Unexpected error in handleLinkUpdate', { betId, error: err.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro inesperado: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    ).catch(() => {}); // Ignore send errors
  }
}

/**
 * Handle /filtrar command - Filter bets by criteria (Story 12.5, 14.6)
 * Usage: /filtrar [tipo] [pagina]
 */
async function handleFiltrarCommand(bot, msg, filterType, page = 1) {
  logger.info('[admin:bet] Received /filtrar command', { chatId: msg.chat.id, filterType, page });

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
      // Exclui posted (já foram ao ar com link)
      filtered = bets.filter(b => !b.deepLink && b.betStatus !== 'posted');
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
      // TODAS apostas com odds + link (universo maior que /fila)
      // Inclui: posted (ativas) + qualquer aposta com link e odds válidas
      // Nota: getAvailableBets() já exclui apostas com bet_result terminal
      filtered = bets.filter(b => {
        const temLink = !!b.deepLink;
        const temOdds = b.odds && b.odds > 0;
        return temLink && temOdds;
      });
      filterLabel = 'PRONTAS';
      hint = '💡 Use `/fila` para ver o que será postado';
      break;
    default:
      await bot.sendMessage(
        msg.chat.id,
        `❌ Filtro desconhecido: ${filterType}\n\nFiltros válidos: ${VALID_FILTER_TYPES.join(', ')}\nUse \`/filtrar\` para ver ajuda.`,
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

  // Story 14.6: Paginacao (10 por pagina)
  const PAGE_SIZE = 10;
  const pagination = paginateResults(filtered, page, PAGE_SIZE);
  const displayBets = pagination.items;

  // Story 14.5: Format single bet for day grouping
  const formatBetForFilter = (bet) => {
    const kickoff = new Date(bet.kickoffTime);
    const timeStr = kickoff.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const oddsDisplay = bet.odds ? `💰 ${bet.odds.toFixed(2)}` : '⚠️ SEM ODD';
    const linkDisplay = bet.deepLink ? '🔗' : '❌';

    return [
      `🆔 *#${bet.id}* ${bet.homeTeamName} x ${bet.awayTeamName}`,
      `🎯 ${bet.betMarket} │ 🕐 ${timeStr}`,
      `${oddsDisplay} │ ${linkDisplay}`,
      '', // Empty line between bets
    ].join('\n');
  };

  // Formatar lista com agrupamento por dia (Story 14.5)
  const lines = [`📋 *APOSTAS ${filterLabel}*`, `Pagina ${pagination.currentPage} de ${pagination.totalPages} • Total: ${pagination.totalItems}`, ''];
  const groupedContent = formatBetListWithDays(displayBets, formatBetForFilter);
  lines.push(groupedContent);

  // Story 14.6: Footer com paginacao
  if (pagination.totalPages > 1) {
    lines.push('');
    const commandBase = filterType ? `/filtrar ${filterType}` : '/filtrar';
    lines.push(formatPaginationFooter(pagination, commandBase));
  }

  if (hint) {
    lines.push('');
    lines.push(hint);
  }

  await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
  logger.info('[admin:bet] Filter command executed', { filterType, page: pagination.currentPage, totalPages: pagination.totalPages, count: filtered.length });
}

/**
 * Handle /promover command - Promote bet to posting queue (Story 13.2)
 * Sets elegibilidade='elegivel' and promovida_manual=true
 * Promoted bets bypass the minimum odds filter (>= 1.60)
 */
async function handlePromoverCommand(bot, msg, betId) {
  logger.info('[admin:bet] Received /promover command', { chatId: msg.chat.id, betId });

  // AC5: Comando sem ID mostra ajuda
  if (!betId) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Uso: /promover <id>\n\nExemplo: /promover 45`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Usar a nova função promoverAposta do betService
  const result = await promoverAposta(betId);

  // AC4: ID inválido
  if (!result.success) {
    if (result.error.code === 'ALREADY_PROMOTED') {
      // AC3: Aposta já promovida
      await bot.sendMessage(
        msg.chat.id,
        `⚠️ Aposta #${betId} já está promovida`,
        { reply_to_message_id: msg.message_id }
      );
    } else {
      await bot.sendMessage(
        msg.chat.id,
        `❌ ${result.error.message}`,
        { reply_to_message_id: msg.message_id }
      );
    }
    return;
  }

  // AC2 + AC6: Sucesso com feedback visual
  const bet = result.data;
  const oddsDisplay = bet.odds
    ? `${bet.odds.toFixed(2)}${bet.odds < 1.60 ? ' (abaixo do mínimo)' : ''}`
    : 'N/A';

  const response = `✅ *APOSTA PROMOVIDA*

#${bet.id} ${bet.homeTeamName} vs ${bet.awayTeamName}
🎯 ${bet.betMarket}
📊 Odd: ${oddsDisplay}

⚡ Promoção manual ativada
📤 Será incluída na próxima postagem`;

  await bot.sendMessage(
    msg.chat.id,
    response,
    { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
  );

  logger.info('[admin:bet] Bet promoted', { betId, odds: bet.odds, promovidaManual: bet.promovidaManual });
}

/**
 * Handle /remover command - Remove bet from posting queue (Story 13.3)
 * Sets elegibilidade='removida'
 * Can be reversed using /promover
 */
async function handleRemoverCommand(bot, msg, betId) {
  logger.info('[admin:bet] Received /remover command', { chatId: msg.chat.id, betId });

  // AC5: Comando sem ID mostra ajuda
  if (!betId) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Uso: /remover <id>\n\nExemplo: /remover 45`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  // Usar a função removerAposta do betService
  const result = await removerAposta(betId);

  // AC4: ID inválido
  if (!result.success) {
    if (result.error.code === 'ALREADY_REMOVED') {
      // AC3: Aposta já removida
      await bot.sendMessage(
        msg.chat.id,
        `⚠️ Aposta #${betId} já está removida da fila`,
        { reply_to_message_id: msg.message_id }
      );
    } else {
      await bot.sendMessage(
        msg.chat.id,
        `❌ ${result.error.message}`,
        { reply_to_message_id: msg.message_id }
      );
    }
    return;
  }

  // AC2: Sucesso com feedback visual e dica de reversão
  const bet = result.data;

  const response = `✅ *APOSTA REMOVIDA DA FILA*

#${bet.id} ${bet.homeTeamName} vs ${bet.awayTeamName}
🎯 ${bet.betMarket}

⛔ Removida da fila de postagem
💡 Use \`/promover ${bet.id}\` para reverter`;

  await bot.sendMessage(
    msg.chat.id,
    response,
    { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
  );

  logger.info('[admin:bet] Bet removed from queue', { betId, elegibilidade: bet.elegibilidade });
}

/**
 * Handle /fila command - Show posting queue status (Story 13.4, 14.6)
 * Mostra apostas ativas (posted) + novas que serão postadas
 * Usage: /fila [pagina]
 */
async function handleFilaCommand(bot, msg, page = 1) {
  logger.info('[admin:bet] Received /fila command', { chatId: msg.chat.id, page });

  const result = await getFilaStatus();

  if (!result.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ ${result.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const { filaCompleta, ativas, novas, counts, slotsDisponiveis, nextPost } = result.data;

  // Fila vazia
  if (filaCompleta.length === 0) {
    await bot.sendMessage(
      msg.chat.id,
      `📋 *FILA DE POSTAGEM*\n\n` +
      `Nenhuma aposta na fila de postagem.\n\n` +
      `💡 Use /apostas para ver todas as apostas.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Story 14.6: Paginacao (10 por pagina)
  const PAGE_SIZE = 10;
  const pagination = paginateResults(filaCompleta, page, PAGE_SIZE);
  const displayBets = pagination.items;

  // Story 14.5: Format single bet for queue with day grouping
  const formatBetForQueue = (bet) => {
    const kickoff = new Date(bet.kickoffTime);
    const timeStr = kickoff.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
    const statusFlag = bet.betStatus === 'posted' ? '📤' : '🆕';
    const promoFlag = bet.promovidaManual ? ' ⚡' : '';
    const oddsDisplay = bet.odds ? bet.odds.toFixed(2) : 'N/A';

    return [
      `${statusFlag} #${bet.id} ${bet.homeTeamName} vs ${bet.awayTeamName}${promoFlag}`,
      `   🕐 ${timeStr} │ 🎯 ${bet.betMarket} @ ${oddsDisplay}`,
    ].join('\n');
  };

  // Formatar fila com agrupamento por dia (Story 14.5)
  const filaLines = formatBetListWithDays(displayBets, formatBetForQueue);

  // Montar resposta completa
  let response = `📋 *FILA DE POSTAGEM*
Pagina ${pagination.currentPage} de ${pagination.totalPages} • Total: ${pagination.totalItems}

*Proxima postagem:* ${nextPost.time} (em ${nextPost.diff})

*Na fila:* (📤 = ativa, 🆕 = nova, ⚡ = promovida)
${filaLines}

*Status:*
📤 Ativas: ${ativas.length}/${ativas.length + slotsDisponiveis}
🆕 Novas: ${novas.length}
📊 Slots livres: ${slotsDisponiveis}

*Resumo geral:*
✅ Elegiveis: ${counts.elegivel}
⚡ Promovidas: ${counts.promovidas}
⛔ Removidas: ${counts.removida}`;

  // Story 14.6: Footer com paginacao
  if (pagination.totalPages > 1) {
    response += `\n\n${formatPaginationFooter(pagination, '/fila')}`;
  }

  await bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
  logger.info('[admin:bet] Fila command executed', {
    total: filaCompleta.length,
    page: pagination.currentPage,
    totalPages: pagination.totalPages,
    ativas: ativas.length,
    novas: novas.length,
    slots: slotsDisponiveis
  });
}

module.exports = {
  // Handlers
  handleOddsCommand,
  handleApostasCommand,
  handleLinkUpdate,
  handleFiltrarCommand,
  handlePromoverCommand,
  handleRemoverCommand,
  handleFilaCommand,
  // Patterns (for router)
  LINK_PATTERN,
  ODDS_PATTERN,
  APOSTAS_PATTERN,
  LINK_COMMAND_PATTERN,
  FILTRAR_PATTERN,
  PROMOVER_PATTERN,
  REMOVER_PATTERN,
  FILA_PATTERN,
  // Constants
  VALID_FILTER_TYPES
  // Note: getRateIndicator is internal helper, not exported
};
