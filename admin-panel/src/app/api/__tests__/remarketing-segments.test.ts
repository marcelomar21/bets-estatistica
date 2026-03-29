import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

type QueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
};

function createSegmentsSupabaseMock(results: QueryResult[]) {
  const sharedQuerySpies = {
    select: vi.fn(),
    eq: vi.fn(),
    lt: vi.fn(),
    gt: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    or: vi.fn(),
  };

  let fromCallIndex = 0;
  const from = vi.fn(() => {
    const currentIndex = fromCallIndex;
    fromCallIndex += 1;
    const result = results[currentIndex] ?? results[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = {};
    query.select = vi.fn((...args: unknown[]) => { sharedQuerySpies.select(...args); return query; });
    query.eq = vi.fn((...args: unknown[]) => { sharedQuerySpies.eq(...args); return query; });
    query.lt = vi.fn((...args: unknown[]) => { sharedQuerySpies.lt(...args); return query; });
    query.gt = vi.fn((...args: unknown[]) => { sharedQuerySpies.gt(...args); return query; });
    query.gte = vi.fn((...args: unknown[]) => { sharedQuerySpies.gte(...args); return query; });
    query.lte = vi.fn((...args: unknown[]) => { sharedQuerySpies.lte(...args); return query; });
    query.or = vi.fn((...args: unknown[]) => { sharedQuerySpies.or(...args); return query; });

    const resolved = { data: result.data, error: result.error, count: result.count };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query.then = (onFulfilled?: any, onRejected?: any) =>
      Promise.resolve(resolved).then(onFulfilled, onRejected);

    return query;
  });

  return { from, query: sharedQuerySpies };
}

function createMockContext(
  role: 'super_admin' | 'group_admin',
  supabaseMock: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'group_admin' ? 'group-uuid-1' : null,
    supabase: supabaseMock as unknown as TenantContext['supabase'],
  };
}

function createMockRequest(url: string): NextRequest {
  return new NextRequest(new Request(url, { method: 'GET' }));
}

describe('GET /api/remarketing/segments', () => {
  const validGroupId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('retorna 7 segmentos com contagens para super_admin', async () => {
    const counts = [42, 5, 12, 8, 3, 15, 28];
    const results = counts.map((c) => ({ data: null, error: null, count: c }));
    const supabase = createSegmentsSupabaseMock(results);
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/segments/route');
    const response = await GET(createMockRequest('http://localhost/api/remarketing/segments'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.segments).toHaveLength(7);
    expect(body.data.segments[0]).toEqual({
      key: 'trial_expired',
      label: 'Trial expirado',
      description: 'Oferta de conversao',
      count: 42,
      membersLink: null,
    });
    expect(body.data.segments[4]).toMatchObject({
      key: 'inadimplente',
      count: 3,
    });
  });

  it('aplica groupFilter para group_admin', async () => {
    const zeroResult = { data: null, error: null, count: 0 };
    const supabase = createSegmentsSupabaseMock(Array(7).fill(zeroResult));
    const context = createMockContext('group_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/segments/route');
    const response = await GET(createMockRequest('http://localhost/api/remarketing/segments'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // 7 segment queries, each should call eq('group_id', ...)
    const eqCalls = supabase.query.eq.mock.calls.filter(
      (call: unknown[]) => call[0] === 'group_id' && call[1] === 'group-uuid-1',
    );
    expect(eqCalls.length).toBe(7);
  });

  it('super_admin com group_id aplica filtro nos segmentos', async () => {
    const zeroResult = { data: null, error: null, count: 0 };
    const supabase = createSegmentsSupabaseMock(Array(7).fill(zeroResult));
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/segments/route');
    const response = await GET(
      createMockRequest(`http://localhost/api/remarketing/segments?group_id=${validGroupId}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    const eqCalls = supabase.query.eq.mock.calls.filter(
      (call: unknown[]) => call[0] === 'group_id' && call[1] === validGroupId,
    );
    expect(eqCalls.length).toBe(7);
  });

  it('retorna 400 quando group_id e invalido', async () => {
    const supabase = createSegmentsSupabaseMock([{ data: null, error: null, count: 0 }]);
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/segments/route');
    const response = await GET(
      createMockRequest('http://localhost/api/remarketing/segments?group_id=not-a-uuid'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('retorna 500 quando query falha', async () => {
    const results = [
      { data: null, error: { message: 'DB down' }, count: null },
      ...Array(6).fill({ data: null, error: null, count: 0 }),
    ];
    const supabase = createSegmentsSupabaseMock(results);
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/segments/route');
    const response = await GET(createMockRequest('http://localhost/api/remarketing/segments'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('executa 7 queries em paralelo (from chamado 7 vezes)', async () => {
    const zeroResult = { data: null, error: null, count: 0 };
    const supabase = createSegmentsSupabaseMock(Array(7).fill(zeroResult));
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/segments/route');
    await GET(createMockRequest('http://localhost/api/remarketing/segments'));

    expect(supabase.from).toHaveBeenCalledTimes(7);
  });
});
