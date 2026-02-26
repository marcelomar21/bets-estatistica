import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createMockRequest(url: string): NextRequest {
  return new NextRequest(new Request(url, { method: 'GET' }));
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

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const sampleBets = [
  { bet_market: 'Gols Over 2.5', bet_result: 'success', result_updated_at: daysAgo(2), group_id: 'g1', league_matches: { league_seasons: { league_name: 'Serie A', country: 'Brasil' } }, groups: { name: 'GuruBet' } },
  { bet_market: 'Gols Under 1.5', bet_result: 'failure', result_updated_at: daysAgo(3), group_id: 'g1', league_matches: { league_seasons: { league_name: 'Serie A', country: 'Brasil' } }, groups: { name: 'GuruBet' } },
  { bet_market: 'Escanteios Over 8.5', bet_result: 'success', result_updated_at: daysAgo(5), group_id: 'g1', league_matches: { league_seasons: { league_name: 'Premier League', country: 'England' } }, groups: { name: 'GuruBet' } },
  { bet_market: 'Gols Over 1.5', bet_result: 'success', result_updated_at: daysAgo(10), group_id: 'g2', league_matches: { league_seasons: { league_name: 'Serie A', country: 'Brasil' } }, groups: { name: 'Osmar' } },
  { bet_market: 'BTTS Sim', bet_result: 'success', result_updated_at: daysAgo(20), group_id: 'g2', league_matches: { league_seasons: { league_name: 'La Liga', country: 'Espanha' } }, groups: { name: 'Osmar' } },
  { bet_market: 'Gols Over 3.5', bet_result: 'failure', result_updated_at: daysAgo(40), group_id: 'g1', league_matches: { league_seasons: { league_name: 'Serie A', country: 'Brasil' } }, groups: { name: 'GuruBet' } },
];

function createSupabaseMock(bets: typeof sampleBets = sampleBets) {
  const chain: Record<string, unknown> = {};
  const eqCalls: Array<[string, unknown]> = [];

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return chain;
  });
  chain.in = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);

  // The final resolution of the chain
  chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => {
    resolve({ data: bets, error: null });
  });

  const from = vi.fn().mockReturnValue(chain);
  return { from, eqCalls, chain };
}

describe('GET /api/analytics/accuracy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns analytics with all breakdowns', async () => {
    const mock = createSupabaseMock();
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { GET } = await import('../analytics/accuracy/route');
    const req = createMockRequest('http://localhost/api/analytics/accuracy');
    const res = await GET(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Total: 4 wins, 2 losses out of 6
    expect(body.data.total.wins).toBe(4);
    expect(body.data.total.losses).toBe(2);
    expect(body.data.total.total).toBe(6);
    expect(body.data.total.rate).toBeCloseTo(66.7, 0);

    // Periods
    expect(body.data.periods.allTime.total).toBe(6);
    expect(body.data.periods.last7d.total).toBeGreaterThanOrEqual(2); // at least the 2 and 3 day ago bets
    expect(body.data.periods.last30d.total).toBeGreaterThanOrEqual(4); // at least 5 of the 6 (40 day ago excluded)

    // byGroup should be present for super_admin
    expect(Array.isArray(body.data.byGroup)).toBe(true);

    // byMarket — Gols should have at least 3 entries
    expect(Array.isArray(body.data.byMarket)).toBe(true);
    const golsMarket = body.data.byMarket.find((m: { market: string }) => m.market === 'Gols');
    expect(golsMarket).toBeDefined();
    expect(golsMarket.total).toBeGreaterThanOrEqual(3);

    // byChampionship — Serie A should have at least 3 entries
    expect(Array.isArray(body.data.byChampionship)).toBe(true);
    const serieA = body.data.byChampionship.find((c: { league_name: string }) => c.league_name === 'Serie A');
    expect(serieA).toBeDefined();
    expect(serieA.total).toBeGreaterThanOrEqual(3);
  });

  it('hides byGroup for group_admin', async () => {
    const mock = createSupabaseMock();
    const ctx = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { GET } = await import('../analytics/accuracy/route');
    const req = createMockRequest('http://localhost/api/analytics/accuracy');
    const res = await GET(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.byGroup).toEqual([]);
  });

  it('applies group filter for group_admin RLS', async () => {
    const mock = createSupabaseMock();
    const ctx = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { GET } = await import('../analytics/accuracy/route');
    const req = createMockRequest('http://localhost/api/analytics/accuracy');
    await GET(req, { params: Promise.resolve({}) });

    const hasGroupFilter = mock.eqCalls.some(
      ([col, val]) => col === 'group_id' && val === 'group-uuid-1',
    );
    expect(hasGroupFilter).toBe(true);
  });

  it('returns empty data when no bets exist', async () => {
    const mock = createSupabaseMock([]);
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { GET } = await import('../analytics/accuracy/route');
    const req = createMockRequest('http://localhost/api/analytics/accuracy');
    const res = await GET(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.total.total).toBe(0);
    expect(body.data.total.rate).toBe(0);
    expect(body.data.byGroup).toEqual([]);
    expect(body.data.byMarket).toEqual([]);
    expect(body.data.byChampionship).toEqual([]);
  });

  it('filters items below minimum threshold', async () => {
    // Only 1 bet for Escanteios — should NOT appear in byMarket
    const mock = createSupabaseMock(sampleBets);
    const ctx = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { GET } = await import('../analytics/accuracy/route');
    const req = createMockRequest('http://localhost/api/analytics/accuracy');
    const res = await GET(req, { params: Promise.resolve({}) });
    const body = await res.json();

    const escanteios = body.data.byMarket.find((m: { market: string }) => m.market === 'Escanteios');
    expect(escanteios).toBeUndefined(); // Below MIN_BETS_DISPLAY of 3
  });

  it('returns 500 on database error', async () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.gte = vi.fn().mockReturnValue(chain);
    chain.lte = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => {
      resolve({ data: null, error: { message: 'DB connection failed' } });
    });
    const from = vi.fn().mockReturnValue(chain);

    const ctx = createMockContext('super_admin', { from });
    mockWithTenant.mockResolvedValue({ success: true, context: ctx });

    const { GET } = await import('../analytics/accuracy/route');
    const req = createMockRequest('http://localhost/api/analytics/accuracy');
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(500);
  });
});
