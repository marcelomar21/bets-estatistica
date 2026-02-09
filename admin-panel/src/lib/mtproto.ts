import { TelegramClient, Api, errors, sessions } from 'telegram';
import type { BigInteger } from 'big-integer';

const { StringSession } = sessions;
import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/encryption';

export class MtprotoError extends Error {
  code: string;
  retryable: boolean;
  retryAfterSeconds?: number;

  constructor(code: string, message?: string, retryable = false, retryAfterSeconds?: number) {
    super(message || code);
    this.name = 'MtprotoError';
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function createTelegramClient(sessionString: string): TelegramClient {
  return new TelegramClient(
    new StringSession(sessionString),
    Number(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH!,
    { connectionRetries: 3 },
  );
}

// Locks older than this are considered stale (process crash recovery)
const STALE_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function withMtprotoSession<T>(
  supabase: SupabaseClient,
  fn: (client: TelegramClient) => Promise<T>,
): Promise<T> {
  // 0. Clean up stale locks (crash recovery)
  const staleThreshold = new Date(Date.now() - STALE_LOCK_TIMEOUT_MS).toISOString();
  await supabase
    .from('mtproto_sessions')
    .update({ locked_at: null, locked_by: null })
    .eq('is_active', true)
    .lt('locked_at', staleThreshold);

  // 1. Find active, unlocked session
  const { data: session } = await supabase
    .from('mtproto_sessions')
    .select('*')
    .eq('is_active', true)
    .eq('requires_reauth', false)
    .is('locked_at', null)
    .single();

  if (!session) throw new MtprotoError('MTPROTO_SESSION_NOT_FOUND', 'Nenhuma sessão MTProto ativa encontrada. Configure em /settings/telegram');

  // 2. Acquire lock (optimistic locking)
  const lockId = crypto.randomUUID();
  const { data: locked } = await supabase
    .from('mtproto_sessions')
    .update({ locked_at: new Date().toISOString(), locked_by: lockId })
    .eq('id', session.id)
    .is('locked_at', null)
    .select()
    .single();

  if (!locked) throw new MtprotoError('MTPROTO_SESSION_BUSY', 'Sessão MTProto em uso por outro processo', true);

  const sessionString = decrypt(session.session_string);
  const client = createTelegramClient(sessionString);

  try {
    await client.connect();
    const result = await fn(client);

    // Update last_used_at and release lock
    await supabase
      .from('mtproto_sessions')
      .update({ last_used_at: new Date().toISOString(), locked_at: null, locked_by: null })
      .eq('id', session.id);

    return result;
  } catch (error) {
    if (isAuthError(error)) {
      await supabase
        .from('mtproto_sessions')
        .update({ requires_reauth: true, is_active: false, locked_at: null, locked_by: null })
        .eq('id', session.id);
    } else {
      // Release lock even on error
      await supabase
        .from('mtproto_sessions')
        .update({ locked_at: null, locked_by: null })
        .eq('id', session.id);
    }
    throw error;
  } finally {
    await client.disconnect();
  }
}

export async function createSupergroup(
  client: TelegramClient,
  title: string,
  about: string,
): Promise<{ groupId: number; accessHash: BigInteger; channel: Api.Channel }> {
  const result = await client.invoke(
    new Api.channels.CreateChannel({
      title,
      about,
      megagroup: true,
    }),
  );

  const channel = (result as Api.Updates).chats[0] as Api.Channel;
  // CRITICAL: Convert BigInt to Number
  const groupId = Number(channel.id);

  return { groupId, accessHash: channel.accessHash!, channel };
}

export async function addBotAsAdmin(
  client: TelegramClient,
  channel: Api.Channel | Api.TypeInputChannel,
  botUsername: string,
): Promise<void> {
  // Resolve username → entity (required in cold/serverless sessions)
  const botEntity = await client.getEntity(`@${botUsername}`);

  await client.invoke(
    new Api.channels.EditAdmin({
      channel,
      userId: botEntity,
      adminRights: new Api.ChatAdminRights({
        postMessages: true,
        deleteMessages: true,
        banUsers: true,
        inviteUsers: true,
        pinMessages: true,
        changeInfo: false,
        addAdmins: false,
        anonymous: false,
        manageCall: false,
        other: true,
      }),
      rank: 'Bot',
    }),
  );
}

export async function createInviteLink(
  client: TelegramClient,
  channel: Api.Channel | Api.TypeInputChannel,
  title: string,
  expireDays = 30,
): Promise<string> {
  const invite = await client.invoke(
    new Api.messages.ExportChatInvite({
      peer: channel,
      expireDate: Math.floor(Date.now() / 1000) + expireDays * 86400,
      usageLimit: 100,
      title,
    }),
  ) as Api.ChatInviteExported;

  return invite.link;
}

export async function verifyBotIsAdmin(
  client: TelegramClient,
  telegramGroupId: number,
  botUsername: string,
): Promise<boolean> {
  try {
    const botEntity = await client.getEntity(`@${botUsername}`);
    const result = await client.invoke(
      new Api.channels.GetParticipant({
        channel: await client.getInputEntity(telegramGroupId),
        participant: botEntity,
      }),
    );
    const participant = result.participant;
    return (
      participant instanceof Api.ChannelParticipantAdmin ||
      participant instanceof Api.ChannelParticipantCreator
    );
  } catch {
    return false;
  }
}

export function isAuthError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('AUTH_KEY_UNREGISTERED')
    || msg.includes('SESSION_REVOKED')
    || msg.includes('USER_DEACTIVATED');
}

export function classifyMtprotoError(error: unknown): MtprotoError {
  if (error instanceof MtprotoError) return error;

  if (error instanceof errors.FloodWaitError) {
    return new MtprotoError(
      'FLOOD_WAIT',
      `Telegram rate limit. Retry em ${error.seconds}s`,
      true,
      error.seconds,
    );
  }

  if (isAuthError(error)) {
    return new MtprotoError(
      'MTPROTO_SESSION_EXPIRED',
      'Sessão MTProto expirada. Re-autentique em /settings/telegram',
    );
  }

  return new MtprotoError(
    'TELEGRAM_ERROR',
    error instanceof Error ? error.message : 'Erro desconhecido do Telegram',
    true,
  );
}
