import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Mock supabase-admin (service_role client for bot_pool queries)
const mockAdminFrom = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: mockAdminFrom }),
}));

// Save/restore global fetch
const originalFetch = global.fetch;

function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function createMockRequest(method: string, url: string): NextRequest {
  return new NextRequest(new Request(url, { method }));
}

const sampleMember = {
  id: 42,
  is_admin: false,
  group_id: 'group-uuid-1',
  telegram_id: 123456789,
};

const sampleBotData = {
  bot_token: 'test-bot-token',
  public_group_id: '-1001234567890',
};

function createTableMock(tableResponses: Record<string, {
  singleData?: unknown;
  singleError?: unknown;
  updateError?: unknown;
  insertError?: unknown;
}>) {
  const eqCalls: Array<[string, unknown]> = [];

  const from = vi.fn().mockImplementation((tableName: string) => {
    const response = tableResponses[tableName] || {};
    const chain: Record<string, unknown> = {};

    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    });
    chain.single = vi.fn().mockResolvedValue({
      data: response.singleData ?? null,
      error: response.singleError ?? null,
    });
    chain.update = vi.fn().mockImplementation(() => {
      const updateChain: Record<string, unknown> = {};
      updateChain.eq = vi.fn().mockReturnValue(updateChain);
      updateChain.maybeSingle = vi.fn().mockResolvedValue({
        data: response.updateError ? null : { id: 1 },
        error: response.updateError ?? null,
      });
      return updateChain;
    });
    chain.insert = vi.fn().mockResolvedValue({ error: response.insertError ?? null });

    return chain;
  });

  return { from, eqCalls };
}

function setupAdminBotPoolMock(botData: typeof sampleBotData | null = sampleBotData) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({
    data: botData,
    error: botData ? null : { message: 'not found' },
  });
  mockAdminFrom.mockReturnValue(chain);
}

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-uuid-1',
    supabase: (supabaseMock ?? { from: vi.fn() }) as unknown as TenantContext['supabase'],
  };
}

describe('PATCH /api/members/[id]/toggle-admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('promotes member to admin in Telegram', async () => {
    const mock = createTableMock({
      members: { singleData: { ...sampleMember, is_admin: false } },
      audit_log: {},
    });
    setupAdminBotPoolMock();
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { PATCH } = await import('../members/[id]/toggle-admin/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/members/42/toggle-admin');
    const res = await PATCH(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.is_admin).toBe(true);

    // Verify promoteChatMember was called with permissions = true
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const promoteCall = fetchCalls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/promoteChatMember'),
    );
    expect(promoteCall).toBeDefined();
    const promoteBody = JSON.parse(promoteCall![1].body);
    expect(promoteBody.chat_id).toBe('-1001234567890');
    expect(promoteBody.user_id).toBe(123456789);
    expect(promoteBody.can_manage_chat).toBe(true);
    expect(promoteBody.can_delete_messages).toBe(true);
    expect(promoteBody.can_restrict_members).toBe(true);
    expect(promoteBody.can_invite_users).toBe(true);
    expect(promoteBody.can_pin_messages).toBe(true);
    expect(promoteBody.can_manage_video_chats).toBe(true);
  });

  it('demotes member from admin in Telegram', async () => {
    const mock = createTableMock({
      members: { singleData: { ...sampleMember, is_admin: true } },
      audit_log: {},
    });
    setupAdminBotPoolMock();
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { PATCH } = await import('../members/[id]/toggle-admin/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/members/42/toggle-admin');
    const res = await PATCH(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.is_admin).toBe(false);

    // Verify promoteChatMember was called with permissions = false
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const promoteCall = fetchCalls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/promoteChatMember'),
    );
    expect(promoteCall).toBeDefined();
    const promoteBody = JSON.parse(promoteCall![1].body);
    expect(promoteBody.can_manage_chat).toBe(false);
    expect(promoteBody.can_delete_messages).toBe(false);
    expect(promoteBody.can_restrict_members).toBe(false);
  });

  it('skips Telegram when member has no telegram_id', async () => {
    const mock = createTableMock({
      members: { singleData: { ...sampleMember, telegram_id: null } },
      audit_log: {},
    });
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { PATCH } = await import('../members/[id]/toggle-admin/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/members/42/toggle-admin');
    const res = await PATCH(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Verify no Telegram call was made
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const promoteCall = fetchCalls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/promoteChatMember'),
    );
    expect(promoteCall).toBeUndefined();
    // Admin bot_pool should not have been queried
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it('continues on Telegram failure', async () => {
    const mock = createTableMock({
      members: { singleData: sampleMember },
      audit_log: {},
    });
    setupAdminBotPoolMock();
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { PATCH } = await import('../members/[id]/toggle-admin/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/members/42/toggle-admin');
    const res = await PATCH(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    // API should still succeed (best-effort Telegram)
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    expect(warnSpy).toHaveBeenCalledWith(
      '[toggle-admin] Telegram promoteChatMember error:',
      'Network error',
    );
    warnSpy.mockRestore();
  });

  it('group_admin can toggle admin with Telegram', async () => {
    const mock = createTableMock({
      members: { singleData: sampleMember },
      audit_log: {},
    });
    setupAdminBotPoolMock();
    const ctx = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { PATCH } = await import('../members/[id]/toggle-admin/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/members/42/toggle-admin');
    const res = await PATCH(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Verify Telegram call went through despite being group_admin
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const promoteCall = fetchCalls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/promoteChatMember'),
    );
    expect(promoteCall).toBeDefined();

    // Verify admin client was used for bot_pool (not tenant's supabase)
    expect(mockAdminFrom).toHaveBeenCalledWith('bot_pool');
  });

  it('rejects invalid member ID', async () => {
    const mock = createTableMock({});
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { PATCH } = await import('../members/[id]/toggle-admin/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/members/abc/toggle-admin');
    const res = await PATCH(req, createRouteContext({ id: 'abc' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent member', async () => {
    const mock = createTableMock({
      members: { singleError: { message: 'not found' } },
    });
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { PATCH } = await import('../members/[id]/toggle-admin/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/members/999/toggle-admin');
    const res = await PATCH(req, createRouteContext({ id: '999' }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
