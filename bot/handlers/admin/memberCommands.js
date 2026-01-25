/**
 * Admin Member Commands
 * Handles /membros, /membro, /trial, /add_trial, /remover_membro, /estender commands
 */
const logger = require('../../../lib/logger');
const { getMemberStats, calculateMRR, calculateConversionRate, getNewMembersThisWeek, getMemberDetails, getNotificationHistory, addManualTrialMember, extendMembership, getTrialDays, setTrialDays } = require('../../services/memberService');
const { addPendingRemoval, REMOVAL_TIMEOUT_MS } = require('./removalState');

// Regex patterns
const MEMBROS_PATTERN = /^\/membros$/i;
const MEMBRO_PATTERN = /^\/membro\s+(.+)$/i;
const TRIAL_CONFIG_PATTERN = /^\/trial(?:\s+(\d+))?$/i;
const ADD_TRIAL_PATTERN = /^\/add_trial\s+(.+)$/i;
const REMOVER_MEMBRO_PATTERN = /^\/remover_membro\s+(\S+)(?:\s+(.+))?$/i;
const ESTENDER_PATTERN = /^\/estender\s+(\S+)\s+(\d+)$/i;

/**
 * Handle /membros command - Show member statistics summary (Story 16.7)
 * AC1: Displays total members, MRR, conversion rate, and weekly trend
 */
async function handleMembrosCommand(bot, msg) {
  logger.info('[admin:member] Received /membros command', { chatId: msg.chat.id, userId: msg.from?.id });

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

    logger.info('[admin:member] Member stats displayed', { stats, mrr, conversionRate, newMembers });
  } catch (err) {
    logger.error('[admin:member] Failed to handle /membros command', { error: err.message });
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
  logger.info('[admin:member] Received /membro command', { chatId: msg.chat.id, userId: msg.from?.id, identifier });

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

    logger.info('[admin:member] Member details displayed', { memberId: member.id, status: member.status });
  } catch (err) {
    logger.error('[admin:member] Failed to handle /membro command', { error: err.message });
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
  logger.info('[admin:member] Received /trial command', { chatId: msg.chat.id, userId: msg.from?.id, days });

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

    logger.info('[admin:member] Trial config changed', { operator: operatorUsername, oldValue, newValue });
  } catch (err) {
    logger.error('[admin:member] Failed to handle /trial command', { error: err.message });
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
  logger.info('[admin:member] Received /add_trial command', { chatId: msg.chat.id, userId: msg.from?.id, identifier });

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

    logger.info('[admin:member] Member added to trial', { telegramId, isNew: result.isNew, trialEnds: member.trial_ends_at });
  } catch (err) {
    logger.error('[admin:member] Failed to handle /add_trial command', { error: err.message });
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
  logger.info('[admin:member] Received /remover_membro command', { chatId: msg.chat.id, userId: msg.from?.id, identifier, motivo });

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

    // Send confirmation message with inline keyboard
    const confirmMsg = await bot.sendMessage(
      msg.chat.id,
      `⚠️ *CONFIRMAR REMOÇÃO*\n\n` +
      `👤 ${displayName}\n` +
      `🆔 \`${member.telegram_id}\`\n` +
      `📊 Status: ${member.status}\n` +
      `📅 Membro desde: ${joinDate}\n\n` +
      `${motivo ? `📝 Motivo: ${motivo}\n\n` : ''}` +
      `_Expira em ${REMOVAL_TIMEOUT_MS / 1000} segundos_`,
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

    // Store pending removal data with auto-cleanup timeout
    addPendingRemoval(callbackId, {
      memberId: member.id,
      telegramId: member.telegram_id,
      displayName,
      motivo: motivo || 'manual_removal',
      operator: operatorUsername,
      chatId: msg.chat.id,
      messageId: confirmMsg.message_id
    });

    logger.info('[admin:member] Removal confirmation sent', { callbackId, memberId: member.id });
  } catch (err) {
    logger.error('[admin:member] Failed to handle /remover_membro command', { error: err.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro inesperado: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

/**
 * Handle /estender command - Extend membership by X days (Story 16.7)
 * AC6: Extends trial_ends_at or subscription_ends_at
 * Usage: /estender @username 7
 */
async function handleEstenderCommand(bot, msg, identifier, days) {
  const operatorUsername = msg.from?.username || msg.from?.id?.toString() || 'unknown';
  logger.info('[admin:member] Received /estender command', { chatId: msg.chat.id, userId: msg.from?.id, identifier, days });

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

    logger.info('[admin:member] Membership extended', { memberId: member.id, days, operator: operatorUsername });
  } catch (err) {
    logger.error('[admin:member] Failed to handle /estender command', { error: err.message });
    await bot.sendMessage(
      msg.chat.id,
      `❌ Erro inesperado: ${err.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

module.exports = {
  // Handlers
  handleMembrosCommand,
  handleMembroCommand,
  handleTrialConfigCommand,
  handleAddTrialCommand,
  handleRemoverMembroCommand,
  handleEstenderCommand,
  // Patterns (for router)
  MEMBROS_PATTERN,
  MEMBRO_PATTERN,
  TRIAL_CONFIG_PATTERN,
  ADD_TRIAL_PATTERN,
  REMOVER_MEMBRO_PATTERN,
  ESTENDER_PATTERN
};
