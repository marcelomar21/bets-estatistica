/**
 * Admin Group Message Handler
 * Handles incoming messages in the admin group, primarily for receiving deep links
 */
const { config } = require('../../lib/config');
const logger = require('../../lib/logger');
const { getBetById, updateBetLink, updateBetOdds, getAvailableBets, createManualBet, getOverviewStats, swapPostedBet, getBetsReadyForPosting, getActiveBetsForRepost, promoverAposta, removerAposta, getFilaStatus, getOddsHistory } = require('../services/betService');
const { runEnrichment } = require('../jobs/enrichOdds');
const { runPostBets, hasPendingConfirmation, getPendingConfirmationInfo } = require('../jobs/postBets');
const { generateBetCopy, clearBetCache } = require('../services/copyService');
const { getSuccessRateForDays, getSuccessRateStats, getDetailedStats } = require('../services/metricsService');
const { formatBetListWithDays, paginateResults, formatPaginationFooter } = require('../utils/formatters');
const { getMemberStats, calculateMRR, calculateConversionRate, getNewMembersThisWeek, getMemberDetails, getNotificationHistory, addManualTrialMember, extendMembership, appendToNotes, getTrialDays, setTrialDays, kickMemberFromGroup, markMemberAsRemoved } = require('../services/memberService');
const { getLatestExecutions, formatResult, withExecutionLogging } = require('../services/jobExecutionService');

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

// Regex to match "/filtrar [tipo] [pagina]" command (Story 12.5, 14.6)
const FILTRAR_PATTERN = /^\/filtrar(?:\s+(sem_odds|sem_link|com_link|com_odds|prontas))?(?:\s+(\d+))?$/i;

// Regex to match "/simular [novo|ID]" command (Story 12.6)
const SIMULAR_PATTERN = /^\/simular(?:\s+(novo|\d+))?$/i;

// Regex to match "/promover ID" command (Story 13.2)
const PROMOVER_PATTERN = /^\/promover(?:\s+(\d+))?$/i;

// Regex to match "/remover ID" command (Story 13.3)
const REMOVER_PATTERN = /^\/remover(?:\s+(\d+))?$/i;

// Regex to match "/fila [pagina]" command (Story 13.4, 14.6)
const FILA_PATTERN = /^\/fila(?:\s+(\d+))?$/i;

// Regex to match "/metricas" command (Story 11.4)
const METRICAS_PATTERN = /^\/metricas$/i;

// Regex to match "/atualizados [pagina]" command (Story 14.9)
const ATUALIZADOS_PATTERN = /^\/atualizados(?:\s+(\d+))?$/i;

// Story 16.7: Regex patterns for member management commands
const MEMBROS_PATTERN = /^\/membros$/i;
const MEMBRO_PATTERN = /^\/membro\s+(.+)$/i;
const TRIAL_CONFIG_PATTERN = /^\/trial(?:\s+(\d+))?$/i;
const ADD_TRIAL_PATTERN = /^\/add_trial\s+(.+)$/i;
const REMOVER_MEMBRO_PATTERN = /^\/remover_membro\s+(\S+)(?:\s+(.+))?$/i;
const ESTENDER_PATTERN = /^\/estender\s+(\S+)\s+(\d+)$/i;

// Story 16.7: ADR-003 - Pending removals with auto-cleanup 60s
const pendingRemovals = new Map();
const REMOVAL_TIMEOUT_MS = 60000;

// Constants for /metricas formatting
const MAX_MARKET_NAME_LENGTH = 25;

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
  // Story 14.8: Passar jobName para registro no historico
  const updateResult = await updateBetOdds(betId, odds, `Odds manual via admin: ${odds}`, 'manual_admin_/odds');

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

  // Story 14.5: Format single bet for day grouping
  const formatBetForList = (bet) => {
    const kickoff = new Date(bet.kickoffTime);
    const timeStr = kickoff.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const oddsDisplay = bet.odds ? `💰 ${bet.odds.toFixed(2)}` : '⚠️ *SEM ODD*';
    const linkDisplay = bet.hasLink ? '🔗' : '❌';
    const statusLabel = getStatusLabel(bet.betStatus);

    return [
      `🆔 *#${bet.id}* │ ${statusLabel}`,
      `⚽ ${bet.homeTeamName} x ${bet.awayTeamName}`,
      `🕐 ${timeStr} │ 🎯 ${bet.betMarket}`,
      `${oddsDisplay} │ ${linkDisplay}`,
      '', // Empty line between bets
    ].join('\n');
  };

  // Format message with day grouping (Story 14.5)
  const lines = [`📋 *APOSTAS DISPONÍVEIS*`, `Página ${currentPage} de ${totalPages} • Total: ${bets.length}`, ''];

  // Add day-grouped bets
  const groupedContent = formatBetListWithDays(displayBets, formatBetForList);
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

  logger.info('Listed available bets', { count: displayBets.length, page: currentPage, totalPages });
}

/**
 * Handle /status command - Show bot status with job executions
 */
async function handleStatusCommand(bot, msg) {
  const now = new Date();
  const nowSP = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // Header always shows
  let statusText = `🤖 *Status do Bot*\n\n✅ Bot online (webhook mode)\n📊 Ambiente: ${config.env}\n🕐 ${nowSP}\n`;

  // Fetch job executions
  const execResult = await getLatestExecutions();

  if (!execResult.success) {
    statusText += '\n⚠️ Erro ao buscar jobs';
    await bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'Markdown' });
    logger.warn('Status command: failed to fetch executions', { error: execResult.error?.message });
    return;
  }

  const executions = execResult.data || [];

  if (executions.length === 0) {
    statusText += '\n📋 Nenhuma execução registrada';
    await bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'Markdown' });
    logger.info('Status command executed (no executions)');
    return;
  }

  // Format job executions list
  statusText += '\n📋 *Últimas Execuções:*\n';

  let failCount = 0;
  let warnCount = 0;
  const thirtyMinAgo = Date.now() - 30 * 60 * 1000;

  for (const exec of executions) {
    const startedAt = new Date(exec.started_at);
    const timeStr = startedAt.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit'
    });

    let statusIcon;
    let resultStr = '';

    if (exec.status === 'running') {
      // Check if running for too long (> 30 min)
      const runningMs = Date.now() - startedAt.getTime();
      const runningMin = Math.round(runningMs / 60000);

      if (startedAt.getTime() < thirtyMinAgo) {
        statusIcon = '⏳';
        resultStr = `running há ${runningMin}min`;
        warnCount++;
      } else {
        statusIcon = '🔄';
        resultStr = 'running';
      }
    } else if (exec.status === 'failed') {
      statusIcon = '❌';
      resultStr = exec.error_message
        ? (exec.error_message.length > 30 ? exec.error_message.substring(0, 27) + '...' : exec.error_message)
        : 'erro';
      failCount++;
    } else if (exec.status === 'success') {
      // Check if result has warnings (for healthCheck)
      if (exec.result?.alerts?.length > 0) {
        statusIcon = '⚠️';
        warnCount++;
      } else {
        statusIcon = '✅';
      }
      resultStr = formatResult(exec.job_name, exec.result);
    } else {
      statusIcon = '❓';
      resultStr = exec.status;
    }

    // Format line: icon job · HH:MM · result
    const line = `${statusIcon} ${exec.job_name} · ${timeStr}${resultStr ? ` · ${resultStr}` : ''}`;
    statusText += `${line}\n`;
  }

  // Add summary footer
  if (failCount > 0 || warnCount > 0) {
    statusText += '\n';
    if (failCount > 0) statusText += `❌ ${failCount} falha(s)`;
    if (failCount > 0 && warnCount > 0) statusText += ' │ ';
    if (warnCount > 0) statusText += `⚠️ ${warnCount} warn(s)`;
  }

  // Truncate if too long (Telegram limit ~4096, use 2000 for safety)
  // Truncate at line boundary to avoid breaking markdown
  if (statusText.length > 2000) {
    const lines = statusText.split('\n');
    let truncated = '';
    for (const line of lines) {
      if ((truncated + line + '\n').length > 1990) break;
      truncated += line + '\n';
    }
    statusText = truncated.trim() + '\n...';
  }

  await bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'Markdown' });
  logger.info('Status command executed', { executions: executions.length, fromCache: execResult.fromCache });
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
 * Handle /filtrar command - Filter bets by criteria (Story 12.5, 14.6)
 * Usage: /filtrar [tipo] [pagina]
 */
async function handleFiltrarCommand(bot, msg, filterType, page = 1) {
  logger.info('Received /filtrar command', { chatId: msg.chat.id, filterType, page });

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
  logger.info('Filter command executed', { filterType, page: pagination.currentPage, totalPages: pagination.totalPages, count: filtered.length });
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
        await bot.deleteMessage(msg.chat.id, workingMsg.message_id).catch(() => { });
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
      await bot.deleteMessage(msg.chat.id, workingMsg.message_id).catch(() => { });
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
      const rateResult = await getSuccessRateForDays(30);
      if (rateResult.success) {
        successRate = rateResult.data.rate;
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
    await bot.deleteMessage(msg.chat.id, workingMsg.message_id).catch(() => { });
    await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown', disable_web_page_preview: true });

    logger.info('Preview generated', { betsCount: betsToPreview.length, isNovo });
  } catch (err) {
    logger.error('Failed to generate preview', { error: err.message });
    await bot.deleteMessage(msg.chat.id, workingMsg.message_id).catch(() => { });
    await bot.sendMessage(msg.chat.id, `❌ Erro ao gerar preview: ${err.message}`, { reply_to_message_id: msg.message_id });
  }
}

/**
 * Handle /membros command - Show member statistics summary (Story 16.7)
 * AC1: Displays total members, MRR, conversion rate, and weekly trend
 */
async function handleMembrosCommand(bot, msg) {
  logger.info('Received /membros command', { chatId: msg.chat.id, userId: msg.from?.id });

  try {
    // Fetch all member stats in parallel
    const [statsResult, conversionResult, newMembersResult] = await Promise.all([
      getMemberStats(),
      calculateConversionRate(),
      getNewMembersThisWeek(),
    ]);

    if (!statsResult.success) {
      await bot.sendMessage(
        msg.chat.id,
        `❌ Erro ao buscar estatísticas: ${statsResult.error.message}`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    const stats = statsResult.data;
    const mrr = calculateMRR(stats.ativo);
    const conversionRate = conversionResult.success ? conversionResult.data.rate.toFixed(1) : 'N/A';
    const newMembers = newMembersResult.success ? newMembersResult.data.count : 0;

    // Build trend indicator
    const trendEmoji = newMembers > 0 ? '📈' : '➖';

    const message = `👥 *RESUMO DE MEMBROS*

📊 *Status atual:*
├ Ativos: *${stats.ativo}*
├ Trial: *${stats.trial}*
├ Inadimplentes: *${stats.inadimplente}*
└ Removidos: *${stats.removido}*

💰 *MRR:* R$ ${mrr.toLocaleString('pt-BR')}
🔄 *Conversão trial→ativo:* ${conversionRate}%
${trendEmoji} *Novos esta semana:* ${newMembers}

_Total histórico: ${stats.total} membros_`;

    await bot.sendMessage(msg.chat.id, message, {
      reply_to_message_id: msg.message_id,
      parse_mode: 'Markdown'
    });

    logger.info('Member stats displayed', { stats, mrr, conversionRate, newMembers });
  } catch (err) {
    logger.error('Failed to handle /membros command', { error: err.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro inesperado: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

/**
 * Handle /membro command - Show detailed member status (Story 16.7)
 * AC2: Displays detailed member info including notifications history
 * Usage: /membro @username or /membro 123456789 (telegram_id)
 */
async function handleMembroCommand(bot, msg, identifier) {
  logger.info('Received /membro command', { chatId: msg.chat.id, userId: msg.from?.id, identifier });

  try {
    // Get member details
    const memberResult = await getMemberDetails(identifier);

    if (!memberResult.success) {
      if (memberResult.error.code === 'MEMBER_NOT_FOUND') {
        await bot.sendMessage(
          msg.chat.id,
          `❌ Membro não encontrado.\nUse @username ou telegram_id numérico.`,
          { reply_to_message_id: msg.message_id }
        );
      } else {
        await bot.sendMessage(
          msg.chat.id,
          `❌ Erro: ${memberResult.error.message}`,
          { reply_to_message_id: msg.message_id }
        );
      }
      return;
    }

    const member = memberResult.data;

    // Get notification history
    const notifResult = await getNotificationHistory(member.id, 5);
    const notifications = notifResult.success ? notifResult.data : [];

    // Format dates
    const formatDate = (date) => date ? new Date(date).toLocaleDateString('pt-BR') : 'N/A';

    // Calculate days remaining
    let daysRemaining = 'N/A';
    if (member.status === 'trial' && member.trial_ends_at) {
      const remaining = Math.ceil((new Date(member.trial_ends_at) - new Date()) / (24 * 60 * 60 * 1000));
      daysRemaining = `${remaining} dias`;
    } else if (member.status === 'ativo' && member.subscription_ends_at) {
      const remaining = Math.ceil((new Date(member.subscription_ends_at) - new Date()) / (24 * 60 * 60 * 1000));
      daysRemaining = `${remaining} dias`;
    }

    // Status emoji
    const statusEmoji = {
      'trial': '🆓',
      'ativo': '✅',
      'inadimplente': '⚠️',
      'removido': '❌'
    };

    // Format notification history
    let notifText = '';
    if (notifications.length > 0) {
      notifText = '\n\n📨 *Últimas notificações:*\n';
      notifText += notifications.map(n => {
        const date = new Date(n.created_at).toLocaleDateString('pt-BR');
        return `• ${date}: ${n.notification_type}`;
      }).join('\n');
    } else {
      notifText = '\n\n📨 _Sem notificações recentes_';
    }

    const message = `👤 *DETALHES DO MEMBRO*

${statusEmoji[member.status] || '❓'} *Status:* ${member.status}
🆔 *Telegram ID:* \`${member.telegram_id}\`
👤 *Username:* ${member.telegram_username ? '@' + member.telegram_username : '_sem username_'}
📧 *Email:* ${member.email || '_não informado_'}
📅 *Entrada:* ${formatDate(member.created_at)}
⏰ *Dias restantes:* ${daysRemaining}
💳 *Pagamento:* ${member.payment_method || 'N/A'}
🔄 *Última renovação:* ${formatDate(member.last_payment_at)}${notifText}`;

    await bot.sendMessage(msg.chat.id, message, {
      reply_to_message_id: msg.message_id,
      parse_mode: 'Markdown'
    });

    logger.info('Member details displayed', { memberId: member.id, status: member.status });
  } catch (err) {
    logger.error('Failed to handle /membro command', { error: err.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro inesperado: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

/**
 * Handle /trial command - Configure trial duration (Story 16.7)
 * AC3: View current trial days or set new value (1-30)
 * Usage: /trial (view) or /trial 14 (set to 14 days)
 */
async function handleTrialConfigCommand(bot, msg, days) {
  const operatorUsername = msg.from?.username || msg.from?.id?.toString() || 'unknown';
  logger.info('Received /trial command', { chatId: msg.chat.id, userId: msg.from?.id, days });

  try {
    // If no days specified, show current config
    if (days === null || days === undefined) {
      const result = await getTrialDays();

      if (!result.success) {
        await bot.sendMessage(
          msg.chat.id,
          `❌ Erro ao buscar configuração: ${result.error.message}`,
          { reply_to_message_id: msg.message_id }
        );
        return;
      }

      const { days: currentDays, source } = result.data;
      const sourceLabel = source === 'system_config' ? 'banco de dados' : 'variável de ambiente';

      await bot.sendMessage(
        msg.chat.id,
        `⏰ *Configuração de Trial*\n\n` +
        `Duração atual: *${currentDays} dias*\n` +
        `Fonte: _${sourceLabel}_\n\n` +
        `💡 Use \`/trial N\` para alterar (1-30 dias)`,
        { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
      );
      return;
    }

    // Validate range
    if (days < 1 || days > 30) {
      await bot.sendMessage(
        msg.chat.id,
        `❌ Valor inválido. Use entre 1 e 30 dias.`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    // Set new value
    const result = await setTrialDays(days, operatorUsername);

    if (!result.success) {
      await bot.sendMessage(
        msg.chat.id,
        `❌ Erro ao alterar: ${result.error.message}`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    const { oldValue, newValue } = result.data;

    await bot.sendMessage(
      msg.chat.id,
      `✅ *Trial alterado para ${newValue} dias*\n\n` +
      `Valor anterior: ${oldValue || 'N/A'} dias\n` +
      `Alterado por: @${operatorUsername}\n\n` +
      `_Aplica-se apenas a novos membros_`,
      { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
    );

    logger.info('Trial config changed', { operator: operatorUsername, oldValue, newValue });
  } catch (err) {
    logger.error('Failed to handle /trial command', { error: err.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro inesperado: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

/**
 * Handle /add_trial command - Add user to trial (Story 16.7)
 * AC4: Creates new trial or reactivates removed member
 * Usage: /add_trial @username or /add_trial 123456789
 */
async function handleAddTrialCommand(bot, msg, identifier) {
  logger.info('Received /add_trial command', { chatId: msg.chat.id, userId: msg.from?.id, identifier });

  try {
    // Clean identifier
    const cleanId = identifier.startsWith('@') ? identifier.slice(1) : identifier;
    const isNumeric = /^\d+$/.test(cleanId);

    // Validate identifier format
    if (!isNumeric && cleanId.length < 2) {
      await bot.sendMessage(
        msg.chat.id,
        `❌ Use @username ou telegram_id numérico`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    // Get telegram_id from identifier
    let telegramId = isNumeric ? cleanId : null;
    let username = isNumeric ? null : cleanId;

    // If we have a username, we need to look up the telegram_id first
    if (!telegramId) {
      // For now, username-only add is not supported - needs telegram_id
      await bot.sendMessage(
        msg.chat.id,
        `⚠️ Para adicionar por username, use o telegram_id numérico.\n\n` +
        `💡 O telegram_id pode ser obtido quando o usuário entra no grupo.`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    // Get trial days config
    const trialResult = await getTrialDays();
    const trialDays = trialResult.success ? trialResult.data.days : 7;

    // Add member to trial
    const result = await addManualTrialMember(telegramId, username);

    if (!result.success) {
      if (result.error.code === 'MEMBER_ACTIVE') {
        await bot.sendMessage(
          msg.chat.id,
          `⚠️ Membro já está ativo.\nUse /estender para dar mais tempo.`,
          { reply_to_message_id: msg.message_id }
        );
      } else {
        await bot.sendMessage(
          msg.chat.id,
          `❌ Erro: ${result.error.message}`,
          { reply_to_message_id: msg.message_id }
        );
      }
      return;
    }

    const member = result.data;
    const trialEnd = new Date(member.trial_ends_at);
    const trialEndStr = trialEnd.toLocaleDateString('pt-BR');

    const actionText = result.isNew ? 'adicionado' : 'reativado';
    const displayName = member.telegram_username ? `@${member.telegram_username}` : `ID ${member.telegram_id}`;

    await bot.sendMessage(
      msg.chat.id,
      `✅ *Membro ${actionText} ao trial*\n\n` +
      `👤 ${displayName}\n` +
      `🆔 \`${member.telegram_id}\`\n` +
      `⏰ ${trialDays} dias (até ${trialEndStr})`,
      { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
    );

    logger.info('Member added to trial', { telegramId, isNew: result.isNew, trialEnds: member.trial_ends_at });
  } catch (err) {
    logger.error('Failed to handle /add_trial command', { error: err.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro inesperado: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

/**
 * Handle /remover_membro command - Remove member from group (Story 16.7)
 * AC5: Shows confirmation preview with inline keyboard
 * Usage: /remover_membro @username [motivo]
 */
async function handleRemoverMembroCommand(bot, msg, identifier, motivo) {
  const operatorUsername = msg.from?.username || msg.from?.id?.toString() || 'unknown';
  logger.info('Received /remover_membro command', { chatId: msg.chat.id, userId: msg.from?.id, identifier, motivo });

  try {
    // Get member details
    const memberResult = await getMemberDetails(identifier);

    if (!memberResult.success) {
      if (memberResult.error.code === 'MEMBER_NOT_FOUND') {
        await bot.sendMessage(
          msg.chat.id,
          `❌ Membro não encontrado.\nUse @username ou telegram_id numérico.`,
          { reply_to_message_id: msg.message_id }
        );
      } else {
        await bot.sendMessage(
          msg.chat.id,
          `❌ Erro: ${memberResult.error.message}`,
          { reply_to_message_id: msg.message_id }
        );
      }
      return;
    }

    const member = memberResult.data;

    // Check if already removed
    if (member.status === 'removido') {
      await bot.sendMessage(
        msg.chat.id,
        `⚠️ Membro já está removido.\nUse /add_trial para reativar.`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    // Format dates
    const joinDate = member.created_at ? new Date(member.created_at).toLocaleDateString('pt-BR') : 'N/A';
    const displayName = member.telegram_username ? `@${member.telegram_username}` : `ID ${member.telegram_id}`;

    // Create unique callback data ID
    const callbackId = `remove_${member.id}_${Date.now()}`;

    // Store pending removal data
    const timeoutId = setTimeout(() => {
      if (pendingRemovals.has(callbackId)) {
        pendingRemovals.delete(callbackId);
        logger.debug('Pending removal expired', { callbackId });
      }
    }, REMOVAL_TIMEOUT_MS);

    pendingRemovals.set(callbackId, {
      memberId: member.id,
      telegramId: member.telegram_id,
      displayName,
      motivo: motivo || 'manual_removal',
      operator: operatorUsername,
      chatId: msg.chat.id,
      messageId: null, // Will be set after sending
      timeoutId
    });

    // Send confirmation message with inline keyboard
    const confirmMsg = await bot.sendMessage(
      msg.chat.id,
      `⚠️ *CONFIRMAR REMOÇÃO*\n\n` +
      `👤 ${displayName}\n` +
      `🆔 \`${member.telegram_id}\`\n` +
      `📊 Status: ${member.status}\n` +
      `📅 Membro desde: ${joinDate}\n\n` +
      `${motivo ? `📝 Motivo: ${motivo}\n\n` : ''}` +
      `_Expira em 60 segundos_`,
      {
        reply_to_message_id: msg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Confirmar', callback_data: `confirm_${callbackId}` },
            { text: '❌ Cancelar', callback_data: `cancel_${callbackId}` }
          ]]
        }
      }
    );

    // Update with message ID for later editing
    const pendingData = pendingRemovals.get(callbackId);
    if (pendingData) {
      pendingData.messageId = confirmMsg.message_id;
    }

    logger.info('Removal confirmation sent', { callbackId, memberId: member.id });
  } catch (err) {
    logger.error('Failed to handle /remover_membro command', { error: err.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro inesperado: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

/**
 * Handle callback queries for member removal confirmation (Story 16.7)
 * AC5: Process confirm/cancel button clicks
 */
async function handleRemovalCallback(bot, callbackQuery) {
  const { data, message, from } = callbackQuery;

  // Parse callback data
  const [action, ...callbackIdParts] = data.split('_');
  const callbackId = callbackIdParts.join('_');

  // Handle non-removal callbacks
  if (!callbackId.startsWith('remove_')) {
    return false; // Not a removal callback, let other handlers process
  }

  const fullCallbackId = callbackId;
  const pendingData = pendingRemovals.get(fullCallbackId);

  // Answer callback query to remove loading state
  await bot.answerCallbackQuery(callbackQuery.id);

  // Check if removal expired
  if (!pendingData) {
    await bot.editMessageText(
      '⏰ Confirmação expirada. Use o comando novamente.',
      {
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: 'Markdown'
      }
    );
    return true;
  }

  // Clear timeout
  clearTimeout(pendingData.timeoutId);
  pendingRemovals.delete(fullCallbackId);

  const operatorUsername = from?.username || from?.id?.toString() || 'unknown';

  if (action === 'cancel') {
    await bot.editMessageText(
      `❌ Remoção cancelada.\n\n_Cancelado por @${operatorUsername}_`,
      {
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: 'Markdown'
      }
    );
    logger.info('Removal cancelled', { callbackId: fullCallbackId, operator: operatorUsername });
    return true;
  }

  if (action === 'confirm') {
    try {
      // Send farewell message (consistent with kick-expired.js)
      const groupId = config.telegram.publicGroupId;
      try {
        await bot.sendMessage(
          pendingData.telegramId,
          `👋 Olá! Você foi removido do grupo por um administrador.\n\n` +
          `${pendingData.motivo !== 'manual_removal' ? `📝 Motivo: ${pendingData.motivo}\n\n` : ''}` +
          `Se tiver dúvidas, entre em contato conosco.`
        );
      } catch (dmErr) {
        logger.warn('Could not send farewell DM', { telegramId: pendingData.telegramId, error: dmErr.message });
      }

      // Kick from group
      const kickResult = await kickMemberFromGroup(pendingData.telegramId, groupId);

      if (!kickResult.success && kickResult.error.code !== 'USER_NOT_IN_GROUP') {
        await bot.editMessageText(
          `❌ Erro ao remover do grupo: ${kickResult.error.message}`,
          {
            chat_id: message.chat.id,
            message_id: message.message_id,
            parse_mode: 'Markdown'
          }
        );
        return true;
      }

      // Mark as removed in database
      const markResult = await markMemberAsRemoved(pendingData.memberId, pendingData.motivo);

      if (!markResult.success) {
        logger.error('Failed to mark member as removed', { memberId: pendingData.memberId, error: markResult.error });
      }

      // Append to notes for audit trail
      await appendToNotes(pendingData.memberId, operatorUsername, `Removido manualmente - ${pendingData.motivo}`);

      await bot.editMessageText(
        `✅ *MEMBRO REMOVIDO*\n\n` +
        `👤 ${pendingData.displayName}\n` +
        `📝 Motivo: ${pendingData.motivo}\n` +
        `👮 Removido por: @${operatorUsername}`,
        {
          chat_id: message.chat.id,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        }
      );

      logger.info('Member removed successfully', {
        memberId: pendingData.memberId,
        telegramId: pendingData.telegramId,
        motivo: pendingData.motivo,
        operator: operatorUsername
      });
    } catch (err) {
      logger.error('Failed to process removal confirmation', { error: err.message });
      await bot.editMessageText(
        `❌ Erro ao processar remoção: ${err.message}`,
        {
          chat_id: message.chat.id,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        }
      );
    }
    return true;
  }

  return false;
}

/**
 * Handle /estender command - Extend membership by X days (Story 16.7)
 * AC6: Extends trial_ends_at or subscription_ends_at
 * Usage: /estender @username 7
 */
async function handleEstenderCommand(bot, msg, identifier, days) {
  const operatorUsername = msg.from?.username || msg.from?.id?.toString() || 'unknown';
  logger.info('Received /estender command', { chatId: msg.chat.id, userId: msg.from?.id, identifier, days });

  try {
    // Validate range
    if (days < 1 || days > 90) {
      await bot.sendMessage(
        msg.chat.id,
        `❌ Valor inválido. Use entre 1 e 90 dias.`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    // Get member details
    const memberResult = await getMemberDetails(identifier);

    if (!memberResult.success) {
      if (memberResult.error.code === 'MEMBER_NOT_FOUND') {
        await bot.sendMessage(
          msg.chat.id,
          `❌ Membro não encontrado.\nUse @username ou telegram_id numérico.`,
          { reply_to_message_id: msg.message_id }
        );
      } else {
        await bot.sendMessage(
          msg.chat.id,
          `❌ Erro: ${memberResult.error.message}`,
          { reply_to_message_id: msg.message_id }
        );
      }
      return;
    }

    const member = memberResult.data;
    const displayName = member.telegram_username ? `@${member.telegram_username}` : `ID ${member.telegram_id}`;

    // Check if member is removed
    if (member.status === 'removido') {
      await bot.sendMessage(
        msg.chat.id,
        `❌ Membro removido.\nUse /add_trial para reativar.`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    // Get current end date for display
    let currentEndDate = null;
    if (member.status === 'trial') {
      currentEndDate = member.trial_ends_at ? new Date(member.trial_ends_at) : new Date();
    } else if (member.status === 'ativo' || member.status === 'inadimplente') {
      currentEndDate = member.subscription_ends_at ? new Date(member.subscription_ends_at) : new Date();
    }

    const currentEndStr = currentEndDate ? currentEndDate.toLocaleDateString('pt-BR') : 'N/A';
    const newEndDate = currentEndDate ? new Date(currentEndDate.getTime() + days * 24 * 60 * 60 * 1000) : null;
    const newEndStr = newEndDate ? newEndDate.toLocaleDateString('pt-BR') : 'N/A';

    // Extend membership
    const extendResult = await extendMembership(member.id, days, operatorUsername);

    if (!extendResult.success) {
      await bot.sendMessage(
        msg.chat.id,
        `❌ Erro ao estender: ${extendResult.error.message}`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    await bot.sendMessage(
      msg.chat.id,
      `✅ *ASSINATURA ESTENDIDA*\n\n` +
      `👤 ${displayName}\n` +
      `📊 Status: ${member.status}\n` +
      `📅 Anterior: ${currentEndStr}\n` +
      `📅 Nova: ${newEndStr}\n\n` +
      `➕ ${days} dias de cortesia\n` +
      `👮 Por: @${operatorUsername}`,
      { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
    );

    logger.info('Membership extended', { memberId: member.id, days, operator: operatorUsername });
  } catch (err) {
    logger.error('Failed to handle /estender command', { error: err.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro inesperado: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

/**
 * Handle /metricas command - Show detailed metrics (Story 11.4)
 */
async function handleMetricasCommand(bot, msg) {
  logger.info('Received /metricas command', { chatId: msg.chat.id, userId: msg.from?.id });

  // Get both success rate and detailed stats
  const [rateResult, detailsResult] = await Promise.all([
    getSuccessRateStats(),
    getDetailedStats(),
  ]);

  if (!rateResult.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao buscar métricas: ${rateResult.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const stats = rateResult.data;
  const details = detailsResult.success ? detailsResult.data : null;

  if (!detailsResult.success) {
    logger.warn('Failed to get detailed stats for /metricas', {
      error: detailsResult.error?.message,
    });
  }

  // Format by-market breakdown
  let byMarketText = '';
  if (details?.byMarket && Object.keys(details.byMarket).length > 0) {
    byMarketText = '\n*Por Mercado:*\n';
    for (const [market, data] of Object.entries(details.byMarket)) {
      const total = data.success + data.failure;
      const rate = total > 0 ? ((data.success / total) * 100).toFixed(1) : '0.0';
      // Truncate long market names
      const marketName = market.length > MAX_MARKET_NAME_LENGTH
        ? market.substring(0, MAX_MARKET_NAME_LENGTH - 3) + '...'
        : market;
      byMarketText += `• ${marketName}: ${data.success}/${total} (${rate}%)\n`;
    }
  }

  // Build message (using different emoji than /overview for distinction)
  const lines = ['📈 *MÉTRICAS DETALHADAS*', ''];

  // Success rate section
  lines.push('*Taxa de Acerto:*');
  if (stats.last30Days?.total > 0) {
    lines.push(`• 30 dias: ${stats.last30Days.success}/${stats.last30Days.total} (${stats.last30Days.rate?.toFixed(1)}%)`);
  } else {
    lines.push('• 30 dias: _Sem dados_');
  }

  if (stats.allTime?.total > 0) {
    lines.push(`• All-time: ${stats.allTime.success}/${stats.allTime.total} (${stats.allTime.rate?.toFixed(1)}%)`);
  } else {
    lines.push('• All-time: _Sem dados_');
  }

  // By market section
  if (byMarketText) {
    lines.push('');
    lines.push(byMarketText.trim());
  }

  // Posting stats
  if (details) {
    lines.push('');
    lines.push('*Postagens:*');
    lines.push(`• Total postadas: ${details.totalPosted}`);
    lines.push(`• Concluídas: ${details.totalCompleted}`);
    if (details.averageOdds) {
      lines.push(`• Odds média: ${details.averageOdds.toFixed(2)}`);
    }
  }

  // Footer hint
  lines.push('');
  lines.push('💡 `/overview` para resumo geral');

  await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
  logger.info('Metricas command executed', {
    allTime: stats.allTime?.total,
    last30Days: stats.last30Days?.total,
  });
}

/**
 * Handle /promover command - Promote bet to posting queue (Story 13.2)
 * Sets elegibilidade='elegivel' and promovida_manual=true
 * Promoted bets bypass the minimum odds filter (>= 1.60)
 */
async function handlePromoverCommand(bot, msg, betId) {
  logger.info('Received /promover command', { chatId: msg.chat.id, betId });

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

  logger.info('Bet promoted', { betId, odds: bet.odds, promovidaManual: bet.promovidaManual });
}

/**
 * Handle /remover command - Remove bet from posting queue (Story 13.3)
 * Sets elegibilidade='removida'
 * Can be reversed using /promover
 */
async function handleRemoverCommand(bot, msg, betId) {
  logger.info('Received /remover command', { chatId: msg.chat.id, betId });

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

  logger.info('Bet removed from queue', { betId, elegibilidade: bet.elegibilidade });
}

/**
 * Handle /fila command - Show posting queue status (Story 13.4, 14.6)
 * Mostra apostas ativas (posted) + novas que serão postadas
 * Usage: /fila [pagina]
 */
async function handleFilaCommand(bot, msg, page = 1) {
  logger.info('Received /fila command', { chatId: msg.chat.id, page });

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
  logger.info('Fila command executed', {
    total: filaCompleta.length,
    page: pagination.currentPage,
    totalPages: pagination.totalPages,
    ativas: ativas.length,
    novas: novas.length,
    slots: slotsDisponiveis
  });
}

/**
 * Handle /atualizados command - Lista historico de atualizacoes (Story 14.9)
 * Usage: /atualizados or /atualizados 2 (for page 2)
 * @param {TelegramBot} bot - Bot instance
 * @param {object} msg - Telegram message object
 * @param {number} page - Page number (default: 1)
 */
async function handleAtualizadosCommand(bot, msg, page = 1) {
  logger.info('Received /atualizados command', { chatId: msg.chat.id, page });

  const PAGE_SIZE = 10;
  const MAX_HISTORY_RECORDS = 500; // Limite seguro para evitar timeout

  // Validar página e logar se inválida
  if (page < 1 || !Number.isInteger(page)) {
    logger.warn('Invalid page requested for /atualizados, defaulting to 1', { requestedPage: page });
    page = 1;
  }

  // Buscar registros com limite maior para cobrir histórico completo
  const result = await getOddsHistory(48, MAX_HISTORY_RECORDS, 0);

  if (!result.success) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro ao buscar histórico: ${result.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const { history, total } = result.data;

  // AC4: Caso sem atualizacoes
  if (history.length === 0) {
    await bot.sendMessage(
      msg.chat.id,
      `📜 *HISTÓRICO DE ATUALIZAÇÕES*\n\nNenhuma atualização nas últimas 48 horas.\n\n_Atualizações aparecem após jobs de enrichOdds ou comandos /odds_`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Avisar se há mais registros que o limite buscado
  const isDataTruncated = total > MAX_HISTORY_RECORDS;
  if (isDataTruncated) {
    logger.warn('History data truncated due to limit', { total, limit: MAX_HISTORY_RECORDS });
  }

  // Agrupar por dia e hora (usando timezone Brasil)
  const grouped = groupHistoryByDayAndHour(history);

  // Flatten para paginacao
  const flatItems = [];
  const days = Object.keys(grouped).sort().reverse();
  for (const day of days) {
    const hours = Object.keys(grouped[day]).sort().reverse();
    for (const hour of hours) {
      for (const item of grouped[day][hour]) {
        flatItems.push({ ...item, day, hour });
      }
    }
  }

  // Paginar
  const totalPages = Math.ceil(flatItems.length / PAGE_SIZE);
  const validPage = Math.max(1, Math.min(page, totalPages));
  if (page !== validPage) {
    logger.debug('Page adjusted to valid range', { requested: page, adjusted: validPage, totalPages });
  }
  const startIndex = (validPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const pageItems = flatItems.slice(startIndex, endIndex);

  // Formatar mensagem
  let message = `📜 *HISTÓRICO DE ATUALIZAÇÕES*\nPágina ${validPage} de ${totalPages} • Total: ${flatItems.length}`;
  if (isDataTruncated) {
    message += ` _(mostrando últimos ${MAX_HISTORY_RECORDS})_`;
  }
  message += `\n\n`;

  let currentDay = null;
  for (const item of pageItems) {
    // Adicionar header do dia se mudou
    if (item.day !== currentDay) {
      currentDay = item.day;
      const dayLabel = formatDayLabelForHistory(item.day);
      message += `━━━━ *${dayLabel}* ━━━━\n\n`;
    }

    message += formatHistoryItem(item);
  }

  // Footer com paginação (AC2, AC5)
  message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  if (totalPages > 1) {
    message += `Página ${validPage} de ${totalPages}\n`;
    if (validPage < totalPages) {
      message += `Use \`/atualizados ${validPage + 1}\` para mais`;
    } else if (validPage > 1) {
      message += `Use \`/atualizados 1\` para o início`;
    }
  }

  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  logger.info('Atualizados command executed', { page: validPage, totalPages, totalItems: flatItems.length, dataTruncated: isDataTruncated });
}

/**
 * Agrupa historico por dia e hora usando timezone Brasil (Story 14.9)
 * @param {Array} history - Array de itens do historico
 * @returns {Object} Objeto agrupado por dia (YYYY-MM-DD) e hora (HH:00)
 */
function groupHistoryByDayAndHour(history) {
  const grouped = {};
  for (const item of history) {
    const date = new Date(item.createdAt);
    // Usar timezone Brasil para consistência com display
    const brDateStr = date.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const [datePart, timePart] = brDateStr.split(' ');
    const day = datePart; // YYYY-MM-DD
    const hour = `${timePart.substring(0, 2)}:00`;

    if (!grouped[day]) grouped[day] = {};
    if (!grouped[day][hour]) grouped[day][hour] = [];
    grouped[day][hour].push(item);
  }
  return grouped;
}

/**
 * Formata label do dia para historico (Story 14.9)
 * @param {string} day - Data no formato YYYY-MM-DD
 * @returns {string} Label formatado (HOJE, ONTEM, ou DD/MM)
 */
function formatDayLabelForHistory(day) {
  // Usar timezone Brasil para comparação de datas
  const now = new Date();
  const todayStr = now.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).split(' ')[0];
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterdayDate.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).split(' ')[0];

  const [_year, month, dayNum] = day.split('-');
  const formattedDate = `${dayNum}/${month}`;

  if (day === todayStr) {
    return `HOJE - ${formattedDate}`;
  }
  if (day === yesterdayStr) {
    return `ONTEM - ${formattedDate}`;
  }
  return formattedDate;
}

/**
 * Formata item do historico (Story 14.9, AC3)
 */
function formatHistoryItem(item) {
  const time = new Date(item.createdAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  });

  const match = item.homeTeamName && item.awayTeamName
    ? `${item.homeTeamName} x ${item.awayTeamName}`
    : `#${item.betId}`;

  // AC3: Mostrar old -> new para mudancas de odds
  if (item.updateType === 'odds_change') {
    const oldVal = item.oldValue != null ? item.oldValue.toFixed(2) : '?';
    const newVal = item.newValue != null ? item.newValue.toFixed(2) : '?';
    return `${time} #${item.betId}\n   ${match}\n   📊 ${oldVal} → ${newVal}\n\n`;
  }
  if (item.updateType === 'new_analysis') {
    const newVal = item.newValue != null ? item.newValue.toFixed(2) : '?';
    return `${time} #${item.betId} _(nova)_\n   ${match}\n   📊 Odd: ${newVal}\n\n`;
  }
  // Fallback para outros tipos
  return `${time} #${item.betId}\n   ${item.updateType}: ${item.newValue}\n\n`;
}

/**
 * Handle /help command - Show all admin commands
 */
async function handleHelpCommand(bot, msg) {
  const helpText = `
📚 *Comandos do Admin*

*📋 Consultas:*
/apostas - Listar apostas disponíveis
/fila - Ver fila de postagem
/filtrar - Filtrar apostas por critério
/atualizados - Histórico de atualizações (48h)
/simular - Preview da próxima postagem
/overview - Resumo com estatísticas
/metricas - Métricas detalhadas de acerto
/membros - Resumo de membros e MRR
/membro @user - Detalhes do membro
/trial [dias] - Ver/alterar duração trial
/status - Ver status do bot
/help - Ver esta ajuda

*✏️ Edição:*
/odd ID valor - Ajustar odd de aposta
/link ID URL - Adicionar link a aposta
/trocar ID1 ID2 - Trocar aposta postada
/promover ID - Promover aposta (ignora odds mínimas)
/remover ID - Remover aposta da fila
\`ID: URL\` - Adicionar link (atalho)

*➕ Criação:*
/adicionar - Ver formato de aposta manual

*⚡ Ações:*
/atualizar - Forçar atualização de odds
/postar - Forçar postagem imediata

*👥 Membros:*
/add_trial @user - Adicionar ao trial
/remover_membro @user - Remover membro
/estender @user N - Estender por N dias

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

  // Check if there's already a pending confirmation to prevent duplicate posts
  if (hasPendingConfirmation()) {
    const pendingInfo = getPendingConfirmationInfo();
    logger.warn('Blocked /postar - confirmation already pending', { pendingInfo });
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
    const result = await withExecutionLogging('post-bets-manual', () => runPostBets());

    // Delete "working" message
    try {
      await bot.deleteMessage(msg.chat.id, workingMsg.message_id);
    } catch (e) {
      // Ignore delete errors
    }

    const totalSent = (result.reposted || 0) + (result.posted || 0);

    // If cancelled via confirmation, don't send additional message
    if (result.cancelled) {
      logger.info('Posting cancelled via confirmation');
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
  const statusMsg = updateResult.promoted
    ? `🚀 *Auto-promovida para PRONTA!*`
    : `⚠️ Aguardando odds >= 1.60 para ficar pronta`;

  await bot.sendMessage(
    msg.chat.id,
    `✅ *Link salvo!*\n\n🏟️ ${match}\n🎯 ${bet.betMarket}\n${statusMsg}`,
    { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
  );

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

  // Check if message is /metricas command (Story 11.4)
  if (METRICAS_PATTERN.test(text)) {
    await handleMetricasCommand(bot, msg);
    return;
  }

  // Check if message is /membros command (Story 16.7)
  if (MEMBROS_PATTERN.test(text)) {
    await handleMembrosCommand(bot, msg);
    return;
  }

  // Check if message is /membro @username command (Story 16.7)
  const membroMatch = text.match(MEMBRO_PATTERN);
  if (membroMatch) {
    const identifier = membroMatch[1].trim();
    await handleMembroCommand(bot, msg, identifier);
    return;
  }

  // Check if message is /trial command (Story 16.7)
  const trialMatch = text.match(TRIAL_CONFIG_PATTERN);
  if (trialMatch) {
    const days = trialMatch[1] ? parseInt(trialMatch[1], 10) : null;
    await handleTrialConfigCommand(bot, msg, days);
    return;
  }

  // Check if message is /add_trial command (Story 16.7)
  const addTrialMatch = text.match(ADD_TRIAL_PATTERN);
  if (addTrialMatch) {
    const identifier = addTrialMatch[1].trim();
    await handleAddTrialCommand(bot, msg, identifier);
    return;
  }

  // Check if message is /remover_membro command (Story 16.7)
  const removerMembroMatch = text.match(REMOVER_MEMBRO_PATTERN);
  if (removerMembroMatch) {
    const identifier = removerMembroMatch[1].trim();
    const motivo = removerMembroMatch[2]?.trim() || null;
    await handleRemoverMembroCommand(bot, msg, identifier, motivo);
    return;
  }

  // Check if message is /estender command (Story 16.7)
  const estenderMatch = text.match(ESTENDER_PATTERN);
  if (estenderMatch) {
    const identifier = estenderMatch[1].trim();
    const days = parseInt(estenderMatch[2], 10);
    await handleEstenderCommand(bot, msg, identifier, days);
    return;
  }

  // Check if message is /atualizados command (Story 14.9)
  const atualizadosMatch = text.match(ATUALIZADOS_PATTERN);
  if (atualizadosMatch) {
    const page = atualizadosMatch[1] ? parseInt(atualizadosMatch[1], 10) : 1;
    await handleAtualizadosCommand(bot, msg, page);
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

  // Check if message is /filtrar command (Story 12.5, 14.6)
  const filtrarMatch = text.match(FILTRAR_PATTERN);
  if (filtrarMatch) {
    const filterType = filtrarMatch[1] || null;
    const page = filtrarMatch[2] ? parseInt(filtrarMatch[2], 10) : 1;
    await handleFiltrarCommand(bot, msg, filterType, page);
    return;
  }

  // Check if message is /simular command (Story 12.6)
  const simularMatch = text.match(SIMULAR_PATTERN);
  if (simularMatch) {
    const arg = simularMatch[1] || null;
    await handleSimularCommand(bot, msg, arg);
    return;
  }

  // Check if message is /promover command (Story 13.2)
  const promoverMatch = text.match(PROMOVER_PATTERN);
  if (promoverMatch) {
    const betId = promoverMatch[1] ? parseInt(promoverMatch[1], 10) : null;
    await handlePromoverCommand(bot, msg, betId);
    return;
  }

  // Check if message is /remover command (Story 13.3)
  const removerMatch = text.match(REMOVER_PATTERN);
  if (removerMatch) {
    const betId = removerMatch[1] ? parseInt(removerMatch[1], 10) : null;
    await handleRemoverCommand(bot, msg, betId);
    return;
  }

  // Check if message is /fila command (Story 13.4, 14.6)
  const filaMatch = text.match(FILA_PATTERN);
  if (filaMatch) {
    const page = filaMatch[1] ? parseInt(filaMatch[1], 10) : 1;
    await handleFilaCommand(bot, msg, page);
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

module.exports = { handleAdminMessage, handleRemovalCallback };
