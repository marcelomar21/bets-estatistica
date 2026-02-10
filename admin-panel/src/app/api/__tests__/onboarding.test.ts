import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantResult } from '@/middleware/tenant';

// Mock external integration clients
vi.mock('@/lib/telegram', () => ({
  validateBotToken: vi.fn(),
}));

vi.mock('@/lib/mercadopago', () => ({
  createSubscriptionPlan: vi.fn(),
}));

vi.mock('@/lib/render', () => ({
  createBotService: vi.fn(),
}));

// Mock supabase-js createClient (for admin operations)
const mockAdminAuth = {
  admin: {
    createUser: vi.fn(),
  },
};

const mockAdminFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: mockAdminAuth,
    from: mockAdminFrom,
  }),
}));

// Mock withTenant
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

vi.mock('@/lib/mtproto', () => ({
  withMtprotoSession: vi.fn(),
  createSupergroup: vi.fn(),
  addBotAsAdmin: vi.fn(),
  createInviteLink: vi.fn(),
  verifyBotIsAdmin: vi.fn(),
  classifyMtprotoError: vi.fn(),
  MtprotoError: class MtprotoError extends Error {
    code: string;
    retryable: boolean;
    constructor(code: string, message?: string, retryable = false) {
      super(message || code);
      this.name = 'MtprotoError';
      this.code = code;
      this.retryable = retryable;
    }
  },
}));

vi.mock('@/lib/super-admin-bot', () => ({
  getBotConfig: vi.fn(),
  sendFounderNotification: vi.fn(),
  sendInvite: vi.fn(),
}));

import { POST } from '../groups/onboarding/route';
import { validateBotToken } from '@/lib/telegram';
import { createSubscriptionPlan } from '@/lib/mercadopago';
import { createBotService } from '@/lib/render';
import { withMtprotoSession, createSupergroup, addBotAsAdmin, createInviteLink, verifyBotIsAdmin, classifyMtprotoError, MtprotoError } from '@/lib/mtproto';
import { getBotConfig, sendFounderNotification } from '@/lib/super-admin-bot';

// Helper to create mock query builder
function createMockQueryBuilder(overrides: Record<string, unknown> = {}) {
  const builder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((cb) => cb({ error: null })),
    ...overrides,
  };
  return builder;
}

function createMockContext(overrides: Record<string, Record<string, unknown>> = {}) {
  const defaultQueryBuilder = createMockQueryBuilder();

  const mockSupabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (overrides[table]) {
        return createMockQueryBuilder(overrides[table]);
      }
      return defaultQueryBuilder;
    }),
  };

  return {
    user: { id: 'user-123', email: 'admin@test.com' },
    role: 'super_admin' as const,
    groupFilter: null,
    supabase: mockSupabase,
  };
}

function createRequest(body: unknown) {
  return new NextRequest('http://localhost/api/groups/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BOT_ID = 'a0000000-0000-4000-a000-000000000001';
const VALID_GROUP_ID = 'b0000000-0000-4000-b000-000000000001';

describe('POST /api/groups/onboarding (step-by-step)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: admin email check returns no existing admin
    mockAdminFrom.mockReturnValue(
      createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    );
  });

  it('rejects invalid JSON body', async () => {
    const mockCtx = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = new NextRequest('http://localhost/api/groups/onboarding', {
      method: 'POST',
      body: 'not json',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects body without step field', async () => {
    const mockCtx = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = createRequest({ name: 'Test' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects creating step with missing fields', async () => {
    const mockCtx = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = createRequest({ step: 'creating', name: 'A' }); // name too short, missing email, bot_id, price
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects creating step with invalid email', async () => {
    const mockCtx = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = createRequest({ step: 'creating', name: 'Test Group', email: 'invalid', bot_id: VALID_BOT_ID, price: 29.9 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects creating step with invalid price', async () => {
    const mockCtx = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = createRequest({ step: 'creating', name: 'Test Group', email: 'test@test.com', bot_id: VALID_BOT_ID, price: 0 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects when bot is not found (creating step)', async () => {
    const mockCtx = createMockContext({
      bot_pool: {
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = createRequest({ step: 'creating', name: 'Test Group', email: 'test@test.com', bot_id: VALID_BOT_ID, price: 29.9 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.message).toBe('Bot não encontrado');
  });

  it('rejects when bot is not available (creating step)', async () => {
    const mockCtx = createMockContext({
      bot_pool: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'bot-1', bot_token: 'token', bot_username: 'mybot', status: 'in_use' },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = createRequest({ step: 'creating', name: 'Test Group', email: 'test@test.com', bot_id: VALID_BOT_ID, price: 29.9 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.message).toBe('Bot não está disponível');
  });

  it('rejects when email is already in use (creating step)', async () => {
    const mockCtx = createMockContext({
      bot_pool: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'bot-1', bot_token: 'token', bot_username: 'mybot', status: 'available' },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    // Admin check returns existing user
    mockAdminFrom.mockReturnValue(
      createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: { id: 'existing-user' }, error: null }),
      }),
    );

    const req = createRequest({ step: 'creating', name: 'Test Group', email: 'test@test.com', bot_id: VALID_BOT_ID, price: 29.9 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.message).toBe('Email já está em uso');
  });

  it('creating step returns group_id and bot_username', async () => {
    const mockCtx = createMockContext({
      bot_pool: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'bot-1', bot_token: 'token', bot_username: 'mybot', status: 'available' },
          error: null,
        }),
      },
      groups: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'group-1', name: 'Test', status: 'creating' },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = createRequest({ step: 'creating', name: 'Test Group', email: 'test@test.com', bot_id: VALID_BOT_ID, price: 29.9 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.group_id).toBe('group-1');
    expect(json.data.bot_username).toBe('mybot');
  });

  it('returns error when Telegram API fails (validating_bot step)', async () => {
    const mockCtx = createMockContext({
      bot_pool: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'bot-1', bot_token: 'token', bot_username: 'mybot' },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    vi.mocked(validateBotToken).mockResolvedValue({ success: false, error: 'Unauthorized' });

    const req = createRequest({ step: 'validating_bot', group_id: VALID_GROUP_ID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('ONBOARDING_FAILED');
    expect(json.error.step).toBe('validating_bot');
    expect(json.error.group_id).toBe(VALID_GROUP_ID);
  });

  it('validating_bot step returns bot_username on success', async () => {
    const mockCtx = createMockContext({
      bot_pool: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'bot-1', bot_token: 'token', bot_username: 'mybot' },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    vi.mocked(validateBotToken).mockResolvedValue({ success: true, data: { username: 'mybot' } });

    const req = createRequest({ step: 'validating_bot', group_id: VALID_GROUP_ID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.bot_username).toBe('mybot');
  });

  it('returns error when Mercado Pago API fails (configuring_mp step)', async () => {
    const mockCtx = createMockContext({
      groups: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'group-1', name: 'Test', mp_plan_id: null, checkout_url: null },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    vi.mocked(createSubscriptionPlan).mockResolvedValue({ success: false, error: 'MP error' });

    const req = createRequest({ step: 'configuring_mp', group_id: VALID_GROUP_ID, price: 29.9 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('ONBOARDING_FAILED');
    expect(json.error.step).toBe('configuring_mp');
  });

  it('passes price to Mercado Pago (configuring_mp step)', async () => {
    const mockCtx = createMockContext({
      groups: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'group-1', name: 'Test Group', mp_plan_id: null, checkout_url: null },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    vi.mocked(createSubscriptionPlan).mockResolvedValue({ success: true, data: { planId: 'plan-1', checkoutUrl: 'http://mp.com/checkout' } });

    const req = createRequest({ step: 'configuring_mp', group_id: VALID_GROUP_ID, price: 49.9 });
    await POST(req);

    expect(createSubscriptionPlan).toHaveBeenCalledWith('Test Group', VALID_GROUP_ID, 49.9);
  });

  it('configuring_mp is idempotent (skips if already configured)', async () => {
    const mockCtx = createMockContext({
      groups: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'group-1', name: 'Test', mp_plan_id: 'plan-1', checkout_url: 'http://mp.com/checkout' },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = createRequest({ step: 'configuring_mp', group_id: VALID_GROUP_ID, price: 29.9 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.checkout_url).toBe('http://mp.com/checkout');
    expect(createSubscriptionPlan).not.toHaveBeenCalled();
  });

  it('returns error and includes planId when MP succeeds but DB save fails (configuring_mp step)', async () => {
    const groupsSelectBuilder = createMockQueryBuilder({
      single: vi.fn().mockResolvedValue({
        data: { id: 'group-1', name: 'Test Group', mp_plan_id: null, checkout_url: null },
        error: null,
      }),
    });
    const groupsUpdateFailBuilder = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB write failed' } }),
    };
    const groupsStatusBuilder = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const groupBuilders = [groupsSelectBuilder, groupsUpdateFailBuilder, groupsStatusBuilder];

    const mockCtx = {
      user: { id: 'user-123', email: 'admin@test.com' },
      role: 'super_admin' as const,
      groupFilter: null,
      supabase: {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'groups') {
            const builder = groupBuilders.shift();
            return builder ?? createMockQueryBuilder();
          }
          return createMockQueryBuilder();
        }),
      },
    };
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    vi.mocked(createSubscriptionPlan).mockResolvedValue({
      success: true,
      data: { planId: 'plan-123', checkoutUrl: 'http://mp.com/checkout' },
    });

    const req = createRequest({ step: 'configuring_mp', group_id: VALID_GROUP_ID, price: 29.9 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('ONBOARDING_FAILED');
    expect(json.error.message).toContain('planId: plan-123');
  });

  it('returns error when Render API fails (deploying_bot step)', async () => {
    const mockCtx = createMockContext({
      groups: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'group-1', name: 'Test', render_service_id: null },
          error: null,
        }),
      },
      bot_pool: {
        single: vi.fn().mockResolvedValue({
          data: { bot_token: 'token' },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    vi.mocked(createBotService).mockResolvedValue({ success: false, error: 'Render error' });

    const req = createRequest({ step: 'deploying_bot', group_id: VALID_GROUP_ID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('ONBOARDING_FAILED');
    expect(json.error.step).toBe('deploying_bot');
  });

  it('deploying_bot is idempotent (skips if already deployed)', async () => {
    const mockCtx = createMockContext({
      groups: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'group-1', name: 'Test', render_service_id: 'srv-1' },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = createRequest({ step: 'deploying_bot', group_id: VALID_GROUP_ID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.service_id).toBe('srv-1');
    expect(createBotService).not.toHaveBeenCalled();
  });

  it('returns error when Supabase Auth fails (creating_admin step)', async () => {
    const mockCtx = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    // Admin check returns no existing admin for group
    mockAdminFrom.mockReturnValue(
      createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    );

    mockAdminAuth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth error' },
    });

    const req = createRequest({ step: 'creating_admin', group_id: VALID_GROUP_ID, email: 'test@test.com' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('ONBOARDING_FAILED');
    expect(json.error.step).toBe('creating_admin');
  });

  it('creating_admin step returns email and temp_password', async () => {
    const mockCtx = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    // Admin check returns no existing admin for group
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'admin_users') {
        return createMockQueryBuilder({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        });
      }
      return createMockQueryBuilder();
    });

    mockAdminAuth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'auth-user-1' } },
      error: null,
    });

    const req = createRequest({ step: 'creating_admin', group_id: VALID_GROUP_ID, email: 'test@test.com' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.admin_email).toBe('test@test.com');
    expect(json.data.temp_password).toBeDefined();
    expect(typeof json.data.temp_password).toBe('string');
  });

  it('creating_admin is idempotent (skips if admin exists)', async () => {
    const mockCtx = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    mockAdminFrom.mockReturnValue(
      createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: { id: 'existing-admin', email: 'test@test.com' }, error: null }),
      }),
    );

    const req = createRequest({ step: 'creating_admin', group_id: VALID_GROUP_ID, email: 'test@test.com' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.admin_email).toBe('test@test.com');
    expect(json.data.temp_password).toBeNull();
    expect(mockAdminAuth.admin.createUser).not.toHaveBeenCalled();
  });

  it('finalizing step activates group and returns full group data', async () => {
    const finalGroupData = {
      id: 'group-1', name: 'Canal do João', status: 'active',
      checkout_url: 'http://mp.com/checkout', mp_plan_id: 'plan-1',
      render_service_id: 'srv-1', created_at: '2026-01-01',
    };

    const mockCtx = createMockContext({
      groups: {
        single: vi.fn().mockResolvedValue({ data: finalGroupData, error: null }),
      },
      bot_health: {
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

    const req = createRequest({ step: 'finalizing', group_id: VALID_GROUP_ID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.group).toBeDefined();
    expect(json.data.group.name).toBe('Canal do João');
  });

  it('endpoint is protected by super_admin role', async () => {
    mockWithTenant.mockResolvedValue({
      success: true,
      context: {
        user: { id: 'user-1', email: 'admin@test.com' },
        role: 'group_admin',
        groupFilter: 'group-1',
        supabase: { from: vi.fn() },
      },
    } as unknown as TenantResult);

    const req = createRequest({ step: 'creating', name: 'Test', email: 'test@test.com', bot_id: VALID_BOT_ID, price: 29.9 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
  });

  describe('creating_telegram_group step', () => {
    it('returns BOT_NOT_ASSIGNED when no bot is linked to the group', async () => {
      const mockCtx = createMockContext({
        groups: {
          single: vi.fn().mockResolvedValue({
            data: { id: 'group-1', name: 'Test', telegram_group_id: null, telegram_invite_link: null, additional_invitee_ids: null },
            error: null,
          }),
        },
        bot_pool: {
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        },
      });
      mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

      const req = createRequest({ step: 'creating_telegram_group', group_id: VALID_GROUP_ID });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('BOT_NOT_ASSIGNED');
      expect(json.error.step).toBe('creating_telegram_group');
    });

    it('returns MTPROTO_SESSION_NOT_FOUND when no MTProto session is active', async () => {
      const mockCtx = createMockContext({
        groups: {
          single: vi.fn().mockResolvedValue({
            data: { id: 'group-1', name: 'Test', telegram_group_id: null, telegram_invite_link: null, additional_invitee_ids: null },
            error: null,
          }),
        },
        bot_pool: {
          single: vi.fn().mockResolvedValue({
            data: { bot_token: 'token', bot_username: 'mybot' },
            error: null,
          }),
        },
      });
      mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

      const mtprotoErr = new MtprotoError('MTPROTO_SESSION_NOT_FOUND', 'Nenhuma sessão MTProto ativa');
      vi.mocked(withMtprotoSession).mockRejectedValue(mtprotoErr);
      vi.mocked(classifyMtprotoError).mockReturnValue(mtprotoErr);

      const req = createRequest({ step: 'creating_telegram_group', group_id: VALID_GROUP_ID });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('MTPROTO_SESSION_NOT_FOUND');
      expect(json.error.step).toBe('creating_telegram_group');
    });

    it('creates supergroup, adds bot as admin, generates invite link on success', async () => {
      const mockCtx = createMockContext({
        groups: {
          single: vi.fn().mockResolvedValue({
            data: { id: 'group-1', name: 'Test Group', telegram_group_id: null, telegram_invite_link: null, additional_invitee_ids: null },
            error: null,
          }),
        },
        bot_pool: {
          single: vi.fn().mockResolvedValue({
            data: { bot_token: 'token', bot_username: 'mybot' },
            error: null,
          }),
        },
      });
      mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

      vi.mocked(withMtprotoSession).mockImplementation(async (_sb, fn) => fn({} as any));
      vi.mocked(createSupergroup).mockResolvedValue({ groupId: -1001234, channel: {} as any, accessHash: 0 as unknown as import('big-integer').BigInteger });
      vi.mocked(addBotAsAdmin).mockResolvedValue(undefined);
      vi.mocked(createInviteLink).mockResolvedValue('https://t.me/+abc');
      vi.mocked(getBotConfig).mockResolvedValue(null);

      const req = createRequest({ step: 'creating_telegram_group', group_id: VALID_GROUP_ID });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.telegram_group_id).toBe(-1001234);
      expect(json.data.invite_link).toBe('https://t.me/+abc');
    });

    it('skips creation when telegram_group_id already exists and bot is admin with invite link (idempotency)', async () => {
      const mockCtx = createMockContext({
        groups: {
          single: vi.fn().mockResolvedValue({
            data: { id: 'group-1', name: 'Test', telegram_group_id: -1001234, telegram_invite_link: 'https://t.me/+existing', additional_invitee_ids: null },
            error: null,
          }),
        },
        bot_pool: {
          single: vi.fn().mockResolvedValue({
            data: { bot_token: 'token', bot_username: 'mybot' },
            error: null,
          }),
        },
      });
      mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

      vi.mocked(withMtprotoSession).mockImplementation(async (_sb, fn) => fn({} as any));
      vi.mocked(verifyBotIsAdmin).mockResolvedValue(true);

      const req = createRequest({ step: 'creating_telegram_group', group_id: VALID_GROUP_ID });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.skipped).toBe(true);
      expect(json.data.telegram_group_id).toBe(-1001234);
      expect(json.data.invite_link).toBe('https://t.me/+existing');
    });

    it('returns BOT_NOT_ADMIN when group exists but bot is not admin', async () => {
      const mockCtx = createMockContext({
        groups: {
          single: vi.fn().mockResolvedValue({
            data: { id: 'group-1', name: 'Test', telegram_group_id: -1001234, telegram_invite_link: 'https://t.me/+existing', additional_invitee_ids: null },
            error: null,
          }),
        },
        bot_pool: {
          single: vi.fn().mockResolvedValue({
            data: { bot_token: 'token', bot_username: 'mybot' },
            error: null,
          }),
        },
      });
      mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

      vi.mocked(withMtprotoSession).mockImplementation(async (_sb, fn) => fn({} as any));
      vi.mocked(verifyBotIsAdmin).mockResolvedValue(false);

      const req = createRequest({ step: 'creating_telegram_group', group_id: VALID_GROUP_ID });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('BOT_NOT_ADMIN');
      expect(json.error.step).toBe('creating_telegram_group');
    });

    it('returns classified error when createSupergroup fails', async () => {
      const mockCtx = createMockContext({
        groups: {
          single: vi.fn().mockResolvedValue({
            data: { id: 'group-1', name: 'Test', telegram_group_id: null, telegram_invite_link: null, additional_invitee_ids: null },
            error: null,
          }),
        },
        bot_pool: {
          single: vi.fn().mockResolvedValue({
            data: { bot_token: 'token', bot_username: 'mybot' },
            error: null,
          }),
        },
      });
      mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

      vi.mocked(withMtprotoSession).mockRejectedValue(new Error('Create failed'));
      vi.mocked(classifyMtprotoError).mockReturnValue(
        Object.assign(new Error('Create failed'), { name: 'MtprotoError', code: 'TELEGRAM_ERROR', message: 'Create failed', retryable: true }) as any,
      );

      const req = createRequest({ step: 'creating_telegram_group', group_id: VALID_GROUP_ID });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('TELEGRAM_ERROR');
      expect(json.error.message).toBe('Create failed');
      expect(json.error.retryable).toBe(true);
      expect(json.error.step).toBe('creating_telegram_group');
    });

    it('returns FLOOD_WAIT error with retryAfterSeconds', async () => {
      const mockCtx = createMockContext({
        groups: {
          single: vi.fn().mockResolvedValue({
            data: { id: 'group-1', name: 'Test', telegram_group_id: null, telegram_invite_link: null, additional_invitee_ids: null },
            error: null,
          }),
        },
        bot_pool: {
          single: vi.fn().mockResolvedValue({
            data: { bot_token: 'token', bot_username: 'mybot' },
            error: null,
          }),
        },
      });
      mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as unknown as TenantResult);

      vi.mocked(withMtprotoSession).mockRejectedValue(new Error('Rate limit'));
      vi.mocked(classifyMtprotoError).mockReturnValue(
        Object.assign(new Error('Rate limit'), { name: 'MtprotoError', code: 'FLOOD_WAIT', message: 'Rate limit', retryable: true, retryAfterSeconds: 30 }) as any,
      );

      const req = createRequest({ step: 'creating_telegram_group', group_id: VALID_GROUP_ID });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FLOOD_WAIT');
      expect(json.error.retryable).toBe(true);
      expect(json.error.retryAfterSeconds).toBe(30);
      expect(json.error.step).toBe('creating_telegram_group');
    });
  });
});
