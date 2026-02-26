/**
 * Cancel Command Handler
 * Story 9.2: Self-service cancellation via /cancelar command
 *
 * Only works in private chat. Member can cancel their subscription
 * with inline keyboard confirmation.
 */
const logger = require('../../lib/logger');
const { supabase } = require('../../lib/supabase');
const { getMemberByTelegramId, kickMemberFromGroup } = require('../services/memberService');

const CANCELLABLE_STATUSES = new Set(['trial', 'ativo']);

/**
 * Handle /cancelar command in private chat
 * @param {object} msg - Telegram message object
 * @param {object} [botCtx] - BotContext for multi-bot
 */
async function handleCancelCommand(msg, botCtx) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  // Only in private chat
  if (msg.chat.type !== 'private') {
    return;
  }

  const { getBot } = require('../telegram');
  const bot = botCtx ? botCtx.bot : getBot();
  const groupId = botCtx ? botCtx.groupId : null;

  logger.info('[cancelCommand] /cancelar received', { telegramId, groupId });

  // Look up member
  const result = await getMemberByTelegramId(telegramId, groupId);

  if (!result.success || !result.data) {
    await bot.sendMessage(chatId, 'Voce nao tem assinatura ativa para cancelar.');
    return;
  }

  const member = result.data;

  if (!CANCELLABLE_STATUSES.has(member.status)) {
    await bot.sendMessage(chatId, 'Voce nao tem assinatura ativa para cancelar.');
    return;
  }

  // Send confirmation message with inline keyboard
  const confirmText = [
    'Tem certeza que deseja cancelar sua assinatura?',
    '',
    'Voce perdera acesso ao grupo VIP.',
  ].join('\n');

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Confirmar Cancelamento', callback_data: `cancel_membership_confirm_${member.id}` },
        ],
        [
          { text: 'Voltar', callback_data: `cancel_membership_abort_${member.id}` },
        ],
      ],
    },
  };

  await bot.sendMessage(chatId, confirmText, keyboard);
}

/**
 * Handle cancel membership callback
 * @param {object} bot - TelegramBot instance
 * @param {object} callbackQuery - Telegram callback query
 * @param {object} [botCtx] - BotContext for multi-bot
 */
async function handleCancelCallback(bot, callbackQuery, botCtx) {
  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message.chat.id;
  const telegramId = callbackQuery.from.id;

  // Acknowledge the callback
  try {
    await bot.answerCallbackQuery(callbackQuery.id);
  } catch {
    // Best-effort
  }

  if (data.startsWith('cancel_membership_abort_')) {
    await bot.sendMessage(chatId, 'Cancelamento abortado. Voce continua no grupo!');
    return;
  }

  if (!data.startsWith('cancel_membership_confirm_')) {
    return;
  }

  const memberId = parseInt(data.replace('cancel_membership_confirm_', ''), 10);
  if (isNaN(memberId)) {
    logger.warn('[cancelCommand] Invalid member ID in callback', { data });
    return;
  }

  logger.info('[cancelCommand] Cancellation confirmed', { telegramId, memberId });

  // Verify the member still exists and is cancellable
  const groupId = botCtx ? botCtx.groupId : null;
  const result = await getMemberByTelegramId(telegramId, groupId);

  if (!result.success || !result.data) {
    await bot.sendMessage(chatId, 'Nao foi possivel processar o cancelamento. Membro nao encontrado.');
    return;
  }

  const member = result.data;

  // Verify the callback matches the current member
  if (member.id !== memberId) {
    await bot.sendMessage(chatId, 'Nao foi possivel processar o cancelamento. Dados inconsistentes.');
    return;
  }

  if (!CANCELLABLE_STATUSES.has(member.status)) {
    await bot.sendMessage(chatId, 'Voce nao tem assinatura ativa para cancelar.');
    return;
  }

  // Update member status with optimistic locking
  const { data: updated, error: updateError } = await supabase
    .from('members')
    .update({
      status: 'cancelado',
      kicked_at: new Date().toISOString(),
      cancellation_reason: 'self_cancel',
      cancelled_by: null,
    })
    .eq('id', member.id)
    .eq('status', member.status)
    .select('id')
    .maybeSingle();

  if (updateError) {
    logger.error('[cancelCommand] Failed to update member status', {
      memberId: member.id,
      error: updateError.message,
    });
    await bot.sendMessage(chatId, 'Erro ao processar cancelamento. Tente novamente.');
    return;
  }

  if (!updated) {
    logger.warn('[cancelCommand] Status changed concurrently', { memberId: member.id });
    await bot.sendMessage(chatId, 'Seu status foi alterado. Tente novamente.');
    return;
  }

  // Get checkout URL for farewell message
  let checkoutUrl = '';
  if (member.group_id) {
    const { data: groupData } = await supabase
      .from('groups')
      .select('checkout_url')
      .eq('id', member.group_id)
      .single();

    checkoutUrl = groupData?.checkout_url || '';
  }

  // Send farewell message
  const farewellText = checkoutUrl
    ? `Sentiremos sua falta! Se mudar de ideia: ${checkoutUrl}`
    : 'Sua assinatura foi cancelada.';

  await bot.sendMessage(chatId, farewellText);

  // Kick from group (best-effort)
  const publicGroupId = botCtx ? botCtx.publicGroupId : null;
  if (publicGroupId) {
    try {
      await kickMemberFromGroup(telegramId, publicGroupId, bot);
    } catch (err) {
      logger.warn('[cancelCommand] Failed to kick member from group', {
        telegramId,
        error: err.message,
      });
    }
  }

  // Audit log (best-effort, using member_events pattern)
  try {
    const { registerMemberEvent } = require('./memberEvents');
    await registerMemberEvent(member.id, 'cancel', {
      reason: 'self_cancel',
      groupId: member.group_id,
      telegramId,
    });
  } catch {
    // Best-effort — also log to audit_log if possible
  }

  logger.info('[cancelCommand] Self-cancel completed', {
    memberId: member.id,
    telegramId,
    groupId: member.group_id,
  });
}

module.exports = {
  handleCancelCommand,
  handleCancelCallback,
};
