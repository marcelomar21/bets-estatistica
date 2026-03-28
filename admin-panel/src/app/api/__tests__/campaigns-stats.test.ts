import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  rpcData: unknown = [],
  rpcError: { message: string } | null = null,
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-uuid-1',
    supabase: {
      rpc: vi.fn().mockResolvedValue({ data: rpcData, error: rpcError }),
    } as unknown as TenantContext['supabase'],
  };
}

function createMockRequest(url: string): NextRequest {
  return new NextRequest(new Request(url, { method: 'GET' }));
}

const sampleAffiliates = [
  {
    code: 'PARTNER_001',
    clicks: 50,
    unique_members: 20,
    trials: 5,
    active_members: 10,
    cancelled: 3,
    last_click_at: '2026-03-25T14:30:00Z',
  },
  {
    code: 'PARTNER_002',
    clicks: 30,
    unique_members: 10,
    trials: 2,
    active_members: 3,
    cancelled: 1,
    last_click_at: '2026-03-10T10:00:00Z',
  },
];

describe('GET /api/campaigns/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns affiliate stats with summary for super_admin', async () => {
    const context = createMockContext('super_admin', sampleAffiliates);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/campaigns/stats/route');
    const req = createMockRequest('http://localhost/api/campaigns/stats');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.summary.totalAffiliates).toBe(2);
    expect(body.data.summary.totalClicks).toBe(80);
    expect(body.data.summary.globalConversionRate).toBeCloseTo(43.3, 0);
    expect(body.data.affiliates).toHaveLength(2);
    expect(body.data.affiliates[0].code).toBe('PARTNER_001');
    expect(body.data.affiliates[0].conversionRate).toBe(50);
  });

  it('passes groupFilter for group_admin', async () => {
    const context = createMockContext('group_admin', []);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/campaigns/stats/route');
    const req = createMockRequest('http://localhost/api/campaigns/stats');
    await GET(req);

    expect(context.supabase.rpc).toHaveBeenCalledWith('get_affiliate_stats', {
      p_group_id: 'group-uuid-1',
      p_since: expect.any(String),
    });
  });

  it('passes null group_id for super_admin', async () => {
    const context = createMockContext('super_admin', []);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/campaigns/stats/route');
    const req = createMockRequest('http://localhost/api/campaigns/stats');
    await GET(req);

    expect(context.supabase.rpc).toHaveBeenCalledWith('get_affiliate_stats', {
      p_group_id: null,
      p_since: expect.any(String),
    });
  });

  it('uses default period 30d when not specified', async () => {
    const context = createMockContext('super_admin', []);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/campaigns/stats/route');
    const req = createMockRequest('http://localhost/api/campaigns/stats');
    await GET(req);

    const rpcCall = vi.mocked(context.supabase.rpc).mock.calls[0];
    const sinceDate = new Date(rpcCall[1].p_since as string);
    const daysDiff = (Date.now() - sinceDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeCloseTo(30, 0);
  });

  it('passes null p_since for period=all', async () => {
    const context = createMockContext('super_admin', []);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/campaigns/stats/route');
    const req = createMockRequest('http://localhost/api/campaigns/stats?period=all');
    await GET(req);

    expect(context.supabase.rpc).toHaveBeenCalledWith('get_affiliate_stats', {
      p_group_id: null,
      p_since: null,
    });
  });

  it('returns 400 for invalid period', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/campaigns/stats/route');
    const req = createMockRequest('http://localhost/api/campaigns/stats?period=invalid');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 on database error', async () => {
    const context = createMockContext('super_admin', null, { message: 'function not found' });
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/campaigns/stats/route');
    const req = createMockRequest('http://localhost/api/campaigns/stats');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('returns 401 when not authenticated', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { GET } = await import('@/app/api/campaigns/stats/route');
    const req = createMockRequest('http://localhost/api/campaigns/stats');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns empty data when no affiliates exist', async () => {
    const context = createMockContext('super_admin', []);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/campaigns/stats/route');
    const req = createMockRequest('http://localhost/api/campaigns/stats');
    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.summary.totalAffiliates).toBe(0);
    expect(body.data.summary.totalClicks).toBe(0);
    expect(body.data.summary.globalConversionRate).toBe(0);
    expect(body.data.affiliates).toEqual([]);
  });

  it('handles 7d period correctly', async () => {
    const context = createMockContext('super_admin', []);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/campaigns/stats/route');
    const req = createMockRequest('http://localhost/api/campaigns/stats?period=7d');
    await GET(req);

    const rpcCall = vi.mocked(context.supabase.rpc).mock.calls[0];
    const sinceDate = new Date(rpcCall[1].p_since as string);
    const daysDiff = (Date.now() - sinceDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeCloseTo(7, 0);
  });
});
