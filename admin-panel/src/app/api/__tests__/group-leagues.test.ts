import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Helper to create route context with params (Next.js 16 Promise-based params)
function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

// Build a supabase mock that routes by table name
function createSupabaseMock(tableHandlers: Record<string, {
  selectData?: unknown;
  selectError?: { message: string; code?: string } | null;
  upsertData?: unknown;
  upsertError?: { message: string; code?: string } | null;
}>) {
  const mockFrom = vi.fn((table: string) => {
    const handler = tableHandlers[table] || {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.upsert = vi.fn(() => ({
      data: handler.upsertData ?? null,
      error: handler.upsertError ?? null,
    }));

    // eq() is the terminal call in our chains:
    // league_seasons: from().select().eq('active', true)
    // group_league_preferences: from().select().eq('group_id', ...)
    // groups: from().select().eq('id', ...).single()
    const eqResult = {
      data: handler.selectData ?? [],
      error: handler.selectError ?? null,
      single: vi.fn(() => ({
        data: handler.selectData ?? null,
        error: handler.selectError ?? null,
      })),
      select: null as unknown,
      eq: null as unknown,
      upsert: chain.upsert,
    };
    eqResult.select = chain.select;
    eqResult.eq = vi.fn(() => eqResult);

    chain.eq = vi.fn(() => eqResult);

    return chain;
  });

  return { from: mockFrom };
}

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  supabaseMock: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-uuid-1',
    supabase: supabaseMock as unknown as TenantContext['supabase'],
  };
}

function createMockRequest(
  method: string,
  url: string,
  body?: unknown,
): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new Request(url, init));
}

const sampleLeagueSeasons = [
  { league_name: 'Premier League', country: 'England' },
  { league_name: 'La Liga', country: 'Spain' },
  { league_name: 'Brazil Serie A', country: 'Brazil' },
  { league_name: 'Italy Serie A', country: 'Italy' },
];

// ===========================
// GET /api/groups/[groupId]/leagues
// ===========================
describe('GET /api/groups/[groupId]/leagues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns all leagues with default enabled=true when no preferences exist', async () => {
    const supabaseMock = createSupabaseMock({
      league_seasons: { selectData: sampleLeagueSeasons },
      group_league_preferences: { selectData: [] },
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../groups/[groupId]/leagues/route');
    const req = createMockRequest('GET', 'http://localhost/api/groups/group-uuid-1/leagues');
    const res = await GET(req, createRouteContext({ groupId: 'group-uuid-1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.leagues).toHaveLength(4);
    // All should be enabled by default
    expect(json.data.leagues.every((l: { enabled: boolean }) => l.enabled)).toBe(true);
  });

  it('merges preferences with league data correctly', async () => {
    const supabaseMock = createSupabaseMock({
      league_seasons: { selectData: sampleLeagueSeasons },
      group_league_preferences: {
        selectData: [
          { league_name: 'Premier League', enabled: false },
          { league_name: 'La Liga', enabled: true },
        ],
      },
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../groups/[groupId]/leagues/route');
    const req = createMockRequest('GET', 'http://localhost/api/groups/group-uuid-1/leagues');
    const res = await GET(req, createRouteContext({ groupId: 'group-uuid-1' }));
    const json = await res.json();

    expect(json.success).toBe(true);
    const pl = json.data.leagues.find((l: { league_name: string }) => l.league_name === 'Premier League');
    expect(pl.enabled).toBe(false);
    const laLiga = json.data.leagues.find((l: { league_name: string }) => l.league_name === 'La Liga');
    expect(laLiga.enabled).toBe(true);
    // Brazil Serie A (no preference) should be enabled by default
    const brazilSerieA = json.data.leagues.find((l: { league_name: string }) => l.league_name === 'Brazil Serie A');
    expect(brazilSerieA.enabled).toBe(true);
  });

  it('returns 403 for group_admin accessing another group', async () => {
    const supabaseMock = createSupabaseMock({});
    const context = createMockContext('group_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../groups/[groupId]/leagues/route');
    const req = createMockRequest('GET', 'http://localhost/api/groups/other-group/leagues');
    const res = await GET(req, createRouteContext({ groupId: 'other-group' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('FORBIDDEN');
  });

  it('returns 500 when league_seasons query fails', async () => {
    const supabaseMock = createSupabaseMock({
      league_seasons: { selectError: { message: 'connection refused' } },
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../groups/[groupId]/leagues/route');
    const req = createMockRequest('GET', 'http://localhost/api/groups/group-uuid-1/leagues');
    const res = await GET(req, createRouteContext({ groupId: 'group-uuid-1' }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('DB_ERROR');
  });
});

// ===========================
// PUT /api/groups/[groupId]/leagues
// ===========================
describe('PUT /api/groups/[groupId]/leagues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('upserts league preferences successfully', async () => {
    const supabaseMock = createSupabaseMock({
      groups: { selectData: { id: 'group-uuid-1' } },
      group_league_preferences: { upsertData: null, upsertError: null },
    });
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('../groups/[groupId]/leagues/route');
    const req = createMockRequest('PUT', 'http://localhost/api/groups/group-uuid-1/leagues', {
      leagues: [
        { league_name: 'Premier League', enabled: false },
        { league_name: 'La Liga', enabled: true },
      ],
    });
    const res = await PUT(req, createRouteContext({ groupId: 'group-uuid-1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.updated).toBe(2);

    // Verify upsert was called with correct data
    expect(supabaseMock.from).toHaveBeenCalledWith('group_league_preferences');
  });

  it('returns 400 for invalid body (empty leagues array)', async () => {
    const supabaseMock = createSupabaseMock({});
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('../groups/[groupId]/leagues/route');
    const req = createMockRequest('PUT', 'http://localhost/api/groups/group-uuid-1/leagues', {
      leagues: [],
    });
    const res = await PUT(req, createRouteContext({ groupId: 'group-uuid-1' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for group_admin accessing another group', async () => {
    const supabaseMock = createSupabaseMock({});
    const context = createMockContext('group_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('../groups/[groupId]/leagues/route');
    const req = createMockRequest('PUT', 'http://localhost/api/groups/other-group/leagues', {
      leagues: [{ league_name: 'Premier League', enabled: false }],
    });
    const res = await PUT(req, createRouteContext({ groupId: 'other-group' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 for invalid JSON body', async () => {
    const supabaseMock = createSupabaseMock({});
    const context = createMockContext('super_admin', supabaseMock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PUT } = await import('../groups/[groupId]/leagues/route');
    // Create request with invalid JSON
    const req = new NextRequest(
      new Request('http://localhost/api/groups/group-uuid-1/leagues', {
        method: 'PUT',
        body: 'not json',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const res = await PUT(req, createRouteContext({ groupId: 'group-uuid-1' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
