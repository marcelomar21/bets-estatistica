import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantContext, TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Table-aware Supabase mock for dashboard (multiple parallel queries)
function createDashboardMock(overrides: {
  groups?: { data: unknown[] | null; error: { message: string } | null };
  bot_pool?: { data: unknown[] | null; error: { message: string } | null };
  bot_health?: { data: unknown[] | null; error: { message: string } | null };
  members?: { data: unknown[] | null; error: { message: string } | null };
  audit_log?: { data: unknown[] | null; error: { message: string } | null };
  notifications?: { data: unknown[] | null; error: { message: string } | null; count?: number };
  /** Recent notifications for dedup check in persistNotifications */
  notifications_dedup?: { data: unknown[] | null; error: { message: string } | null };
} = {}) {
  const defaults = {
    groups: { data: [], error: null },
    bot_pool: { data: [], error: null },
    bot_health: { data: [], error: null },
    members: { data: [], error: null },
    audit_log: { data: [], error: null },
    notifications: { data: [], error: null, count: 0 },
    notifications_dedup: { data: [], error: null },
  };
  const tables = { ...defaults, ...overrides };

  const mockInsert = vi.fn(() => ({ error: null }));

  const mockFrom = vi.fn((table: string) => {
    const tableData = tables[table as keyof typeof tables] ?? { data: [], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};

    // notifications table needs insert (persistNotifications) and count support (unread count)
    if (table === 'notifications') {
      const notifData = tableData as typeof tables.notifications;
      const dedupData = tables.notifications_dedup;
      // Differentiate select queries by inspecting the columns argument:
      //   - select('type, group_id') => dedup query from persistNotifications
      //   - select('*', { count: 'exact', head: true }) => unread count query
      chain.select = vi.fn((cols: string, options?: { count?: string; head?: boolean }) => {
        if (cols === 'type, group_id') {
          // Dedup query: select('type, group_id').gte(...)
          return {
            ...dedupData,
            gte: vi.fn(() => ({ ...dedupData })),
          };
        }
        // Unread count query: select('*', { count: 'exact', head: true }).eq('read', false)
        const unreadChain: Record<string, unknown> = {
          ...notifData,
          count: notifData.count ?? 0,
          gte: vi.fn(() => ({ ...notifData })),
        };
        unreadChain.eq = vi.fn(() => unreadChain);
        return unreadChain;
      });
      chain.insert = mockInsert;
      chain.update = vi.fn(() => ({
        eq: vi.fn(() => ({ select: vi.fn(() => ({ ...notifData })) })),
      }));
      return chain;
    }

    chain.select = vi.fn(() => ({
      ...tableData,
      order: vi.fn(() => ({ ...tableData, limit: vi.fn(() => tableData) })),
      eq: vi.fn(() => ({
        ...tableData,
        order: vi.fn(() => ({ ...tableData, limit: vi.fn(() => tableData) })),
      })),
      gte: vi.fn(() => ({
        ...tableData,
        order: vi.fn(() => ({ ...tableData, limit: vi.fn(() => tableData) })),
      })),
    }));
    return chain;
  });

  return { from: mockFrom, mockInsert };
}

function createMockContext(
  role: 'super_admin' | 'group_admin' = 'super_admin',
  supabaseMock?: { from: ReturnType<typeof vi.fn> },
): TenantContext {
  const mock = supabaseMock ?? createDashboardMock();
  return {
    user: { id: 'user-1', email: 'admin@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-uuid-1',
    supabase: mock as unknown as TenantContext['supabase'],
  };
}

function createMockRequest(method: string, url: string): NextRequest {
  return new NextRequest(new Request(url, { method }));
}

// Sample data
const sampleGroups = [
  { id: 'g1', name: 'Grupo Alpha', status: 'active', created_at: '2026-01-01T00:00:00Z' },
  { id: 'g2', name: 'Grupo Beta', status: 'paused', created_at: '2026-01-02T00:00:00Z' },
  { id: 'g3', name: 'Grupo Gamma', status: 'failed', created_at: '2026-01-03T00:00:00Z' },
];

const sampleBots = [
  { id: 'b1', status: 'in_use' },
  { id: 'b2', status: 'available' },
];

const sampleBotHealth = [
  { group_id: 'g1', status: 'online', last_heartbeat: '2026-02-08T10:00:00Z', error_message: null, groups: { name: 'Grupo Alpha' } },
  { group_id: 'g2', status: 'offline', last_heartbeat: '2026-02-08T09:00:00Z', error_message: 'Connection lost', groups: { name: 'Grupo Beta' } },
];

const sampleMembers = [
  { id: 'm1', group_id: 'g1', status: 'ativo' },
  { id: 'm2', group_id: 'g1', status: 'trial' },
  { id: 'm3', group_id: 'g2', status: 'ativo' },
  { id: 'm4', group_id: 'g1', status: 'removido' },
];

describe('GET /api/dashboard/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns correct dashboard data for super_admin', async () => {
    const mock = createDashboardMock({
      groups: { data: sampleGroups, error: null },
      bot_pool: { data: sampleBots, error: null },
      bot_health: { data: sampleBotHealth, error: null },
      members: { data: sampleMembers, error: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // Summary
    expect(body.data.summary.groups.active).toBe(1);
    expect(body.data.summary.groups.paused).toBe(1);
    expect(body.data.summary.groups.total).toBe(3);
    expect(body.data.summary.bots.available).toBe(1);
    expect(body.data.summary.bots.in_use).toBe(1);
    expect(body.data.summary.bots.total).toBe(2);
    expect(body.data.summary.bots.online).toBe(1);
    expect(body.data.summary.bots.offline).toBe(1);
    expect(body.data.summary.members.total).toBe(3); // 2 ativo + 1 trial (removido excluded)

    // Group cards
    expect(body.data.groups).toHaveLength(3);
    const alphaCard = body.data.groups.find((g: { id: string }) => g.id === 'g1');
    expect(alphaCard.active_members).toBe(2); // m1 (ativo) + m2 (trial)
    const betaCard = body.data.groups.find((g: { id: string }) => g.id === 'g2');
    expect(betaCard.active_members).toBe(1); // m3 (ativo)

    // Alerts
    expect(body.data.alerts.length).toBeGreaterThanOrEqual(2);
    const offlineAlert = body.data.alerts.find((a: { type: string }) => a.type === 'bot_offline');
    expect(offlineAlert).toBeDefined();
    expect(offlineAlert.group_name).toBe('Grupo Beta');
    const failedAlert = body.data.alerts.find((a: { type: string }) => a.type === 'group_failed');
    expect(failedAlert).toBeDefined();
    expect(failedAlert.group_name).toBe('Grupo Gamma');

    // Unread notification count
    expect(body.data.unread_count).toBeDefined();
  });

  it('returns filtered data for group_admin (singular group + member summary)', async () => {
    // group_admin gets singular group and member summary
    const filteredGroups = [sampleGroups[0]]; // Only g1
    const filteredMembers = [
      { ...sampleMembers[0], vencimento_at: null },
      { ...sampleMembers[1], vencimento_at: null },
      { ...sampleMembers[3], vencimento_at: null },
    ]; // Only g1 members

    const mock = createDashboardMock({
      groups: { data: filteredGroups, error: null },
      members: { data: filteredMembers, error: null },
    });
    const context = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.group).toBeDefined();
    expect(body.data.group.name).toBe('Grupo Alpha');
    expect(body.data.summary.members.total).toBe(2); // ativo + trial (removido excluded)
    expect(body.data.summary.members.trial).toBe(1);
    expect(body.data.summary.members.ativo).toBe(1);
  });

  it('returns 401 for unauthenticated user', async () => {
    mockWithTenant.mockResolvedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 on database error', async () => {
    const mock = createDashboardMock({
      groups: { data: null, error: { message: 'Connection refused' } },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('returns 500 when unread notifications query fails for super_admin', async () => {
    const mock = createDashboardMock({
      groups: { data: sampleGroups, error: null },
      bot_pool: { data: sampleBots, error: null },
      bot_health: { data: sampleBotHealth, error: null },
      members: { data: sampleMembers, error: null },
      notifications: { data: null, error: { message: 'notifications unavailable' } },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('includes offline bots in alerts', async () => {
    const offlineHealth = [
      { group_id: 'g1', status: 'offline', last_heartbeat: '2026-02-08T09:00:00Z', error_message: 'Timeout', groups: { name: 'Grupo Alpha' } },
    ];
    const mock = createDashboardMock({
      groups: { data: [sampleGroups[0]], error: null },
      bot_health: { data: offlineHealth, error: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    const offlineAlerts = body.data.alerts.filter((a: { type: string }) => a.type === 'bot_offline');
    expect(offlineAlerts).toHaveLength(1);
    expect(offlineAlerts[0].message).toContain('Timeout');
    expect(offlineAlerts[0].group_name).toBe('Grupo Alpha');
  });

  it('includes failed groups in alerts', async () => {
    const failedGroup = [{ id: 'g3', name: 'Grupo Falho', status: 'failed', created_at: '2026-01-01T00:00:00Z' }];
    const mock = createDashboardMock({
      groups: { data: failedGroup, error: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    const failedAlerts = body.data.alerts.filter((a: { type: string }) => a.type === 'group_failed');
    expect(failedAlerts).toHaveLength(1);
    expect(failedAlerts[0].group_name).toBe('Grupo Falho');
  });

  it('returns empty data gracefully when no groups exist', async () => {
    const mock = createDashboardMock(); // All empty defaults
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.summary.groups.total).toBe(0);
    expect(body.data.groups).toHaveLength(0);
    expect(body.data.alerts).toHaveLength(0);
  });

  it('includes onboarding_completed alerts from audit_log', async () => {
    const auditEntries = [
      { table_name: 'groups', record_id: 'g1', action: 'UPDATE', changes: { status: 'active' }, created_at: '2026-02-08T08:00:00Z' },
    ];
    const mock = createDashboardMock({
      groups: { data: [sampleGroups[0]], error: null },
      audit_log: { data: auditEntries, error: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    const onboardingAlerts = body.data.alerts.filter((a: { type: string }) => a.type === 'onboarding_completed');
    expect(onboardingAlerts).toHaveLength(1);
    expect(onboardingAlerts[0].group_name).toBe('Grupo Alpha');
    expect(onboardingAlerts[0].message).toContain('onboarding concluido');
  });

  it('returns data even when audit_log query fails', async () => {
    const mock = createDashboardMock({
      groups: { data: [sampleGroups[0]], error: null },
      audit_log: { data: null, error: { message: 'Permission denied' } },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.summary).toBeDefined();
  });

  it('includes paused groups in alerts as group_paused type', async () => {
    const pausedGroup = [{ id: 'g2', name: 'Grupo Pausado', status: 'paused', created_at: '2026-01-02T00:00:00Z' }];
    const mock = createDashboardMock({
      groups: { data: pausedGroup, error: null },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    const pausedAlerts = body.data.alerts.filter((a: { type: string }) => a.type === 'group_paused');
    expect(pausedAlerts).toHaveLength(1);
    expect(pausedAlerts[0].group_name).toBe('Grupo Pausado');
    expect(pausedAlerts[0].message).toContain('pausado');
  });

  it('does NOT insert notifications when matching alerts already exist within 1 hour (dedup)', async () => {
    // Simulate a bot_offline alert that already has a recent matching notification
    const offlineHealth = [
      { group_id: 'g1', status: 'offline', last_heartbeat: '2026-02-08T09:00:00Z', error_message: 'Timeout', groups: { name: 'Grupo Alpha' } },
    ];
    const mock = createDashboardMock({
      groups: { data: [sampleGroups[0]], error: null },
      bot_health: { data: offlineHealth, error: null },
      // Dedup query returns a matching recent notification
      notifications_dedup: {
        data: [{ type: 'bot_offline', group_id: 'g1' }],
        error: null,
      },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    expect(response.status).toBe(200);

    // Wait for fire-and-forget persistNotifications to complete
    await new Promise((r) => setTimeout(r, 50));

    // insert should NOT have been called because the dedup detected existing notification
    expect(mock.mockInsert).not.toHaveBeenCalled();
  });

  it('returns group_admin dashboard with member summary and singular group', async () => {
    const groupAdminGroup = { id: 'g1', name: 'Grupo Alpha', status: 'active', created_at: '2026-01-01T00:00:00Z' };
    const groupAdminMembers = [
      { id: 'm1', group_id: 'g1', status: 'ativo', vencimento_at: '2026-02-20T00:00:00Z' },
      { id: 'm2', group_id: 'g1', status: 'trial', vencimento_at: null },
      { id: 'm3', group_id: 'g1', status: 'ativo', vencimento_at: '2026-02-12T00:00:00Z' }, // vencendo em 7d
      { id: 'm4', group_id: 'g1', status: 'removido', vencimento_at: null },
    ];

    const mock = createDashboardMock({
      groups: { data: [groupAdminGroup], error: null },
      bot_pool: { data: [], error: null },
      bot_health: { data: [{ group_id: 'g1', status: 'online', last_heartbeat: '2026-02-08T10:00:00Z', error_message: null, groups: { name: 'Grupo Alpha' } }], error: null },
      members: { data: groupAdminMembers, error: null },
    });
    const context = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // group_admin gets singular 'group' instead of 'groups' array
    expect(body.data.group).toBeDefined();
    expect(body.data.group.id).toBe('g1');
    expect(body.data.group.name).toBe('Grupo Alpha');
    expect(body.data.group.status).toBe('active');

    // group_admin gets member summary with breakdown
    expect(body.data.summary.members.total).toBeDefined();
    expect(body.data.summary.members.trial).toBeDefined();
    expect(body.data.summary.members.ativo).toBeDefined();
    expect(body.data.summary.members.vencendo).toBeDefined();

    // Should NOT have 'groups' array for group_admin
    expect(body.data.groups).toBeUndefined();
  });

  it('group_admin does not receive bot/group summary stats', async () => {
    const mock = createDashboardMock({
      groups: { data: [{ id: 'g1', name: 'Grupo Alpha', status: 'active', created_at: '2026-01-01T00:00:00Z' }], error: null },
      members: { data: [{ id: 'm1', group_id: 'g1', status: 'ativo', vencimento_at: null }], error: null },
    });
    const context = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // group_admin should NOT have groups/bots summary
    expect(body.data.summary.groups).toBeUndefined();
    expect(body.data.summary.bots).toBeUndefined();
  });

  it('returns 500 for group_admin when unread notifications query fails', async () => {
    const mock = createDashboardMock({
      groups: { data: [{ id: 'g1', name: 'Grupo Alpha', status: 'active', created_at: '2026-01-01T00:00:00Z' }], error: null },
      members: { data: [{ id: 'm1', group_id: 'g1', status: 'ativo', vencimento_at: null }], error: null },
      notifications: { data: null, error: { message: 'Permission denied' } },
    });
    const context = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DB_ERROR');
  });

  it('builds group_admin dashboard summary for 10k members in under 3 seconds', async () => {
    const tenThousandMembers = Array.from({ length: 10_000 }, (_, i) => {
      if (i % 4 === 0) return { id: `m-${i}`, group_id: 'g1', status: 'trial', vencimento_at: null };
      return { id: `m-${i}`, group_id: 'g1', status: 'ativo', vencimento_at: '2026-02-12T00:00:00Z' };
    });

    const mock = createDashboardMock({
      groups: { data: [{ id: 'g1', name: 'Grupo Alpha', status: 'active', created_at: '2026-01-01T00:00:00Z' }], error: null },
      members: { data: tenThousandMembers, error: null },
      notifications: { data: [], error: null, count: 0 },
    });
    const context = createMockContext('group_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const start = performance.now();
    const response = await GET(req);
    const elapsedMs = performance.now() - start;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(elapsedMs).toBeLessThan(3000);
  });

  it('inserts notifications when no matching alerts exist (no dedup hit)', async () => {
    // Simulate a bot_offline alert with NO recent matching notification
    const offlineHealth = [
      { group_id: 'g1', status: 'offline', last_heartbeat: '2026-02-08T09:00:00Z', error_message: 'Timeout', groups: { name: 'Grupo Alpha' } },
    ];
    const mock = createDashboardMock({
      groups: { data: [sampleGroups[0]], error: null },
      bot_health: { data: offlineHealth, error: null },
      // Dedup query returns empty — no matching recent notifications
      notifications_dedup: {
        data: [],
        error: null,
      },
    });
    const context = createMockContext('super_admin', mock);
    mockWithTenant.mockResolvedValue({ success: true, context });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const req = createMockRequest('GET', 'http://localhost/api/dashboard/stats');

    const response = await GET(req);
    expect(response.status).toBe(200);

    // Wait for fire-and-forget persistNotifications to complete
    await new Promise((r) => setTimeout(r, 50));

    // insert SHOULD have been called since no dedup match was found
    expect(mock.mockInsert).toHaveBeenCalled();
    const insertedRows = (mock.mockInsert.mock.calls[0] as unknown[])[0];
    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bot_offline' }),
      ]),
    );
  });
});
