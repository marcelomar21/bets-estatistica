import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module at the top level
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createMockRequest(method = 'GET', url = 'http://localhost'): NextRequest {
  return new NextRequest(new Request(url, { method }));
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success with status ok and timestamp (public route)', async () => {
    const { GET } = await import('@/app/api/health/route');
    const req = createMockRequest('GET', 'http://localhost/api/health');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.timestamp).toBeDefined();
    // withTenant should NOT be called for public routes
    expect(mockWithTenant).not.toHaveBeenCalled();
  });
});

describe('GET /api/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user data for super_admin', async () => {
    const context: TenantContext = {
      user: { id: 'user-sa', email: 'super@admin.com' },
      role: 'super_admin',
      groupFilter: null,
      supabase: {} as TenantContext['supabase'],
    };
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/me/route');
    const req = createMockRequest('GET', 'http://localhost/api/me');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        userId: 'user-sa',
        email: 'super@admin.com',
        role: 'super_admin',
        groupId: null,
      },
    });
  });

  it('returns user data for group_admin with groupId', async () => {
    const groupId = '550e8400-e29b-41d4-a716-446655440000';
    const context: TenantContext = {
      user: { id: 'user-ga', email: 'group@admin.com' },
      role: 'group_admin',
      groupFilter: groupId,
      supabase: {} as TenantContext['supabase'],
    };
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/me/route');
    const req = createMockRequest('GET', 'http://localhost/api/me');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        userId: 'user-ga',
        email: 'group@admin.com',
        role: 'group_admin',
        groupId,
      },
    });
  });

  it('returns 401 UNAUTHORIZED when not authenticated', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { GET } = await import('@/app/api/me/route');
    const req = createMockRequest('GET', 'http://localhost/api/me');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });
});
