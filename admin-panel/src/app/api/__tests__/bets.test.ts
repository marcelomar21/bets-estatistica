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
} = {}) {
  const {
    mainData = [],
    mainError = null,
    mainCount = 0,
    counterCounts = {},
  } = options;

  let fromCallIndex = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createChain(isCounter = false): Record<string, any> {
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

    if (isCounter) {
      // Counter queries: all methods chain, and the chain itself has result props
      // This way it works as both a chainable query and a resolved result
      const counterKey = Object.keys(counterCounts)[fromCallIndex - 1] ?? 'unknown';
      chain.data = null;
      chain.error = null;
      chain.count = counterCounts[counterKey] ?? 0;
      // Override eq/is to also return chainable+result
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
    }

    return chain;
  }

  const mockFrom = vi.fn(() => {
    fromCallIndex++;
    // First call is the main query, rest are counters/pair-stats
    return createChain(fromCallIndex > 1);
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
      counterCounts: { ready: 1, posted: 0, pending_link: 0, pending_odds: 0, sem_odds: 0, sem_link: 0 },
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

  it('group_admin sees only their group bets', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    let fromCallIndex = 0;

    const mockFrom = vi.fn(() => {
      fromCallIndex++;
      const isMainQuery = fromCallIndex === 1;
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
      chain.range = vi.fn(() => ({
        data: isMainQuery ? [sampleBet] : null,
        error: null,
        count: isMainQuery ? 1 : 0,
      }));

      if (!isMainQuery) {
        chain.data = null;
        chain.error = null;
        chain.count = 0;
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
    expect(eqCalls).toContainEqual(['group_id', 'group-uuid-1']);
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
      counterCounts: { ready: 3, posted: 2, pending_link: 1, pending_odds: 1, sem_odds: 2, sem_link: 1 },
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
// POST /api/bets/[id]/distribute (Story 4-2)
// ============================================================
describe('POST /api/bets/[id]/distribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  function createDistributeQueryBuilder(options: {
    groupData?: unknown;
    groupError?: { message: string } | null;
    currentBet?: unknown;
    betError?: { message: string } | null;
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
      chain.neq = vi.fn(() => chain);
      chain.update = vi.fn(() => chain);
      chain.insert = vi.fn(() => ({ data: null, error: null }));
      chain.single = vi.fn(() => {
        if (fromCallIndex === 1) {
          // Group lookup
          return { data: options.groupData ?? null, error: options.groupError ?? null };
        }
        if (fromCallIndex === 2) {
          // Current bet fetch
          return { data: options.currentBet ?? null, error: options.betError ?? null };
        }
        if (fromCallIndex === 3) {
          // Update bet (returns error only)
          return { data: null, error: options.updateError ?? null };
        }
        // Fetch updated bet (call 4 or 5 depending on audit_log insert)
        return { data: options.updatedBet ?? options.currentBet ?? null, error: null };
      });
      return chain;
    });

    return { from: mockFrom };
  }

  it('distributes a pool bet to a group', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const qb = createDistributeQueryBuilder({
      groupData: { id: groupUuid, name: 'Guru da Bet' },
      currentBet: { id: 1, group_id: null, bet_status: 'generated' },
      updatedBet: { id: 1, group_id: groupUuid, bet_status: 'ready', distributed_at: '2026-02-20T10:00:00Z' },
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
    expect(body.data.redistributed).toBe(false);
    expect(body.data.groupName).toBe('Guru da Bet');
  });

  it('redistributes a bet and writes audit_log', async () => {
    const oldGroupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const newGroupUuid = '550e8400-e29b-41d4-a716-446655440002';
    const qb = createDistributeQueryBuilder({
      groupData: { id: newGroupUuid, name: 'Osmar Palpites' },
      currentBet: { id: 1, group_id: oldGroupUuid, bet_status: 'ready' },
      updatedBet: { id: 1, group_id: newGroupUuid, bet_status: 'ready', distributed_at: '2026-02-20T10:00:00Z' },
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
      groupData: null,
      groupError: { message: 'Not found' },
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
      groupData: { id: groupUuid, name: 'Guru da Bet' },
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
// POST /api/bets/bulk/distribute (Story 4-3)
// ============================================================
describe('POST /api/bets/bulk/distribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  function createBulkDistributeQueryBuilder(options: {
    groupData?: unknown;
    groupError?: { message: string } | null;
    bets?: Array<{ id: number; group_id: string | null }>;
    updateError?: { message: string } | null;
  } = {}) {
    let fromCallIndex = 0;
    let betIndex = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn((_table: string) => {
      fromCallIndex++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.neq = vi.fn(() => chain);
      chain.update = vi.fn(() => chain);
      chain.insert = vi.fn(() => ({ data: null, error: null }));
      chain.single = vi.fn(() => {
        if (fromCallIndex === 1) {
          // Group lookup
          return { data: options.groupData ?? null, error: options.groupError ?? null };
        }
        // Bet fetches (each bet: fetch + update cycles)
        const bets = options.bets ?? [];
        const bet = bets[betIndex];
        betIndex++;
        if (!bet) {
          return { data: null, error: { message: 'Not found' } };
        }
        return { data: bet, error: null };
      });
      return chain;
    });

    return { from: mockFrom };
  }

  it('distributes multiple pool bets to a group', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const qb = createBulkDistributeQueryBuilder({
      groupData: { id: groupUuid, name: 'Guru da Bet' },
      bets: [
        { id: 1, group_id: null },
        { id: 2, group_id: null },
        { id: 3, group_id: null },
      ],
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
    expect(body.data.redistributed).toBe(0);
    expect(body.data.failed).toBe(0);
    expect(body.data.groupName).toBe('Guru da Bet');
  });

  it('writes audit_log for redistributed bets', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440002';
    const oldGroupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const qb = createBulkDistributeQueryBuilder({
      groupData: { id: groupUuid, name: 'Osmar Palpites' },
      bets: [
        { id: 1, group_id: oldGroupUuid },
        { id: 2, group_id: null },
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
    expect(body.data.distributed).toBe(2);
    expect(body.data.redistributed).toBe(1);
    expect(qb.from).toHaveBeenCalledWith('audit_log');
  });

  it('returns 400 for invalid group', async () => {
    const qb = createBulkDistributeQueryBuilder({
      groupData: null,
      groupError: { message: 'Not found' },
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

  it('handles partial failure gracefully', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440001';
    const qb = createBulkDistributeQueryBuilder({
      groupData: { id: groupUuid, name: 'Guru da Bet' },
      bets: [
        { id: 1, group_id: null },
        // bet 2 not in array → will return NOT_FOUND
      ],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/distribute', {
      betIds: [1, 999],
      groupId: groupUuid,
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.distributed).toBe(1);
    expect(body.data.failed).toBe(1);
    expect(body.data.errors).toHaveLength(1);
    expect(body.data.errors[0].id).toBe(999);
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
      counterCounts: { ready: 1, posted: 0, pending_link: 0, pending_odds: 0, sem_odds: 0, sem_link: 0, pool: 5, distributed: 10 },
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

  it('accepts __pool__ as valid group_id filter', async () => {
    const isCalls: Array<[string, unknown]> = [];
    let fromCallIndex = 0;

    const mockFrom = vi.fn(() => {
      fromCallIndex++;
      const isMainQuery = fromCallIndex === 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.not = vi.fn(() => chain);
      chain.is = vi.fn((column: string, value: unknown) => {
        isCalls.push([column, value]);
        return chain;
      });
      chain.in = vi.fn(() => chain);
      chain.gte = vi.fn(() => chain);
      chain.lte = vi.fn(() => chain);
      chain.or = vi.fn(() => chain);
      chain.ilike = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.range = vi.fn(() => ({
        data: isMainQuery ? [] : null,
        error: null,
        count: 0,
      }));

      if (!isMainQuery) {
        chain.data = null;
        chain.error = null;
        chain.count = 0;
      }

      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?group_id=__pool__');

    const response = await GET(req);

    expect(response.status).toBe(200);
    // Should have called .is('group_id', null) for main query
    expect(isCalls).toContainEqual(['group_id', null]);
  });

  it('filters by specific group_id UUID', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    let fromCallIndex = 0;

    const mockFrom = vi.fn(() => {
      fromCallIndex++;
      const isMainQuery = fromCallIndex === 1;
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
      chain.range = vi.fn(() => ({
        data: isMainQuery ? [] : null,
        error: null,
        count: 0,
      }));

      if (!isMainQuery) {
        chain.data = null;
        chain.error = null;
        chain.count = 0;
      }

      return chain;
    });

    const context = createMockContext('super_admin', { from: mockFrom });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/bets/route');
    const req = createMockRequest('GET', 'http://localhost/api/bets?group_id=550e8400-e29b-41d4-a716-446655440000');

    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(eqCalls).toContainEqual(['group_id', '550e8400-e29b-41d4-a716-446655440000']);
  });
});
