import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createMockRequest(url = 'http://localhost/api/job-executions/summary'): NextRequest {
  return new NextRequest(new Request(url, { method: 'GET' }));
}

function createMockSupabase(data: unknown[] = [], error: unknown = null) {
  const mockLimit = vi.fn().mockResolvedValue({ data, error });
  const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: mockOrder,
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

describe('GET /api/job-executions/summary', () => {
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

  it('returns healthy status when no failed jobs', async () => {
    const mockData = [
      { id: '1', job_name: 'post-bets', started_at: '2026-02-25T10:00:00Z', finished_at: '2026-02-25T10:01:00Z', status: 'success', duration_ms: 1000, result: null, error_message: null },
      { id: '2', job_name: 'track-results', started_at: '2026-02-25T09:00:00Z', finished_at: '2026-02-25T09:01:00Z', status: 'success', duration_ms: 500, result: null, error_message: null },
    ];
    const mockSupabase = createMockSupabase(mockData);
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
    expect(body.data.health.status).toBe('healthy');
    expect(body.data.health.failed_count).toBe(0);
    expect(body.data.health.total_jobs).toBe(2);
    expect(body.data.health.last_error).toBeNull();
    expect(body.data.jobs).toHaveLength(2);
  });

  it('returns degraded status when a job has failed', async () => {
    const mockData = [
      { id: '1', job_name: 'post-bets', started_at: '2026-02-25T10:00:00Z', finished_at: '2026-02-25T10:01:00Z', status: 'failed', duration_ms: 1000, result: null, error_message: 'Timeout' },
      { id: '2', job_name: 'track-results', started_at: '2026-02-25T09:00:00Z', finished_at: '2026-02-25T09:01:00Z', status: 'success', duration_ms: 500, result: null, error_message: null },
    ];
    const mockSupabase = createMockSupabase(mockData);
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

    expect(body.data.health.status).toBe('degraded');
    expect(body.data.health.failed_count).toBe(1);
    expect(body.data.health.last_error).toBeDefined();
    expect(body.data.health.last_error.job_name).toBe('post-bets');
    expect(body.data.health.last_error.error_message).toBe('Timeout');
  });

  it('returns correct response shape with empty data', async () => {
    const mockSupabase = createMockSupabase([]);
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

    expect(body.success).toBe(true);
    expect(body.data.jobs).toHaveLength(0);
    expect(body.data.health.total_jobs).toBe(0);
    expect(body.data.health.status).toBe('healthy');
  });

  it('extracts latest execution per job_name', async () => {
    const mockData = [
      { id: '1', job_name: 'post-bets', started_at: '2026-02-25T12:00:00Z', finished_at: '2026-02-25T12:01:00Z', status: 'success', duration_ms: 1000, result: null, error_message: null },
      { id: '2', job_name: 'post-bets', started_at: '2026-02-25T10:00:00Z', finished_at: '2026-02-25T10:01:00Z', status: 'failed', duration_ms: 500, result: null, error_message: 'Old error' },
      { id: '3', job_name: 'track-results', started_at: '2026-02-25T11:00:00Z', finished_at: '2026-02-25T11:01:00Z', status: 'success', duration_ms: 300, result: null, error_message: null },
    ];
    const mockSupabase = createMockSupabase(mockData);
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

    // Should have 2 jobs (latest per job_name), not 3
    expect(body.data.jobs).toHaveLength(2);
    // post-bets latest is success (id: 1), not the old failed one (id: 2)
    const postBetsJob = body.data.jobs.find((j: { job_name: string }) => j.job_name === 'post-bets');
    expect(postBetsJob.status).toBe('success');
  });

  it('returns 500 on database error', async () => {
    const mockSupabase = createMockSupabase([], { message: 'DB error' });
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

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });
});
