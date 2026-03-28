import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Mock distribute-utils
const mockGetScheduledCountsPerTime = vi.fn<() => Promise<Record<string, number>>>();
vi.mock('@/lib/distribute-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/distribute-utils')>();
  return {
    ...actual,
    getScheduledCountsPerTime: (...args: unknown[]) => mockGetScheduledCountsPerTime(),
  };
});

function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function createMockRequest(body: unknown): NextRequest {
  return new NextRequest(
    new Request('http://localhost/api/bets/1/distribute', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const GROUP_A = '11111111-1111-1111-1111-111111111111';
const GROUP_B = '22222222-2222-2222-2222-222222222222';
const GROUP_C = '33333333-3333-3333-3333-333333333333';

interface MockSupabaseOptions {
  bet?: unknown;
  betError?: { message: string; code?: string } | null;
  groups?: unknown[];
  groupsError?: { message: string } | null;
  existingAssignments?: { group_id: string }[];
  insertError?: { message: string; code?: string } | null;
  updateError?: { message: string } | null;
}

function createMockSupabase(options: MockSupabaseOptions = {}) {
  let fromCallIndex = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFrom = vi.fn((_table: string) => {
    fromCallIndex++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.neq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.insert = vi.fn(() => ({ error: options.insertError ?? null }));
    chain.update = vi.fn(() => ({
      eq: vi.fn(() => ({ error: options.updateError ?? null })),
    }));
    chain.single = vi.fn(() => {
      // First .single() call → suggested_bets (fetch bet)
      if (fromCallIndex === 1) {
        return { data: options.bet ?? null, error: options.betError ?? null };
      }
      return { data: null, error: null };
    });

    // For groups query: return via chain directly (no .single())
    if (fromCallIndex === 2) {
      // groups fetch — .in() resolves the chain
      chain.in = vi.fn(() => ({
        data: options.groups ?? [],
        error: options.groupsError ?? null,
      }));
    }

    // For existing assignments query
    if (fromCallIndex === 3) {
      chain.eq = vi.fn(() => ({
        data: options.existingAssignments ?? [],
        error: null,
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            data: options.existingAssignments ?? [],
            error: null,
          }),
        }),
      }));
    }

    return chain;
  });

  return { from: mockFrom };
}

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
  groupFilter?: string | null,
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: groupFilter !== undefined ? groupFilter : (role === 'super_admin' ? null : GROUP_A),
    supabase: (supabaseMock ?? { from: vi.fn() }) as unknown as TenantContext['supabase'],
  };
}

// ============================================================
// POST /api/bets/[id]/distribute
// ============================================================
describe('POST /api/bets/[id]/distribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetScheduledCountsPerTime.mockResolvedValue({ '10:00': 0, '14:00': 1 });
  });

  it('distributes to 2 groups successfully (groupIds array)', async () => {
    const supabaseMock = createDistributeSupabase({
      bet: { id: 1, group_id: null, bet_status: 'generated' },
      groups: [
        { id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: { times: ['10:00', '14:00'] } },
        { id: GROUP_B, name: 'Group B', status: 'active', posting_schedule: { times: ['11:00'] } },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupIds: [GROUP_A, GROUP_B] });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(2);
    expect(body.data.alreadyExisted).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(0);
  });

  it('accepts backward-compatible groupId (single string)', async () => {
    const supabaseMock = createDistributeSupabase({
      bet: { id: 1, group_id: null, bet_status: 'generated' },
      groups: [
        { id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupId: GROUP_A });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_A);
  });

  it('returns mixed result: 1 created, 1 alreadyExisted', async () => {
    const supabaseMock = createDistributeSupabase({
      bet: { id: 1, group_id: GROUP_A, bet_status: 'ready' },
      groups: [
        { id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null },
        { id: GROUP_B, name: 'Group B', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [{ group_id: GROUP_A }],
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupIds: [GROUP_A, GROUP_B] });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_B);
    expect(body.data.alreadyExisted).toHaveLength(1);
    expect(body.data.alreadyExisted[0].groupId).toBe(GROUP_A);
  });

  it('skips inactive group', async () => {
    const supabaseMock = createDistributeSupabase({
      bet: { id: 1, group_id: null, bet_status: 'generated' },
      groups: [
        { id: GROUP_A, name: 'Group A', status: 'inactive', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupIds: [GROUP_A] });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].groupId).toBe(GROUP_A);
    expect(body.data.skipped[0].reason).toContain('inativo');
  });

  it('skips group not found', async () => {
    const supabaseMock = createDistributeSupabase({
      bet: { id: 1, group_id: null, bet_status: 'generated' },
      groups: [], // GROUP_C not in DB
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupIds: [GROUP_C] });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].reason).toContain('nao encontrado');
  });

  it('returns 400 for invalid UUID format', async () => {
    const supabaseMock = createDistributeSupabase({});
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupIds: ['not-a-uuid'] });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid bet ID', async () => {
    const supabaseMock = createDistributeSupabase({});
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupId: GROUP_A });
    const routeContext = createRouteContext({ id: 'abc' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('invalido');
  });

  it('returns 404 when bet not found', async () => {
    const supabaseMock = createDistributeSupabase({ bet: null });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupId: GROUP_A });
    const routeContext = createRouteContext({ id: '999' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 when group_admin distributes to another group', async () => {
    const supabaseMock = createDistributeSupabase({});
    const context = createMockContext('group_admin', supabaseMock, GROUP_A);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupIds: [GROUP_B] });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('allows group_admin to distribute to their own group', async () => {
    const supabaseMock = createDistributeSupabase({
      bet: { id: 1, group_id: null, bet_status: 'generated' },
      groups: [
        { id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('group_admin', supabaseMock, GROUP_A);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupId: GROUP_A });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
  });

  it('returns 500 on DB insert error', async () => {
    const supabaseMock = createDistributeSupabase({
      bet: { id: 1, group_id: null, bet_status: 'generated' },
      groups: [
        { id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
      insertError: { message: 'connection lost', code: '08006' },
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupIds: [GROUP_A] });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('returns 400 for empty groupIds array', async () => {
    const supabaseMock = createDistributeSupabase({});
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupIds: [] });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('deduplicates groupIds in the request', async () => {
    const supabaseMock = createDistributeSupabase({
      bet: { id: 1, group_id: null, bet_status: 'generated' },
      groups: [
        { id: GROUP_A, name: 'Group A', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest({ groupIds: [GROUP_A, GROUP_A] });
    const routeContext = createRouteContext({ id: '1' });

    const response = await POST(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(1);
  });
});

// ============================================================
// Unit tests for distribute-utils
// ============================================================
describe('distribute-utils', () => {
  describe('pickPostTime', () => {
    it('picks the time with fewest bets', async () => {
      const { pickPostTime } = await import('@/lib/distribute-utils');
      const counts = { '10:00': 3, '14:00': 1, '18:00': 2 };
      const result = pickPostTime(['10:00', '14:00', '18:00'], counts);
      expect(result).toBe('14:00');
      expect(counts['14:00']).toBe(2); // incremented
    });

    it('returns first time when all counts are equal', async () => {
      const { pickPostTime } = await import('@/lib/distribute-utils');
      const counts = { '10:00': 0, '14:00': 0 };
      const result = pickPostTime(['10:00', '14:00'], counts);
      expect(result).toBe('10:00');
    });

    it('returns null for empty times array', async () => {
      const { pickPostTime } = await import('@/lib/distribute-utils');
      const result = pickPostTime([], {});
      expect(result).toBeNull();
    });
  });

  describe('getFuturePostingTimes', () => {
    it('returns empty array for null schedule', async () => {
      const { getFuturePostingTimes } = await import('@/lib/distribute-utils');
      expect(getFuturePostingTimes(null)).toEqual([]);
    });

    it('returns empty array for schedule without times', async () => {
      const { getFuturePostingTimes } = await import('@/lib/distribute-utils');
      expect(getFuturePostingTimes({ times: [] })).toEqual([]);
    });
  });
});

// ============================================================
// Helpers
// ============================================================

/**
 * Creates a mock supabase that handles the specific call sequence
 * in the distribute route:
 *   1. from('suggested_bets').select(...).eq('id', betId).single()
 *   2. from('groups').select(...).in('id', groupIds)
 *   3. from('bet_group_assignments').select('group_id').eq('bet_id', betId)
 *   4. from('bet_group_assignments').insert(...)
 *   5. from('suggested_bets').update(...)
 *   6. from('audit_log').insert(...)
 */
function createDistributeSupabase(options: {
  bet?: unknown;
  betError?: { message: string } | null;
  groups?: unknown[];
  groupsError?: { message: string } | null;
  existingAssignments?: { group_id: string }[];
  insertError?: { message: string; code?: string } | null;
}) {
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
    chain.insert = vi.fn(() => ({ error: options.insertError ?? null }));
    chain.update = vi.fn(() => ({
      eq: vi.fn(() => ({ error: null })),
    }));
    chain.single = vi.fn(() => {
      // Call 1: fetch bet from suggested_bets
      if (fromCallIndex === 1) {
        if (!options.bet) {
          return { data: null, error: options.betError ?? { message: 'not found', code: 'PGRST116' } };
        }
        return { data: options.bet, error: null };
      }
      return { data: null, error: null };
    });

    // Call 2: fetch groups — resolves via .in()
    if (fromCallIndex === 2) {
      chain.in = vi.fn(() => ({
        data: options.groups ?? [],
        error: options.groupsError ?? null,
      }));
    }

    // Call 3: fetch existing assignments — resolves via .eq()
    if (fromCallIndex === 3) {
      const assignmentData = options.existingAssignments ?? [];
      chain.select = vi.fn(() => ({
        eq: vi.fn(() => ({
          data: assignmentData,
          error: null,
        })),
      }));
    }

    return chain;
  });

  return { from: mockFrom };
}
