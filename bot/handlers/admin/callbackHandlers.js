/**
 * Admin Callback Handlers
 * Handles inline keyboard callbacks for admin commands
 */
const logger = require('../../../lib/logger');
const { config } = require('../../../lib/config');
const { kickMemberFromGroup, markMemberAsRemoved, appendToNotes } = require('../../services/memberService');
const { consumePendingRemoval } = require('./removalState');

/**
 * Handle callback queries for member removal confirmation (Story 16.7)
 * AC5: Process confirm/cancel button clicks
 * @param {TelegramBot} bot - Bot instance
 * @param {object} callbackQuery - Telegram callback query object
 * @returns {boolean} - True if handled, false otherwise
 */
async function handleRemovalCallback(bot, callbackQuery) {
  const { data, message, from } = callbackQuery;

  // Parse callback data
  const [action, ...callbackIdParts] = data.split('_');
  const callbackId = callbackIdParts.join('_');

  // Handle non-removal callbacks
  if (!callbackId.startsWith('remove_')) {
    // Not a removal callback - log for debugging and let other handlers process
    logger.debug('[admin:callback] Unknown callback type, skipping', {
      action,
      callbackId: callbackId.substring(0, 50) // Truncate for safety
    });
    return false;
  }

  const fullCallbackId = callbackId;

  // Answer callback query to remove loading state
  await bot.answerCallbackQuery(callbackQuery.id);

  // Get and consume pending removal (atomic operation)
  const pendingData = consumePendingRemoval(fullCallbackId);

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
  handleRemovalCallback
};
