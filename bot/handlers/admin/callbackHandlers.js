/**
 * Callback Handlers Module - Inline keyboard callback processing
 * Story 17.1: Refatorar adminGroup.js em Módulos por Domínio
 *
 * Handles:
 * - Member removal confirmations
 * - Pending removal state management
 */

const { config } = require('../../../lib/config');
const logger = require('../../../lib/logger');
const { kickMemberFromGroup, markMemberAsRemoved, appendToNotes } = require('../../services/memberService');

// Story 16.7: ADR-003 - Pending removals with auto-cleanup 60s
const pendingRemovals = new Map();
const REMOVAL_TIMEOUT_MS = 60000;

/**
 * Add a pending removal with auto-cleanup timeout
 * @param {string} callbackId - Unique callback ID
 * @param {object} data - Removal data (memberId, telegramId, displayName, motivo)
 * @param {object} bot - Telegram bot instance
 * @param {object} msg - Original message for timeout cleanup
 */
function addPendingRemoval(callbackId, data, bot, msg) {
  // Set timeout for auto-cleanup
  const timeoutId = setTimeout(async () => {
    pendingRemovals.delete(callbackId);
    try {
      await bot.editMessageText(
        '⏰ Confirmação expirada. Use o comando novamente.',
        {
          chat_id: msg.chat.id,
          message_id: msg.message_id,
          parse_mode: 'Markdown'
        }
      );
    } catch (err) {
      logger.warn('[admin:callback] Timeout cleanup failed', { error: err.message });
    }
  }, REMOVAL_TIMEOUT_MS);

  pendingRemovals.set(callbackId, { ...data, timeoutId });
}

/**
 * Handle removal confirmation callback
 * @param {object} bot - Telegram bot instance
 * @param {object} callbackQuery - Callback query from Telegram
 * @returns {Promise<boolean>} - True if handled, false if not a removal callback
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
    logger.info('[admin:callback] Removal cancelled', { callbackId: fullCallbackId, operator: operatorUsername });
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
        logger.warn('[admin:callback] Could not send farewell DM', { telegramId: pendingData.telegramId, error: dmErr.message });
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
        logger.error('[admin:callback] Failed to mark member as removed', { memberId: pendingData.memberId, error: markResult.error });
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

      logger.info('[admin:callback] Member removed successfully', {
        memberId: pendingData.memberId,
        telegramId: pendingData.telegramId,
        motivo: pendingData.motivo,
        operator: operatorUsername
      });
    } catch (err) {
      logger.error('[admin:callback] Failed to process removal confirmation', { error: err.message });
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

module.exports = {
  handleRemovalCallback,
  addPendingRemoval,
  pendingRemovals,
  REMOVAL_TIMEOUT_MS,
};
