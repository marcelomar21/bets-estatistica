import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Mock supabase-js createClient (for signed URL generation in pdf route)
const mockCreateSignedUrl = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: mockCreateSignedUrl,
      }),
    },
  }),
}));

function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function createMockRequest(method: string, url: string): NextRequest {
  return new NextRequest(new Request(url, { method }));
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

// ============================================================
// Helper: query builder for GET /api/analyses
// ============================================================
function createAnalysesQueryBuilder(options: {
  disabledPrefsData?: { league_name: string }[];
  disabledPrefsError?: { message: string } | null;
  activeLeaguesData?: { league_name: string }[];
  activeLeaguesError?: { message: string } | null;
  analysesData?: unknown[];
  analysesError?: { message: string } | null;
} = {}) {
  let fromCallIndex = 0;

  const mockFrom = vi.fn((_table: string) => {
    fromCallIndex++;

    // For group_admin: 1st call = group_league_preferences, 2nd = league_seasons (if disabled exist), then game_analysis
    // For super_admin: 1st call = game_analysis

    if (_table === 'group_league_preferences') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      // Terminal: last .eq() returns data
      let eqCount = 0;
      chain.eq = vi.fn(() => {
        eqCount++;
        if (eqCount >= 2) {
          return {
            data: options.disabledPrefsData ?? [],
            error: options.disabledPrefsError ?? null,
          };
        }
        return chain;
      });
      return chain;
    }

    if (_table === 'league_seasons') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => ({
        data: options.activeLeaguesData ?? [],
        error: options.activeLeaguesError ?? null,
      }));
      return chain;
    }

    // game_analysis query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.lt = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.order = vi.fn(() => ({
      data: options.analysesData ?? [],
      error: options.analysesError ?? null,
    }));
    return chain;
  });

  return { from: mockFrom };
}

// ============================================================
// Helper: query builder for GET /api/analyses/[id]/pdf
// ============================================================
function createPdfQueryBuilder(options: {
  analysis?: { id: number; match_id: number; pdf_storage_path: string | null } | null;
  fetchError?: { message: string } | null;
  matchData?: { season_id: number; league_seasons: { league_name: string } } | null;
  prefData?: { enabled: boolean } | null;
} = {}) {
  const mockFrom = vi.fn((_table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);

    if (_table === 'game_analysis') {
      chain.single = vi.fn(() => ({
        data: options.analysis ?? null,
        error: options.fetchError ?? null,
      }));
    } else if (_table === 'league_matches') {
      chain.single = vi.fn(() => ({
        data: options.matchData ?? null,
        error: null,
      }));
    } else if (_table === 'group_league_preferences') {
      chain.maybeSingle = vi.fn(() => ({
        data: options.prefData ?? null,
        error: null,
      }));
    }

    return chain;
  });

  return { from: mockFrom };
}

// ============================================================
// GET /api/analyses
// ============================================================
describe('GET /api/analyses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns list of analyses for super admin', async () => {
    const analysesData = [
      {
        id: 1,
        match_id: 100,
        pdf_storage_path: '100/analysis.pdf',
        pdf_uploaded_at: '2026-02-25T10:00:00Z',
        created_at: '2026-02-25T09:00:00Z',
        updated_at: '2026-02-25T10:00:00Z',
        league_matches: {
          home_team_name: 'Flamengo',
          away_team_name: 'Palmeiras',
          kickoff_time: '2026-02-25T20:00:00Z',
          league_seasons: { league_name: 'Brazil Serie A' },
        },
      },
    ];
    const qb = createAnalysesQueryBuilder({ analysesData });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].league_matches.home_team_name).toBe('Flamengo');
  });

  it('returns all analyses when group admin has no disabled leagues', async () => {
    const analysesData = [
      {
        id: 1,
        match_id: 100,
        league_matches: {
          home_team_name: 'TeamA',
          away_team_name: 'TeamB',
          kickoff_time: '2026-02-25T20:00:00Z',
          league_seasons: { league_name: 'Brazil Serie A' },
        },
      },
    ];
    const qb = createAnalysesQueryBuilder({ disabledPrefsData: [], analysesData });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    // group_league_preferences was queried but league_seasons was NOT (no disabled leagues)
    expect(qb.from).toHaveBeenCalledWith('group_league_preferences');
    expect(qb.from).not.toHaveBeenCalledWith('league_seasons');
  });

  it('filters by enabled leagues when group admin has disabled leagues', async () => {
    const analysesData = [
      {
        id: 1,
        match_id: 100,
        league_matches: {
          home_team_name: 'TeamA',
          away_team_name: 'TeamB',
          kickoff_time: '2026-02-25T20:00:00Z',
          league_seasons: { league_name: 'Brazil Serie A' },
        },
      },
    ];
    const qb = createAnalysesQueryBuilder({
      disabledPrefsData: [{ league_name: 'England Premier League' }],
      activeLeaguesData: [
        { league_name: 'Brazil Serie A' },
        { league_name: 'England Premier League' },
        { league_name: 'Spain La Liga' },
      ],
      analysesData,
    });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Verify both tables were queried
    expect(qb.from).toHaveBeenCalledWith('group_league_preferences');
    expect(qb.from).toHaveBeenCalledWith('league_seasons');
    expect(qb.from).toHaveBeenCalledWith('game_analysis');
  });

  it('returns empty data when all leagues are disabled for group admin', async () => {
    const qb = createAnalysesQueryBuilder({
      disabledPrefsData: [
        { league_name: 'Brazil Serie A' },
        { league_name: 'England Premier League' },
      ],
      activeLeaguesData: [
        { league_name: 'Brazil Serie A' },
        { league_name: 'England Premier League' },
      ],
    });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    // game_analysis should NOT have been queried
    expect(qb.from).not.toHaveBeenCalledWith('game_analysis');
  });

  it('applies date filter', async () => {
    const qb = createAnalysesQueryBuilder({ analysesData: [] });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses?date=2026-02-25');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    const chain = qb.from.mock.results[0].value;
    expect(chain.gte).toHaveBeenCalledWith('league_matches.kickoff_time', '2026-02-25T00:00:00');
    expect(chain.lt).toHaveBeenCalledWith('league_matches.kickoff_time', '2026-02-25T23:59:59');
  });

  it('applies team filter', async () => {
    const qb = createAnalysesQueryBuilder({ analysesData: [] });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses?team=Flamengo');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    const chain = qb.from.mock.results[0].value;
    expect(chain.or).toHaveBeenCalledWith(
      'home_team_name.ilike.%Flamengo%,away_team_name.ilike.%Flamengo%',
      { referencedTable: 'league_matches' },
    );
  });

  it('returns 500 on DB error', async () => {
    const qb = createAnalysesQueryBuilder({ analysesError: { message: 'connection lost' } });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('returns 500 when group_league_preferences query fails', async () => {
    const qb = createAnalysesQueryBuilder({
      disabledPrefsError: { message: 'db error' },
    });
    // Override: make the eq chain return error
    let eqCount = 0;
    const mockFrom = vi.fn((_table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => {
        eqCount++;
        if (eqCount >= 2) {
          return { data: null, error: { message: 'db error' } };
        }
        return chain;
      });
      return chain;
    });
    const customQb = { from: mockFrom };
    const context = createMockContext('group_admin', customQb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });
});

// ============================================================
// GET /api/analyses/[id]/pdf
// ============================================================
describe('GET /api/analyses/[id]/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns signed URL for analysis with PDF', async () => {
    const qb = createPdfQueryBuilder({
      analysis: { id: 1, match_id: 100, pdf_storage_path: '100/analysis.pdf' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.supabase.co/signed/100/analysis.pdf?token=abc' },
      error: null,
    });

    const { GET } = await import('@/app/api/analyses/[id]/pdf/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses/1/pdf');
    const routeContext = createRouteContext({ id: '1' });

    const response = await GET(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.url).toContain('signed');
    expect(body.data.expiresAt).toBeDefined();
  });

  it('returns 404 when analysis has no PDF', async () => {
    const qb = createPdfQueryBuilder({
      analysis: { id: 1, match_id: 100, pdf_storage_path: null },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/[id]/pdf/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses/1/pdf');
    const routeContext = createRouteContext({ id: '1' });

    const response = await GET(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('PDF');
  });

  it('returns 404 when analysis not found', async () => {
    const qb = createPdfQueryBuilder({ fetchError: { message: 'not found' } });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/[id]/pdf/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses/999/pdf');
    const routeContext = createRouteContext({ id: '999' });

    const response = await GET(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid ID', async () => {
    const qb = createPdfQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/[id]/pdf/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses/abc/pdf');
    const routeContext = createRouteContext({ id: 'abc' });

    const response = await GET(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('allows group admin access when league is enabled (no preference = default enabled)', async () => {
    const qb = createPdfQueryBuilder({
      analysis: { id: 1, match_id: 100, pdf_storage_path: '100/analysis.pdf' },
      matchData: { season_id: 1, league_seasons: { league_name: 'Brazil Serie A' } },
      prefData: null, // No preference → default enabled
    });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.supabase.co/signed/100/analysis.pdf?token=abc' },
      error: null,
    });

    const { GET } = await import('@/app/api/analyses/[id]/pdf/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses/1/pdf');
    const routeContext = createRouteContext({ id: '1' });

    const response = await GET(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.url).toContain('signed');
  });

  it('allows group admin access when league is explicitly enabled', async () => {
    const qb = createPdfQueryBuilder({
      analysis: { id: 1, match_id: 100, pdf_storage_path: '100/analysis.pdf' },
      matchData: { season_id: 1, league_seasons: { league_name: 'Brazil Serie A' } },
      prefData: { enabled: true },
    });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.supabase.co/signed/100/analysis.pdf?token=abc' },
      error: null,
    });

    const { GET } = await import('@/app/api/analyses/[id]/pdf/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses/1/pdf');
    const routeContext = createRouteContext({ id: '1' });

    const response = await GET(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 403 for group admin when league is disabled', async () => {
    const qb = createPdfQueryBuilder({
      analysis: { id: 1, match_id: 100, pdf_storage_path: '100/analysis.pdf' },
      matchData: { season_id: 1, league_seasons: { league_name: 'England Premier League' } },
      prefData: { enabled: false },
    });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/[id]/pdf/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses/1/pdf');
    const routeContext = createRouteContext({ id: '1' });

    const response = await GET(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 when match not found in league_matches', async () => {
    const qb = createPdfQueryBuilder({
      analysis: { id: 1, match_id: 100, pdf_storage_path: '100/analysis.pdf' },
      matchData: null, // match not found
    });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/analyses/[id]/pdf/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses/1/pdf');
    const routeContext = createRouteContext({ id: '1' });

    const response = await GET(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 500 when signed URL generation fails', async () => {
    const qb = createPdfQueryBuilder({
      analysis: { id: 1, match_id: 100, pdf_storage_path: '100/analysis.pdf' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'storage error' },
    });

    const { GET } = await import('@/app/api/analyses/[id]/pdf/route');
    const req = createMockRequest('GET', 'http://localhost/api/analyses/1/pdf');
    const routeContext = createRouteContext({ id: '1' });

    const response = await GET(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('STORAGE_ERROR');
  });
});
