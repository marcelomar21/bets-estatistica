import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Mock pickPostTime — isolate route logic from time calculations
vi.mock('@/lib/distribute-utils', () => ({
  pickPostTime: vi.fn(() => '14:00'),
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

const GROUP_A_ID = '550e8400-e29b-41d4-a716-446655440001';
const GROUP_B_ID = '550e8400-e29b-41d4-a716-446655440002';
const GROUP_INACTIVE_ID = '550e8400-e29b-41d4-a716-446655440003';

const GROUP_A = { id: GROUP_A_ID, name: 'Grupo Alpha', status: 'active', posting_schedule: { enabled: true, times: ['10:00', '14:00', '18:00'] } };
const GROUP_B = { id: GROUP_B_ID, name: 'Grupo Beta', status: 'active', posting_schedule: { enabled: true, times: ['12:00', '16:00'] } };
const GROUP_INACTIVE = { id: GROUP_INACTIVE_ID, name: 'Grupo Inativo', status: 'paused', posting_schedule: null };

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : GROUP_A_ID,
    supabase: (supabaseMock ?? { from: vi.fn() }) as unknown as TenantContext['supabase'],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CallTracker = { table: string; method: string; args: any[] };

/**
 * Build a mock supabase client that tracks calls by table name and method.
 * Responses are configured per-table via the `tables` map.
 */
function createDistributeQueryBuilder(options: {
  betData?: unknown;
  betError?: { message: string } | null;
  groups?: unknown[];
  groupsError?: { message: string } | null;
  existingAssignments?: { group_id: string }[];
  scheduledBets?: { post_at: string | null }[];
  insertError?: { message: string; code?: string } | null;
}) {
  const calls: CallTracker[] = [];
  let suggestedBetsCallIndex = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFrom = vi.fn((table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    const trackMethod = (method: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.fn((...args: any[]) => {
        calls.push({ table, method, args });
        return chain;
      });

    chain.select = trackMethod('select');
    chain.eq = trackMethod('eq');
    chain.neq = trackMethod('neq');
    chain.not = trackMethod('not');
    chain.in = trackMethod('in');
    chain.is = trackMethod('is');
    chain.order = trackMethod('order');

    if (table === 'suggested_bets') {
      suggestedBetsCallIndex++;
      chain.single = vi.fn(() => ({
        data: options.betData ?? null,
        error: options.betError ?? null,
      }));
    } else if (table === 'groups') {
      // .in() terminates the query (no .single())
      chain.in = vi.fn(() => ({
        data: options.groups ?? [],
        error: options.groupsError ?? null,
      }));
    } else if (table === 'bet_group_assignments') {
      // Could be: select existing, select scheduled, or insert
      chain.select = vi.fn((...args: unknown[]) => {
        // Distinguish by select columns
        const selectStr = typeof args[0] === 'string' ? args[0] : '';
        if (selectStr === 'group_id') {
          // Existing assignments query
          chain.eq = vi.fn(() => ({
            data: options.existingAssignments ?? [],
            error: null,
          }));
        } else if (selectStr === 'post_at') {
          // Scheduled bets query
          chain.eq = vi.fn(() => {
            // Second .eq() returns data
            chain.eq = vi.fn(() => ({
              data: options.scheduledBets ?? [],
              error: null,
            }));
            return chain;
          });
        }
        return chain;
      });
      chain.insert = vi.fn(() => ({
        data: null,
        error: options.insertError ?? null,
      }));
    } else if (table === 'audit_log') {
      chain.insert = vi.fn(() => ({ data: null, error: null }));
    }

    return chain;
  });

  return { from: mockFrom, calls };
}

// ============================================================
// POST /api/bets/[id]/distribute
// ============================================================
describe('POST /api/bets/[id]/distribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // Helper to run the route
  async function runDistribute(
    body: unknown,
    betId: string,
    context: TenantContext,
  ) {
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('../bets/[id]/distribute/route');
    const req = createMockRequest('POST', `http://localhost/api/bets/${betId}/distribute`, body);
    return POST(req, createRouteContext({ id: betId }));
  }

  // --- Happy path: distribute to 2 groups ---
  it('distributes to 2 groups successfully', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, bet_status: 'generated' },
      groups: [GROUP_A, GROUP_B],
      existingAssignments: [],
      scheduledBets: [],
    });
    const ctx = createMockContext('super_admin', qb);

    const res = await runDistribute({ groupIds: [GROUP_A.id, GROUP_B.id] }, '1', ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.created).toHaveLength(2);
    expect(json.data.created[0].group_id).toBe(GROUP_A.id);
    expect(json.data.created[1].group_id).toBe(GROUP_B.id);
    expect(json.data.alreadyExisted).toHaveLength(0);
    expect(json.data.skipped).toHaveLength(0);
  });

  // --- Backward compat: groupId string ---
  it('accepts groupId (string) for backward compatibility', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, bet_status: 'generated' },
      groups: [GROUP_A],
      existingAssignments: [],
      scheduledBets: [],
    });
    const ctx = createMockContext('super_admin', qb);

    const res = await runDistribute({ groupId: GROUP_A.id }, '1', ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.created).toHaveLength(1);
    expect(json.data.created[0].group_id).toBe(GROUP_A.id);
  });

  // --- Mixed result: 1 new, 1 already-existing ---
  it('returns mixed result: 1 created, 1 already existed', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, bet_status: 'generated' },
      groups: [GROUP_A, GROUP_B],
      existingAssignments: [{ group_id: GROUP_A.id }],
      scheduledBets: [],
    });
    const ctx = createMockContext('super_admin', qb);

    const res = await runDistribute({ groupIds: [GROUP_A.id, GROUP_B.id] }, '1', ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.created).toHaveLength(1);
    expect(json.data.created[0].group_id).toBe(GROUP_B.id);
    expect(json.data.alreadyExisted).toHaveLength(1);
    expect(json.data.alreadyExisted[0].group_id).toBe(GROUP_A.id);
  });

  // --- Inactive group skipped ---
  it('skips inactive groups in response', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, bet_status: 'generated' },
      groups: [GROUP_INACTIVE],
      existingAssignments: [],
      scheduledBets: [],
    });
    const ctx = createMockContext('super_admin', qb);

    const res = await runDistribute({ groupIds: [GROUP_INACTIVE.id] }, '1', ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.created).toHaveLength(0);
    expect(json.data.skipped).toHaveLength(1);
    expect(json.data.skipped[0].group_id).toBe(GROUP_INACTIVE.id);
    expect(json.data.skipped[0].reason).toContain('inativo');
  });

  // --- Invalid UUID format ---
  it('returns 400 for invalid UUID format', async () => {
    const ctx = createMockContext('super_admin');

    const res = await runDistribute({ groupIds: ['not-a-uuid'] }, '1', ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  // --- Invalid bet ID ---
  it('returns 400 for invalid bet ID', async () => {
    const ctx = createMockContext('super_admin');

    const res = await runDistribute({ groupIds: [GROUP_A.id] }, 'abc', ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe('ID de aposta invalido');
  });

  // --- Bet not found ---
  it('returns 404 when bet not found', async () => {
    const qb = createDistributeQueryBuilder({
      betData: null,
      betError: { message: 'not found' },
    });
    const ctx = createMockContext('super_admin', qb);

    const res = await runDistribute({ groupIds: [GROUP_A.id] }, '999', ctx);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  // --- Group not found → skipped ---
  it('skips groups not found in the DB', async () => {
    const unknownId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, bet_status: 'generated' },
      groups: [], // no groups returned
      existingAssignments: [],
      scheduledBets: [],
    });
    const ctx = createMockContext('super_admin', qb);

    const res = await runDistribute({ groupIds: [unknownId] }, '1', ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.skipped).toHaveLength(1);
    expect(json.data.skipped[0].reason).toContain('nao encontrado');
  });

  // --- group_admin cross-group → 403 ---
  it('returns 403 when group_admin tries to distribute to another group', async () => {
    const ctx = createMockContext('group_admin');

    const res = await runDistribute({ groupIds: [GROUP_B.id] }, '1', ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
  });

  // --- group_admin distributes to own group → success ---
  it('allows group_admin to distribute to their own group', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, bet_status: 'generated' },
      groups: [GROUP_A],
      existingAssignments: [],
      scheduledBets: [],
    });
    const ctx = createMockContext('group_admin', qb);
    // group_admin's groupFilter is 'group-uuid-1' which matches GROUP_A.id

    const res = await runDistribute({ groupIds: [GROUP_A.id] }, '1', ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.created).toHaveLength(1);
  });

  // --- DB error on insert → 500 ---
  it('returns 500 on DB insert error', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, bet_status: 'generated' },
      groups: [GROUP_A],
      existingAssignments: [],
      scheduledBets: [],
      insertError: { message: 'connection reset' },
    });
    const ctx = createMockContext('super_admin', qb);

    const res = await runDistribute({ groupIds: [GROUP_A.id] }, '1', ctx);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('DB_ERROR');
  });

  // --- Neither groupIds nor groupId → 400 ---
  it('returns 400 when neither groupIds nor groupId provided', async () => {
    const ctx = createMockContext('super_admin');

    const res = await runDistribute({}, '1', ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
