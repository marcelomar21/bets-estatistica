/**
 * Admin Query Commands
 * Handles /overview, /metricas, /status, /simular, /atualizados, /help commands
 */
const { config } = require('../../../lib/config');
const logger = require('../../../lib/logger');
const { supabase } = require('../../../lib/supabase');
const { getBetById, getOverviewStats, getBetsReadyForPosting, getActiveBetsForRepost, getOddsHistory } = require('../../services/betService');
const { generateBetCopy } = require('../../services/copyService');
const { updateGeneratedCopy } = require('../../services/betService');
const { getSuccessRateForDays, getSuccessRateStats, getDetailedStats } = require('../../services/metricsService');
const { getLatestExecutions, formatResult } = require('../../services/jobExecutionService');
const { formatDateBR, formatDateTimeBR, formatTime } = require('../../../lib/utils');

// Regex patterns
const STATUS_PATTERN = /^\/status$/i;
const OVERVIEW_PATTERN = /^\/overview$/i;
const METRICAS_PATTERN = /^\/metricas$/i;
const SIMULAR_PATTERN = /^\/simular(?:\s+(novo|\d+))?$/i;
const ATUALIZADOS_PATTERN = /^\/atualizados(?:\s+(\d+))?$/i;
const HELP_PATTERN = /^\/help$/i;

// Pagination and formatting constants
const PAGE_SIZE = 10;
const MAX_HISTORY_RECORDS = 500;
const MAX_MARKET_NAME_LENGTH = 25;

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
    logger.warn('[admin:query] Status command: failed to fetch executions', { error: execResult.error?.message });
    return;
  }

  const executions = execResult.data || [];

  if (executions.length === 0) {
    statusText += '\n📋 Nenhuma execução registrada';
    await bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'Markdown' });
    logger.info('[admin:query] Status command executed (no executions)');
    return;
  }

  // Format job executions list
  statusText += '\n📋 *Últimas Execuções:*\n';

  let failCount = 0;
  let warnCount = 0;
  const thirtyMinAgo = Date.now() - 30 * 60 * 1000;

  for (const exec of executions) {
    const startedAt = new Date(exec.started_at);
    const timeStr = formatTime(startedAt);

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
  logger.info('[admin:query] Status command executed', { executions: executions.length, fromCache: execResult.fromCache });
}

/**
 * Handle /overview command - Show bets overview stats (Story 10.3)
 */
async function handleOverviewCommand(bot, msg) {
  logger.info('[admin:query] Received /overview command', { chatId: msg.chat.id, userId: msg.from?.id });

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
    const dateStr = formatDateBR(kickoff);
    const timeStr = formatTime(kickoff);
    nextGameText = `#${stats.nextGame.id} ${stats.nextGame.homeTeam} x ${stats.nextGame.awayTeam}\n📅 ${dateStr} às ${timeStr} (em ${timeUntil})`;
  }

  // Format last posting
  let lastPostingText = 'Nenhuma';
  if (stats.lastPosting) {
    const postDate = new Date(stats.lastPosting);
    const now = new Date();
    const isToday = postDate.toDateString() === now.toDateString();
    const postTimeStr = formatTime(postDate);
    lastPostingText = isToday ? `Hoje às ${postTimeStr}` : formatDateBR(postDate) + ` às ${postTimeStr}`;
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
  logger.info('[admin:query] Overview command executed', { total: stats.totalAnalyzed, posted: stats.postedActive });
}

/**
 * Handle /metricas command - Show detailed metrics (Story 11.4)
 */
async function handleMetricasCommand(bot, msg) {
  logger.info('[admin:query] Received /metricas command', { chatId: msg.chat.id, userId: msg.from?.id });

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
    logger.warn('[admin:query] Failed to get detailed stats for /metricas', {
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
  logger.info('[admin:query] Metricas command executed', {
    allTime: stats.allTime?.total,
    last30Days: stats.last30Days?.total,
  });
}

/**
 * Handle /simular command - Preview next posting (Story 12.6)
 */
async function handleSimularCommand(bot, msg, arg) {
  logger.info('[admin:query] Received /simular command', { chatId: msg.chat.id, arg });

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

    // If "novo", clear persisted copy to force regeneration
    const groupId = config.membership.groupId;
    if (isNovo) {
      await Promise.all(betsToPreview.map(bet => updateGeneratedCopy(bet.id, null, groupId)));
      logger.info('[admin:query] Cleared generated_copy for preview bets', { count: betsToPreview.length });
    }

    // Get success rate
    let successRate = null;
    try {
      const rateResult = await getSuccessRateForDays(30);
      if (rateResult.success) {
        successRate = rateResult.data.rate;
      }
    } catch (e) {
      logger.debug('[admin:query] Could not get success rate for preview');
    }

    // Load tone config for copy generation
    let toneConfig = null;
    try {
      const { data: groupData } = await supabase
        .from('groups')
        .select('copy_tone_config')
        .limit(1)
        .single();
      toneConfig = groupData?.copy_tone_config || null;
    } catch {
      logger.debug('[admin:query] Could not load tone config for preview');
    }

    // Generate preview
    const lines = ['📤 *PREVIEW - PRÓXIMA POSTAGEM*', '', '━━━━━━━━━━━━━━━━━━━━'];

    for (const bet of betsToPreview) {
      // Generate copy
      let copyText = bet.reasoning || 'Aposta de alto valor estatístico';
      try {
        const copyResult = await generateBetCopy(bet, toneConfig);
        if (copyResult.success && copyResult.data?.copy) {
          copyText = copyResult.data.copy;
          // Persist the regenerated copy so it's not wasted
          if (isNovo || !bet.generatedCopy) {
            updateGeneratedCopy(bet.id, copyResult.data.fullMessage ? copyText : null, groupId).catch(() => {});
          }
        }
      } catch (e) {
        logger.debug('[admin:query] Failed to generate copy for preview', { betId: bet.id });
      }

      const kickoffStr = formatDateTimeBR(bet.kickoffTime);

      lines.push('');
      lines.push(`⚽ *${bet.homeTeamName} x ${bet.awayTeamName}*`);
      lines.push(`🗓 ${kickoffStr}`);
      lines.push('');
      lines.push(`📊 *${bet.betMarket}*: ${bet.betPick || ''}`);
      const oddLabel = toneConfig?.oddLabel || 'Odd';
      lines.push(`💰 ${oddLabel}: *${bet.odds?.toFixed(2) || bet.oddsAtPost?.toFixed(2) || 'N/A'}*`);
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

    logger.info('[admin:query] Preview generated', { betsCount: betsToPreview.length, isNovo });
  } catch (err) {
    logger.error('[admin:query] Failed to generate preview', { error: err.message });
    await bot.deleteMessage(msg.chat.id, workingMsg.message_id).catch(() => { });
    await bot.sendMessage(msg.chat.id, `❌ Erro ao gerar preview: ${err.message}`, { reply_to_message_id: msg.message_id });
  }
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

  const [, month, dayNum] = day.split('-');
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
  const time = formatTime(item.createdAt);

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
 * Handle /atualizados command - Lista historico de atualizacoes (Story 14.9)
 * Usage: /atualizados or /atualizados 2 (for page 2)
 * @param {TelegramBot} bot - Bot instance
 * @param {object} msg - Telegram message object
 * @param {number} page - Page number (default: 1)
 */
async function handleAtualizadosCommand(bot, msg, page = 1) {
  logger.info('[admin:query] Received /atualizados command', { chatId: msg.chat.id, page });

  // Uses module-level PAGE_SIZE and MAX_HISTORY_RECORDS constants

  // Validar página e logar se inválida
  if (page < 1 || !Number.isInteger(page)) {
    logger.warn('[admin:query] Invalid page requested for /atualizados, defaulting to 1', { requestedPage: page });
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
    logger.warn('[admin:query] History data truncated due to limit', { total, limit: MAX_HISTORY_RECORDS });
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
    logger.debug('[admin:query] Page adjusted to valid range', { requested: page, adjusted: validPage, totalPages });
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
  logger.info('[admin:query] Atualizados command executed', { page: validPage, totalPages, totalItems: flatItems.length, dataTruncated: isDataTruncated });
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
  logger.info('[admin:query] Help command executed');
}

module.exports = {
  // Handlers
  handleStatusCommand,
  handleOverviewCommand,
  handleMetricasCommand,
  handleSimularCommand,
  handleAtualizadosCommand,
  handleHelpCommand,
  // Patterns (for router)
  STATUS_PATTERN,
  OVERVIEW_PATTERN,
  METRICAS_PATTERN,
  SIMULAR_PATTERN,
  ATUALIZADOS_PATTERN,
  HELP_PATTERN,
  // Helpers (exported for testing)
  groupHistoryByDayAndHour,
  formatDayLabelForHistory,
  formatHistoryItem,
  MAX_MARKET_NAME_LENGTH
};
