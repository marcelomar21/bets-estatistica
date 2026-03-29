import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Mock pickPostTime
const mockPickPostTime = vi.fn<() => Promise<string | null>>();
vi.mock('@/lib/distribute-utils', () => ({
  pickPostTime: (...args: unknown[]) => mockPickPostTime(...args),
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

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
  groupFilter?: string | null,
): TenantContext {
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: groupFilter !== undefined ? groupFilter : (role === 'super_admin' ? null : 'group-uuid-1'),
    supabase: (supabaseMock ?? { from: vi.fn() }) as unknown as TenantContext['supabase'],
  };
}

const GROUP_A = '550e8400-e29b-41d4-a716-446655440001';
const GROUP_B = '550e8400-e29b-41d4-a716-446655440002';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDistributeQueryBuilder(options: {
  betData?: unknown;
  betError?: { message: string } | null;
  groupsData?: unknown[];
  groupsError?: { message: string } | null;
  existingAssignments?: { group_id: string }[];
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
} = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockFrom = vi.fn((table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.neq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.insert = vi.fn(() => {
      if (table === 'bet_group_assignments') {
        return { select: vi.fn(() => ({ data: null, error: options.insertError ?? null })) };
      }
      return { data: null, error: null };
    });
    chain.single = vi.fn(() => {
      if (table === 'suggested_bets') {
        return { data: options.betData ?? null, error: options.betError ?? null };
      }
      return { data: null, error: null };
    });

    // For groups bulk fetch (.in query returns array, not .single())
    if (table === 'groups') {
      chain.in = vi.fn(() => ({
        data: options.groupsData ?? [],
        error: options.groupsError ?? null,
      }));
    }

    // For existing assignments check
    if (table === 'bet_group_assignments' && !options.insertError) {
      chain.eq = vi.fn(() => ({
        data: options.existingAssignments ?? [],
        error: null,
        // Also support chaining for insert path
        select: vi.fn(() => chain),
      }));
    }

    return chain;
  });

  return { from: mockFrom };
}

describe('POST /api/bets/[id]/distribute (multi-group)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPickPostTime.mockResolvedValue('14:00');
  });

  // --- Happy path ---

  it('distributes to 2 groups successfully', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, group_id: null, bet_status: 'generated' },
      groupsData: [
        { id: GROUP_A, name: 'Guru da Bet', status: 'active', posting_schedule: null },
        { id: GROUP_B, name: 'Osmar Palpites', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(2);
    expect(body.data.created[0].groupId).toBe(GROUP_A);
    expect(body.data.created[1].groupId).toBe(GROUP_B);
    expect(body.data.alreadyExisted).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(0);
  });

  // --- Backward compat ---

  it('accepts legacy { groupId } format and wraps to array', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, group_id: null, bet_status: 'generated' },
      groupsData: [
        { id: GROUP_A, name: 'Guru da Bet', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: GROUP_A,
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_A);
  });

  // --- Mixed results ---

  it('returns mixed result: 1 new, 1 already-existing', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, group_id: null, bet_status: 'generated' },
      groupsData: [
        { id: GROUP_A, name: 'Guru da Bet', status: 'active', posting_schedule: null },
        { id: GROUP_B, name: 'Osmar Palpites', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [{ group_id: GROUP_A }],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_B],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.alreadyExisted).toHaveLength(1);
    expect(body.data.alreadyExisted[0].groupId).toBe(GROUP_A);
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0].groupId).toBe(GROUP_B);
  });

  // --- Inactive group skipped ---

  it('skips inactive groups in response', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, group_id: null, bet_status: 'generated' },
      groupsData: [
        { id: GROUP_A, name: 'Guru da Bet', status: 'inactive', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].groupId).toBe(GROUP_A);
    expect(body.data.skipped[0].reason).toContain('inativo');
    expect(body.data.created).toHaveLength(0);
  });

  // --- Validation errors ---

  it('returns 400 for invalid UUID format', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: ['not-a-uuid'],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid bet ID', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/abc/distribute', {
      groupId: GROUP_A,
    });
    const routeCtx = createRouteContext({ id: 'abc' });

    const response = await POST(req, routeCtx);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty groupIds array', async () => {
    const qb = createDistributeQueryBuilder();
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);

    expect(response.status).toBe(400);
  });

  // --- Bet not found ---

  it('returns 404 for non-existent bet', async () => {
    const qb = createDistributeQueryBuilder({
      betData: null,
      betError: { message: 'Not found' },
      groupsData: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/999/distribute', {
      groupId: GROUP_A,
    });
    const routeCtx = createRouteContext({ id: '999' });

    const response = await POST(req, routeCtx);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // --- Group not found ---

  it('categorizes unknown group in skipped', async () => {
    const unknownGroup = '550e8400-e29b-41d4-a716-446655440099';
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, group_id: null, bet_status: 'generated' },
      groupsData: [], // no groups found
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [unknownGroup],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.skipped).toHaveLength(1);
    expect(body.data.skipped[0].groupId).toBe(unknownGroup);
    expect(body.data.skipped[0].reason).toContain('nao encontrado');
  });

  // --- group_admin scope ---

  it('returns 403 when group_admin tries to distribute to another group', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, group_id: null, bet_status: 'generated' },
    });
    const context = createMockContext('group_admin', qb, 'group-uuid-1');
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A], // different from groupFilter
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('allows group_admin to distribute to their own group', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, group_id: null, bet_status: 'generated' },
      groupsData: [
        { id: GROUP_A, name: 'Meu Grupo', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('group_admin', qb, GROUP_A);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupId: GROUP_A,
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toHaveLength(1);
  });

  // --- DB error on insert ---

  it('returns 500 on insert DB error', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, group_id: null, bet_status: 'generated' },
      groupsData: [
        { id: GROUP_A, name: 'Guru da Bet', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
      insertError: { message: 'DB connection error' },
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('DB_ERROR');
  });

  // --- Deduplication ---

  it('deduplicates groupIds in the request', async () => {
    const qb = createDistributeQueryBuilder({
      betData: { id: 1, group_id: null, bet_status: 'generated' },
      groupsData: [
        { id: GROUP_A, name: 'Guru da Bet', status: 'active', posting_schedule: null },
      ],
      existingAssignments: [],
    });
    const context = createMockContext('super_admin', qb);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { POST } = await import('@/app/api/bets/[id]/distribute/route');
    const req = createMockRequest('POST', 'http://localhost/api/bets/1/distribute', {
      groupIds: [GROUP_A, GROUP_A, GROUP_A],
    });
    const routeCtx = createRouteContext({ id: '1' });

    const response = await POST(req, routeCtx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created).toHaveLength(1);
  });
});
