import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Supabase query builder mock for bots
function createMockQueryBuilder(overrides: {
  selectData?: unknown;
  selectError?: { message: string; code?: string } | null;
  insertData?: unknown;
  insertError?: { message: string; code?: string } | null;
} = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};

  builder.select = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.from = vi.fn(() => builder);

  builder.order = vi.fn(() => ({
    data: overrides.selectData ?? [],
    error: overrides.selectError ?? null,
  }));

  builder.single = vi.fn(() => ({
    data: overrides.insertData ?? null,
    error: overrides.insertError ?? null,
  }));

  return builder;
}

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  queryBuilder?: ReturnType<typeof createMockQueryBuilder>,
): TenantContext {
  const qb = queryBuilder ?? createMockQueryBuilder();
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-uuid-1',
    supabase: { from: qb.from } as unknown as TenantContext['supabase'],
  };
}

function createMockRequest(
  method: string,
  url: string,
  body?: unknown,
): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new Request(url, init));
}

const sampleBot = {
  id: 'bot-uuid-1',
  bot_username: '@test_bot',
  status: 'available',
  group_id: null,
  created_at: '2026-02-08T12:00:00Z',
  groups: null,
};

const sampleBotInUse = {
  id: 'bot-uuid-2',
  bot_username: '@used_bot',
  status: 'in_use',
  group_id: 'group-uuid-1',
  created_at: '2026-02-07T12:00:00Z',
  groups: { name: 'Grupo Teste' },
};

// ===========================
// GET /api/bots
// ===========================
describe('GET /api/bots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns list of bots with summary for super_admin', async () => {
    const bots = [sampleBot, sampleBotInUse];
    const qb = createMockQueryBuilder({ selectData: bots });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bots/route');
    const req = createMockRequest('GET', 'http://localhost/api/bots');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(bots);
    expect(body.summary).toEqual({ available: 1, in_use: 1, total: 2 });
    expect(qb.from).toHaveBeenCalledWith('bot_pool');
    expect(qb.select).toHaveBeenCalledWith(
      'id, bot_username, status, group_id, created_at, groups(name)',
    );
    expect(qb.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('does not include bot_token in response', async () => {
    const bots = [sampleBot];
    const qb = createMockQueryBuilder({ selectData: bots });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bots/route');
    const req = createMockRequest('GET', 'http://localhost/api/bots');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    // Verify select does NOT include bot_token
    expect(qb.select).toHaveBeenCalledWith(
      'id, bot_username, status, group_id, created_at, groups(name)',
    );
    // Verify response data has no bot_token
    for (const bot of body.data) {
      expect(bot).not.toHaveProperty('bot_token');
    }
  });

  it('returns correct summary counters', async () => {
    const bots = [
      { ...sampleBot, id: 'b1' },
      { ...sampleBot, id: 'b2' },
      { ...sampleBotInUse, id: 'b3' },
    ];
    const qb = createMockQueryBuilder({ selectData: bots });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bots/route');
    const req = createMockRequest('GET', 'http://localhost/api/bots');

    const response = await GET(req);
    const body = await response.json();

    expect(body.summary).toEqual({ available: 2, in_use: 1, total: 3 });
  });

  it('returns 401 when not authenticated', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { GET } = await import('@/app/api/bots/route');
    const req = createMockRequest('GET', 'http://localhost/api/bots');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 for group_admin', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bots/route');
    const req = createMockRequest('GET', 'http://localhost/api/bots');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 500 on database error', async () => {
    const qb = createMockQueryBuilder({ selectError: { message: 'DB connection failed' } });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bots/route');
    const req = createMockRequest('GET', 'http://localhost/api/bots');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });
});

// ===========================
// POST /api/bots
// ===========================
describe('POST /api/bots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('creates bot with status available', async () => {
    const newBot = {
      id: 'bot-uuid-new',
      bot_username: '@new_bot',
      status: 'available',
      group_id: null,
      created_at: '2026-02-08T14:00:00Z',
      groups: null,
    };
    const qb = createMockQueryBuilder({ insertData: newBot });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bots/route');
    const req = createMockRequest('POST', 'http://localhost/api/bots', {
      bot_token: '123456:ABC-DEF',
      bot_username: '@new_bot',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('available');
    expect(qb.from).toHaveBeenCalledWith('bot_pool');
    expect(qb.insert).toHaveBeenCalledWith({
      bot_token: '123456:ABC-DEF',
      bot_username: '@new_bot',
      status: 'available',
    });
  });

  it('rejects body without bot_token (validation error)', async () => {
    const qb = createMockQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bots/route');
    const req = createMockRequest('POST', 'http://localhost/api/bots', {
      bot_username: '@test',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects username shorter than 3 chars', async () => {
    const qb = createMockQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bots/route');
    const req = createMockRequest('POST', 'http://localhost/api/bots', {
      bot_token: '123456:ABC',
      bot_username: 'ab',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects empty body (validation error)', async () => {
    const qb = createMockQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bots/route');
    const req = createMockRequest('POST', 'http://localhost/api/bots', {});

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 on duplicate token/username (constraint error)', async () => {
    const qb = createMockQueryBuilder({
      insertError: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bots/route');
    const req = createMockRequest('POST', 'http://localhost/api/bots', {
      bot_token: 'existing-token',
      bot_username: '@existing_bot',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 on non-constraint DB error', async () => {
    const qb = createMockQueryBuilder({
      insertError: { message: 'connection timeout' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bots/route');
    const req = createMockRequest('POST', 'http://localhost/api/bots', {
      bot_token: '123:ABC',
      bot_username: '@new_bot',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('returns 403 for group_admin', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bots/route');
    const req = createMockRequest('POST', 'http://localhost/api/bots', {
      bot_token: '123:ABC',
      bot_username: '@test_bot',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 401 when not authenticated', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { POST } = await import('@/app/api/bots/route');
    const req = createMockRequest('POST', 'http://localhost/api/bots', {
      bot_token: '123:ABC',
      bot_username: '@test',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('rejects whitespace-only token after trim', async () => {
    const qb = createMockQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bots/route');
    const req = createMockRequest('POST', 'http://localhost/api/bots', {
      bot_token: '   ',
      bot_username: '@valid_bot',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('trims whitespace from token and username before insert', async () => {
    const newBot = {
      id: 'bot-uuid-trim',
      bot_username: '@padded_bot',
      status: 'available',
      group_id: null,
      created_at: '2026-02-08T14:00:00Z',
      groups: null,
    };
    const qb = createMockQueryBuilder({ insertData: newBot });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bots/route');
    const req = createMockRequest('POST', 'http://localhost/api/bots', {
      bot_token: '  123:ABC  ',
      bot_username: '  @padded_bot  ',
    });

    const response = await POST(req);

    expect(response.status).toBe(201);
    expect(qb.insert).toHaveBeenCalledWith({
      bot_token: '123:ABC',
      bot_username: '@padded_bot',
      status: 'available',
    });
  });

  it('returns 400 for non-JSON body', async () => {
    const qb = createMockQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bots/route');
    const req = new NextRequest(new Request('http://localhost/api/bots', {
      method: 'POST',
      body: 'not-json-content',
      headers: { 'Content-Type': 'application/json' },
    }));

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid JSON body');
  });
});
