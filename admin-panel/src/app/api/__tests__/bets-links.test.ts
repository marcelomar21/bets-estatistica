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

function createLinkUpdateQueryBuilder(options: {
  currentBet?: unknown;
  fetchError?: { message: string; code?: string } | null;
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

const baseBet = {
  id: 1,
  odds: 1.85,
  deep_link: null,
  bet_status: 'pending_link',
  promovida_manual: false,
};

// ============================================================
// PATCH /api/bets/[id]/link
// ============================================================
describe('PATCH /api/bets/[id]/link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('updates link with valid https URL', async () => {
    const qb = createLinkUpdateQueryBuilder({
      currentBet: { ...baseBet, deep_link: null },
      updatedBet: { ...baseBet, deep_link: 'https://bet365.com/link', bet_status: 'ready' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: 'https://bet365.com/link' });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.old_link).toBeNull();
    expect(body.data.new_link).toBe('https://bet365.com/link');
  });

  it('rejects link without protocol', async () => {
    const qb = createLinkUpdateQueryBuilder({ currentBet: baseBet });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: 'bet365.com/link' });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('http://');
  });

  it('allows clearing link with null', async () => {
    const currentBet = { ...baseBet, deep_link: 'https://bet365.com/link', bet_status: 'ready', odds: 1.85 };
    const qb = createLinkUpdateQueryBuilder({
      currentBet,
      updatedBet: { ...currentBet, deep_link: null, bet_status: 'pending_link' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: null });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.new_link).toBeNull();
    expect(body.data.old_link).toBe('https://bet365.com/link');
  });

  it('rejects URL longer than 2048 characters', async () => {
    const qb = createLinkUpdateQueryBuilder({ currentBet: baseBet });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const longUrl = 'https://example.com/' + 'a'.repeat(2040);

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: longUrl });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('2048');
  });

  it('auto-promotes when link + odds >= 1.60', async () => {
    const currentBet = { ...baseBet, odds: 1.85, deep_link: null, bet_status: 'pending_link' };
    const updatedBet = { ...currentBet, deep_link: 'https://bet365.com/link', bet_status: 'ready' };
    const qb = createLinkUpdateQueryBuilder({ currentBet, updatedBet });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: 'https://bet365.com/link' });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.promoted).toBe(true);
  });

  it('sets pending_odds when link added but no valid odds', async () => {
    const currentBet = { ...baseBet, odds: null, deep_link: null, bet_status: 'generated' };
    const qb = createLinkUpdateQueryBuilder({ currentBet });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: 'https://bet365.com/link' });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.promoted).toBe(false);
  });

  it('returns 404 when bet not found', async () => {
    const qb = createLinkUpdateQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/999/link', { link: 'https://bet365.com' });
    const routeContext = createRouteContext({ id: '999' });

    const response = await PATCH(req, routeContext);

    expect(response.status).toBe(404);
  });

  it('returns 500 when fetch fails with DB error', async () => {
    const qb = createLinkUpdateQueryBuilder({
      fetchError: { message: 'connection lost', code: '08006' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: 'https://bet365.com/abc' });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('rejects payload without link field', async () => {
    const qb = createLinkUpdateQueryBuilder({ currentBet: baseBet });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', {});
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('link');
  });

  it('rejects payload with invalid link type', async () => {
    const qb = createLinkUpdateQueryBuilder({ currentBet: baseBet });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: 123 });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('string ou null');
  });

  it('returns 403 for group_admin', async () => {
    const qb = createLinkUpdateQueryBuilder();
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: 'https://bet365.com' });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);

    expect(response.status).toBe(403);
  });

  it('skips update when link did not change', async () => {
    const currentBet = { ...baseBet, deep_link: 'https://bet365.com/link', bet_status: 'ready' };
    const qb = createLinkUpdateQueryBuilder({ currentBet });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: 'https://bet365.com/link' });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.promoted).toBe(false);
    // Should not have called update (only 1 from call for fetch)
    expect(qb.from).toHaveBeenCalledTimes(1);
  });

  it('regresses ready to pending_link when clearing link from bet with valid odds', async () => {
    const currentBet = { ...baseBet, odds: 1.85, deep_link: 'https://bet365.com/link', bet_status: 'ready' };
    const updatedBet = { ...currentBet, deep_link: null, bet_status: 'pending_link' };
    const qb = createLinkUpdateQueryBuilder({ currentBet, updatedBet });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: null });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.bet.bet_status).toBe('pending_link');
    // Verify update was called (from called 3 times: fetch, update, re-fetch)
    expect(qb.from).toHaveBeenCalledTimes(3);
  });

  it('regresses pending_odds to generated when clearing link with no valid odds', async () => {
    const currentBet = { ...baseBet, odds: null, deep_link: 'https://bet365.com/link', bet_status: 'pending_odds' };
    const updatedBet = { ...currentBet, deep_link: null, bet_status: 'generated' };
    const qb = createLinkUpdateQueryBuilder({ currentBet, updatedBet });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/link/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/bets/1/link', { link: null });
    const routeContext = createRouteContext({ id: '1' });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.bet.bet_status).toBe('generated');
    expect(qb.from).toHaveBeenCalledTimes(3);
  });
});

// ============================================================
// POST /api/bets/bulk/links
// ============================================================
describe('POST /api/bets/bulk/links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  function createBulkQueryBuilder(options: {
    bets?: Record<number, unknown>;
    updateErrors?: Record<number, { message: string }>;
    fetchErrors?: Record<number, { message: string; code?: string }>;
  } = {}) {
    const bets = options.bets ?? {};
    const updateErrors = options.updateErrors ?? {};
    const fetchErrors = options.fetchErrors ?? {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockFrom = vi.fn((_table: string) => {
      let isUpdate = false;
      let currentId = 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => { isUpdate = false; return chain; });
      chain.update = vi.fn(() => { isUpdate = true; return chain; });
      chain.eq = vi.fn((col: string, val: unknown) => {
        if (col === 'id') currentId = val as number;
        if (isUpdate) {
          const updateErr = updateErrors[currentId];
          return { data: null, error: updateErr ?? null };
        }
        return chain;
      });
      chain.single = vi.fn(() => {
        const fetchError = fetchErrors[currentId];
        if (fetchError) {
          return { data: null, error: fetchError };
        }
        const bet = bets[currentId];
        return { data: bet ?? null, error: bet ? null : { message: 'not found', code: 'PGRST116' } };
      });
      return chain;
    });

    return { from: mockFrom };
  }

  it('processes valid bulk update with 3 items', async () => {
    const bets: Record<number, unknown> = {
      1: { odds: 1.85, deep_link: null, bet_status: 'pending_link', promovida_manual: false },
      2: { odds: 2.10, deep_link: null, bet_status: 'pending_link', promovida_manual: false },
      3: { odds: 1.50, deep_link: null, bet_status: 'generated', promovida_manual: false },
    };
    const qb = createBulkQueryBuilder({ bets });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/links/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/links', {
      updates: [
        { id: 1, link: 'https://bet365.com/1' },
        { id: 2, link: 'https://bet365.com/2' },
        { id: 3, link: 'https://bet365.com/3' },
      ],
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(3);
    // Bets 1,2 have odds >= 1.60, so they get promoted. Bet 3 has odds 1.50, no promotion.
    expect(body.data.promoted).toBe(2);
  });

  it('rejects empty updates array', async () => {
    const qb = createBulkQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/links/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/links', { updates: [] });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects more than 50 items', async () => {
    const qb = createBulkQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const updates = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, link: `https://example.com/${i}` }));

    const { POST } = await import('@/app/api/bets/bulk/links/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/links', { updates });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toContain('50');
  });

  it('handles partial failure (1 of 3 fails)', async () => {
    const bets: Record<number, unknown> = {
      1: { odds: 1.85, deep_link: null, bet_status: 'pending_link', promovida_manual: false },
      // id 2 not found
      3: { odds: 1.85, deep_link: null, bet_status: 'pending_link', promovida_manual: false },
    };
    const qb = createBulkQueryBuilder({ bets });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/links/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/links', {
      updates: [
        { id: 1, link: 'https://bet365.com/1' },
        { id: 2, link: 'https://bet365.com/2' },
        { id: 3, link: 'https://bet365.com/3' },
      ],
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(2);
    expect(body.data.failed).toBe(1);
    expect(body.data.errors).toHaveLength(1);
    expect(body.data.errors[0].id).toBe(2);
  });

  it('returns 403 for group_admin', async () => {
    const qb = createBulkQueryBuilder();
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/links/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/links', {
      updates: [{ id: 1, link: 'https://bet365.com' }],
    });

    const response = await POST(req);

    expect(response.status).toBe(403);
  });

  it('validates URL for each item in bulk', async () => {
    const qb = createBulkQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/links/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/links', {
      updates: [
        { id: 1, link: 'bet365.com/invalid' },
      ],
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('http://');
  });

  it('rejects duplicated IDs in bulk payload', async () => {
    const qb = createBulkQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/links/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/links', {
      updates: [
        { id: 1, link: 'https://bet365.com/1' },
        { id: 1, link: 'https://bet365.com/2' },
      ],
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('duplicado');
  });

  it('rejects item without link field in bulk payload', async () => {
    const qb = createBulkQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/links/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/links', {
      updates: [
        { id: 1 },
      ],
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('link');
  });

  it('keeps partial processing and reports DB_ERROR when a fetch fails', async () => {
    const bets: Record<number, unknown> = {
      1: { odds: 1.85, deep_link: null, bet_status: 'pending_link', promovida_manual: false },
      3: { odds: 1.90, deep_link: null, bet_status: 'pending_link', promovida_manual: false },
    };
    const fetchErrors = {
      2: { message: 'connection lost', code: '08006' },
    };
    const qb = createBulkQueryBuilder({ bets, fetchErrors });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/bulk/links/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/bulk/links', {
      updates: [
        { id: 1, link: 'https://bet365.com/1' },
        { id: 2, link: 'https://bet365.com/2' },
        { id: 3, link: 'https://bet365.com/3' },
      ],
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(2);
    expect(body.data.failed).toBe(1);
    expect(body.data.errors[0].error).toContain('DB_ERROR');
  });
});
