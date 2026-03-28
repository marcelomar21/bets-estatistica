import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Mock distribute-utils
const mockPick = vi.fn<() => string | null>().mockReturnValue(null);
vi.mock('@/lib/distribute-utils', () => ({
  buildPostTimePicker: vi.fn().mockResolvedValue({ pick: () => mockPick() }),
}));

function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function createMockRequest(url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method: 'POST' };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new Request(url, init));
}

const OWN_GROUP = '550e8400-e29b-41d4-a716-446655440099';

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : OWN_GROUP,
    supabase: (supabaseMock ?? { from: vi.fn() }) as unknown as TenantContext['supabase'],
  };
}

const GROUP_A = '550e8400-e29b-41d4-a716-446655440001';
const GROUP_B = '550e8400-e29b-41d4-a716-446655440002';

/**
 * Creates a mock supabase query builder that handles the distribute route's
 * sequential DB calls:
 *  1. suggested_bets.select (bet lookup)
 *  2. groups.select.in (bulk group fetch)
 *  3. bet_group_assignments.select (existing assignments)
 *  4+ bet_group_assignments.upsert (inserts, per group)
 *  last: audit_log.insert
 */
function createDistributeQueryBuilder(options: {
  currentBet?: unknown;
  betError?: { message: string } | null;
  groups?: unknown[];
  groupsError?: { message: string } | null;
  existingAssignments?: Array<{ group_id: string }>;
  upsertError?: { message: string } | null;
} = {}) {
  let fromCallIndex = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFrom = vi.fn((_table: string) => {
    fromCallIndex++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.neq = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.insert = vi.fn(() => ({ data: null, error: null }));
    chain.upsert = vi.fn(() => ({ data: null, error: options.upsertError ?? null }));

    chain.single = vi.fn(() => {
      if (fromCallIndex === 1) {
        // Bet lookup
        return { data: options.currentBet ?? null, error: options.betError ?? null };
      }
      return { data: null, error: null };
    });

    // For non-single queries that return arrays (groups, existing assignments)
    if (fromCallIndex === 2) {
      // Groups bulk fetch — .in() returns data directly
      chain.in = vi.fn(() => ({
        data: options.groups ?? [],
        error: options.groupsError ?? null,
      }));
    }
    if (fromCallIndex === 3) {
      // Existing assignments lookup
      chain.eq = vi.fn(() => ({
        data: options.existingAssignments ?? [],
        error: null,
      }));
    }

    return chain;
  });

  return { from: mockFrom };
}

describe('POST /api/bets/[id]/distribute (GURU-42 multi-group)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPick.mockReturnValue(null);
  });

  it('distributes a bet to 2 groups successfully', async () => {
    const qb = createDistributeQueryBuilder({
      currentBet: { id: 1, bet_status: 'generated' },
      groups: [
        { id: GROUP_A, name: 'Guru da Bet', status: 'active', posting_schedule: null },
        { id: GROUP_B, name: 'Osmar Palpites', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(2);
    expect(body.data.alreadyExisted).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(0);
    expect(body.data.created[0].groupName).toBe('Guru da Bet');
    expect(body.data.created[1].groupName).toBe('Osmar Palpites');
  });

  it('backward compat: accepts { groupId } and wraps to array', async () => {
    const qb = createDistributeQueryBuilder({
      currentBet: { id: 1, bet_status: 'generated' },
      groups: [{ id: GROUP_A, name: 'Guru da Bet', status: 'active', posting_schedule: null }],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {
      groupId: GROUP_A,
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_A);
  });

  it('mixed result: 1 new + 1 already-existing', async () => {
    const qb = createDistributeQueryBuilder({
      currentBet: { id: 1, bet_status: 'ready' },
      groups: [
        { id: GROUP_A, name: 'Guru da Bet', status: 'active', posting_schedule: null },
        { id: GROUP_B, name: 'Osmar Palpites', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [{ group_id: GROUP_A }],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_B);
    expect(body.data.alreadyExisted).toHaveLength(1);
    expect(body.data.alreadyExisted[0].groupId).toBe(GROUP_A);
  });

  it('skips inactive groups', async () => {
    const qb = createDistributeQueryBuilder({
      currentBet: { id: 1, bet_status: 'generated' },
      groups: [
        { id: GROUP_A, name: 'Guru da Bet', status: 'inactive', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].reason).toContain('inativo');
  });

  it('returns 400 for invalid UUID format in groupIds', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {
      groupIds: ['not-a-uuid'],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid bet ID', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/abc/distribute', {
      groupIds: [GROUP_A],
    });

    const response = await POST(req, createRouteContext({ id: 'abc' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when neither groupIds nor groupId provided', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {});

    const response = await POST(req, createRouteContext({ id: '1' }));
    expect(response.status).toBe(400);
  });

  it('returns 404 for non-existent bet', async () => {
    const qb = createDistributeQueryBuilder({
      currentBet: null,
      betError: { message: 'Not found' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/999/distribute', {
      groupIds: [GROUP_A],
    });

    const response = await POST(req, createRouteContext({ id: '999' }));
    expect(response.status).toBe(404);
  });

  it('skips groups not found in DB', async () => {
    const UNKNOWN = '550e8400-e29b-41d4-a716-446655440099';
    const qb = createDistributeQueryBuilder({
      currentBet: { id: 1, bet_status: 'generated' },
      groups: [], // no groups found
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {
      groupIds: [UNKNOWN],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].reason).toContain('nao encontrado');
  });

  it('returns 403 for group_admin distributing to another group', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A], // GROUP_A != group-uuid-1 (group_admin's group)
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    expect(response.status).toBe(403);
  });

  it('allows group_admin to distribute to their own group', async () => {
    const qb = createDistributeQueryBuilder({
      currentBet: { id: 1, bet_status: 'generated' },
      groups: [{ id: OWN_GROUP, name: 'My Group', status: 'active', posting_schedule: null }],
      existingAssignments: [],
    });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {
      groupIds: [OWN_GROUP],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
  });

  it('returns 500 on DB error fetching groups', async () => {
    const qb = createDistributeQueryBuilder({
      currentBet: { id: 1, bet_status: 'generated' },
      groupsError: { message: 'Connection failed' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });

    const response = await POST(req, createRouteContext({ id: '1' }));
    expect(response.status).toBe(500);
  });

  it('writes audit_log entries for created assignments', async () => {
    const qb = createDistributeQueryBuilder({
      currentBet: { id: 1, bet_status: 'generated' },
      groups: [
        { id: GROUP_A, name: 'Guru da Bet', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });

    await POST(req, createRouteContext({ id: '1' }));

    // Verify audit_log was called
    expect(qb.from).toHaveBeenCalledWith('audit_log');
  });
});
