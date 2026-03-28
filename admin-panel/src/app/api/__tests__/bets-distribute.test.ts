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
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-uuid-1',
    supabase: (supabaseMock ?? { from: vi.fn() }) as unknown as TenantContext['supabase'],
  };
}

const GROUP_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const GROUP_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GROUP_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

type CallHandler = {
  table: string;
  action: 'select' | 'insert';
  data: unknown;
  error: { message: string } | null;
};

/**
 * Create a mock Supabase client that handles the multi-step flow:
 *   1. from('suggested_bets').select().eq().single() — fetch bet
 *   2. from('groups').select().in() — fetch groups
 *   3. from('bet_group_assignments').select().eq().in() — check existing
 *   4. from('bet_group_assignments').insert() — create new assignments
 *   5. from('audit_log').insert() — audit log
 */
function createDistributeQueryBuilder(options: {
  bet?: unknown;
  betError?: { message: string } | null;
  groups?: unknown[];
  groupsError?: { message: string } | null;
  existingAssignments?: unknown[];
  existingError?: { message: string } | null;
  insertError?: { message: string } | null;
} = {}) {
  let fromCallIndex = 0;

  const mockFrom = vi.fn((_table: string) => {
    fromCallIndex++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.neq = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.in = vi.fn(() => {
      if (fromCallIndex === 2) {
        // groups fetch
        return { data: options.groups ?? [], error: options.groupsError ?? null };
      }
      // existing assignments
      return { data: options.existingAssignments ?? [], error: options.existingError ?? null };
    });
    chain.single = vi.fn(() => {
      // bet fetch
      return { data: options.bet ?? null, error: options.betError ?? null };
    });
    chain.insert = vi.fn(() => {
      if (fromCallIndex === 5) {
        // audit_log — always succeed
        return { data: null, error: null };
      }
      // bet_group_assignments insert
      return { data: null, error: options.insertError ?? null };
    });
    return chain;
  });

  return { from: mockFrom };
}

// ============================================================
// POST /api/bets/[id]/distribute
// ============================================================
describe('POST /api/bets/[id]/distribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPickPostTime.mockResolvedValue('14:30');
  });

  it('distributes to 2 groups successfully', async () => {
    const qb = createDistributeQueryBuilder({
      bet: { id: 1, bet_status: 'ready' },
      groups: [
        { id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null },
        { id: GROUP_B, name: 'Group B', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(2);
    expect(body.data.alreadyExisted).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(0);
    expect(body.data.created[0].groupId).toBe(GROUP_A);
    expect(body.data.created[1].groupId).toBe(GROUP_B);
  });

  it('backward compat: accepts groupId string and wraps to array', async () => {
    const qb = createDistributeQueryBuilder({
      bet: { id: 1, bet_status: 'ready' },
      groups: [{ id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null }],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: GROUP_A,
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_A);
  });

  it('mixed result: 1 new, 1 already-existing', async () => {
    const qb = createDistributeQueryBuilder({
      bet: { id: 1, bet_status: 'ready' },
      groups: [
        { id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null },
        { id: GROUP_B, name: 'Group B', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [{ group_id: GROUP_B }],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_A);
    expect(body.data.alreadyExisted).toHaveLength(1);
    expect(body.data.alreadyExisted[0].groupId).toBe(GROUP_B);
  });

  it('skips inactive groups', async () => {
    const qb = createDistributeQueryBuilder({
      bet: { id: 1, bet_status: 'ready' },
      groups: [
        { id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null },
        { id: GROUP_B, name: 'Group B', status: 'inactive', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].groupId).toBe(GROUP_B);
    expect(body.data.skipped[0].reason).toContain('inativo');
  });

  it('returns 400 for invalid UUID', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: ['not-a-uuid'],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid bet ID', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/abc/distribute', {
      groupIds: [GROUP_A],
    });
    const routeContext = createRouteContext({ id: 'abc' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('invalido');
  });

  it('returns 404 when bet not found', async () => {
    const qb = createDistributeQueryBuilder({
      bet: null,
      betError: { message: 'not found' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/999/distribute', {
      groupIds: [GROUP_A],
    });
    const routeContext = createRouteContext({ id: '999' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('skips groups not found in DB', async () => {
    const qb = createDistributeQueryBuilder({
      bet: { id: 1, bet_status: 'ready' },
      groups: [{ id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null }],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_C],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].groupId).toBe(GROUP_C);
    expect(body.data.skipped[0].reason).toContain('nao encontrado');
  });

  it('returns 403 when group_admin distributes to another group', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 500 on insert DB error', async () => {
    const qb = createDistributeQueryBuilder({
      bet: { id: 1, bet_status: 'ready' },
      groups: [{ id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null }],
      existingAssignments: [],
      insertError: { message: 'connection lost' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('returns 400 when neither groupIds nor groupId provided', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {});
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('allows group_admin to distribute to their own group', async () => {
    const ownGroupId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const qb = createDistributeQueryBuilder({
      bet: { id: 1, bet_status: 'ready' },
      groups: [{ id: ownGroupId, name: 'My Group', status: 'active', posting_schedule: null }],
      existingAssignments: [],
    });
    const context: TenantContext = {
      user: { id: 'user-1', email: 'admin@test.com' },
      role: 'group_admin',
      groupFilter: ownGroupId,
      supabase: qb as unknown as TenantContext['supabase'],
    };
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: ownGroupId,
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
  });
});
