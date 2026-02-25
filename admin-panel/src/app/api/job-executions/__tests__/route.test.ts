import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createMockRequest(url = 'http://localhost/api/job-executions'): NextRequest {
  return new NextRequest(new Request(url, { method: 'GET' }));
}

function createMockSupabase(data: unknown[] = [], count = 0, error: unknown = null) {
  const mockRange = vi.fn().mockResolvedValue({ data, count, error });
  const mockOrder = vi.fn().mockReturnValue({ range: mockRange });
  const mockEqChain = vi.fn().mockReturnValue({ order: mockOrder, eq: vi.fn().mockReturnValue({ order: mockOrder }) });

  // Counter chain
  const mockCounterEq = vi.fn().mockResolvedValue({ count, error: null });
  const mockCounterHead = vi.fn().mockReturnValue({ eq: mockCounterEq });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: mockOrder,
        eq: mockEqChain,
      }),
    }),
  };
}

function createTenantContext(role: 'super_admin' | 'group_admin' = 'super_admin'): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: null,
    supabase: createMockSupabase() as unknown as TenantContext['supabase'],
  };
}

describe('GET /api/job-executions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { GET } = await import('../route');
    const req = createMockRequest();
    const response = await GET(req);

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid status filter', async () => {
    const context = createTenantContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../route');
    const req = createMockRequest('http://localhost/api/job-executions?status=invalid');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid sort_dir', async () => {
    const context = createTenantContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../route');
    const req = createMockRequest('http://localhost/api/job-executions?sort_dir=up');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('calls supabase and returns correct response shape', async () => {
    const mockSupabase = createMockSupabase([{ id: '1', job_name: 'post-bets', status: 'success' }], 1);
    const context: TenantContext = {
      user: { id: 'user-1', email: 'admin@test.com' },
      role: 'super_admin',
      groupFilter: null,
      supabase: mockSupabase as unknown as TenantContext['supabase'],
    };
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../route');
    const req = createMockRequest();
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.pagination).toBeDefined();
    expect(body.data.counters).toBeDefined();
    expect(body.data.counters).toHaveProperty('total');
    expect(body.data.counters).toHaveProperty('success');
    expect(body.data.counters).toHaveProperty('failed');
    expect(body.data.counters).toHaveProperty('success_rate');
    expect(mockSupabase.from).toHaveBeenCalledWith('job_executions');
  });

  it('uses default pagination when no params', async () => {
    const mockSupabase = createMockSupabase([], 0);
    const context: TenantContext = {
      user: { id: 'user-1', email: 'admin@test.com' },
      role: 'super_admin',
      groupFilter: null,
      supabase: mockSupabase as unknown as TenantContext['supabase'],
    };
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../route');
    const req = createMockRequest();
    const response = await GET(req);
    const body = await response.json();

    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.per_page).toBe(50);
  });

  it('applies job_name filter when provided', async () => {
    const mockSupabase = createMockSupabase([], 0);
    const context: TenantContext = {
      user: { id: 'user-1', email: 'admin@test.com' },
      role: 'super_admin',
      groupFilter: null,
      supabase: mockSupabase as unknown as TenantContext['supabase'],
    };
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('../route');
    const req = createMockRequest('http://localhost/api/job-executions?job_name=post-bets');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
