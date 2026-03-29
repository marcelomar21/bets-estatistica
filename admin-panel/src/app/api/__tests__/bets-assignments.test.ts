import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function createMockRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new Request(url, init));
}

const GROUP_UUID = '11111111-1111-1111-1111-111111111111';
const OTHER_GROUP_UUID = '22222222-2222-2222-2222-222222222222';

const sampleAssignment = {
  id: 1,
  bet_id: 42,
  group_id: GROUP_UUID,
  posting_status: 'ready',
  distributed_at: '2026-03-28T00:00:00Z',
  distributed_by: null,
  post_at: '14:00',
  telegram_posted_at: null,
  telegram_message_id: null,
  odds_at_post: null,
  generated_copy: null,
  historico_postagens: [],
  created_at: '2026-03-28T00:00:00Z',
  updated_at: '2026-03-28T00:00:00Z',
};

function createAssignmentQueryBuilder(options: {
  assignment?: unknown;
  fetchError?: { message: string; code?: string } | null;
  deleteError?: { message: string } | null;
  updateError?: { message: string } | null;
  updatedAssignment?: unknown;
} = {}) {
  let fromCallIndex = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFrom = vi.fn((_table: string) => {
    fromCallIndex++;
    const callIndex = fromCallIndex;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    // Make chain thenable so `await supabase.from(...).delete().eq().eq()` resolves
    chain.then = (resolve: (v: unknown) => void) => {
      if (callIndex === 2) {
        return resolve({ data: null, error: options.deleteError ?? options.updateError ?? null });
      }
      return resolve({ data: null, error: null });
    };
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.delete = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.single = vi.fn(() => {
      if (callIndex === 1) {
        // First call: fetch assignment
        return { data: options.assignment ?? null, error: options.fetchError ?? null };
      }
      if (callIndex === 2) {
        // Second call: delete/update (if ending with .single())
        return { data: null, error: options.deleteError ?? options.updateError ?? null };
      }
      // Third call: re-fetch after update
      return { data: options.updatedAssignment ?? options.assignment ?? null, error: null };
    });
    return chain;
  });

  return { from: mockFrom };
}

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : GROUP_UUID,
    supabase: (supabaseMock ?? { from: vi.fn() }) as unknown as TenantContext['supabase'],
  };
}

// ============================================================
// DELETE /api/bets/[id]/assignments/[groupId]
// ============================================================
describe('DELETE /api/bets/[id]/assignments/[groupId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('deletes assignment successfully', async () => {
    const qb = createAssignmentQueryBuilder({ assignment: sampleAssignment });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('DELETE', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`);
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await DELETE(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toEqual(sampleAssignment);
  });

  it('returns 404 when assignment not found', async () => {
    const qb = createAssignmentQueryBuilder({
      fetchError: { message: 'No rows found', code: 'PGRST116' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('DELETE', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`);
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await DELETE(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('allows group_admin to delete their own group assignment', async () => {
    const qb = createAssignmentQueryBuilder({ assignment: sampleAssignment });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('DELETE', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`);
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await DELETE(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 403 when group_admin tries to delete other group assignment', async () => {
    const qb = createAssignmentQueryBuilder({ assignment: sampleAssignment });
    const context = createMockContext('group_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('DELETE', `http://localhost/api/bets/42/assignments/${OTHER_GROUP_UUID}`);
    const routeContext = createRouteContext({ id: '42', groupId: OTHER_GROUP_UUID });

    const response = await DELETE(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 for invalid betId', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('DELETE', `http://localhost/api/bets/abc/assignments/${GROUP_UUID}`);
    const routeContext = createRouteContext({ id: 'abc', groupId: GROUP_UUID });

    const response = await DELETE(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid groupId UUID', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('DELETE', 'http://localhost/api/bets/42/assignments/not-a-uuid');
    const routeContext = createRouteContext({ id: '42', groupId: 'not-a-uuid' });

    const response = await DELETE(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 on DB error during delete', async () => {
    const qb = createAssignmentQueryBuilder({
      assignment: sampleAssignment,
      deleteError: { message: 'Connection lost' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { DELETE } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('DELETE', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`);
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await DELETE(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('DB_ERROR');
  });
});

// ============================================================
// PATCH /api/bets/[id]/assignments/[groupId]
// ============================================================
describe('PATCH /api/bets/[id]/assignments/[groupId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('updates postAt successfully', async () => {
    const updatedAssignment = { ...sampleAssignment, post_at: '16:30' };
    const qb = createAssignmentQueryBuilder({
      assignment: sampleAssignment,
      updatedAssignment,
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`, {
      postAt: '16:30',
    });
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updated.post_at).toBe('16:30');
  });

  it('cancels posting status successfully', async () => {
    const updatedAssignment = { ...sampleAssignment, posting_status: 'cancelled' };
    const qb = createAssignmentQueryBuilder({
      assignment: sampleAssignment,
      updatedAssignment,
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`, {
      postingStatus: 'cancelled',
    });
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updated.posting_status).toBe('cancelled');
  });

  it('rejects postingStatus=posted', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`, {
      postingStatus: 'posted',
    });
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when assignment not found', async () => {
    const qb = createAssignmentQueryBuilder({
      fetchError: { message: 'No rows found', code: 'PGRST116' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`, {
      postingStatus: 'cancelled',
    });
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 when group_admin targets other group', async () => {
    const context = createMockContext('group_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/bets/42/assignments/${OTHER_GROUP_UUID}`, {
      postingStatus: 'cancelled',
    });
    const routeContext = createRouteContext({ id: '42', groupId: OTHER_GROUP_UUID });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 for empty body', async () => {
    const context = createMockContext('super_admin');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`, {});
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 on DB error during update', async () => {
    const qb = createAssignmentQueryBuilder({
      assignment: sampleAssignment,
      updateError: { message: 'Connection lost' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`, {
      postingStatus: 'ready',
    });
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('clears postAt by setting null', async () => {
    const updatedAssignment = { ...sampleAssignment, post_at: null };
    const qb = createAssignmentQueryBuilder({
      assignment: sampleAssignment,
      updatedAssignment,
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/bets/[id]/assignments/[groupId]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/bets/42/assignments/${GROUP_UUID}`, {
      postAt: null,
    });
    const routeContext = createRouteContext({ id: '42', groupId: GROUP_UUID });

    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updated.post_at).toBeNull();
  });
});
