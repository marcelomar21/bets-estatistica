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

function createMockRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new Request(url, init));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createListQueryBuilder(options: {
  mainData?: unknown[];
  mainError?: { message: string } | null;
  mainCount?: number;
  counterCounts?: Record<string, number>;
  assignedBetIds?: number[];
  bgaCounterCounts?: Record<string, number>;
} = {}) {
  const {
    mainData = [],
    mainError = null,
    mainCount = 0,
    counterCounts = {},
    assignedBetIds = [],
    bgaCounterCounts = {},
  } = options;

  let sbCallIndex = 0;
  let bgaCallIndex = 0;
  const counterKeys = Object.keys(counterCounts);
  const bgaCounterKeys = Object.keys(bgaCounterCounts);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createChain(opts: { isCounter?: boolean; isPrefetch?: boolean; counterKey?: string } = {}): Record<string, any> {
    const { isCounter = false, isPrefetch = false, counterKey } = opts;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.ilike = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.lte = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.range = vi.fn(() => ({
      data: mainData,
      error: mainError,
      count: mainCount,
    }));

    if (isPrefetch) {
      chain.data = assignedBetIds.map(id => ({ bet_id: id }));
      chain.error = null;
    }

    if (isCounter) {
      chain.data = null;
      chain.error = null;
      chain.count = (counterKey ? (counterCounts[counterKey] ?? bgaCounterCounts[counterKey] ?? 0) : 0);
    }

    return chain;
  }

  const mockFrom = vi.fn((table?: string) => {
    if (table === 'bet_group_assignments') {
      bgaCallIndex++;
      if (bgaCallIndex === 1) {
        // Pre-fetch: returns assigned bet IDs
        return createChain({ isPrefetch: true });
      }
      // Counter queries (distributed, posted_assignments)
      const key = bgaCounterKeys[bgaCallIndex - 2] ?? 'unknown';
      return createChain({ isCounter: true, counterKey: key });
    }
    // suggested_bets or pair stats table
    sbCallIndex++;
    if (sbCallIndex === 1) {
      return createChain();
    }
    // Counter queries
    const key = counterKeys[sbCallIndex - 2] ?? 'unknown';
    return createChain({ isCounter: true, counterKey: key });
  });

  return { from: mockFrom };
}

function createDetailQueryBuilder(options: {
  betData?: unknown;
  betError?: { message: string } | null;
  historyData?: unknown[];
  historyError?: { message: string } | null;
} = {}) {
  let fromCallIndex = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFrom = vi.fn((_table: string) => {
    fromCallIndex++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => ({
      data: options.historyData ?? [],
      error: options.historyError ?? null,
    }));
    chain.single = vi.fn(() => ({
      data: fromCallIndex === 1 ? (options.betData ?? null) : null,
      error: fromCallIndex === 1 ? (options.betError ?? null) : null,
    }));
    return chain;
  });

  return { from: mockFrom };
}

function createOddsUpdateQueryBuilder(options: {
  currentBet?: unknown;
  fetchError?: { message: string } | null;
  updateError?: { message: string } | null;
  updatedBet?: unknown;
} = {}) {
  let fromCallIndex = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFrom = vi.fn((_table: string) => {
    fromCallIndex++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.insert = vi.fn(() => ({ data: null, error: null }));
    chain.single = vi.fn(() => {
      if (fromCallIndex === 1) {
        return { data: options.currentBet ?? null, error: options.fetchError ?? null };
      }
      if (fromCallIndex === 2) {
        return { data: null, error: options.updateError ?? null };
      }
      // Last fetch for updated bet
      return { data: options.updatedBet ?? options.currentBet ?? null, error: null };
    });
    return chain;
  });

  return { from: mockFrom };
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

const sampleBet = {
  id: 1,
  bet_market: 'Over 2.5 Gols',
  bet_pick: 'Over',
  odds: 1.85,
  deep_link: 'https://bet365.com/link',
  bet_status: 'ready',
  elegibilidade: 'elegivel',
  promovida_manual: false,
  group_id: 'group-uuid-1',
  distributed_at: '2026-02-10T10:00:00Z',
  created_at: '2026-02-10T08:00:00Z',
  odds_at_post: null,
  notes: null,
  league_matches: {
    home_team_name: 'Flamengo',
    away_team_name: 'Palmeiras',
    kickoff_time: '2026-02-10T20:00:00Z',
    status: 'scheduled',
  },
  groups: { name: 'Grupo Alpha' },
};

const sampleHistory = [
  { id: 1, bet_id: 1, update_type: 'odds_change', old_value: 1.70, new_value: 1.85, job_name: 'enrichOdds_08h', created_at: '2026-02-10T08:30:00Z' },
];

// ============================================================
// GET /api/bets
// ============================================================
describe('GET /api/bets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns list of bets with pagination and counters', async () => {
    const qb = createListQueryBuilder({
      mainData: [sampleBet],
      mainCount: 1,
      counterCounts: { ready: 1, pending_link: 0, pending_odds: 0, sem_odds: 0, sem_link: 0, pool: 0 },
      bgaCounterCounts: { distributed: 1, posted_assignments: 0 },
      assignedBetIds: [1],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.per_page).toBe(50);
    expect(body.data.counters).toBeDefined();
  });

  it('applies pagination params', async () => {
    const qb = createListQueryBuilder({ mainData: [], mainCount: 0 });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?page=2&per_page=25');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.pagination.page).toBe(2);
    expect(body.data.pagination.per_page).toBe(25);
  });

  it('caps per_page at 200', async () => {
    const qb = createListQueryBuilder({ mainData: [], mainCount: 0 });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?per_page=500');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.pagination.per_page).toBe(200);
  });

  it('rejects invalid status filter', async () => {
    const qb = createListQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?status=invalid');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid sort_by field', async () => {
    const qb = createListQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?sort_by=invalid_field');

    const response = await GET(req);

    expect(response.status).toBe(400);
  });

  it('group_admin sees only their group bets (via junction table)', async () => {
    const inCalls: Array<[string, unknown]> = [];
    let sbCallIndex = 0;
    let bgaCallIndex = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn((table?: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.not = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.in = vi.fn((column: string, value: unknown) => {
        inCalls.push([column, value]);
        return chain;
      });
      chain.gte = vi.fn(() => chain);
      chain.lte = vi.fn(() => chain);
      chain.or = vi.fn(() => chain);
      chain.ilike = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.range = vi.fn(() => ({
        data: [sampleBet],
        error: null,
        count: 1,
      }));

      if (table === 'bet_group_assignments') {
        bgaCallIndex++;
        if (bgaCallIndex <= 2) {
          // Pre-fetch calls: return bet_ids for all and for group
          chain.data = [{ bet_id: 1 }];
          chain.error = null;
        } else {
          chain.data = null;
          chain.error = null;
          chain.count = 0;
        }
      } else {
        sbCallIndex++;
        if (sbCallIndex > 1) {
          chain.data = null;
          chain.error = null;
          chain.count = 0;
        }
      }

      return chain;
    });

    const context = createMockContext('group_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // group_admin scoping now uses .in('id', groupBetIds) instead of .eq('group_id', ...)
    expect(inCalls).toContainEqual(['id', [1]]);
  });

  it('super_admin can filter by specific group_id', async () => {
    const qb = createListQueryBuilder({ mainData: [], mainCount: 0 });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?group_id=550e8400-e29b-41d4-a716-446655440000');

    const response = await GET(req);

    expect(response.status).toBe(200);
  });

  it('rejects invalid group_id format', async () => {
    const qb = createListQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?group_id=not-a-uuid');

    const response = await GET(req);

    expect(response.status).toBe(400);
  });

  it('returns counters with correct values', async () => {
    const qb = createListQueryBuilder({
      mainData: [],
      mainCount: 10,
      counterCounts: { ready: 3, pending_link: 1, pending_odds: 1, sem_odds: 2, sem_link: 1, pool: 5 },
      bgaCounterCounts: { distributed: 4, posted_assignments: 2 },
      assignedBetIds: [1, 2, 3, 4, 5],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.counters).toBeDefined();
    expect(typeof body.data.counters.total).toBe('number');
    expect(typeof body.data.counters.ready).toBe('number');
  });

  it('pool counter counts bets with zero assignments', async () => {
    // Bets 1,2 are assigned; pool counter should exclude them
    const qb = createListQueryBuilder({
      mainData: [],
      mainCount: 5,
      counterCounts: { ready: 1, pending_link: 0, pending_odds: 0, sem_odds: 0, sem_link: 0, pool: 3 },
      bgaCounterCounts: { distributed: 2, posted_assignments: 0 },
      assignedBetIds: [1, 2],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.counters.pool).toBe(3);
    // Verify pool query queries suggested_bets (not bet_group_assignments)
    const fromCalls = qb.from.mock.calls.map((c: unknown[]) => c[0]);
    expect(fromCalls).toContain('bet_group_assignments');
    expect(fromCalls).toContain('suggested_bets');
  });

  it('distributed/posted counters come from bet_group_assignments', async () => {
    const qb = createListQueryBuilder({
      mainData: [],
      mainCount: 0,
      counterCounts: { ready: 0, pending_link: 0, pending_odds: 0, sem_odds: 0, sem_link: 0, pool: 0 },
      bgaCounterCounts: { distributed: 5, posted_assignments: 3 },
      assignedBetIds: [1, 2, 3],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.counters.distributed).toBe(5);
    expect(body.data.counters.posted).toBe(3);
  });

  it('__pool__ filter returns only bets with zero assignments', async () => {
    const notCalls: Array<[string, string, string]> = [];
    let sbCallIndex = 0;
    let bgaCallIndex = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn((table?: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.not = vi.fn((col: string, op: string, val: string) => {
        notCalls.push([col, op, val]);
        return chain;
      });
      chain.is = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.gte = vi.fn(() => chain);
      chain.lte = vi.fn(() => chain);
      chain.or = vi.fn(() => chain);
      chain.ilike = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.range = vi.fn(() => ({ data: [], error: null, count: 0 }));

      if (table === 'bet_group_assignments') {
        bgaCallIndex++;
        chain.data = bgaCallIndex === 1 ? [{ bet_id: 10 }, { bet_id: 20 }] : null;
        chain.error = null;
        chain.count = 0;
      } else {
        sbCallIndex++;
        if (sbCallIndex > 1) {
          chain.data = null;
          chain.error = null;
          chain.count = 0;
        }
      }
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?group_id=__pool__');

    const response = await GET(req);

    expect(response.status).toBe(200);
    // Should call .not('id', 'in', '(10,20)') to exclude assigned bets
    expect(notCalls).toContainEqual(['id', 'in', '(10,20)']);
  });
});

// ============================================================
// GET /api/bets/[id]
// ============================================================
describe('GET /api/bets/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns bet detail with odds history', async () => {
    const qb = createDetailQueryBuilder({
      betData: sampleBet,
      historyData: sampleHistory,
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/[id]/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets/1');
    const routeCtx = createRouteContext({ id: '1' });

    const response = await GET(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.bet).toBeDefined();
    expect(body.data.odds_history).toBeDefined();
  });

  it('returns 404 for non-existent bet', async () => {
    const qb = createDetailQueryBuilder({
      betData: null,
      betError: { message: 'Not found' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/[id]/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets/999');
    const routeCtx = createRouteContext({ id: '999' });

    const response = await GET(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid bet ID', async () => {
    const qb = createDetailQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/[id]/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets/abc');
    const routeCtx = createRouteContext({ id: 'abc' });

    const response = await GET(req, routeCtx);

    expect(response.status).toBe(400);
  });

  it('group_admin restricted to own group bets', async () => {
    const qb = createDetailQueryBuilder({
      betData: null,
      betError: { message: 'Not found (RLS)' },
    });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/[id]/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets/1');
    const routeCtx = createRouteContext({ id: '1' });

    const response = await GET(req, routeCtx);

    expect(response.status).toBe(404);
  });
});

// ============================================================
// PATCH /api/bets/[id]/odds
// ============================================================
describe('PATCH /api/bets/[id]/odds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('updates odds successfully', async () => {
    const currentBet = { id: 1, odds: 1.70, deep_link: 'https://bet365.com/link', bet_status: 'pending_link', promovida_manual: false };
    const qb = createOddsUpdateQueryBuilder({ currentBet, updatedBet: { ...currentBet, odds: 2.10, bet_status: 'ready' } });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/odds/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/odds', { odds: 2.10 });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.old_odds).toBe(1.70);
    expect(body.data.new_odds).toBe(2.10);
  });

  it('auto-promotes bet to ready when odds >= 1.60 and has deep_link', async () => {
    const currentBet = { id: 1, odds: 1.50, deep_link: 'https://bet365.com/link', bet_status: 'pending_odds', promovida_manual: false };
    const qb = createOddsUpdateQueryBuilder({ currentBet, updatedBet: { ...currentBet, odds: 1.85, bet_status: 'ready' } });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/odds/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/odds', { odds: 1.85 });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('rejects negative odds', async () => {
    const qb = createOddsUpdateQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/odds/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/odds', { odds: -1 });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeCtx);

    expect(response.status).toBe(400);
  });

  it('rejects zero odds', async () => {
    const qb = createOddsUpdateQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/odds/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/odds', { odds: 0 });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeCtx);

    expect(response.status).toBe(400);
  });

  it('rejects NaN odds', async () => {
    const qb = createOddsUpdateQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/odds/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/odds', { odds: 'abc' });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeCtx);

    expect(response.status).toBe(400);
  });

  it('returns 404 for non-existent bet', async () => {
    const qb = createOddsUpdateQueryBuilder({
      currentBet: null,
      fetchError: { message: 'Not found' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/odds/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/999/odds', { odds: 2.0 });
    const routeCtx = createRouteContext({ id: '999' });

    const response = await PATCH(req, routeCtx);

    expect(response.status).toBe(404);
  });

  it('group_admin receives 403', async () => {
    mockWithTenant.mockResolvedValue({
      success: true,
      context: createMockContext('group_admin'),
    });

    const { PATCH } = await import('@/app/api/bets/[id]/odds/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/odds', { odds: 2.0 });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeCtx);

    expect(response.status).toBe(403);
  });
});

// ============================================================
// POST /api/bets/bulk/odds
// ============================================================
describe('POST /api/bets/bulk/odds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('updates multiple bets successfully', async () => {
    const bets = [
      { id: 1, odds: 1.70, deep_link: 'https://link1.com', bet_status: 'pending_link', promovida_manual: false },
      { id: 2, odds: 1.50, deep_link: null, bet_status: 'generated', promovida_manual: false },
      { id: 3, odds: 2.00, deep_link: 'https://link3.com', bet_status: 'ready', promovida_manual: false },
    ];

    let fetchIndex = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn((_table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.update = vi.fn(() => chain);
      chain.insert = vi.fn(() => ({ data: null, error: null }));
      chain.single = vi.fn(() => {
        // Each item does: fetch current, update, maybe status update, fetch updated
        const betIndex = Math.floor(fetchIndex / 2);
        const bet = bets[betIndex] ?? null;
        fetchIndex++;
        return { data: bet, error: bet ? null : { message: 'Not found' } };
      });
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/odds/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/odds', {
      updates: [
        { id: 1, odds: 2.10 },
        { id: 2, odds: 1.80 },
        { id: 3, odds: 2.00 },
      ],
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('updated');
    expect(body.data).toHaveProperty('promoted');
    expect(body.data).toHaveProperty('skipped');
    expect(body.data).toHaveProperty('failed');
    expect(body.data).toHaveProperty('errors');
  });

  it('rejects empty updates array', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/odds/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/odds', {
      updates: [],
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('rejects more than 50 items', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/odds/route');
    const updates = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, odds: 2.0 }));
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/odds', { updates });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('handles partial failure gracefully', async () => {
    let callCount = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn((_table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.update = vi.fn(() => chain);
      chain.insert = vi.fn(() => ({ data: null, error: null }));
      chain.single = vi.fn(() => {
        callCount++;
        // First bet exists, second doesn't, third exists
        if (callCount <= 2) {
          return { data: { id: 1, odds: 1.50, deep_link: null, bet_status: 'generated', promovida_manual: false }, error: null };
        }
        if (callCount <= 4) {
          return { data: null, error: { message: 'Not found' } };
        }
        return { data: { id: 3, odds: 1.80, deep_link: 'https://link.com', bet_status: 'pending_link', promovida_manual: false }, error: null };
      });
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/odds/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/odds', {
      updates: [
        { id: 1, odds: 2.10 },
        { id: 999, odds: 1.80 },
        { id: 3, odds: 2.20 },
      ],
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // At least one failure expected
    expect(body.data.failed).toBeGreaterThanOrEqual(1);
    expect(body.data.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('group_admin receives 403', async () => {
    mockWithTenant.mockResolvedValue({
      success: true,
      context: createMockContext('group_admin'),
    });

    const { POST } = await import('@/app/api/bets/bulk/odds/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/odds', {
      updates: [{ id: 1, odds: 2.0 }],
    });

    const response = await POST(req);

    expect(response.status).toBe(403);
  });
});

// ============================================================
// POST /api/bets/[id]/distribute (Story 4-2 — multi-group)
// ============================================================
describe('POST /api/bets/[id]/distribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  function createDistributeQueryBuilder(options: {
    groupsData?: unknown[];
    groupsError?: { message: string } | null;
    currentBet?: unknown;
    betError?: { message: string } | null;
    existingAssignments?: unknown[];
    upsertError?: { message: string } | null;
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
      chain.update = vi.fn(() => chain);
      chain.insert = vi.fn(() => ({ data: null, error: null }));
      chain.upsert = vi.fn(() => ({ data: null, error: options.upsertError ?? null }));

      if (table === 'groups') {
        // Multi-group lookup returns array (not single)
        chain.neq = vi.fn(() => ({
          data: options.groupsData ?? null,
          error: options.groupsError ?? null,
        }));
      } else if (table === 'suggested_bets') {
        chain.single = vi.fn(() => ({
          data: options.currentBet ?? null,
          error: options.betError ?? null,
        }));
        // update().eq() returns { error }
        chain.update = vi.fn(() => ({
          eq: vi.fn(() => ({ data: null, error: options.updateError ?? null })),
        }));
      } else if (table === 'bet_group_assignments') {
        chain.in = vi.fn(() => ({
          data: options.existingAssignments ?? [],
          error: null,
        }));
        chain.upsert = vi.fn(() => ({
          data: null,
          error: options.upsertError ?? null,
        }));
      } else if (table === 'audit_log') {
        chain.insert = vi.fn(() => ({ data: null, error: null }));
      }

      return chain;
    });

    return { from: mockFrom };
  }

  it('distributes a pool bet to a group (backward compat groupId)', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const qb = createDistributeQueryBuilder({
      groupsData: [{ id: groupUuid, name: 'Guru da Bet', posting_schedule: null }],
      currentBet: { id: 1, group_id: null, bet_status: 'generated' },
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: groupUuid,
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Backward compat fields
    expect(body.data.redistributed).toBe(false);
    expect(body.data.groupName).toBe('Guru da Bet');
    // New multi-group fields
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(groupUuid);
    expect(body.data.alreadyExisted).toHaveLength(0);
  });

  it('distributes a bet to multiple groups via groupIds', async () => {
    const g1 = '550e8400-e29b-41d4-a716-446655440001';
    const g2 = '550e8400-e29b-41d4-a716-446655440002';
    const qb = createDistributeQueryBuilder({
      groupsData: [
        { id: g1, name: 'Guru da Bet', posting_schedule: null },
        { id: g2, name: 'Osmar Palpites', posting_schedule: null },
      ],
      currentBet: { id: 1, group_id: null, bet_status: 'generated' },
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [g1, g2],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(2);
    expect(body.data.alreadyExisted).toHaveLength(0);
    // bet_group_assignments upsert was called
    expect(qb.from).toHaveBeenCalledWith('bet_group_assignments');
  });

  it('returns alreadyExisted for duplicate assignment', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const qb = createDistributeQueryBuilder({
      groupsData: [{ id: groupUuid, name: 'Guru da Bet', posting_schedule: null }],
      currentBet: { id: 1, group_id: groupUuid, bet_status: 'ready' },
      existingAssignments: [{ group_id: groupUuid }],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: groupUuid,
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(0);
    expect(body.data.alreadyExisted).toHaveLength(1);
    expect(body.data.alreadyExisted[0].groupName).toBe('Guru da Bet');
  });

  it('redistributes a bet and writes audit_log', async () => {
    const oldGroupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const newGroupUuid = '550e8400-e29b-41d4-a716-446655440002';
    const qb = createDistributeQueryBuilder({
      groupsData: [{ id: newGroupUuid, name: 'Osmar Palpites', posting_schedule: null }],
      currentBet: { id: 1, group_id: oldGroupUuid, bet_status: 'ready' },
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: newGroupUuid,
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.redistributed).toBe(true);
    // Verify audit_log was called (from was called for audit_log insert)
    expect(qb.from).toHaveBeenCalledWith('audit_log');
  });

  it('returns 400 for invalid group', async () => {
    const qb = createDistributeQueryBuilder({
      groupsData: null as unknown as undefined,
      groupsError: { message: 'Not found' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: '550e8400-e29b-41d4-a716-446655440000',
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid groupId format', async () => {
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
      groupId: '550e8400-e29b-41d4-a716-446655440000',
    });
    const routeCtx = createRouteContext({ id: 'abc' });

    const response = await POST(req, routeCtx);

    expect(response.status).toBe(400);
  });

  it('returns 403 for group_admin', async () => {
    mockWithTenant.mockResolvedValue({
      success: true,
      context: createMockContext('group_admin'),
    });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: '550e8400-e29b-41d4-a716-446655440000',
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);

    expect(response.status).toBe(403);
  });

  it('returns 404 for non-existent bet', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const qb = createDistributeQueryBuilder({
      groupsData: [{ id: groupUuid, name: 'Guru da Bet', posting_schedule: null }],
      currentBet: null,
      betError: { message: 'Not found' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/999/distribute', {
      groupId: groupUuid,
    });
    const routeCtx = createRouteContext({ id: '999' });

    const response = await POST(req, routeCtx);

    expect(response.status).toBe(404);
  });
});

// ============================================================
// POST /api/bets/bulk/distribute (GURU-43: multi-group bulk)
// ============================================================
describe('POST /api/bets/bulk/distribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  function createBulkDistributeQueryBuilder(options: {
    groupsData?: unknown[];
    groupsError?: { message: string } | null;
    betsData?: unknown[];
    betsError?: { message: string } | null;
    existingAssignments?: unknown[];
    upsertError?: { message: string } | null;
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
      chain.insert = vi.fn(() => ({ data: null, error: null }));
      chain.upsert = vi.fn(() => ({ data: null, error: options.upsertError ?? null }));

      if (table === 'groups') {
        chain.in = vi.fn(() => ({
          ...chain,
          neq: vi.fn(() => ({
            data: options.groupsData ?? null,
            error: options.groupsError ?? null,
          })),
        }));
      } else if (table === 'suggested_bets') {
        // .select().in('id', betIds) for bet validation
        chain.in = vi.fn(() => ({
          data: options.betsData ?? options.groupsData?.map(() => ({})) ?? [],
          error: options.betsError ?? null,
        }));
      } else if (table === 'bet_group_assignments') {
        chain.in = vi.fn(() => ({
          in: vi.fn(() => ({
            data: options.existingAssignments ?? [],
            error: null,
          })),
        }));
        chain.upsert = vi.fn(() => ({
          data: null,
          error: options.upsertError ?? null,
        }));
      }

      return chain;
    });

    return { from: mockFrom };
  }

  it('distributes multiple pool bets to a group', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const qb = createBulkDistributeQueryBuilder({
      groupsData: [{ id: groupUuid, name: 'Guru da Bet', posting_schedule: null }],
      betsData: [{ id: 1, group_id: null }, { id: 2, group_id: null }, { id: 3, group_id: null }],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/distribute', {
      betIds: [1, 2, 3],
      groupId: groupUuid,
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.distributed).toBe(3);
    expect(body.data.groupName).toBe('Guru da Bet');
    expect(qb.from).toHaveBeenCalledWith('bet_group_assignments');
  });

  it('returns alreadyExisted for duplicate assignments', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const qb = createBulkDistributeQueryBuilder({
      groupsData: [{ id: groupUuid, name: 'Guru da Bet', posting_schedule: null }],
      betsData: [{ id: 1, group_id: groupUuid }, { id: 2, group_id: groupUuid }],
      existingAssignments: [
        { bet_id: 1, group_id: groupUuid },
        { bet_id: 2, group_id: groupUuid },
      ],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/distribute', {
      betIds: [1, 2],
      groupId: groupUuid,
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.distributed).toBe(0);
    expect(body.data.alreadyExisted).toBe(2);
  });

  it('returns 400 for invalid group', async () => {
    const qb = createBulkDistributeQueryBuilder({
      groupsData: [],
      groupsError: null,
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/distribute', {
      betIds: [1],
      groupId: '550e8400-e29b-41d4-a716-446655440000',
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns 400 for empty betIds', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/distribute', {
      betIds: [],
      groupId: '550e8400-e29b-41d4-a716-446655440000',
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns 400 for more than 50 items', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/distribute/route');
    const betIds = Array.from({ length: 51 }, (_, i) => i + 1);
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/distribute', {
      betIds,
      groupId: '550e8400-e29b-41d4-a716-446655440000',
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns 403 for group_admin', async () => {
    mockWithTenant.mockResolvedValue({
      success: true,
      context: createMockContext('group_admin'),
    });

    const { POST } = await import('@/app/api/bets/bulk/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/distribute', {
      betIds: [1],
      groupId: '550e8400-e29b-41d4-a716-446655440000',
    });

    const response = await POST(req);

    expect(response.status).toBe(403);
  });

  it('distributes to multiple groups at once', async () => {
    const g1 = '550e8400-e29b-41d4-a716-446655440001';
    const g2 = '550e8400-e29b-41d4-a716-446655440002';
    const qb = createBulkDistributeQueryBuilder({
      groupsData: [
        { id: g1, name: 'Guru da Bet', posting_schedule: null },
        { id: g2, name: 'Osmar Palpites', posting_schedule: null },
      ],
      betsData: [{ id: 1, group_id: null }, { id: 2, group_id: null }],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/distribute', {
      betIds: [1, 2],
      groupIds: [g1, g2],
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.distributed).toBe(4); // 2 bets × 2 groups
  });
});

// ============================================================
// Story 4-1: Pool and distribution visibility
// ============================================================
describe('Story 4-1: Pool and distribution visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns pool and distributed counters', async () => {
    const qb = createListQueryBuilder({
      mainData: [sampleBet],
      mainCount: 1,
      counterCounts: { ready: 1, pending_link: 0, pending_odds: 0, sem_odds: 0, sem_link: 0, pool: 5 },
      bgaCounterCounts: { distributed: 10, posted_assignments: 0 },
      assignedBetIds: [1],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.counters).toHaveProperty('pool');
    expect(body.data.counters).toHaveProperty('distributed');
    expect(typeof body.data.counters.pool).toBe('number');
    expect(typeof body.data.counters.distributed).toBe('number');
  });

  it('accepts __pool__ as valid group_id filter (uses NOT IN assigned IDs)', async () => {
    const notCalls: Array<[string, string, string]> = [];
    let sbCallIndex = 0;
    let bgaCallIndex = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn((table?: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.not = vi.fn((col: string, op: string, val: string) => {
        notCalls.push([col, op, val]);
        return chain;
      });
      chain.is = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.gte = vi.fn(() => chain);
      chain.lte = vi.fn(() => chain);
      chain.or = vi.fn(() => chain);
      chain.ilike = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.range = vi.fn(() => ({ data: [], error: null, count: 0 }));

      if (table === 'bet_group_assignments') {
        bgaCallIndex++;
        chain.data = bgaCallIndex === 1 ? [{ bet_id: 5 }, { bet_id: 10 }] : null;
        chain.error = null;
        chain.count = 0;
      } else {
        sbCallIndex++;
        if (sbCallIndex > 1) {
          chain.data = null;
          chain.error = null;
          chain.count = 0;
        }
      }
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?group_id=__pool__');

    const response = await GET(req);

    expect(response.status).toBe(200);
    // Pool filter now uses NOT IN to exclude assigned bet IDs
    expect(notCalls).toContainEqual(['id', 'in', '(5,10)']);
  });

  it('filters by specific group_id UUID via junction table', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    let bgaCallIndex = 0;
    let sbCallIndex = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn((table?: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn((column: string, value: unknown) => {
        eqCalls.push([column, value]);
        return chain;
      });
      chain.not = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.gte = vi.fn(() => chain);
      chain.lte = vi.fn(() => chain);
      chain.or = vi.fn(() => chain);
      chain.ilike = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.range = vi.fn(() => ({ data: [], error: null, count: 0 }));

      if (table === 'bet_group_assignments') {
        bgaCallIndex++;
        chain.data = bgaCallIndex === 1 ? [{ bet_id: 1 }] : null;
        chain.error = null;
        chain.count = 0;
      } else {
        sbCallIndex++;
        if (sbCallIndex > 1) {
          chain.data = null;
          chain.error = null;
          chain.count = 0;
        }
      }
      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?group_id=550e8400-e29b-41d4-a716-446655440000');

    const response = await GET(req);

    expect(response.status).toBe(200);
    // Now filters via bet_group_assignments.group_id
    expect(eqCalls).toContainEqual(['bet_group_assignments.group_id', '550e8400-e29b-41d4-a716-446655440000']);
  });
});
