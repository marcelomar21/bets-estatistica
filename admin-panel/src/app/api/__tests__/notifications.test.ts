import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// ---------------------------------------------------------------------------
// Supabase mock factory — notifications table
// ---------------------------------------------------------------------------
// The GET handler performs TWO queries on 'notifications':
//   1) select('*', { count: 'exact' }).gte().order().range() (optionally .eq())
//   2) select('*', { count: 'exact', head: true }).eq('read', false)
//
// The PATCH [id] handler performs:
//   .update({ read }).eq('id', id).select('id, read') — returns array
//
// The PATCH mark-all-read handler performs:
//   .update({ read: true }, { count: 'exact' }).eq('read', false) — uses count
// ---------------------------------------------------------------------------

interface QueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
  count?: number | null;
}

function createNotificationsMock(overrides: {
  list?: QueryResult;
  unread?: QueryResult;
  update?: { data: unknown | null; error: { message: string } | null };
} = {}) {
  const listDefaults: QueryResult = { data: [], error: null, count: 0 };
  const unreadDefaults: QueryResult = { data: null, error: null, count: 0 };
  const updateDefaults = { data: null, error: null };

  const list = { ...listDefaults, ...overrides.list };
  const unread = { ...unreadDefaults, ...overrides.unread };
  const update = { ...updateDefaults, ...overrides.update };

  // Spy trackers for query builder assertions
  const spies = {
    selectEq: vi.fn(),
    selectGte: vi.fn(),
    selectRange: vi.fn(),
    selectOrder: vi.fn(),
  };

  const mockFrom = vi.fn((table: string) => {
    if (table !== 'notifications') {
      // Fallback for any unexpected table
      const empty = { data: [], error: null, count: 0 };
      return { select: vi.fn(() => empty) };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};

    // ------- SELECT path (GET handler) -------
    // Differentiate queries by inspecting select() options:
    //   - { count: 'exact', head: true } => unread count query
    //   - otherwise => list query
    chain.select = vi.fn((_cols?: string, options?: { count?: string; head?: boolean }) => {
      const isUnreadCountQuery = options?.head === true;
      const result = isUnreadCountQuery ? unread : list;

      const terminal = {
        ...result,
        eq: vi.fn((...args: unknown[]) => {
          spies.selectEq(...args);
          return {
            ...result,
            order: vi.fn((...orderArgs: unknown[]) => {
              spies.selectOrder(...orderArgs);
              return {
                ...result,
                range: vi.fn((...rangeArgs: unknown[]) => {
                  spies.selectRange(...rangeArgs);
                  return result;
                }),
              };
            }),
            gte: vi.fn((...gteArgs: unknown[]) => {
              spies.selectGte(...gteArgs);
              return result;
            }),
          };
        }),
        gte: vi.fn((...args: unknown[]) => {
          spies.selectGte(...args);
          return {
            ...result,
            order: vi.fn((...orderArgs: unknown[]) => {
              spies.selectOrder(...orderArgs);
              return {
                ...result,
                range: vi.fn((...rangeArgs: unknown[]) => {
                  spies.selectRange(...rangeArgs);
                  return {
                    ...result,
                    eq: vi.fn((...eqArgs: unknown[]) => {
                      spies.selectEq(...eqArgs);
                      return result;
                    }),
                  };
                }),
              };
            }),
            eq: vi.fn((...eqArgs: unknown[]) => {
              spies.selectEq(...eqArgs);
              return {
                ...result,
                order: vi.fn((...orderArgs: unknown[]) => {
                  spies.selectOrder(...orderArgs);
                  return {
                    ...result,
                    range: vi.fn((...rangeArgs: unknown[]) => {
                      spies.selectRange(...rangeArgs);
                      return result;
                    }),
                  };
                }),
              };
            }),
          };
        }),
        order: vi.fn((...args: unknown[]) => {
          spies.selectOrder(...args);
          return {
            ...result,
            range: vi.fn((...rangeArgs: unknown[]) => {
              spies.selectRange(...rangeArgs);
              return result;
            }),
          };
        }),
        range: vi.fn((...args: unknown[]) => {
          spies.selectRange(...args);
          return result;
        }),
      };

      return terminal;
    });

    // ------- UPDATE path (PATCH handlers) -------
    // [id] route: .update({ read }).eq('id', id).select('id, read') => array
    // mark-all-read: .update({ read: true }, { count: 'exact' }).eq('read', false) => count
    chain.update = vi.fn(() => {
      // Build result with count derived from data array length for mark-all-read
      const updateWithCount = {
        ...update,
        count: Array.isArray(update.data) ? update.data.length : (update.data ? 1 : 0),
      };
      return {
        eq: vi.fn(() => ({
          select: vi.fn(() => {
            // [id] route expects array: wrap single object in array if needed
            const arrayData = update.data
              ? (Array.isArray(update.data) ? update.data : [update.data])
              : [];
            return { data: arrayData, error: update.error };
          }),
          ...updateWithCount,
        })),
      };
    });

    return chain;
  });

  return { from: mockFrom, spies };
}

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  const mock = supabaseMock ?? createNotificationsMock();
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-uuid-1',
    supabase: mock as unknown as TenantContext['supabase'],
  };
}

function createMockRequest(
  method: string,
  url: string,
  body?: unknown,
): NextRequest {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new Request(url, init));
}

// ---- Sample UUIDs (RFC 4122 variant + version-4 compliant) ----
const UUID_N1 = '11111111-1111-4111-a111-111111111111';
const UUID_N2 = '22222222-2222-4222-a222-222222222222';
const UUID_N3 = '33333333-3333-4333-a333-333333333333';
const UUID_G1 = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const UUID_G2 = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const UUID_G3 = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

// ---- Sample data ----

const sampleNotifications = [
  {
    id: UUID_N1,
    type: 'bot_offline',
    message: 'Bot do Grupo Alpha ficou offline',
    read: false,
    group_id: UUID_G1,
    created_at: '2026-02-08T10:00:00Z',
  },
  {
    id: UUID_N2,
    type: 'member_joined',
    message: 'Novo membro entrou no Grupo Beta',
    read: true,
    group_id: UUID_G2,
    created_at: '2026-02-07T09:00:00Z',
  },
  {
    id: UUID_N3,
    type: 'group_failed',
    message: 'Grupo Gamma falhou',
    read: false,
    group_id: UUID_G3,
    created_at: '2026-02-06T08:00:00Z',
  },
];

// =====================================================================
// GET /api/notifications
// =====================================================================
describe('GET /api/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns notifications list with total and unread_count', async () => {
    const mock = createNotificationsMock({
      list: { data: sampleNotifications, error: null, count: 3 },
      unread: { data: null, error: null, count: 2 },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toHaveLength(3);
    expect(body.data.total).toBe(3);
    expect(body.data.unread_count).toBe(2);
  });

  it('filters by read=false (only unread notifications)', async () => {
    const unreadOnly = sampleNotifications.filter((n) => !n.read);
    const mock = createNotificationsMock({
      list: { data: unreadOnly, error: null, count: 2 },
      unread: { data: null, error: null, count: 2 },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications?read=false');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toHaveLength(2);
    body.data.notifications.forEach((n: { read: boolean }) => {
      expect(n.read).toBe(false);
    });
    // Verify the query builder's .eq() was called with the read filter
    expect(mock.spies.selectEq).toHaveBeenCalledWith('read', false);
  });

  it('filters by days=7 (date range)', async () => {
    const mock = createNotificationsMock({
      list: { data: [sampleNotifications[0]], error: null, count: 1 },
      unread: { data: null, error: null, count: 1 },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications?days=7');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toHaveLength(1);
    // The mock from() should have been called with 'notifications'
    expect(mock.from).toHaveBeenCalledWith('notifications');
    // Verify the query builder's .gte() was called with 'created_at' and an ISO date string
    expect(mock.spies.selectGte).toHaveBeenCalledWith('created_at', expect.any(String));
  });

  it('supports pagination with limit and offset', async () => {
    const paginatedNotifications = [sampleNotifications[1]]; // second page, 1 item
    const mock = createNotificationsMock({
      list: { data: paginatedNotifications, error: null, count: 3 },
      unread: { data: null, error: null, count: 2 },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications?limit=10&offset=5');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toHaveLength(1);
    expect(body.data.total).toBe(3);
    // Verify the query builder's .range() was called with correct offset and limit values
    // offset=5, limit=10 => range(5, 14)
    expect(mock.spies.selectRange).toHaveBeenCalledWith(5, 14);
  });

  it('returns 400 for invalid query params (days out of range)', async () => {
    const mock = createNotificationsMock();
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications?days=999');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid read param value', async () => {
    const mock = createNotificationsMock();
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications?read=invalid');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid limit param (negative)', async () => {
    const mock = createNotificationsMock();
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications?limit=-1');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for unauthenticated request', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 on database error from list query', async () => {
    const mock = createNotificationsMock({
      list: { data: null, error: { message: 'Connection refused' }, count: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
    expect(body.error.message).toBe('Connection refused');
  });

  it('returns 500 on database error from unread count query', async () => {
    const mock = createNotificationsMock({
      list: { data: sampleNotifications, error: null, count: 3 },
      unread: { data: null, error: { message: 'Permission denied' }, count: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
    expect(body.error.message).toBe('Permission denied');
  });

  it('returns empty list gracefully when no notifications exist', async () => {
    const mock = createNotificationsMock({
      list: { data: [], error: null, count: 0 },
      unread: { data: null, error: null, count: 0 },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toHaveLength(0);
    expect(body.data.total).toBe(0);
    expect(body.data.unread_count).toBe(0);
  });
});

// =====================================================================
// PATCH /api/notifications/[id]
// =====================================================================
describe('PATCH /api/notifications/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('marks a notification as read', async () => {
    const updatedNotification = { id: UUID_N1, read: true };
    const mock = createNotificationsMock({
      update: { data: updatedNotification, error: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/notifications/${UUID_N1}`, {
      read: true,
    });

    const routeContext = { params: Promise.resolve({ id: UUID_N1 }) };
    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(UUID_N1);
    expect(body.data.read).toBe(true);
  });

  it('marks a notification as unread', async () => {
    const updatedNotification = { id: UUID_N2, read: false };
    const mock = createNotificationsMock({
      update: { data: updatedNotification, error: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/notifications/${UUID_N2}`, {
      read: false,
    });

    const routeContext = { params: Promise.resolve({ id: UUID_N2 }) };
    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(UUID_N2);
    expect(body.data.read).toBe(false);
  });

  it('returns 400 for invalid JSON body', async () => {
    const mock = createNotificationsMock();
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    // Create a request with invalid JSON
    const req = new NextRequest(
      new Request(`http://localhost/api/notifications/${UUID_N1}`, {
        method: 'PATCH',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const routeContext = { params: Promise.resolve({ id: UUID_N1 }) };
    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid JSON body');
  });

  it('returns 400 for missing read field in body', async () => {
    const mock = createNotificationsMock();
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/notifications/${UUID_N1}`, {
      status: 'read',
    });

    const routeContext = { params: Promise.resolve({ id: UUID_N1 }) };
    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for read field with non-boolean value', async () => {
    const mock = createNotificationsMock();
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/notifications/${UUID_N1}`, {
      read: 'yes',
    });

    const routeContext = { params: Promise.resolve({ id: UUID_N1 }) };
    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid (non-UUID) notification ID', async () => {
    const mock = createNotificationsMock();
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/notifications/non-existent', {
      read: true,
    });

    const routeContext = { params: Promise.resolve({ id: 'non-existent' }) };
    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid notification ID format');
  });

  it('returns 404 when notification does not exist', async () => {
    const nonExistentUuid = '99999999-9999-4999-a999-999999999999';
    const mock = createNotificationsMock({
      update: { data: null, error: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/notifications/${nonExistentUuid}`, {
      read: true,
    });

    const routeContext = { params: Promise.resolve({ id: nonExistentUuid }) };
    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Notification not found');
  });

  it('returns 401 for unauthenticated request', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/notifications/${UUID_N1}`, {
      read: true,
    });

    const routeContext = { params: Promise.resolve({ id: UUID_N1 }) };
    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 on database error', async () => {
    const mock = createNotificationsMock({
      update: { data: null, error: { message: 'Database unavailable' } },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/notifications/${UUID_N1}`, {
      read: true,
    });

    const routeContext = { params: Promise.resolve({ id: UUID_N1 }) };
    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
    expect(body.error.message).toBe('Database unavailable');
  });
});

// =====================================================================
// PATCH /api/notifications/mark-all-read
// =====================================================================
describe('PATCH /api/notifications/mark-all-read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('marks all unread notifications as read', async () => {
    const updatedIds = [{ id: UUID_N1 }, { id: UUID_N3 }];
    const mock = createNotificationsMock({
      update: { data: updatedIds, error: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/mark-all-read/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/notifications/mark-all-read');

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updated_count).toBe(2);
  });

  it('returns updated_count 0 when no unread notifications exist', async () => {
    const mock = createNotificationsMock({
      update: { data: [], error: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/mark-all-read/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/notifications/mark-all-read');

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updated_count).toBe(0);
  });

  it('returns 401 for unauthenticated request', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { PATCH } = await import('@/app/api/notifications/mark-all-read/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/notifications/mark-all-read');

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 on database error', async () => {
    const mock = createNotificationsMock({
      update: { data: null, error: { message: 'Deadlock detected' } },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/mark-all-read/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/notifications/mark-all-read');

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
    expect(body.error.message).toBe('Deadlock detected');
  });
});

// =====================================================================
// group_admin access
// =====================================================================
describe('group_admin access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('GET returns only their group notifications (RLS-filtered)', async () => {
    // group_admin with group_id=UUID_G1 should only see g1 notifications via RLS
    const g1Notifications = sampleNotifications.filter((n) => n.group_id === UUID_G1);
    const mock = createNotificationsMock({
      list: { data: g1Notifications, error: null, count: g1Notifications.length },
      unread: { data: null, error: null, count: g1Notifications.filter((n) => !n.read).length },
    });
    const context = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/notifications/route');
    const req = createMockRequest('GET', 'http://localhost/api/notifications');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // RLS ensures only g1 notifications are returned
    expect(body.data.notifications).toHaveLength(g1Notifications.length);
    body.data.notifications.forEach((n: { group_id: string }) => {
      expect(n.group_id).toBe(UUID_G1);
    });
    expect(body.data.unread_count).toBe(g1Notifications.filter((n) => !n.read).length);
  });

  it('PATCH mark-as-read works for their group notification', async () => {
    const updatedNotification = { id: UUID_N1, read: true };
    const mock = createNotificationsMock({
      update: { data: updatedNotification, error: null },
    });
    const context = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    const req = createMockRequest('PATCH', `http://localhost/api/notifications/${UUID_N1}`, {
      read: true,
    });

    const routeContext = { params: Promise.resolve({ id: UUID_N1 }) };
    const response = await PATCH(req, routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(UUID_N1);
    expect(body.data.read).toBe(true);
  });

  it('PATCH mark-all-read only affects their group (RLS-filtered)', async () => {
    // group_admin marks all as read — RLS ensures only their group's notifications are affected
    const g1UnreadIds = [{ id: UUID_N1 }]; // Only g1 notification was unread
    const mock = createNotificationsMock({
      update: { data: g1UnreadIds, error: null },
    });
    const context = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { PATCH } = await import('@/app/api/notifications/mark-all-read/route');
    const req = createMockRequest('PATCH', 'http://localhost/api/notifications/mark-all-read');

    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Only 1 notification from g1 was unread, so updated_count should be 1
    expect(body.data.updated_count).toBe(1);
  });
});
