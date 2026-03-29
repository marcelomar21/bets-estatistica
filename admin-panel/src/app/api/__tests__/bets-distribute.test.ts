import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function createMockRequest(body?: unknown): NextRequest {
  const init: RequestInit = {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  };
  return new NextRequest(new Request('http://localhost/api/bets/1/distribute', init));
}

function createMockContext(overrides?: Partial<TenantContext>): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role: 'super_admin',
    groupFilter: null,
    supabase: {} as TenantContext['supabase'],
    ...overrides,
  };
}

const GROUP_A_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
const GROUP_B_ID = 'bbbbbbbb-1111-2222-3333-444444444444';
const GROUP_C_ID = 'cccccccc-1111-2222-3333-444444444444';

describe('POST /api/bets/[id]/distribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function callHandler(body: unknown, routeParams = { id: '1' }) {
    const { POST } = await import('../bets/[id]/distribute/route');
    const context = createMockContext();
    const mockSupabase = createDistributeQueryBuilder({});
    context.supabase = mockSupabase as unknown as TenantContext['supabase'];
    mockWithTenant.mockResolvedValue({ success: true, context });

    const req = createMockRequest(body);
    return POST(req, createRouteContext(routeParams));
  }

  // Helper: creates a mock supabase that tracks .from() calls and their results
  function createDistributeQueryBuilder(config: {
    bet?: { id: number; bet_status: string } | null;
    betError?: { message: string } | null;
    groups?: Array<{ id: string; name: string; status: string; posting_schedule: unknown }>;
    groupsError?: { message: string } | null;
    existingAssignments?: Array<{ group_id: string }>;
    scheduledAssignments?: Array<{ post_at: string }>;
    insertError?: { message: string } | null;
    insertedRows?: Array<{ group_id: string }>;
  }) {
    const {
      bet = { id: 1, bet_status: 'generated' },
      betError = null,
      groups = [],
      groupsError = null,
      existingAssignments = [],
      scheduledAssignments = [],
      insertError = null,
      insertedRows,
    } = config;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn((table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.neq = vi.fn(() => chain);
      chain.not = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.insert = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);

      if (table === 'suggested_bets') {
        chain.single = vi.fn(() => ({ data: bet, error: betError }));
      } else if (table === 'groups') {
        // .in() returns the groups array directly (no .single())
        chain.in = vi.fn(() => ({ data: groups, error: groupsError }));
      } else if (table === 'bet_group_assignments') {
        // Could be select (existing check) or select (scheduled) or insert
        let selectCallCount = 0;
        chain.select = vi.fn(() => {
          selectCallCount++;
          // Re-bind eq/neq/not to return the right data
          const innerChain = { ...chain };
          innerChain.eq = vi.fn(() => innerChain);
          innerChain.neq = vi.fn(() => innerChain);
          innerChain.not = vi.fn(() => innerChain);
          // First select on bga = existing assignments check
          // Subsequent selects = scheduled counts per group
          if (selectCallCount === 1) {
            // Return existingAssignments as final result (no .single())
            return { data: existingAssignments, error: null, eq: vi.fn(() => ({ data: existingAssignments, error: null })) };
          }
          // Scheduled assignments per group
          innerChain.not = vi.fn(() => ({
            neq: vi.fn(() => ({ data: scheduledAssignments, error: null })),
          }));
          return innerChain;
        });
        // insert returns inserted rows
        chain.insert = vi.fn(() => ({
          select: vi.fn(() => ({
            data: insertedRows ?? groups.filter((g) => g.status === 'active').map((g) => ({ group_id: g.id })),
            error: insertError,
          })),
        }));
      } else if (table === 'audit_log') {
        chain.insert = vi.fn(() => ({ error: null }));
      }

      return chain;
    });

    return { from: mockFrom };
  }

  async function callHandlerWithSupabase(
    body: unknown,
    supabaseConfig: Parameters<typeof createDistributeQueryBuilder>[0],
    contextOverrides?: Partial<TenantContext>,
    routeParams = { id: '1' },
  ) {
    const { POST } = await import('../bets/[id]/distribute/route');
    const context = createMockContext(contextOverrides);
    const mockSupabase = createDistributeQueryBuilder(supabaseConfig);
    context.supabase = mockSupabase as unknown as TenantContext['supabase'];
    mockWithTenant.mockResolvedValue({ success: true, context });

    const req = createMockRequest(body);
    return POST(req, createRouteContext(routeParams));
  }

  // --- Validation tests ---

  it('returns 400 for invalid bet ID', async () => {
    const res = await callHandlerWithSupabase({ groupIds: [GROUP_A_ID] }, {}, undefined, { id: 'abc' });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for negative bet ID', async () => {
    const res = await callHandlerWithSupabase({ groupIds: [GROUP_A_ID] }, {}, undefined, { id: '-5' });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid UUID in groupIds', async () => {
    const res = await callHandlerWithSupabase({ groupIds: ['not-a-uuid'] }, {});
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty groupIds array', async () => {
    const res = await callHandlerWithSupabase({ groupIds: [] }, {});
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for missing body fields', async () => {
    const res = await callHandlerWithSupabase({}, {});
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  // --- Backward compatibility ---

  it('accepts { groupId: string } and normalizes to array', async () => {
    const res = await callHandlerWithSupabase(
      { groupId: GROUP_A_ID },
      {
        bet: { id: 1, bet_status: 'generated' },
        groups: [{ id: GROUP_A_ID, name: 'Group A', status: 'active', posting_schedule: null }],
      },
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.created).toHaveLength(1);
    expect(json.data.created[0].groupId).toBe(GROUP_A_ID);
  });

  // --- Not found ---

  it('returns 404 when bet not found', async () => {
    const res = await callHandlerWithSupabase(
      { groupIds: [GROUP_A_ID] },
      { bet: null, betError: { message: 'not found' } },
    );
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  // --- Happy path: distribute to 2 groups ---

  it('distributes to 2 groups successfully', async () => {
    const res = await callHandlerWithSupabase(
      { groupIds: [GROUP_A_ID, GROUP_B_ID] },
      {
        bet: { id: 1, bet_status: 'generated' },
        groups: [
          { id: GROUP_A_ID, name: 'Group A', status: 'active', posting_schedule: null },
          { id: GROUP_B_ID, name: 'Group B', status: 'active', posting_schedule: null },
        ],
      },
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.created).toHaveLength(2);
    expect(json.data.alreadyExisted).toHaveLength(0);
    expect(json.data.skipped).toHaveLength(0);
  });

  // --- Mixed result: 1 new, 1 already existing ---

  it('handles mixed result: 1 created, 1 already existing', async () => {
    const res = await callHandlerWithSupabase(
      { groupIds: [GROUP_A_ID, GROUP_B_ID] },
      {
        bet: { id: 1, bet_status: 'generated' },
        groups: [
          { id: GROUP_A_ID, name: 'Group A', status: 'active', posting_schedule: null },
          { id: GROUP_B_ID, name: 'Group B', status: 'active', posting_schedule: null },
        ],
        existingAssignments: [{ group_id: GROUP_A_ID }],
        insertedRows: [{ group_id: GROUP_B_ID }],
      },
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.created).toHaveLength(1);
    expect(json.data.created[0].groupId).toBe(GROUP_B_ID);
    expect(json.data.alreadyExisted).toHaveLength(1);
    expect(json.data.alreadyExisted[0].groupId).toBe(GROUP_A_ID);
  });

  // --- Inactive group skipped ---

  it('skips inactive groups in response', async () => {
    const res = await callHandlerWithSupabase(
      { groupIds: [GROUP_A_ID, GROUP_B_ID] },
      {
        bet: { id: 1, bet_status: 'generated' },
        groups: [
          { id: GROUP_A_ID, name: 'Group A', status: 'active', posting_schedule: null },
          { id: GROUP_B_ID, name: 'Group B', status: 'inactive', posting_schedule: null },
        ],
        insertedRows: [{ group_id: GROUP_A_ID }],
      },
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.created).toHaveLength(1);
    expect(json.data.skipped).toHaveLength(1);
    expect(json.data.skipped[0].groupId).toBe(GROUP_B_ID);
    expect(json.data.skipped[0].reason).toContain('inativo');
  });

  // --- Group not found (UUID valid but doesn't exist) ---

  it('skips groups not found in DB', async () => {
    const res = await callHandlerWithSupabase(
      { groupIds: [GROUP_A_ID, GROUP_C_ID] },
      {
        bet: { id: 1, bet_status: 'generated' },
        groups: [
          { id: GROUP_A_ID, name: 'Group A', status: 'active', posting_schedule: null },
          // GROUP_C not returned by DB
        ],
        insertedRows: [{ group_id: GROUP_A_ID }],
      },
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.created).toHaveLength(1);
    expect(json.data.skipped).toHaveLength(1);
    expect(json.data.skipped[0].groupId).toBe(GROUP_C_ID);
    expect(json.data.skipped[0].reason).toContain('nao encontrado');
  });

  // --- Group admin scope enforcement ---

  it('returns 403 when group_admin tries to distribute to another group', async () => {
    const res = await callHandlerWithSupabase(
      { groupIds: [GROUP_B_ID] },
      {},
      { role: 'group_admin', groupFilter: GROUP_A_ID },
    );
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
  });

  it('allows group_admin to distribute to their own group', async () => {
    const res = await callHandlerWithSupabase(
      { groupIds: [GROUP_A_ID] },
      {
        bet: { id: 1, bet_status: 'generated' },
        groups: [{ id: GROUP_A_ID, name: 'Group A', status: 'active', posting_schedule: null }],
      },
      { role: 'group_admin', groupFilter: GROUP_A_ID },
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  // --- DB error on insert ---

  it('returns 500 on insert DB error', async () => {
    const res = await callHandlerWithSupabase(
      { groupIds: [GROUP_A_ID] },
      {
        bet: { id: 1, bet_status: 'generated' },
        groups: [{ id: GROUP_A_ID, name: 'Group A', status: 'active', posting_schedule: null }],
        insertError: { message: 'constraint violation' },
      },
    );
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error.code).toBe('DB_ERROR');
  });

  // --- Groups fetch DB error ---

  it('returns 500 when groups query fails', async () => {
    const res = await callHandlerWithSupabase(
      { groupIds: [GROUP_A_ID] },
      {
        bet: { id: 1, bet_status: 'generated' },
        groupsError: { message: 'db error' },
      },
    );
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error.code).toBe('DB_ERROR');
  });
});

// --- Unit tests for distribute-utils ---

describe('distribute-utils', () => {
  describe('computeAvailableTimes', () => {
    it('returns empty array for null schedule', async () => {
      const { computeAvailableTimes } = await import('@/lib/distribute-utils');
      expect(computeAvailableTimes(null)).toEqual([]);
    });

    it('returns empty array for schedule without times', async () => {
      const { computeAvailableTimes } = await import('@/lib/distribute-utils');
      expect(computeAvailableTimes({ enabled: true })).toEqual([]);
    });

    it('returns empty array for empty times array', async () => {
      const { computeAvailableTimes } = await import('@/lib/distribute-utils');
      expect(computeAvailableTimes({ times: [] })).toEqual([]);
    });
  });

  describe('createPostTimePicker', () => {
    it('returns null when no available times', async () => {
      const { createPostTimePicker } = await import('@/lib/distribute-utils');
      const pick = createPostTimePicker([], {});
      expect(pick()).toBeNull();
    });

    it('picks time with fewest existing bets', async () => {
      const { createPostTimePicker } = await import('@/lib/distribute-utils');
      const pick = createPostTimePicker(
        ['10:00', '14:00', '18:00'],
        { '10:00': 3, '14:00': 1, '18:00': 2 },
      );
      expect(pick()).toBe('14:00');
    });

    it('increments counter on each pick', async () => {
      const { createPostTimePicker } = await import('@/lib/distribute-utils');
      const pick = createPostTimePicker(
        ['10:00', '14:00'],
        { '10:00': 0, '14:00': 0 },
      );
      expect(pick()).toBe('10:00'); // both 0, picks first
      expect(pick()).toBe('14:00'); // 10:00 has 1, 14:00 has 0
      expect(pick()).toBe('10:00'); // both 1, picks first
    });
  });
});
