import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantResult } from '@/middleware/tenant';

/**
 * Tests: Story 5.5 APIs
 * - POST /api/bets/post-now (sets post_now_requested_at flag)
 * - GET /api/bets/queue (returns posting queue status)
 * - PUT /api/groups/[groupId] (posting_schedule validation)
 */

const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockSupabase(config: Record<string, any> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildChain(table: string): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.insert = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.gt = vi.fn(() => chain);
    chain.order = vi.fn(() => ({
      data: config[`${table}_list`] ?? [],
      error: config[`${table}_list_error`] ?? null,
    }));
    chain.single = vi.fn(() => ({
      data: config[`${table}_single`] ?? null,
      error: config[`${table}_single_error`] ?? null,
    }));
    return chain;
  }

  return {
    from: vi.fn((table: string) => buildChain(table)),
  };
}

function createTenantContext(role: 'super_admin' | 'group_admin', groupFilter: string | null, supabase: unknown) {
  return {
    success: true as const,
    context: {
      supabase,
      user: { id: 'user-1', email: 'test@test.com' },
      role,
      groupFilter,
    },
  };
}

describe('POST /api/bets/post-now', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('sets post_now_requested_at flag for group_admin', async () => {
    const mockSupa = createMockSupabase({
      groups_single: { id: 'group-uuid-1' },
    });
    mockWithTenant.mockResolvedValue(
      createTenantContext('group_admin', 'group-uuid-1', mockSupa),
    );

    const { POST } = await import('../bets/post-now/route');
    const req = new NextRequest('http://localhost/api/bets/post-now', { method: 'POST' });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.message).toBe('Postagem solicitada');
    expect(mockSupa.from).toHaveBeenCalledWith('groups');
  });

  it('requires group_id for super_admin', async () => {
    const mockSupa = createMockSupabase();
    mockWithTenant.mockResolvedValue(
      createTenantContext('super_admin', null, mockSupa),
    );

    const { POST } = await import('../bets/post-now/route');
    const req = new NextRequest('http://localhost/api/bets/post-now', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(res.status).toBe(400);
  });

  it('super_admin can post for a specific group', async () => {
    const mockSupa = createMockSupabase({
      groups_single: { id: 'group-uuid-1' },
    });
    mockWithTenant.mockResolvedValue(
      createTenantContext('super_admin', null, mockSupa),
    );

    const { POST } = await import('../bets/post-now/route');
    const req = new NextRequest('http://localhost/api/bets/post-now', {
      method: 'POST',
      body: JSON.stringify({ group_id: 'group-uuid-1' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it('returns 404 when target group does not exist', async () => {
    const mockSupa = createMockSupabase({
      groups_single: null,
      groups_single_error: { code: 'PGRST116', message: '0 rows' },
    });
    mockWithTenant.mockResolvedValue(
      createTenantContext('super_admin', null, mockSupa),
    );

    const { POST } = await import('../bets/post-now/route');
    const req = new NextRequest('http://localhost/api/bets/post-now', {
      method: 'POST',
      body: JSON.stringify({ group_id: 'group-missing' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/bets/queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns queue data for group_admin', async () => {
    const mockSupa = createMockSupabase({
      groups_single: { posting_schedule: { enabled: true, times: ['10:00', '15:00'] } },
      suggested_bets_list: [
        { id: 1, bet_status: 'ready', bet_market: 'ML', bet_pick: 'Home', odds: 1.8, deep_link: 'http://link', league_matches: { home_team_name: 'A', away_team_name: 'B', kickoff_time: '2026-02-12T10:00:00Z' } },
        { id: 2, bet_status: 'pending_link', bet_market: 'OU', bet_pick: 'Over', odds: 2.0, deep_link: null, league_matches: { home_team_name: 'C', away_team_name: 'D', kickoff_time: '2026-02-12T15:00:00Z' } },
      ],
    });
    mockWithTenant.mockResolvedValue(
      createTenantContext('group_admin', 'group-uuid-1', mockSupa),
    );

    const { GET } = await import('../bets/queue/route');
    const req = new NextRequest('http://localhost/api/bets/queue');
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.readyCount).toBe(1);
    expect(json.data.pendingLinkCount).toBe(1);
    expect(json.data.postingSchedule.enabled).toBe(true);
    expect(json.data.nextPostTime).toBeDefined();
  });

  it('requires group_id for super_admin', async () => {
    const mockSupa = createMockSupabase();
    mockWithTenant.mockResolvedValue(
      createTenantContext('super_admin', null, mockSupa),
    );

    const { GET } = await import('../bets/queue/route');
    const req = new NextRequest('http://localhost/api/bets/queue');
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/groups/[groupId] - posting_schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('accepts valid posting_schedule', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function buildChain(): Record<string, any> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.insert = vi.fn(() => ({ data: null, error: null }));
      chain.update = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.single = vi.fn(() => ({
        data: { id: 'g1', name: 'Test', status: 'active', posting_schedule: { enabled: false, times: ['09:00'] } },
        error: null,
      }));
      return chain;
    }

    const mockSupa = { from: vi.fn(() => buildChain()) };
    mockWithTenant.mockResolvedValue(
      createTenantContext('super_admin', null, mockSupa),
    );

    const { PUT } = await import('../groups/[groupId]/route');
    const req = new NextRequest('http://localhost/api/groups/g1', {
      method: 'PUT',
      body: JSON.stringify({ posting_schedule: { enabled: false, times: ['09:00'] } }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PUT(req, createRouteContext({ groupId: 'g1' }));
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it('rejects duplicate posting times', async () => {
    const mockSupa = createMockSupabase();
    mockWithTenant.mockResolvedValue(
      createTenantContext('super_admin', null, mockSupa),
    );

    const { PUT } = await import('../groups/[groupId]/route');
    const req = new NextRequest('http://localhost/api/groups/g1', {
      method: 'PUT',
      body: JSON.stringify({ posting_schedule: { enabled: true, times: ['10:00', '10:00'] } }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PUT(req, createRouteContext({ groupId: 'g1' }));
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(res.status).toBe(400);
  });

  it('rejects invalid time format', async () => {
    const mockSupa = createMockSupabase();
    mockWithTenant.mockResolvedValue(
      createTenantContext('super_admin', null, mockSupa),
    );

    const { PUT } = await import('../groups/[groupId]/route');
    const req = new NextRequest('http://localhost/api/groups/g1', {
      method: 'PUT',
      body: JSON.stringify({ posting_schedule: { enabled: true, times: ['25:99'] } }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PUT(req, createRouteContext({ groupId: 'g1' }));
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(res.status).toBe(400);
  });

  it('group_admin cannot access another group', async () => {
    const mockSupa = createMockSupabase();
    mockWithTenant.mockResolvedValue(
      createTenantContext('group_admin', 'group-uuid-1', mockSupa),
    );

    const { PUT } = await import('../groups/[groupId]/route');
    const req = new NextRequest('http://localhost/api/groups/other-group', {
      method: 'PUT',
      body: JSON.stringify({ posting_schedule: { enabled: true, times: ['10:00'] } }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PUT(req, createRouteContext({ groupId: 'other-group' }));
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(res.status).toBe(403);
  });
});
