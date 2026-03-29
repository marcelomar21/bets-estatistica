import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Mock distribute-utils
const mockPickPostTime = vi.fn<() => string | null>();
vi.mock('@/lib/distribute-utils', () => ({
  createPostTimePicker: vi.fn(() => Promise.resolve(mockPickPostTime)),
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

const GROUP_A = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Group A',
  status: 'active',
  posting_schedule: { enabled: true, times: ['10:00', '15:00'] },
};

const GROUP_B = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  name: 'Group B',
  status: 'active',
  posting_schedule: { enabled: true, times: ['12:00'] },
};

const GROUP_INACTIVE = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  name: 'Group Inactive',
  status: 'paused',
  posting_schedule: null,
};

const SAMPLE_BET = { id: 1, bet_status: 'generated' };

/**
 * Creates a Supabase mock that routes .from(table) calls to per-table handlers.
 */
function createDistributeQueryBuilder(options: {
  bet?: unknown;
  betError?: { message: string } | null;
  groups?: unknown[];
  groupsError?: { message: string } | null;
  existingAssignments?: Array<{ group_id: string }>;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
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
    chain.insert = vi.fn(() => ({ data: null, error: options.insertError ?? null }));
    chain.update = vi.fn(() => chain);

    if (table === 'suggested_bets') {
      chain.single = vi.fn(() => ({
        data: options.bet ?? null,
        error: options.betError ?? null,
      }));
      return chain;
    }

    if (table === 'groups') {
      // .in() returns array result (no .single())
      chain.in = vi.fn(() => ({
        data: options.groups ?? [],
        error: options.groupsError ?? null,
      }));
      return chain;
    }

    if (table === 'bet_group_assignments') {
      // For select (existing check), return assignments
      chain.eq = vi.fn(() => ({
        data: options.existingAssignments ?? [],
        error: null,
      }));
      // For insert, return insertError
      chain.insert = vi.fn(() => ({ data: null, error: options.insertError ?? null }));
      return chain;
    }

    if (table === 'audit_log') {
      chain.insert = vi.fn(() => ({ data: null, error: null }));
      return chain;
    }

    return chain;
  });

  return { from: mockFrom };
}

describe('POST /api/bets/[id]/distribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPickPostTime.mockReturnValue('15:00');
  });

  // ---- Happy path: distribute to 2 groups ----
  it('distributes to multiple groups successfully', async () => {
    const qb = createDistributeQueryBuilder({
      bet: SAMPLE_BET,
      groups: [GROUP_A, GROUP_B],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A.id, GROUP_B.id],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(2);
    expect(body.data.alreadyExisted).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(0);
    expect(body.data.created[0].groupName).toBe('Group A');
    expect(body.data.created[1].groupName).toBe('Group B');
  });

  // ---- Backward compat: groupId (string) ----
  it('accepts groupId (string) for backward compatibility', async () => {
    const qb = createDistributeQueryBuilder({
      bet: SAMPLE_BET,
      groups: [GROUP_A],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: GROUP_A.id,
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_A.id);
  });

  // ---- Mixed: 1 new, 1 already existing ----
  it('returns mixed result with created and alreadyExisted', async () => {
    const qb = createDistributeQueryBuilder({
      bet: SAMPLE_BET,
      groups: [GROUP_A, GROUP_B],
      existingAssignments: [{ group_id: GROUP_A.id }],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A.id, GROUP_B.id],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.alreadyExisted).toHaveLength(1);
    expect(body.data.alreadyExisted[0].groupId).toBe(GROUP_A.id);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_B.id);
  });

  // ---- Inactive group skipped ----
  it('skips inactive groups in response', async () => {
    const qb = createDistributeQueryBuilder({
      bet: SAMPLE_BET,
      groups: [GROUP_A, GROUP_INACTIVE],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A.id, GROUP_INACTIVE.id],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].groupId).toBe(GROUP_INACTIVE.id);
    expect(body.data.skipped[0].reason).toContain('inativo');
  });

  // ---- Group not found -> skipped ----
  it('skips groups not found in database', async () => {
    const unknownId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const qb = createDistributeQueryBuilder({
      bet: SAMPLE_BET,
      groups: [GROUP_A], // unknownId not returned
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A.id, unknownId],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].groupId).toBe(unknownId);
    expect(body.data.skipped[0].reason).toContain('nao encontrado');
  });

  // ---- Invalid UUID -> 400 ----
  it('returns 400 for invalid UUID format', async () => {
    const context = createMockContext('super_admin');
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

  // ---- Invalid bet ID -> 400 ----
  it('returns 400 for invalid bet ID', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/abc/distribute', {
      groupIds: [GROUP_A.id],
    });
    const routeContext = createRouteContext({ id: 'abc' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  // ---- Bet not found -> 404 ----
  it('returns 404 when bet is not found', async () => {
    const qb = createDistributeQueryBuilder({
      bet: null,
      betError: { message: 'not found' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/999/distribute', {
      groupIds: [GROUP_A.id],
    });
    const routeContext = createRouteContext({ id: '999' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // ---- group_admin cross-group -> 403 ----
  it('returns 403 when group_admin distributes to another group', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A.id], // GROUP_A.id !== groupFilter ('group-uuid-1')
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  // ---- DB error on insert -> 500 ----
  it('returns 500 on database insert error', async () => {
    const qb = createDistributeQueryBuilder({
      bet: SAMPLE_BET,
      groups: [GROUP_A],
      existingAssignments: [],
      insertError: { message: 'DB connection failed' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A.id],
    });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('DB_ERROR');
  });

  // ---- Empty body -> 400 ----
  it('returns 400 for empty body', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {});
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  // ---- group_admin can distribute to own group ----
  it('allows group_admin to distribute to their own group', async () => {
    const ownGroupId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const ownGroup = { ...GROUP_A, id: ownGroupId };
    const qb = createDistributeQueryBuilder({
      bet: SAMPLE_BET,
      groups: [ownGroup],
      existingAssignments: [],
    });
    // Create context with groupFilter matching the target group
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
