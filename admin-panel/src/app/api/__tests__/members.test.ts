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

function createMembersSupabaseMock(result: QueryResult) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.gte = vi.fn(() => query);
  query.lte = vi.fn(() => query);
  query.lt = vi.fn(() => query);
  query.ilike = vi.fn(() => query);
  query.or = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.range = vi.fn(async () => ({
    data: result.data,
    error: result.error,
    count: result.count,
  }));

  // Make chain thenable for head queries (counter queries use select with head: true)
  const resolved = { data: result.data, error: result.error, count: result.count };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query.then = (onFulfilled?: any, onRejected?: any) =>
    Promise.resolve(resolved).then(onFulfilled, onRejected);

  const from = vi.fn(() => query);
  return { from, query };
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

describe('GET /api/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('retorna membros para super_admin com join em groups(name)', async () => {
    const rows = [
      {
        id: 1,
        telegram_id: 123,
        telegram_username: 'alice',
        status: 'ativo',
        subscription_ends_at: '2026-02-20T00:00:00Z',
        created_at: '2026-02-01T00:00:00Z',
        group_id: 'group-1',
        groups: { name: 'Grupo Alpha' },
      },
    ];
    const supabase = createMembersSupabaseMock({ data: rows, error: null, count: 1 });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/members/route');
    const response = await GET(createMockRequest('http://localhost/api/members'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual(rows);
    expect(supabase.query.select).toHaveBeenCalledWith(
      'id, telegram_id, telegram_username, status, subscription_ends_at, created_at, group_id, groups(name)',
      { count: 'exact' },
    );
    expect(supabase.query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(supabase.query.range).toHaveBeenCalledWith(0, 49);
    expect(supabase.query.eq).not.toHaveBeenCalledWith('group_id', expect.any(String));
    expect(body.data.counters).toBeDefined();
    expect(body.data.counters.total).toBe(1);
  });

  it('retorna apenas membros do group_admin com filtro explícito por group_id', async () => {
    const rows = [
      {
        id: 10,
        telegram_id: 1000,
        telegram_username: 'groupadmin-member',
        status: 'trial',
        subscription_ends_at: null,
        created_at: '2026-02-08T00:00:00Z',
        group_id: 'group-uuid-1',
      },
    ];
    const supabase = createMembersSupabaseMock({ data: rows, error: null, count: 1 });
    const context = createMockContext('group_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/members/route');
    const response = await GET(createMockRequest('http://localhost/api/members'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual(rows);
    expect(supabase.query.select).toHaveBeenCalledWith(
      'id, telegram_id, telegram_username, status, subscription_ends_at, created_at, group_id',
      { count: 'exact' },
    );
    expect(supabase.query.eq).toHaveBeenCalledWith('group_id', 'group-uuid-1');
  });

  it('aplica filtro por status simples', async () => {
    const supabase = createMembersSupabaseMock({ data: [], error: null, count: 0 });
    const context = createMockContext('group_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/members/route');
    await GET(createMockRequest('http://localhost/api/members?status=trial'));

    expect(supabase.query.eq).toHaveBeenCalledWith('status', 'trial');
  });

  it('aplica filtro especial vencendo (ativo + intervalo de 7 dias)', async () => {
    const supabase = createMembersSupabaseMock({ data: [], error: null, count: 0 });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/members/route');
    await GET(createMockRequest('http://localhost/api/members?status=vencendo'));

    expect(supabase.query.eq).toHaveBeenCalledWith('status', 'ativo');
    expect(supabase.query.gte).toHaveBeenCalledWith('subscription_ends_at', expect.any(String));
    expect(supabase.query.lte).toHaveBeenCalledWith('subscription_ends_at', expect.any(String));
  });

  it('aplica filtro especial expirado (ativo + vencimento no passado)', async () => {
    const supabase = createMembersSupabaseMock({ data: [], error: null, count: 0 });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/members/route');
    await GET(createMockRequest('http://localhost/api/members?status=expirado'));

    expect(supabase.query.eq).toHaveBeenCalledWith('status', 'ativo');
    expect(supabase.query.lt).toHaveBeenCalledWith('subscription_ends_at', expect.any(String));
  });

  it('aplica busca por username com ilike', async () => {
    const supabase = createMembersSupabaseMock({ data: [], error: null, count: 0 });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/members/route');
    await GET(createMockRequest('http://localhost/api/members?search=joao'));

    expect(supabase.query.ilike).toHaveBeenCalledWith('telegram_username', '%joao%');
  });

  it('aplica paginação com page e per_page', async () => {
    const supabase = createMembersSupabaseMock({ data: [], error: null, count: 0 });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/members/route');
    await GET(createMockRequest('http://localhost/api/members?page=3&per_page=25'));

    expect(supabase.query.range).toHaveBeenCalledWith(50, 74);
  });

  it('retorna 500 quando query falha', async () => {
    const supabase = createMembersSupabaseMock({
      data: null,
      error: { message: 'DB indisponível' },
      count: null,
    });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/members/route');
    const response = await GET(createMockRequest('http://localhost/api/members'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('processa resposta paginada em tempo aceitavel (latencia do handler)', async () => {
    const pageItems = Array.from({ length: 50 }, (_, idx) => ({
      id: idx + 1,
      telegram_id: 100000 + idx,
      telegram_username: `user-${idx}`,
      status: idx % 2 === 0 ? 'ativo' : 'trial',
      subscription_ends_at: idx % 2 === 0 ? '2026-02-20T00:00:00Z' : null,
      created_at: '2026-02-01T00:00:00Z',
      group_id: 'group-1',
      groups: { name: 'Grupo Alpha' },
    }));

    const supabase = createMembersSupabaseMock({
      data: pageItems,
      error: null,
      count: 10_000,
    });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/members/route');

    const start = performance.now();
    const response = await GET(createMockRequest('http://localhost/api/members?page=1&per_page=50'));
    const elapsedMs = performance.now() - start;

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toHaveLength(50);
    expect(body.data.pagination.total).toBe(10_000);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
