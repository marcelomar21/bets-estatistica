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

// Enhanced mock for PUT with audit log support — routes from() by table name
function createMockPutQueryBuilder(overrides: {
  currentGroupData?: unknown;
  updatedGroupData?: unknown;
  updateError?: { message: string; code?: string } | null;
  auditInsertError?: { message: string; code?: string } | null;
} = {}) {
  const mockAuditInsert = vi.fn((_payload: unknown) => ({
    data: null,
    error: overrides.auditInsertError ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createChainBuilder(table: string): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.insert = vi.fn((payload: unknown) => {
      if (table === 'audit_log') {
        return mockAuditInsert(payload);
      }
      return chain;
    });
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);

    chain.single = vi.fn(() => {
      if (table === 'groups') {
        // Determine if this is a select (pre-fetch) or update call
        if (chain.update.mock.calls.length > 0) {
          return {
            data: overrides.updatedGroupData ?? null,
            error: overrides.updateError ?? null,
          };
        }
        return {
          data: overrides.currentGroupData ?? null,
          error: null,
        };
      }
      return { data: null, error: null };
    });

    return chain;
  }

  const mockFrom = vi.fn((table: string) => createChainBuilder(table));

  return { from: mockFrom, auditInsert: mockAuditInsert };
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

function createMockContextWithSupabase(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  supabaseMock: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-uuid-1',
    supabase: supabaseMock as unknown as TenantContext['supabase'],
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

  // Story 5.5: group_admin can now GET their own group
  it('allows group_admin to GET their own group', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'GET',
      'http://localhost/api/groups/group-uuid-1',
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await GET(req, routeCtx);

    // group_admin accessing their own group (groupFilter matches groupId)
    // Result depends on DB mock, but should not be 403
    expect(response.status).not.toBe(403);
  });

  it('returns 403 for group_admin accessing another group', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'GET',
      'http://localhost/api/groups/other-group-uuid',
    );
    const routeCtx = createRouteContext({ groupId: 'other-group-uuid' });

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
    const mock = createMockPutQueryBuilder({
      currentGroupData: sampleGroup,
      updatedGroupData: updatedGroup,
    });
    const context = createMockContextWithSupabase('super_admin', mock);
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
    const mock = createMockPutQueryBuilder({
      currentGroupData: null,
      updatedGroupData: null,
    });
    const context = createMockContextWithSupabase('super_admin', mock);
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
    const mock = createMockPutQueryBuilder({
      currentGroupData: sampleGroup,
      updatedGroupData: null,
      updateError: { message: 'connection refused' },
    });
    const context = createMockContextWithSupabase('super_admin', mock);
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

  // Story 5.5: group_admin can now update their own group
  it('allows group_admin to update their own group', async () => {
    const qb = createMockPutQueryBuilder({
      currentGroupData: { id: 'group-uuid-1', name: 'Old Name', status: 'active', telegram_group_id: null, telegram_admin_group_id: null, posting_schedule: null },
      updatedGroupData: { id: 'group-uuid-1', name: 'New Name', status: 'active', telegram_group_id: null, telegram_admin_group_id: null, posting_schedule: null, checkout_url: null, created_at: '2026-01-01' },
    });
    const context = createMockContextWithSupabase('group_admin', { from: qb.from });
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

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('forbids group_admin from updating another group', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/other-group-uuid',
      { name: 'New Name' },
    );
    const routeCtx = createRouteContext({ groupId: 'other-group-uuid' });

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
    const mock = createMockPutQueryBuilder({
      currentGroupData: sampleGroup,
      updatedGroupData: updatedGroup,
    });
    const context = createMockContextWithSupabase('super_admin', mock);
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
  });

  // ===========================
  // Audit log tests (Story 2.1)
  // ===========================
  it('inserts audit_log with correct payload after successful update', async () => {
    const updatedGroup = { ...sampleGroup, name: 'Updated Name' };
    const mock = createMockPutQueryBuilder({
      currentGroupData: sampleGroup,
      updatedGroupData: updatedGroup,
    });
    const context = createMockContextWithSupabase('super_admin', mock);
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
    expect(body.success).toBe(true);

    // Verify audit_log insert was called with correct payload
    expect(mock.auditInsert).toHaveBeenCalledWith({
      table_name: 'groups',
      record_id: 'group-uuid-1',
      action: 'update',
      changed_by: 'user-1',
      changes: {
        old: { name: 'Grupo Teste' },
        new: { name: 'Updated Name' },
      },
    });
  });

  it('audit_log contains old and new values for multiple changed fields', async () => {
    const updatedGroup = { ...sampleGroup, name: 'New Name', status: 'paused' };
    const mock = createMockPutQueryBuilder({
      currentGroupData: sampleGroup,
      updatedGroupData: updatedGroup,
    });
    const context = createMockContextWithSupabase('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/group-uuid-1',
      { name: 'New Name', status: 'paused' },
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await PUT(req, routeCtx);
    expect(response.status).toBe(200);

    // Verify audit_log payload includes both changed fields with old/new values
    expect(mock.auditInsert).toHaveBeenCalledWith({
      table_name: 'groups',
      record_id: 'group-uuid-1',
      action: 'update',
      changed_by: 'user-1',
      changes: {
        old: { name: 'Grupo Teste', status: 'active' },
        new: { name: 'New Name', status: 'paused' },
      },
    });
  });

  it('does not insert audit_log when no fields actually changed', async () => {
    const mock = createMockPutQueryBuilder({
      currentGroupData: sampleGroup,
      updatedGroupData: sampleGroup,
    });
    const context = createMockContextWithSupabase('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/group-uuid-1',
      { name: 'Grupo Teste' },
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await PUT(req, routeCtx);
    expect(response.status).toBe(200);

    // Audit log should NOT be called when values are the same
    expect(mock.auditInsert).not.toHaveBeenCalled();
  });

  it('audit_log failure does not block the update response', async () => {
    const updatedGroup = { ...sampleGroup, name: 'Updated Name' };
    const mock = createMockPutQueryBuilder({
      currentGroupData: sampleGroup,
      updatedGroupData: updatedGroup,
      auditInsertError: { message: 'audit_log table not found' },
    });
    const context = createMockContextWithSupabase('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/group-uuid-1',
      { name: 'Updated Name' },
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await PUT(req, routeCtx);
    const body = await response.json();

    // Update should still succeed even though audit log failed
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Name');

    // Verify warning was logged
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[audit_log] Failed to insert audit log for group update',
      'group-uuid-1',
      'audit_log table not found',
    );

    consoleWarnSpy.mockRestore();
  });

  // Story 5.5: group_admin can now update their OWN group (posting_schedule, etc.)
  it('allows group_admin to update their own group', async () => {
    const qb = createMockPutQueryBuilder({
      currentGroupData: { id: 'group-uuid-1', name: 'Old Name', status: 'active', telegram_group_id: null, telegram_admin_group_id: null, posting_schedule: null },
      updatedGroupData: { id: 'group-uuid-1', name: 'Try Update', status: 'active', telegram_group_id: null, telegram_admin_group_id: null, posting_schedule: null, checkout_url: null, created_at: '2026-01-01' },
    });
    const context = createMockContextWithSupabase('group_admin', { from: qb.from });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/group-uuid-1',
      { name: 'Try Update' },
    );
    const routeCtx = createRouteContext({ groupId: 'group-uuid-1' });

    const response = await PUT(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('forbids group_admin from updating another group', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('@/app/api/groups/[groupId]/route');
    const req = createMockRequest(
      'PUT',
      'http://localhost/api/groups/other-group-uuid',
      { name: 'Try Update' },
    );
    const routeCtx = createRouteContext({ groupId: 'other-group-uuid' });

    const response = await PUT(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
