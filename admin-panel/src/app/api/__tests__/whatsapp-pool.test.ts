import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantResult } from '@/middleware/tenant';

const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createPoolSupabaseMock(numbersResult: any, healthResult: any) {
  let fromCallIndex = 0;
  const from = vi.fn(() => {
    const idx = fromCallIndex++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.insert = vi.fn(() => chain);
    chain.single = vi.fn(async () => ({}));

    // First from() call = whatsapp_numbers, second = bot_health
    const result = idx === 0 ? numbersResult : healthResult;
    // Make the chain thenable so Promise.all resolves correctly
    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      return Promise.resolve(result).then(resolve, reject);
    };
    return chain;
  });

  return { from };
}

function mockTenantSuccess(supabase: unknown) {
  mockWithTenant.mockResolvedValue({
    success: true,
    context: {
      supabase: supabase as TenantResult extends { success: true; context: infer C } ? C['supabase'] : never,
      role: 'super_admin',
      groupFilter: null,
      user: { id: 'user-1', email: 'admin@test.com' },
    },
  } as TenantResult);
}

describe('/api/whatsapp-pool GET', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns numbers with health data merged', async () => {
    const numbersResult = {
      data: [
        { id: 'num-1', phone_number: '+5511111', status: 'active', group_id: 'g-1', role: 'active', last_heartbeat: '2026-02-28T10:00:00Z', banned_at: null, allocated_at: '2026-02-28T00:00:00Z', created_at: '2026-02-27T00:00:00Z', groups: { name: 'Grupo A' } },
        { id: 'num-2', phone_number: '+5522222', status: 'backup', group_id: 'g-1', role: 'backup', last_heartbeat: null, banned_at: null, allocated_at: null, created_at: '2026-02-27T00:00:00Z', groups: { name: 'Grupo A' } },
      ],
      error: null,
    };
    const healthResult = {
      data: [
        { number_id: 'num-1', status: 'online', last_heartbeat: '2026-02-28T10:00:00Z', error_message: null },
        { number_id: 'num-2', status: 'offline', last_heartbeat: '2026-02-28T09:55:00Z', error_message: 'Disconnected for 3 cycle(s)' },
      ],
      error: null,
    };

    const supabase = createPoolSupabaseMock(numbersResult, healthResult);
    mockTenantSuccess(supabase);

    const { GET } = await import('../whatsapp-pool/route');
    const req = new NextRequest('http://localhost:3000/api/whatsapp-pool');
    const res = await GET(req);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].health_status).toBe('online');
    expect(body.data[0].health_error).toBeNull();
    expect(body.data[1].health_status).toBe('offline');
    expect(body.data[1].health_error).toBe('Disconnected for 3 cycle(s)');
  });

  it('returns null health when no bot_health data exists', async () => {
    const numbersResult = {
      data: [
        { id: 'num-1', phone_number: '+5511111', status: 'available', group_id: null, role: null, last_heartbeat: null, banned_at: null, allocated_at: null, created_at: '2026-02-27T00:00:00Z', groups: null },
      ],
      error: null,
    };
    const healthResult = { data: [], error: null };

    const supabase = createPoolSupabaseMock(numbersResult, healthResult);
    mockTenantSuccess(supabase);

    const { GET } = await import('../whatsapp-pool/route');
    const req = new NextRequest('http://localhost:3000/api/whatsapp-pool');
    const res = await GET(req);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data[0].health_status).toBeNull();
    expect(body.data[0].health_error).toBeNull();
  });

  it('returns summary with correct counts', async () => {
    const numbersResult = {
      data: [
        { id: 'num-1', phone_number: '+5511111', status: 'active', group_id: 'g-1', role: 'active', last_heartbeat: null, banned_at: null, allocated_at: null, created_at: '2026-02-27T00:00:00Z', groups: null },
        { id: 'num-2', phone_number: '+5522222', status: 'available', group_id: null, role: null, last_heartbeat: null, banned_at: null, allocated_at: null, created_at: '2026-02-27T00:00:00Z', groups: null },
        { id: 'num-3', phone_number: '+5533333', status: 'banned', group_id: null, role: null, last_heartbeat: null, banned_at: '2026-02-28T00:00:00Z', allocated_at: null, created_at: '2026-02-27T00:00:00Z', groups: null },
      ],
      error: null,
    };
    const healthResult = { data: [], error: null };

    const supabase = createPoolSupabaseMock(numbersResult, healthResult);
    mockTenantSuccess(supabase);

    const { GET } = await import('../whatsapp-pool/route');
    const req = new NextRequest('http://localhost:3000/api/whatsapp-pool');
    const res = await GET(req);
    const body = await res.json();

    expect(body.summary.total).toBe(3);
    expect(body.summary.active).toBe(1);
    expect(body.summary.available).toBe(1);
    expect(body.summary.banned).toBe(1);
  });

  it('returns 500 on DB error', async () => {
    const numbersResult = { data: null, error: { message: 'connection timeout' } };
    const healthResult = { data: [], error: null };

    const supabase = createPoolSupabaseMock(numbersResult, healthResult);
    mockTenantSuccess(supabase);

    const { GET } = await import('../whatsapp-pool/route');
    const req = new NextRequest('http://localhost:3000/api/whatsapp-pool');
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });
});
