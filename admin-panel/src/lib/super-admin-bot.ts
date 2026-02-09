import TelegramBot from 'node-telegram-bot-api';
import { decrypt } from '@/lib/encryption';
import type { SupabaseClient } from '@supabase/supabase-js';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Singleton — reuse between warm invocations
let botInstance: TelegramBot | null = null;
let cachedToken: string | null = null;

function getBot(token: string): TelegramBot {
  if (botInstance && cachedToken === token) return botInstance;
  botInstance = new TelegramBot(token, { polling: false });
  cachedToken = token;
  return botInstance;
}

export async function getBotConfig(supabase: SupabaseClient): Promise<{
  bot_token: string;
  bot_username: string;
  founder_chat_ids: number[];
  is_active: boolean;
} | null> {
  const { data } = await supabase
    .from('super_admin_bot_config')
    .select('*')
    .eq('is_active', true)
    .single();

  if (!data) return null;

  return {
    bot_token: decrypt(data.bot_token),
    bot_username: data.bot_username,
    founder_chat_ids: data.founder_chat_ids as number[],
    is_active: data.is_active,
  };
}

export async function sendFounderNotification(
  botToken: string,
  founderChatIds: number[],
  groupName: string,
  influencerName: string,
  inviteLink: string,
): Promise<{ sent: number; failed: Array<{ chatId: number; error: string }> }> {
  const bot = getBot(botToken);
  const message =
    `<b>Novo Grupo Criado</b>\n\n` +
    `<b>Grupo:</b> ${escapeHtml(groupName)}\n` +
    `<b>Influencer:</b> ${escapeHtml(influencerName)}\n` +
    `<b>Convite:</b> ${escapeHtml(inviteLink)}\n\n` +
    `Grupo ativo com bot configurado.`;

  const results = await Promise.allSettled(
    founderChatIds.map(chatId =>
      bot.sendMessage(chatId, message, { parse_mode: 'HTML' }),
    ),
  );

  const failed: Array<{ chatId: number; error: string }> = [];
  let sent = 0;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') sent++;
    else failed.push({ chatId: founderChatIds[i], error: result.reason?.message ?? 'Unknown' });
  });

  return { sent, failed };
}

export async function sendInvite(
  botToken: string,
  target: { type: 'telegram'; chatId: number } | { type: 'email'; email: string },
  groupName: string,
  inviteLink: string,
): Promise<{ success: boolean; error?: string }> {
  if (target.type === 'telegram') {
    const bot = getBot(botToken);
    try {
      await bot.sendMessage(
        target.chatId,
        `<b>Convite para Grupo</b>\n\n` +
        `Você foi convidado para o grupo <b>${escapeHtml(groupName)}</b>.\n\n` +
        `<b>Link de convite:</b> ${escapeHtml(inviteLink)}`,
        { parse_mode: 'HTML' },
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to send Telegram invite' };
    }
  }

  if (target.type === 'email') {
    // Email sending not yet configured — log warning
    console.warn(`[super-admin-bot] Email invite not configured. Target: ${target.email}, Group: ${groupName}`);
    return { success: false, error: 'Email sending not configured' };
  }

  return { success: false, error: 'Unknown target type' };
}

export async function testFounderReachability(
  botToken: string,
  founderChatIds: number[],
): Promise<Array<{ chatId: number; reachable: boolean; error?: string }>> {
  const bot = getBot(botToken);

  const results = await Promise.allSettled(
    founderChatIds.map(chatId =>
      bot.sendMessage(chatId, '🔔 Teste de conectividade do Bot Super Admin. Tudo OK!'),
    ),
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return { chatId: founderChatIds[i], reachable: true };
    }
    return {
      chatId: founderChatIds[i],
      reachable: false,
      error: result.reason?.message ?? 'Unknown error',
    };
  });
}

export async function validateBotTokenViaTelegram(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
  try {
    const bot = new TelegramBot(token, { polling: false });
    const me = await bot.getMe();
    return { valid: true, username: me.username };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Token inválido' };
  }
}
