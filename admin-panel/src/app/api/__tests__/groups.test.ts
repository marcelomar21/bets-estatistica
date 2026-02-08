import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Helper to create route context with params (Next.js 16 Promise-based params)
function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

// Supabase query builder mock
function createMockQueryBuilder(overrides: {
  selectData?: unknown;
  selectError?: { message: string; code?: string } | null;
  insertData?: unknown;
  insertError?: { message: string; code?: string } | null;
} = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};

  // All chaining methods return the builder itself
  builder.select = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.from = vi.fn(() => builder);

  // Terminal methods return data
  builder.order = vi.fn(() => ({
    data: overrides.selectData ?? [],
    error: overrides.selectError ?? null,
  }));

  builder.single = vi.fn(() => ({
    data: overrides.insertData ?? overrides.selectData ?? null,
    error: overrides.insertError ?? overrides.selectError ?? null,
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

const sampleGroup = {
  id: 'group-uuid-1',
  name: 'Grupo Teste',
  status: 'active',
  telegram_group_id: null,
  telegram_admin_group_id: null,
  checkout_url: null,
  created_at: '2026-02-06T12:00:00Z',
};

// ===========================
// GET /api/groups
// ===========================
describe('GET /api/groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns list of groups for super_admin', async () => {
    const groups = [sampleGroup];
    const qb = createMockQueryBuilder({ selectData: groups });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/groups/route');
    const req = createMockRequest('GET', 'http://localhost/api/groups');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: groups });
    expect(qb.from).toHaveBeenCalledWith('groups');
    expect(qb.select).toHaveBeenCalledWith(
      'id, name, status, telegram_group_id, telegram_admin_group_id, checkout_url, created_at',
    );
    expect(qb.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns 401 when not authenticated', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { GET } = await import('@/app/api/groups/route');
    const req = createMockRequest('GET', 'http://localhost/api/groups');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 for group_admin', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/groups/route');
    const req = createMockRequest('GET', 'http://localhost/api/groups');

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

    const { GET } = await import('@/app/api/groups/route');
    const req = createMockRequest('GET', 'http://localhost/api/groups');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });
});

// ===========================
// POST /api/groups
// ===========================
describe('POST /api/groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('creates a group with valid data', async () => {
    const newGroup = { ...sampleGroup, name: 'Novo Grupo' };
    const qb = createMockQueryBuilder({ insertData: newGroup });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/groups/route');
    const req = createMockRequest('POST', 'http://localhost/api/groups', {
      name: 'Novo Grupo',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ success: true, data: newGroup });
    expect(qb.from).toHaveBeenCalledWith('groups');
    expect(qb.insert).toHaveBeenCalledWith({ name: 'Novo Grupo' });
  });

  it('rejects body without name (validation error)', async () => {
    const qb = createMockQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/groups/route');
    const req = createMockRequest('POST', 'http://localhost/api/groups', {});

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects name shorter than 2 chars', async () => {
    const qb = createMockQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/groups/route');
    const req = createMockRequest('POST', 'http://localhost/api/groups', {
      name: 'A',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for group_admin', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/groups/route');
    const req = createMockRequest('POST', 'http://localhost/api/groups', {
      name: 'Test Group',
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

    const { POST } = await import('@/app/api/groups/route');
    const req = createMockRequest('POST', 'http://localhost/api/groups', {
      name: 'Test',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('returns 400 on DB insert error (e.g., duplicate name)', async () => {
    const qb = createMockQueryBuilder({
      insertError: { message: 'duplicate key value violates unique constraint' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/groups/route');
    const req = createMockRequest('POST', 'http://localhost/api/groups', {
      name: 'Existing Group',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 on non-constraint DB insert error', async () => {
    const qb = createMockQueryBuilder({
      insertError: { message: 'connection timeout' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/groups/route');
    const req = createMockRequest('POST', 'http://localhost/api/groups', {
      name: 'New Group',
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('returns 400 for non-JSON body', async () => {
    const qb = createMockQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/groups/route');
    const req = new NextRequest(new Request('http://localhost/api/groups', {
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

  it('creates group with optional telegram IDs', async () => {
    const newGroup = {
      ...sampleGroup,
      name: 'Grupo Telegram',
      telegram_group_id: -1001234567890,
      telegram_admin_group_id: -1009876543210,
    };
    const qb = createMockQueryBuilder({ insertData: newGroup });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/groups/route');
    const req = createMockRequest('POST', 'http://localhost/api/groups', {
      name: 'Grupo Telegram',
      telegram_group_id: -1001234567890,
      telegram_admin_group_id: -1009876543210,
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(qb.insert).toHaveBeenCalledWith({
      name: 'Grupo Telegram',
      telegram_group_id: -1001234567890,
      telegram_admin_group_id: -1009876543210,
    });
  });
});

// ===========================
// GET /api/groups/[groupId]
// ===========================
describe('GET /api/groups/[groupId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns group details for existing group', async () => {
    const qb = createMockQueryBuilder({ selectData: sampleGroup });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'GET',
      'http://localhost/api/groups/group-uuid-1',
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await GET(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: sampleGroup });
    expect(qb.eq).toHaveBeenCalledWith('id', 'group-uuid-1');
  });

  it('returns 404 for non-existent group', async () => {
    const qb = createMockQueryBuilder({ selectData: null });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'GET',
      'http://localhost/api/groups/non-existent-id',
    );
    const routeCtx = createRouteContext({ groupId: 'non-existent-id' });

    const response = await GET(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 500 on database error', async () => {
    const qb = createMockQueryBuilder({
      selectData: null,
      selectError: { message: 'connection refused' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'GET',
      'http://localhost/api/groups/group-uuid-1',
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await GET(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('returns 403 for group_admin', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'GET',
      'http://localhost/api/groups/group-uuid-1',
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await GET(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

// ===========================
// PUT /api/groups/[groupId]
// ===========================
describe('PUT /api/groups/[groupId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('updates group with valid data', async () => {
    const updatedGroup = { ...sampleGroup, name: 'Updated Name' };
    const qb = createMockQueryBuilder({ insertData: updatedGroup });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/group-uuid-1',
      { name: 'Updated Name' },
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await PUT(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: updatedGroup });
    expect(qb.update).toHaveBeenCalledWith({ name: 'Updated Name' });
    expect(qb.eq).toHaveBeenCalledWith('id', 'group-uuid-1');
  });

  it('rejects invalid status value', async () => {
    const qb = createMockQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/group-uuid-1',
      { status: 'invalid_status' },
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await PUT(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when group not found on update', async () => {
    const qb = createMockQueryBuilder({ insertData: null });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/non-existent',
      { name: 'New Name' },
    );
    const routeCtx = createRouteContext({ groupId: 'non-existent' });

    const response = await PUT(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 500 on database error during update', async () => {
    const qb = createMockQueryBuilder({
      insertData: null,
      insertError: { message: 'connection refused' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/group-uuid-1',
      { name: 'New Name' },
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await PUT(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('returns 403 for group_admin', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/group-uuid-1',
      { name: 'New Name' },
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await PUT(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 for non-JSON body', async () => {
    const qb = createMockQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = new NextRequest(new Request('http://localhost/api/groups/group-uuid-1', {
      method: 'PUT',
      body: 'not-json-content',
      headers: { 'Content-Type': 'application/json' },
    }));

    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });
    const response = await PUT(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid JSON body');
  });

  it('allows updating status to valid values', async () => {
    const updatedGroup = { ...sampleGroup, status: 'paused' };
    const qb = createMockQueryBuilder({ insertData: updatedGroup });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/group-uuid-1',
      { status: 'paused' },
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await PUT(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(qb.update).toHaveBeenCalledWith({ status: 'paused' });
  });
});
