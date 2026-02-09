import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/* ------------------------------------------------------------------ */
/* Mock: GramJS (telegram)                                            */
/* ------------------------------------------------------------------ */
const mockInvoke = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockComputePasswordCheck = vi.fn().mockResolvedValue('computed-password');

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => ({
    invoke: mockInvoke,
    connect: mockConnect,
    disconnect: mockDisconnect,
    session: { save: () => 'mock-session-string' },
    computePasswordCheck: mockComputePasswordCheck,
  })),
  Api: {
    auth: {
      SendCode: vi.fn().mockImplementation((args: any) => args),
      SignIn: vi.fn().mockImplementation((args: any) => args),
      CheckPassword: vi.fn().mockImplementation((args: any) => args),
    },
    account: {
      GetPassword: vi.fn().mockImplementation(() => ({})),
    },
    CodeSettings: vi.fn().mockImplementation(() => ({})),
  },
}));

vi.mock('telegram/sessions', () => ({
  StringSession: vi.fn().mockImplementation(() => ({})),
}));

/* ------------------------------------------------------------------ */
/* Mock: audit, encryption                                            */
/* ------------------------------------------------------------------ */
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((v: string) => `encrypted_${v}`),
}));

/* ------------------------------------------------------------------ */
/* Mock: api-handler — default (overridden per describe block)        */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function createMockSupabase() {
  const mockChain: Record<string, any> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
  };

  return {
    from: vi.fn().mockReturnValue(mockChain),
    _chain: mockChain,
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */
describe('MTProto API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  /* ================================================================ */
  /* GET /api/mtproto/sessions                                        */
  /* ================================================================ */
  describe('GET /api/mtproto/sessions', () => {
    it('should return sessions without session_string', async () => {
      const mockSessions = [
        { id: '1', phone_number: '+5511999', label: 'founder_test', is_active: true, requires_reauth: false, last_used_at: null, created_at: '2026-01-01' },
      ];

      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          supabase.from = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockSessions, error: null }),
            }),
          });
          return handler(req, { user: { id: 'u1', email: 'a@b.com' }, role: 'super_admin', groupFilter: null, supabase });
        },
      );

      const { GET } = await import('../mtproto/sessions/route');

      const req = new NextRequest('http://localhost/api/mtproto/sessions');
      const res = await GET(req);
      const body = await res.json();

      expect(body.success).toBe(true);
      if (body.data) {
        for (const s of body.data) {
          expect(s).not.toHaveProperty('session_string');
        }
      }
    });
  });

  /* ================================================================ */
  /* POST /api/mtproto/setup                                          */
  /* ================================================================ */
  describe('POST /api/mtproto/setup', () => {
    it('rejects invalid phone number format', async () => {
      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          return handler(req, { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase });
        },
      );

      const { POST } = await import('../mtproto/setup/route');

      const req = new NextRequest('http://localhost/api/mtproto/setup', {
        method: 'POST',
        body: JSON.stringify({ phone_number: '123' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('sends code and returns setup_token on valid phone', async () => {
      mockInvoke.mockResolvedValueOnce({ phoneCodeHash: 'hash123' });

      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          return handler(req, { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase });
        },
      );

      const { POST } = await import('../mtproto/setup/route');

      const req = new NextRequest('http://localhost/api/mtproto/setup', {
        method: 'POST',
        body: JSON.stringify({ phone_number: '+5511999999999' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('setup_token');
      expect(body.data).toHaveProperty('phone_hash', 'hash123');
    });

    it('returns error when Telegram sendCode fails', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('FLOOD_WAIT'));

      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          return handler(req, { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase });
        },
      );

      const { POST } = await import('../mtproto/setup/route');

      const req = new NextRequest('http://localhost/api/mtproto/setup', {
        method: 'POST',
        body: JSON.stringify({ phone_number: '+5511999999999' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MTPROTO_SETUP_FAILED');
    });
  });

  /* ================================================================ */
  /* POST /api/mtproto/verify                                         */
  /* ================================================================ */
  describe('POST /api/mtproto/verify', () => {
    const VALID_TOKEN = '550e8400-e29b-41d4-a716-446655440000';

    function createMockClient(overrides: Record<string, any> = {}) {
      return {
        invoke: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        session: { save: () => 'session-str' },
        computePasswordCheck: vi.fn().mockResolvedValue('computed-password'),
        ...overrides,
      };
    }

    it('rejects invalid/missing setup_token', async () => {
      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          return handler(req, { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase });
        },
      );

      const { POST } = await import('../mtproto/verify/route');

      const req = new NextRequest('http://localhost/api/mtproto/verify', {
        method: 'POST',
        body: JSON.stringify({ setup_token: 'not-a-uuid', code: '12345' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns MTPROTO_SETUP_EXPIRED for unknown token', async () => {
      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          return handler(req, { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase });
        },
      );

      // Import setup to get pendingSetups, then import verify (which also imports pendingSetups)
      const { pendingSetups } = await import('../mtproto/setup/route');
      pendingSetups.clear();

      const { POST } = await import('../mtproto/verify/route');

      const req = new NextRequest('http://localhost/api/mtproto/verify', {
        method: 'POST',
        body: JSON.stringify({ setup_token: VALID_TOKEN, code: '12345' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MTPROTO_SETUP_EXPIRED');
    });

    it('returns MTPROTO_VERIFICATION_FAILED after 5 attempts', async () => {
      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          return handler(req, { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase });
        },
      );

      const { pendingSetups } = await import('../mtproto/setup/route');
      const mockClient = createMockClient();
      pendingSetups.set(VALID_TOKEN, {
        client: mockClient as any,
        phoneHash: 'hash',
        phoneNumber: '+5511999999999',
        attempts: 5,
        createdAt: Date.now(),
      });

      const { POST } = await import('../mtproto/verify/route');

      const req = new NextRequest('http://localhost/api/mtproto/verify', {
        method: 'POST',
        body: JSON.stringify({ setup_token: VALID_TOKEN, code: '12345' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(429);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MTPROTO_VERIFICATION_FAILED');
      expect(pendingSetups.has(VALID_TOKEN)).toBe(false);
    });

    it('returns MTPROTO_SETUP_EXPIRED for expired token', async () => {
      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          return handler(req, { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase });
        },
      );

      const { pendingSetups } = await import('../mtproto/setup/route');
      const mockClient = createMockClient();
      pendingSetups.set(VALID_TOKEN, {
        client: mockClient as any,
        phoneHash: 'hash',
        phoneNumber: '+5511999999999',
        attempts: 0,
        createdAt: Date.now() - 6 * 60 * 1000,
      });

      const { POST } = await import('../mtproto/verify/route');

      const req = new NextRequest('http://localhost/api/mtproto/verify', {
        method: 'POST',
        body: JSON.stringify({ setup_token: VALID_TOKEN, code: '12345' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MTPROTO_SETUP_EXPIRED');
      expect(pendingSetups.has(VALID_TOKEN)).toBe(false);
    });

    it('successfully verifies code and saves session', async () => {
      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          // Override from() to return an object whose upsert starts a proper chain
          supabase.from = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'session-1', phone_number: '+5511999999999', label: 'founder_admin' },
                  error: null,
                }),
              }),
            }),
          });
          return handler(req, { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase });
        },
      );

      const { pendingSetups } = await import('../mtproto/setup/route');
      const mockClient = createMockClient();
      pendingSetups.set(VALID_TOKEN, {
        client: mockClient as any,
        phoneHash: 'hash',
        phoneNumber: '+5511999999999',
        attempts: 0,
        createdAt: Date.now(),
      });

      const { POST } = await import('../mtproto/verify/route');

      const req = new NextRequest('http://localhost/api/mtproto/verify', {
        method: 'POST',
        body: JSON.stringify({ setup_token: VALID_TOKEN, code: '12345' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('session_id', 'session-1');
      expect(body.data).toHaveProperty('label', 'founder_admin');
      expect(body.data).toHaveProperty('phone_number', '+5511999999999');
      expect(pendingSetups.has(VALID_TOKEN)).toBe(false);
    });

    it('returns MTPROTO_2FA_REQUIRED when password needed', async () => {
      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          return handler(req, { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase });
        },
      );

      const { pendingSetups } = await import('../mtproto/setup/route');
      const mockClient = createMockClient({
        invoke: vi.fn().mockRejectedValueOnce(new Error('SESSION_PASSWORD_NEEDED')),
      });
      pendingSetups.set(VALID_TOKEN, {
        client: mockClient as any,
        phoneHash: 'hash',
        phoneNumber: '+5511999999999',
        attempts: 0,
        createdAt: Date.now(),
      });

      const { POST } = await import('../mtproto/verify/route');

      const req = new NextRequest('http://localhost/api/mtproto/verify', {
        method: 'POST',
        body: JSON.stringify({ setup_token: VALID_TOKEN, code: '12345' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MTPROTO_2FA_REQUIRED');
    });
  });

  /* ================================================================ */
  /* DELETE /api/mtproto/sessions/:id                                 */
  /* ================================================================ */
  describe('DELETE /api/mtproto/sessions/:id', () => {
    it('returns 404 for unknown session', async () => {
      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          const supabase = createMockSupabase();
          supabase._chain.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });
          return handler(
            req,
            { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase },
            { params: Promise.resolve({ id: 'session-nonexistent' }) },
          );
        },
      );

      const { DELETE } = await import('../mtproto/sessions/[id]/route');

      const req = new NextRequest('http://localhost/api/mtproto/sessions/session-nonexistent', {
        method: 'DELETE',
      });

      const res = await DELETE(req);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('deactivates session successfully', async () => {
      const { createApiHandler } = await import('@/middleware/api-handler');
      vi.mocked(createApiHandler).mockImplementation(
        (handler: Function) => async (req: NextRequest) => {
          // Build a supabase mock that handles two separate from() call chains:
          // 1st from(): .select().eq().single() -> returns session data
          // 2nd from(): .update().eq() -> returns success
          let fromCallCount = 0;
          const supabase = {
            from: vi.fn().mockImplementation(() => {
              fromCallCount++;
              if (fromCallCount === 1) {
                // First call: fetch session by id
                return {
                  select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: { id: 'session-1', phone_number: '+5511999999999', label: 'founder_admin' },
                        error: null,
                      }),
                    }),
                  }),
                };
              }
              // Second call: update session
              return {
                update: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              };
            }),
          };

          return handler(
            req,
            { user: { id: 'user-1', email: 'admin@test.com' }, role: 'super_admin', groupFilter: null, supabase },
            { params: Promise.resolve({ id: 'session-1' }) },
          );
        },
      );

      const { DELETE } = await import('../mtproto/sessions/[id]/route');

      const req = new NextRequest('http://localhost/api/mtproto/sessions/session-1', {
        method: 'DELETE',
      });

      const res = await DELETE(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 'session-1', deactivated: true });
    });
  });
});
