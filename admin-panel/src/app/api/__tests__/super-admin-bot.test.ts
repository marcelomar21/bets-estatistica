import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/super-admin-bot', () => ({
  validateBotTokenViaTelegram: vi.fn(),
  getBotConfig: vi.fn(),
  testFounderReachability: vi.fn(),
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((v: string) => `encrypted_${v}`),
  decrypt: vi.fn((v: string) => `decrypted_${v}`),
}));

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}));

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };

  return {
    from: vi.fn().mockReturnValue(mockChain),
    _chain: mockChain,
  };
}

vi.mock('@/middleware/api-handler', () => ({
  createApiHandler: vi.fn((handler: Function, _opts?: Record<string, unknown>) => {
    return async (req: NextRequest) => {
      const mockContext = {
        user: { id: 'user-1', email: 'admin@test.com' },
        role: 'super_admin' as const,
        groupFilter: null,
        supabase: createMockSupabase(),
      };
      return handler(req, mockContext);
    };
  }),
}));

describe('Super Admin Bot API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/super-admin-bot', () => {
    it('should return config without bot_token', async () => {
      const { GET } = await import('../super-admin-bot/route');

      const req = new NextRequest('http://localhost/api/super-admin-bot');
      const res = await GET(req);
      const body = await res.json();

      expect(body.success).toBe(true);
      // Should never include bot_token
      if (body.data) {
        expect(body.data).not.toHaveProperty('bot_token');
      }
    });
  });

  describe('POST /api/super-admin-bot', () => {
    it('should validate bot token before saving', async () => {
      const { validateBotTokenViaTelegram } = await import('@/lib/super-admin-bot');
      vi.mocked(validateBotTokenViaTelegram).mockResolvedValue({ valid: false, error: 'Invalid token' });

      const { POST } = await import('../super-admin-bot/route');

      const req = new NextRequest('http://localhost/api/super-admin-bot', {
        method: 'POST',
        body: JSON.stringify({ bot_token: '1234567890:ABCdefGHIjklMNOpqr', founder_chat_ids: [123] }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_BOT_TOKEN');
    });

    it('should reject invalid body with Zod validation', async () => {
      const { POST } = await import('../super-admin-bot/route');

      const req = new NextRequest('http://localhost/api/super-admin-bot', {
        method: 'POST',
        body: JSON.stringify({ bot_token: 'short', founder_chat_ids: [] }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/super-admin-bot/test', () => {
    it('should return error if bot not configured', async () => {
      const { getBotConfig } = await import('@/lib/super-admin-bot');
      vi.mocked(getBotConfig).mockResolvedValue(null);

      const { POST } = await import('../super-admin-bot/test/route');

      const req = new NextRequest('http://localhost/api/super-admin-bot/test', { method: 'POST' });
      const res = await POST(req);
      const body = await res.json();

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BOT_SUPER_ADMIN_NOT_CONFIGURED');
    });

    it('should return reachability results', async () => {
      const { getBotConfig, testFounderReachability } = await import('@/lib/super-admin-bot');
      vi.mocked(getBotConfig).mockResolvedValue({
        bot_token: 'token',
        bot_username: 'bot',
        founder_chat_ids: [111, 222],
        is_active: true,
      });
      vi.mocked(testFounderReachability).mockResolvedValue([
        { chatId: 111, reachable: true },
        { chatId: 222, reachable: false, error: 'Not found' },
      ]);

      const { POST } = await import('../super-admin-bot/test/route');

      const req = new NextRequest('http://localhost/api/super-admin-bot/test', { method: 'POST' });
      const res = await POST(req);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data.results).toHaveLength(2);
      expect(body.data.results[0].reachable).toBe(true);
      expect(body.data.results[1].reachable).toBe(false);
    });
  });
});
