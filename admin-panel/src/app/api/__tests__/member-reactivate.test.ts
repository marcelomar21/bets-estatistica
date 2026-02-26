import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Save/restore global fetch
const originalFetch = global.fetch;

function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function createMockRequest(method: string, url: string): NextRequest {
  return new NextRequest(new Request(url, { method }));
}

const sampleCancelledMember = {
  id: 42,
  telegram_id: 123456789,
  telegram_username: 'testuser',
  status: 'cancelado',
  group_id: 'group-uuid-1',
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
      updateChain.select = vi.fn().mockReturnValue(updateChain);
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

describe('POST /api/members/[id]/reactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reactivates a cancelled member', async () => {
    const mock = createTableMock({
      members: { singleData: sampleCancelledMember },
      bot_pool: { singleData: sampleBotData },
      audit_log: {},
    });
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/reactivate/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/reactivate');
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ativo');
  });

  it('rejects invalid member ID', async () => {
    const mock = createTableMock({});
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/reactivate/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/abc/reactivate');
    const res = await POST(req, createRouteContext({ id: 'abc' }));
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

    const { POST } = await import('../members/[id]/reactivate/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/999/reactivate');
    const res = await POST(req, createRouteContext({ id: '999' }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('rejects reactivation of active member', async () => {
    const mock = createTableMock({
      members: { singleData: { ...sampleCancelledMember, status: 'ativo' } },
    });
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/reactivate/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/reactivate');
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects reactivation of trial member', async () => {
    const mock = createTableMock({
      members: { singleData: { ...sampleCancelledMember, status: 'trial' } },
    });
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/reactivate/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/reactivate');
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 409 on concurrent status change', async () => {
    const mock = createTableMock({
      members: { singleData: sampleCancelledMember, updateError: undefined },
    });
    // Override the update mock to simulate no rows matched
    mock.from.mockImplementation((tableName: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({
        data: tableName === 'members' ? sampleCancelledMember : null,
        error: null,
      });
      chain.update = vi.fn().mockImplementation(() => {
        const updateChain: Record<string, unknown> = {};
        updateChain.eq = vi.fn().mockReturnValue(updateChain);
        updateChain.select = vi.fn().mockReturnValue(updateChain);
        updateChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return updateChain;
      });
      chain.insert = vi.fn().mockResolvedValue({ error: null });
      return chain;
    });
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/reactivate/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/reactivate');
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('applies group filter for group_admin', async () => {
    const mock = createTableMock({
      members: { singleData: sampleCancelledMember },
      bot_pool: { singleData: sampleBotData },
      audit_log: {},
    });
    const ctx = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/reactivate/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/reactivate');
    await POST(req, createRouteContext({ id: '42' }));

    const hasGroupFilter = mock.eqCalls.some(
      ([col, val]) => col === 'group_id' && val === 'group-uuid-1',
    );
    expect(hasGroupFilter).toBe(true);
  });

  it('calls Telegram unbanChatMember on success', async () => {
    const mock = createTableMock({
      members: { singleData: sampleCancelledMember },
      bot_pool: { singleData: sampleBotData },
      audit_log: {},
    });
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/reactivate/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/reactivate');
    await POST(req, createRouteContext({ id: '42' }));

    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const unbanCall = fetchCalls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('unbanChatMember'),
    );
    expect(unbanCall).toBeDefined();

    const unbanBody = JSON.parse((unbanCall![1] as { body: string }).body);
    expect(unbanBody.chat_id).toBe('-1001234567890');
    expect(unbanBody.user_id).toBe(123456789);
    expect(unbanBody.only_if_banned).toBe(true);
  });
});
