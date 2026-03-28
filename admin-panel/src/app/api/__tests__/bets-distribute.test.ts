import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Mock distribute-utils
const mockBuildPostTimeContext = vi.fn();
const mockPickPostTime = vi.fn();
vi.mock('@/lib/distribute-utils', () => ({
  buildPostTimeContext: (...args: unknown[]) => mockBuildPostTimeContext(...args),
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

const GROUP_ADMIN_OWN = '550e8400-e29b-41d4-a716-446655440099';

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : GROUP_ADMIN_OWN,
    supabase: (supabaseMock ?? { from: vi.fn() }) as unknown as TenantContext['supabase'],
  };
}

const GROUP_A = '550e8400-e29b-41d4-a716-446655440001';
const GROUP_B = '550e8400-e29b-41d4-a716-446655440002';

/**
 * Creates a mock supabase query builder for the multi-group distribute route.
 *
 * Call order in route:
 * 1. from('suggested_bets').select().eq().single() — bet lookup
 * 2. from('groups').select().in() — bulk group validation
 * 3. from('bet_group_assignments').select().eq() — existing assignments
 * 4. from('bet_group_assignments').insert() — create new assignments
 * 5. from('audit_log').insert() — audit log
 */
function createDistributeQueryBuilder(options: {
  betData?: unknown;
  betError?: { message: string } | null;
  groupsData?: unknown[];
  groupsError?: { message: string; code?: string } | null;
  existingAssignments?: Array<{ group_id: string }>;
  insertError?: { message: string; code?: string } | null;
} = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFrom = vi.fn((table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.neq = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.insert = vi.fn(() => ({
      data: null,
      error: options.insertError ?? null,
    }));
    chain.single = vi.fn(() => {
      if (table === 'suggested_bets') {
        return { data: options.betData ?? null, error: options.betError ?? null };
      }
      return { data: null, error: null };
    });

    // For non-single queries (groups bulk, existing assignments)
    if (table === 'groups') {
      chain.in = vi.fn(() => ({
        data: options.groupsData ?? [],
        error: options.groupsError ?? null,
      }));
    }

    if (table === 'bet_group_assignments') {
      // For select().eq() — existing assignments query
      chain.eq = vi.fn(() => ({
        data: options.existingAssignments ?? [],
        error: null,
      }));
      // For insert — create new assignments
      chain.insert = vi.fn(() => ({
        data: null,
        error: options.insertError ?? null,
      }));
    }

    return chain;
  });

  return { from: mockFrom };
}

describe('POST /api/bets/[id]/distribute (multi-group)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockBuildPostTimeContext.mockResolvedValue({ availableTimes: [], timeCounts: {} });
    mockPickPostTime.mockReturnValue(null);
  });

  it('distributes to 2 groups — both created', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1 },
      groupsData: [
        { id: GROUP_A, name: 'Guru', status: 'active', posting_schedule: null },
        { id: GROUP_B, name: 'Osmar', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(2);
    expect(body.data.alreadyExisted).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(0);
    expect(body.data.created[0].groupName).toBe('Guru');
    expect(body.data.created[1].groupName).toBe('Osmar');
  });

  it('backward compat: { groupId } wrapped to array', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1 },
      groupsData: [
        { id: GROUP_A, name: 'Guru', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: GROUP_A,
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_A);
  });

  it('mixed result: 1 new, 1 already-existing', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1 },
      groupsData: [
        { id: GROUP_A, name: 'Guru', status: 'active', posting_schedule: null },
        { id: GROUP_B, name: 'Osmar', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [{ group_id: GROUP_A }],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_B);
    expect(body.data.alreadyExisted).toHaveLength(1);
    expect(body.data.alreadyExisted[0].groupId).toBe(GROUP_A);
  });

  it('skips inactive group', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1 },
      groupsData: [
        { id: GROUP_A, name: 'Guru', status: 'inactive', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].reason).toContain('inactive');
  });

  it('returns 400 for invalid UUID format', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: 'not-a-uuid',
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid bet ID', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/abc/distribute', {
      groupId: GROUP_A,
    });
    const routeCtx = createRouteContext({ id: 'abc' });

    const response = await POST(req, routeCtx);
    expect(response.status).toBe(400);
  });

  it('returns 404 for non-existent bet', async () => {
    const qb = createDistributeQueryBuilder({
      betData: null,
      betError: { message: 'Not found' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/999/distribute', {
      groupId: GROUP_A,
    });
    const routeCtx = createRouteContext({ id: '999' });

    const response = await POST(req, routeCtx);
    expect(response.status).toBe(404);
  });

  it('skips group not found in DB', async () => {
    const UNKNOWN = '550e8400-e29b-41d4-a716-446655440099';
    const qb = createDistributeQueryBuilder({
      betData: { id: 1 },
      groupsData: [], // group not in DB
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [UNKNOWN],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].reason).toContain('nao encontrado');
  });

  it('returns 403 for group_admin distributing to another group', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A], // different from groupFilter='group-uuid-1'
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    expect(response.status).toBe(403);
  });

  it('group_admin can distribute to own group', async () => {
    const ownGroup = GROUP_ADMIN_OWN; // matches groupFilter
    const qb = createDistributeQueryBuilder({
      betData: { id: 1 },
      groupsData: [
        { id: ownGroup, name: 'My Group', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: ownGroup,
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 500 on DB insert error', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1 },
      groupsData: [
        { id: GROUP_A, name: 'Guru', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
      insertError: { message: 'DB connection failed', code: '08006' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    expect(response.status).toBe(500);
  });

  it('handles unique constraint race condition gracefully', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1 },
      groupsData: [
        { id: GROUP_A, name: 'Guru', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
      insertError: { message: 'duplicate key', code: '23505' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Race condition: items moved from created to alreadyExisted
    expect(body.data.alreadyExisted).toHaveLength(1);
    expect(body.data.created).toHaveLength(0);
  });

  it('assigns post_at via pickPostTime', async () => {
    mockPickPostTime.mockReturnValue('14:00');

    const qb = createDistributeQueryBuilder({
      betData: { id: 1 },
      groupsData: [
        { id: GROUP_A, name: 'Guru', status: 'active', posting_schedule: { times: ['14:00', '16:00'] } },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created[0].postAt).toBe('14:00');
    expect(mockBuildPostTimeContext).toHaveBeenCalled();
    expect(mockPickPostTime).toHaveBeenCalled();
  });
});
