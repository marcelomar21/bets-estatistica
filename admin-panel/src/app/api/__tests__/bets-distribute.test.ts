import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Mock pickPostTime
const mockPickPostTime = vi.fn<() => Promise<string | null>>();
vi.mock('@/lib/distribute-utils', () => ({
  pickPostTime: (...args: unknown[]) => mockPickPostTime(...args),
}));

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

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
  groupFilter?: string | null,
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: groupFilter !== undefined ? groupFilter : (role === 'super_admin' ? null : 'group-uuid-1'),
    supabase: (supabaseMock ?? { from: vi.fn() }) as unknown as TenantContext['supabase'],
  };
}

const GROUP_A = '550e8400-e29b-41d4-a716-446655440001';
const GROUP_B = '550e8400-e29b-41d4-a716-446655440002';
const OWN_GROUP = '550e8400-e29b-41d4-a716-446655440010';

type QueryCall = {
  table: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain: Record<string, any>;
};

/**
 * Creates a flexible mock supabase client that tracks calls by table name.
 * Configure per-table behavior via the `tables` option.
 */
function createMultiGroupQueryBuilder(options: {
  bet?: { data: unknown; error: unknown };
  groups?: { data: unknown[]; error: unknown };
  existingAssignments?: { data: unknown[]; error: unknown };
  insert?: { data: unknown; error: unknown };
  auditInsert?: { data: unknown; error: unknown };
}) {
  const calls: QueryCall[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFrom = vi.fn((table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.neq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);

    if (table === 'suggested_bets') {
      chain.single = vi.fn(() => options.bet ?? { data: null, error: null });
    } else if (table === 'groups') {
      // .in() is terminal for group fetch — override to resolve
      chain.in = vi.fn(() => options.groups ?? { data: [], error: null });
    } else if (table === 'bet_group_assignments') {
      // Could be a select (existing check) or insert
      chain.in = vi.fn(() => options.existingAssignments ?? { data: [], error: null });
      chain.insert = vi.fn(() => ({
        select: vi.fn(() => options.insert ?? { data: null, error: null }),
      }));
    } else if (table === 'audit_log') {
      chain.insert = vi.fn(() => options.auditInsert ?? { data: null, error: null });
    }

    calls.push({ table, chain });
    return chain;
  });

  return { from: mockFrom, calls };
}

describe('POST /api/bets/[id]/distribute (multi-group)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPickPostTime.mockResolvedValue('14:00');
  });

  // ============================================================
  // Happy paths
  // ============================================================

  it('distributes bet to 2 groups — both created', async () => {
    const qb = createMultiGroupQueryBuilder({
      bet: { data: { id: 1, bet_status: 'generated' }, error: null },
      groups: {
        data: [
          { id: GROUP_A, name: 'Grupo A', status: 'active', posting_schedule: null },
          { id: GROUP_B, name: 'Grupo B', status: 'active', posting_schedule: null },
        ],
        error: null,
      },
      existingAssignments: { data: [], error: null },
      insert: { data: null, error: null },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(2);
    expect(body.data.created[0].groupId).toBe(GROUP_A);
    expect(body.data.created[1].groupId).toBe(GROUP_B);
    expect(body.data.alreadyExisted).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(0);

    // Verify insert was called on bet_group_assignments
    const bgaCalls = qb.calls.filter(c => c.table === 'bet_group_assignments');
    expect(bgaCalls.length).toBeGreaterThanOrEqual(1);

    // Verify audit_log was written
    expect(qb.from).toHaveBeenCalledWith('audit_log');
  });

  it('backward compat: accepts { groupId } and wraps to array', async () => {
    const qb = createMultiGroupQueryBuilder({
      bet: { data: { id: 1, bet_status: 'generated' }, error: null },
      groups: {
        data: [{ id: GROUP_A, name: 'Grupo A', status: 'active', posting_schedule: null }],
        error: null,
      },
      existingAssignments: { data: [], error: null },
      insert: { data: null, error: null },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: GROUP_A,
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_A);
  });

  // ============================================================
  // Mixed results
  // ============================================================

  it('mixed result: 1 new, 1 already-existing', async () => {
    const qb = createMultiGroupQueryBuilder({
      bet: { data: { id: 1, bet_status: 'generated' }, error: null },
      groups: {
        data: [
          { id: GROUP_A, name: 'Grupo A', status: 'active', posting_schedule: null },
          { id: GROUP_B, name: 'Grupo B', status: 'active', posting_schedule: null },
        ],
        error: null,
      },
      existingAssignments: { data: [{ group_id: GROUP_A }], error: null },
      insert: { data: null, error: null },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.alreadyExisted).toHaveLength(1);
    expect(body.data.alreadyExisted[0].groupId).toBe(GROUP_A);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_B);
  });

  it('skips inactive group', async () => {
    const qb = createMultiGroupQueryBuilder({
      bet: { data: { id: 1, bet_status: 'generated' }, error: null },
      groups: {
        data: [
          { id: GROUP_A, name: 'Grupo A', status: 'active', posting_schedule: null },
          { id: GROUP_B, name: 'Grupo B', status: 'deleted', posting_schedule: null },
        ],
        error: null,
      },
      existingAssignments: { data: [], error: null },
      insert: { data: null, error: null },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].groupId).toBe(GROUP_B);
    expect(body.data.skipped[0].reason).toContain('inativo');
  });

  it('skips group not found in DB', async () => {
    const UNKNOWN = '550e8400-e29b-41d4-a716-446655440099';
    const qb = createMultiGroupQueryBuilder({
      bet: { data: { id: 1, bet_status: 'generated' }, error: null },
      groups: {
        data: [{ id: GROUP_A, name: 'Grupo A', status: 'active', posting_schedule: null }],
        error: null,
      },
      existingAssignments: { data: [], error: null },
      insert: { data: null, error: null },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, UNKNOWN],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].groupId).toBe(UNKNOWN);
    expect(body.data.skipped[0].reason).toContain('nao encontrado');
  });

  // ============================================================
  // Validation errors
  // ============================================================

  it('returns 400 for invalid UUID format', async () => {
    const qb = createMultiGroupQueryBuilder({});
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: 'not-a-uuid',
    });

    const response = await POST(req, createRouteContext({ id: '1' }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid bet ID', async () => {
    const qb = createMultiGroupQueryBuilder({});
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/abc/distribute', {
      groupId: GROUP_A,
    });

    const response = await POST(req, createRouteContext({ id: 'abc' }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty groupIds array', async () => {
    const qb = createMultiGroupQueryBuilder({});
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));

    expect(response.status).toBe(400);
  });

  // ============================================================
  // Not found
  // ============================================================

  it('returns 404 for non-existent bet', async () => {
    const qb = createMultiGroupQueryBuilder({
      bet: { data: null, error: { message: 'Not found' } },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/999/distribute', {
      groupId: GROUP_A,
    });

    const response = await POST(req, createRouteContext({ id: '999' }));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // ============================================================
  // Authorization: group_admin scope
  // ============================================================

  it('group_admin can distribute to own group', async () => {
    const qb = createMultiGroupQueryBuilder({
      bet: { data: { id: 1, bet_status: 'generated' }, error: null },
      groups: {
        data: [{ id: OWN_GROUP, name: 'My Group', status: 'active', posting_schedule: null }],
        error: null,
      },
      existingAssignments: { data: [], error: null },
      insert: { data: null, error: null },
    });
    const context = createMockContext('group_admin', qb, OWN_GROUP);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: OWN_GROUP,
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 403 for group_admin distributing to another group', async () => {
    const qb = createMultiGroupQueryBuilder({});
    const context = createMockContext('group_admin', qb, OWN_GROUP);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: GROUP_A,
    });

    const response = await POST(req, createRouteContext({ id: '1' }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 for group_admin with mixed own + other groups', async () => {
    const qb = createMultiGroupQueryBuilder({});
    const context = createMockContext('group_admin', qb, OWN_GROUP);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [OWN_GROUP, GROUP_B],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));

    expect(response.status).toBe(403);
  });

  // ============================================================
  // DB errors
  // ============================================================

  it('returns 500 on insert error', async () => {
    const qb = createMultiGroupQueryBuilder({
      bet: { data: { id: 1, bet_status: 'generated' }, error: null },
      groups: {
        data: [{ id: GROUP_A, name: 'Grupo A', status: 'active', posting_schedule: null }],
        error: null,
      },
      existingAssignments: { data: [], error: null },
      insert: { data: null, error: { message: 'constraint violation' } },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: GROUP_A,
    });

    const response = await POST(req, createRouteContext({ id: '1' }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('returns 500 on groups fetch error', async () => {
    const qb = createMultiGroupQueryBuilder({
      bet: { data: { id: 1, bet_status: 'generated' }, error: null },
      groups: { data: [], error: { message: 'db down' } },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: GROUP_A,
    });

    const response = await POST(req, createRouteContext({ id: '1' }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('DB_ERROR');
  });
});
