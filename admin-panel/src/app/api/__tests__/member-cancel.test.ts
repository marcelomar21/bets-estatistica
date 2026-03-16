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

function createMockRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new Request(url, init));
}

const sampleMember = {
  id: 42,
  telegram_id: 123456789,
  telegram_username: 'testuser',
  status: 'ativo',
  group_id: 'group-uuid-1',
};

const sampleBotData = {
  bot_token: 'test-bot-token',
  public_group_id: '-1001234567890',
  groups: { checkout_url: 'https://checkout.example.com' },
};

/**
 * Create a supabase mock that returns different data based on the table name.
 * tableResponses is a map of table name → { data, error, singleData?, singleError? }
 */
function createTableMock(tableResponses: Record<string, {
  selectData?: unknown;
  selectError?: unknown;
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
    chain.from = from; // allow chaining back

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

describe('POST /api/members/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('cancels a member with valid reason', async () => {
    const mock = createTableMock({
      members: { singleData: sampleMember },
      audit_log: {},
    });
    setupAdminBotPoolMock();
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/cancel/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/cancel', { reason: 'Membro inativo' });
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('cancelado');
  });

  it('rejects missing reason', async () => {
    const mock = createTableMock({});
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/cancel/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/cancel', { reason: '' });
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects reason shorter than 3 chars', async () => {
    const mock = createTableMock({});
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/cancel/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/cancel', { reason: 'ab' });
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('rejects invalid member ID', async () => {
    const mock = createTableMock({});
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/cancel/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/abc/cancel', { reason: 'Testing' });
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

    const { POST } = await import('../members/[id]/cancel/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/999/cancel', { reason: 'Testing' });
    const res = await POST(req, createRouteContext({ id: '999' }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('rejects cancellation of already cancelled member', async () => {
    const mock = createTableMock({
      members: { singleData: { ...sampleMember, status: 'cancelado' } },
    });
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/cancel/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/cancel', { reason: 'Testing' });
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects cancellation of removed member', async () => {
    const mock = createTableMock({
      members: { singleData: { ...sampleMember, status: 'removido' } },
    });
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/cancel/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/cancel', { reason: 'Testing' });
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('applies group filter for group_admin', async () => {
    const mock = createTableMock({
      members: { singleData: sampleMember },
      audit_log: {},
    });
    setupAdminBotPoolMock();
    const ctx = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/cancel/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/cancel', { reason: 'Membro inativo' });
    await POST(req, createRouteContext({ id: '42' }));

    // Verify group filter was applied
    const hasGroupFilter = mock.eqCalls.some(
      ([col, val]) => col === 'group_id' && val === 'group-uuid-1'
    );
    expect(hasGroupFilter).toBe(true);
  });

  it('group_admin can trigger Telegram ban via admin client', async () => {
    const mock = createTableMock({
      members: { singleData: sampleMember },
      audit_log: {},
    });
    setupAdminBotPoolMock();
    const ctx = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { POST } = await import('../members/[id]/cancel/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/cancel', { reason: 'Membro inativo' });
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Verify banChatMember was called via global.fetch
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const banCall = fetchCalls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/banChatMember'),
    );
    expect(banCall).toBeDefined();
    const banBody = JSON.parse(banCall![1].body);
    expect(banBody.chat_id).toBe('-1001234567890');
    expect(banBody.user_id).toBe(123456789);
  });

  it('logs warning when Telegram ban fails', async () => {
    const mock = createTableMock({
      members: { singleData: sampleMember },
      audit_log: {},
    });
    setupAdminBotPoolMock();
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { POST } = await import('../members/[id]/cancel/route');
    const req = createMockRequest('POST', 'http://localhost/api/members/42/cancel', { reason: 'Membro inativo' });
    const res = await POST(req, createRouteContext({ id: '42' }));
    const body = await res.json();

    // API should still succeed (best-effort Telegram)
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // console.warn should have been called
    expect(warnSpy).toHaveBeenCalledWith(
      '[cancel] Telegram banChatMember error:',
      'Network error',
    );
    warnSpy.mockRestore();
  });
});
