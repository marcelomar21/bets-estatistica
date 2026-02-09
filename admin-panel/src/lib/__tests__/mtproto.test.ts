import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock telegram (GramJS)
const mockInvoke = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockGetEntity = vi.fn();
const mockGetInputEntity = vi.fn();

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => ({
    invoke: mockInvoke,
    connect: mockConnect,
    disconnect: mockDisconnect,
    getEntity: mockGetEntity,
    getInputEntity: mockGetInputEntity,
  })),
  Api: {
    channels: {
      CreateChannel: vi.fn().mockImplementation((params: Record<string, unknown>) => params),
      EditAdmin: vi.fn().mockImplementation((params: Record<string, unknown>) => params),
      GetParticipant: vi.fn().mockImplementation((params: Record<string, unknown>) => params),
    },
    messages: {
      ExportChatInvite: vi.fn().mockImplementation((params: Record<string, unknown>) => params),
    },
    ChatAdminRights: vi.fn().mockImplementation((params: Record<string, unknown>) => params),
    ChannelParticipantAdmin: class ChannelParticipantAdmin {},
    ChannelParticipantCreator: class ChannelParticipantCreator {},
    Channel: class Channel {},
  },
  errors: {
    FloodWaitError: class FloodWaitError extends Error {
      seconds: number;
      constructor(seconds: number) {
        super(`FloodWait(${seconds})`);
        this.seconds = seconds;
      }
    },
  },
}));

vi.mock('telegram/sessions', () => ({
  StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
}));

vi.mock('@/lib/encryption', () => ({
  decrypt: vi.fn((v: string) => `decrypted_${v}`),
}));

vi.stubEnv('TELEGRAM_API_ID', '12345');
vi.stubEnv('TELEGRAM_API_HASH', 'testhash');

import { createTelegramClient, createSupergroup, addBotAsAdmin, createInviteLink, verifyBotIsAdmin, classifyMtprotoError, MtprotoError, isAuthError, withMtprotoSession } from '../mtproto';
import { errors } from 'telegram';

describe('mtproto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTelegramClient', () => {
    it('should create client with session string', () => {
      const client = createTelegramClient('test-session');
      expect(client).toBeDefined();
      expect(client.connect).toBeDefined();
    });
  });

  describe('createSupergroup', () => {
    it('should create supergroup and return numeric ID', async () => {
      const mockChannel = { id: BigInt(1234567890), accessHash: BigInt(9876) };
      mockInvoke.mockResolvedValueOnce({ chats: [mockChannel] });

      const client = createTelegramClient('');
      const result = await createSupergroup(client, 'Test Group', 'About text');

      expect(result.groupId).toBe(1234567890);
      expect(typeof result.groupId).toBe('number');
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('should handle FloodWaitError', async () => {
      mockInvoke.mockRejectedValueOnce(new errors.FloodWaitError(30));

      const client = createTelegramClient('');
      await expect(createSupergroup(client, 'Test', 'About')).rejects.toThrow();
    });
  });

  describe('addBotAsAdmin', () => {
    it('should resolve entity first then add as admin', async () => {
      const botEntity = { id: 123, className: 'User' };
      mockGetEntity.mockResolvedValueOnce(botEntity);
      mockInvoke.mockResolvedValueOnce({});

      const client = createTelegramClient('');
      const mockChannel = { id: BigInt(111) };
      await addBotAsAdmin(client, mockChannel as never, 'my_bot');

      expect(mockGetEntity).toHaveBeenCalledWith('@my_bot');
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('should throw if bot not found', async () => {
      mockGetEntity.mockRejectedValueOnce(new Error('Cannot find entity'));

      const client = createTelegramClient('');
      await expect(addBotAsAdmin(client, {} as never, 'nonexistent_bot')).rejects.toThrow('Cannot find entity');
    });
  });

  describe('createInviteLink', () => {
    it('should create invite link', async () => {
      mockInvoke.mockResolvedValueOnce({ link: 'https://t.me/+abc123' });

      const client = createTelegramClient('');
      const link = await createInviteLink(client, {} as never, 'Test Invite');

      expect(link).toBe('https://t.me/+abc123');
    });
  });

  describe('verifyBotIsAdmin', () => {
    it('should return true if bot is admin', async () => {
      const { Api } = await import('telegram');
      mockGetEntity.mockResolvedValueOnce({ id: 123 });
      mockGetInputEntity.mockResolvedValueOnce({ channelId: BigInt(111) });
      mockInvoke.mockResolvedValueOnce({
        participant: new Api.ChannelParticipantAdmin(),
      });

      const client = createTelegramClient('');
      const result = await verifyBotIsAdmin(client, 111, 'my_bot');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockGetEntity.mockRejectedValueOnce(new Error('Not found'));

      const client = createTelegramClient('');
      const result = await verifyBotIsAdmin(client, 111, 'my_bot');
      expect(result).toBe(false);
    });
  });

  describe('isAuthError', () => {
    it('should detect AUTH_KEY_UNREGISTERED', () => {
      expect(isAuthError(new Error('AUTH_KEY_UNREGISTERED'))).toBe(true);
    });

    it('should detect SESSION_REVOKED', () => {
      expect(isAuthError(new Error('SESSION_REVOKED'))).toBe(true);
    });

    it('should detect USER_DEACTIVATED', () => {
      expect(isAuthError(new Error('USER_DEACTIVATED'))).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isAuthError(new Error('FLOOD_WAIT'))).toBe(false);
    });
  });

  describe('classifyMtprotoError', () => {
    it('should return MtprotoError as-is', () => {
      const err = new MtprotoError('TEST', 'test message');
      expect(classifyMtprotoError(err)).toBe(err);
    });

    it('should classify FloodWaitError as retryable', () => {
      const err = new errors.FloodWaitError(30);
      const classified = classifyMtprotoError(err);
      expect(classified.code).toBe('FLOOD_WAIT');
      expect(classified.retryable).toBe(true);
      expect(classified.retryAfterSeconds).toBe(30);
    });

    it('should classify auth errors as non-retryable', () => {
      const err = new Error('AUTH_KEY_UNREGISTERED');
      const classified = classifyMtprotoError(err);
      expect(classified.code).toBe('MTPROTO_SESSION_EXPIRED');
      expect(classified.retryable).toBe(false);
    });

    it('should classify generic errors as retryable', () => {
      const err = new Error('Network timeout');
      const classified = classifyMtprotoError(err);
      expect(classified.code).toBe('TELEGRAM_ERROR');
      expect(classified.retryable).toBe(true);
    });
  });

  describe('withMtprotoSession', () => {
    function createSessionMockSupabase(sessionData: unknown = null) {
      // Chain that handles both stale lock cleanup and session lookup
      const chain = {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({ error: null }),
        single: vi.fn().mockResolvedValue({ data: sessionData, error: null }),
      };
      return { from: vi.fn().mockReturnValue(chain), _chain: chain };
    }

    it('should throw MTPROTO_SESSION_NOT_FOUND when no session', async () => {
      const mockSupabase = createSessionMockSupabase(null);

      await expect(
        withMtprotoSession(mockSupabase as never, async () => 'test'),
      ).rejects.toMatchObject({ code: 'MTPROTO_SESSION_NOT_FOUND' });
    });

    it('should clean up stale locks before finding session', async () => {
      const mockSupabase = createSessionMockSupabase(null);

      await withMtprotoSession(mockSupabase as never, async () => 'test').catch(() => {});

      // First call to from() is for stale lock cleanup
      expect(mockSupabase.from).toHaveBeenCalledWith('mtproto_sessions');
      expect(mockSupabase._chain.update).toHaveBeenCalledWith({ locked_at: null, locked_by: null });
      expect(mockSupabase._chain.lt).toHaveBeenCalled();
    });
  });
});
