import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createMockRequest(url = 'http://localhost/api/bets/posting-history'): NextRequest {
  return new NextRequest(new Request(url, { method: 'GET' }));
}

// Build a mock supabase that returns data for posting-history queries
function createMockSupabase(data: unknown[] = [], count = 0) {
  const mockRange = vi.fn().mockResolvedValue({ data, count, error: null });
  const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
  // Main query chain: .not('group_id', ...).eq('bet_status', 'posted') → .order → .range
  const mockMainEq = vi.fn().mockReturnValue({ order: mockOrder, eq: vi.fn().mockReturnValue({ order: mockOrder }) });
  const mockNotNull = vi.fn().mockReturnValue({ eq: mockMainEq });

  // Counter chain: .eq('bet_result', ...).eq('bet_status', 'posted').not('group_id', 'is', null)
  const mockCounterEq = vi.fn().mockResolvedValue({ count, error: null });
  const mockCounterNot = vi.fn().mockReturnValue({ eq: mockCounterEq });
  const mockCounterBetStatusEq = vi.fn().mockReturnValue({ not: mockCounterNot });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        not: mockNotNull,
        eq: vi.fn().mockReturnValue({
          eq: mockCounterBetStatusEq,
          not: mockCounterNot,
        }),
      }),
    }),
  };
}

function createTenantContext(role: 'super_admin' | 'group_admin' = 'super_admin', groupFilter: string | null = null): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter,
    supabase: createMockSupabase() as unknown as TenantContext['supabase'],
  };
}

describe('GET /api/bets/posting-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 400 for invalid group_id', async () => {
    const context = createTenantContext('super_admin', null);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../route');
    const req = createMockRequest('http://localhost/api/bets/posting-history?group_id=invalid');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid sort_by field', async () => {
    const context = createTenantContext('super_admin', null);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../route');
    const req = createMockRequest('http://localhost/api/bets/posting-history?sort_by=invalid_field');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('ordenacao');
  });

  it('returns 400 for invalid sort_dir', async () => {
    const context = createTenantContext('super_admin', null);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../route');
    const req = createMockRequest('http://localhost/api/bets/posting-history?sort_dir=up');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('calls supabase with correct filters for super_admin', async () => {
    const mockSupabase = createMockSupabase([{ id: 1 }], 1);
    const context: TenantContext = {
      user: { id: 'user-1', email: 'admin@test.com' },
      role: 'super_admin',
      groupFilter: null,
      supabase: mockSupabase as unknown as TenantContext['supabase'],
    };
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../route');
    const req = createMockRequest('http://localhost/api/bets/posting-history');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.pagination).toBeDefined();
    expect(body.data.counters).toBeDefined();
    // Verify from() was called
    expect(mockSupabase.from).toHaveBeenCalledWith('suggested_bets');
  });

  it('returns correct response shape with counters', async () => {
    const mockSupabase = createMockSupabase([], 0);
    const context: TenantContext = {
      user: { id: 'user-1', email: 'admin@test.com' },
      role: 'super_admin',
      groupFilter: null,
      supabase: mockSupabase as unknown as TenantContext['supabase'],
    };
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../route');
    const req = createMockRequest('http://localhost/api/bets/posting-history');
    const response = await GET(req);
    const body = await response.json();

    expect(body.data.counters).toHaveProperty('total');
    expect(body.data.counters).toHaveProperty('success');
    expect(body.data.counters).toHaveProperty('failure');
    expect(body.data.counters).toHaveProperty('hit_rate');
    expect(body.data.pagination).toHaveProperty('page');
    expect(body.data.pagination).toHaveProperty('per_page');
    expect(body.data.pagination).toHaveProperty('total');
    expect(body.data.pagination).toHaveProperty('total_pages');
  });

  it('returns 401 when not authenticated', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { GET } = await import('../route');
    const req = createMockRequest('http://localhost/api/bets/posting-history');
    const response = await GET(req);

    expect(response.status).toBe(401);
  });
});
