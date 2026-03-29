import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createExportSupabaseMock(
  result: { data: unknown[] | null; error: { message: string } | null; count?: number | null },
) {
  const sharedQuerySpies = {
    select: vi.fn(),
    eq: vi.fn(),
    lt: vi.fn(),
    gt: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };

  const from = vi.fn(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = {};
    query.select = vi.fn((...args: unknown[]) => { sharedQuerySpies.select(...args); return query; });
    query.eq = vi.fn((...args: unknown[]) => { sharedQuerySpies.eq(...args); return query; });
    query.lt = vi.fn((...args: unknown[]) => { sharedQuerySpies.lt(...args); return query; });
    query.gt = vi.fn((...args: unknown[]) => { sharedQuerySpies.gt(...args); return query; });
    query.gte = vi.fn((...args: unknown[]) => { sharedQuerySpies.gte(...args); return query; });
    query.lte = vi.fn((...args: unknown[]) => { sharedQuerySpies.lte(...args); return query; });
    query.or = vi.fn((...args: unknown[]) => { sharedQuerySpies.or(...args); return query; });
    query.order = vi.fn((...args: unknown[]) => { sharedQuerySpies.order(...args); return query; });
    query.limit = vi.fn(async (...args: unknown[]) => {
      sharedQuerySpies.limit(...args);
      return { data: result.data, error: result.error, count: result.count ?? null };
    });

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

describe('GET /api/remarketing/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exporta CSV com dados do segmento trial_expired', async () => {
    const rows = [
      {
        telegram_id: 12345,
        telegram_username: 'alice',
        channel: 'telegram',
        channel_user_id: null,
        status: 'trial',
        trial_ends_at: '2026-03-20T00:00:00Z',
        subscription_ends_at: null,
        last_payment_at: null,
        created_at: '2026-03-01T00:00:00Z',
        groups: { name: 'Grupo Alpha' },
      },
    ];
    const supabase = createExportSupabaseMock({ data: rows, error: null });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/export/route');
    const response = await GET(
      createMockRequest('http://localhost/api/remarketing/export?segment=trial_expired'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain('remarketing-trial_expired');

    const text = await response.text();
    // BOM is present in raw bytes for Excel compatibility but TextDecoder strips it
    // Verify via arrayBuffer instead
    expect(text).toContain('telegram_id,telegram_username,channel');
    expect(text).toContain('12345,alice,telegram');
    expect(text).toContain('Grupo Alpha');

    // Verify BOM in raw bytes (EF BB BF)
    const response2 = await GET(
      createMockRequest('http://localhost/api/remarketing/export?segment=trial_expired'),
    );
    const buf = await response2.arrayBuffer();
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0xEF);
    expect(bytes[1]).toBe(0xBB);
    expect(bytes[2]).toBe(0xBF);
  });

  it('retorna 400 quando segmento e invalido', async () => {
    const supabase = createExportSupabaseMock({ data: [], error: null });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/export/route');
    const response = await GET(
      createMockRequest('http://localhost/api/remarketing/export?segment=invalid'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('retorna 400 quando segmento esta ausente', async () => {
    const supabase = createExportSupabaseMock({ data: [], error: null });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/export/route');
    const response = await GET(
      createMockRequest('http://localhost/api/remarketing/export'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('aplica groupFilter para group_admin', async () => {
    const supabase = createExportSupabaseMock({ data: [], error: null });
    const context = createMockContext('group_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/export/route');
    await GET(
      createMockRequest('http://localhost/api/remarketing/export?segment=inadimplente'),
    );

    expect(supabase.query.eq).toHaveBeenCalledWith('group_id', 'group-uuid-1');
  });

  it('retorna 500 quando query falha', async () => {
    const supabase = createExportSupabaseMock({
      data: null,
      error: { message: 'DB down' },
    });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/export/route');
    const response = await GET(
      createMockRequest('http://localhost/api/remarketing/export?segment=trial_expired'),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('escapa valores CSV com virgula e aspas', async () => {
    const rows = [
      {
        telegram_id: 99,
        telegram_username: 'user,with"special',
        channel: 'telegram',
        channel_user_id: null,
        status: 'trial',
        trial_ends_at: null,
        subscription_ends_at: null,
        last_payment_at: null,
        created_at: '2026-03-01T00:00:00Z',
        groups: { name: 'Grupo "Test"' },
      },
    ];
    const supabase = createExportSupabaseMock({ data: rows, error: null });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/export/route');
    const response = await GET(
      createMockRequest('http://localhost/api/remarketing/export?segment=trial_expired'),
    );

    const text = await response.text();
    // username with comma and quotes should be escaped
    expect(text).toContain('"user,with""special"');
    expect(text).toContain('"Grupo ""Test"""');
  });

  it('passa { count: exact } no select para detectar truncamento', async () => {
    const supabase = createExportSupabaseMock({ data: [], error: null, count: 0 });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/export/route');
    await GET(
      createMockRequest('http://localhost/api/remarketing/export?segment=trial_expired'),
    );

    expect(supabase.query.select).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ count: 'exact' }),
    );
  });

  it('define headers de truncamento quando count excede o limite', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      telegram_id: i,
      telegram_username: `user${i}`,
      channel: 'telegram',
      channel_user_id: null,
      status: 'trial',
      trial_ends_at: null,
      subscription_ends_at: null,
      last_payment_at: null,
      created_at: '2026-03-01T00:00:00Z',
      groups: { name: 'Grupo' },
    }));
    const supabase = createExportSupabaseMock({ data: rows, error: null, count: 7500 });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/export/route');
    const response = await GET(
      createMockRequest('http://localhost/api/remarketing/export?segment=trial_expired'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Export-Truncated')).toBe('true');
    expect(response.headers.get('X-Export-Total')).toBe('7500');
  });

  it('nao define headers de truncamento quando count esta dentro do limite', async () => {
    const supabase = createExportSupabaseMock({ data: [], error: null, count: 100 });
    const context = createMockContext('super_admin', supabase);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/remarketing/export/route');
    const response = await GET(
      createMockRequest('http://localhost/api/remarketing/export?segment=trial_expired'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Export-Truncated')).toBeNull();
    expect(response.headers.get('X-Export-Total')).toBeNull();
  });

  it('aplica filtros corretos para cada tipo de segmento', async () => {
    const segmentFilters: Record<string, { status: string; method?: string }> = {
      trial_expired: { status: 'trial', method: 'lt' },
      trial_expiring: { status: 'trial', method: 'gte' },
      subscription_expiring: { status: 'ativo', method: 'gte' },
      subscription_expired: { status: 'ativo', method: 'lt' },
      inadimplente: { status: 'inadimplente' },
      cancelled_recent: { status: 'cancelado', method: 'gt' },
      cancelled_old: { status: 'cancelado', method: 'or' },
    };

    for (const [segment, expected] of Object.entries(segmentFilters)) {
      vi.clearAllMocks();
      vi.resetModules();

      const supabase = createExportSupabaseMock({ data: [], error: null });
      const context = createMockContext('super_admin', supabase);
      mockWithTenant.mockResolvedValue({ success: true, context });

      const { GET } = await import('@/app/api/remarketing/export/route');
      const response = await GET(
        createMockRequest(`http://localhost/api/remarketing/export?segment=${segment}`),
      );

      expect(response.status).toBe(200);
      expect(supabase.query.eq).toHaveBeenCalledWith('status', expected.status);
    }
  });
});
