import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantResult } from '@/middleware/tenant';

// Mock external integration clients
vi.mock('@/lib/telegram', () => ({
  validateBotToken: vi.fn(),
}));

vi.mock('@/lib/mercadopago', () => ({
  createCheckoutPreference: vi.fn(),
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

import { POST } from '../groups/onboarding/route';
import { validateBotToken } from '@/lib/telegram';
import { createCheckoutPreference } from '@/lib/mercadopago';
import { createBotService } from '@/lib/render';

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

describe('POST /api/groups/onboarding', () => {
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
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as TenantResult);

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

  it('rejects body with missing fields', async () => {
    const mockCtx = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as TenantResult);

    const req = createRequest({ name: 'A' }); // name too short, missing email and bot_id
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects body with invalid email', async () => {
    const mockCtx = createMockContext();
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as TenantResult);

    const req = createRequest({ name: 'Test Group', email: 'invalid', bot_id: 'a0000000-0000-4000-a000-000000000001' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects when bot is not found', async () => {
    const mockCtx = createMockContext({
      bot_pool: {
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as TenantResult);

    const req = createRequest({ name: 'Test Group', email: 'test@test.com', bot_id: 'a0000000-0000-4000-a000-000000000001' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.message).toBe('Bot não encontrado');
  });

  it('rejects when bot is not available', async () => {
    const mockCtx = createMockContext({
      bot_pool: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'bot-1', bot_token: 'token', bot_username: 'mybot', status: 'in_use' },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as TenantResult);

    const req = createRequest({ name: 'Test Group', email: 'test@test.com', bot_id: 'a0000000-0000-4000-a000-000000000001' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.message).toBe('Bot não está disponível');
  });

  it('rejects when email is already in use', async () => {
    const mockCtx = createMockContext({
      bot_pool: {
        single: vi.fn().mockResolvedValue({
          data: { id: 'bot-1', bot_token: 'token', bot_username: 'mybot', status: 'available' },
          error: null,
        }),
      },
    });
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as TenantResult);

    // Admin check returns existing user
    mockAdminFrom.mockReturnValue(
      createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: { id: 'existing-user' }, error: null }),
      }),
    );

    const req = createRequest({ name: 'Test Group', email: 'existing@test.com', bot_id: 'a0000000-0000-4000-a000-000000000001' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.message).toBe('Email já está em uso');
  });

  it('returns error when Telegram API fails', async () => {
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
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as TenantResult);

    vi.mocked(validateBotToken).mockResolvedValue({ success: false, error: 'Unauthorized' });

    const req = createRequest({ name: 'Test Group', email: 'test@test.com', bot_id: 'a0000000-0000-4000-a000-000000000001' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('ONBOARDING_FAILED');
    expect(json.error.step).toBe('validating_bot');
    expect(json.error.group_id).toBe('group-1');
  });

  it('returns error when Mercado Pago API fails', async () => {
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
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as TenantResult);

    vi.mocked(validateBotToken).mockResolvedValue({ success: true, data: { username: 'mybot' } });
    vi.mocked(createCheckoutPreference).mockResolvedValue({ success: false, error: 'MP error' });

    const req = createRequest({ name: 'Test Group', email: 'test@test.com', bot_id: 'a0000000-0000-4000-a000-000000000001' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('ONBOARDING_FAILED');
    expect(json.error.step).toBe('configuring_mp');
  });

  it('returns error when Render API fails', async () => {
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
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as TenantResult);

    vi.mocked(validateBotToken).mockResolvedValue({ success: true, data: { username: 'mybot' } });
    vi.mocked(createCheckoutPreference).mockResolvedValue({ success: true, data: { id: 'pref-1', checkout_url: 'http://mp.com/checkout' } });
    vi.mocked(createBotService).mockResolvedValue({ success: false, error: 'Render error' });

    const req = createRequest({ name: 'Test Group', email: 'test@test.com', bot_id: 'a0000000-0000-4000-a000-000000000001' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('ONBOARDING_FAILED');
    expect(json.error.step).toBe('deploying_bot');
  });

  it('returns error when Supabase Auth fails', async () => {
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
    mockWithTenant.mockResolvedValue({ success: true, context: mockCtx } as TenantResult);

    vi.mocked(validateBotToken).mockResolvedValue({ success: true, data: { username: 'mybot' } });
    vi.mocked(createCheckoutPreference).mockResolvedValue({ success: true, data: { id: 'pref-1', checkout_url: 'http://mp.com/checkout' } });
    vi.mocked(createBotService).mockResolvedValue({ success: true, data: { service_id: 'srv-1' } });

    mockAdminAuth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth error' },
    });

    const req = createRequest({ name: 'Test Group', email: 'test@test.com', bot_id: 'a0000000-0000-4000-a000-000000000001' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('ONBOARDING_FAILED');
    expect(json.error.step).toBe('creating_admin');
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

    const req = createRequest({ name: 'Test', email: 'test@test.com', bot_id: 'a0000000-0000-4000-a000-000000000001' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
  });
});
