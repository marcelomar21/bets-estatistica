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
} = {}) {
  const defaults = {
    groups: { data: [], error: null },
    bot_pool: { data: [], error: null },
    bot_health: { data: [], error: null },
    members: { data: [], error: null },
    audit_log: { data: [], error: null },
  };
  const tables = { ...defaults, ...overrides };

  const mockFrom = vi.fn((table: string) => {
    const tableData = tables[table as keyof typeof tables] ?? { data: [], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
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

  return { from: mockFrom };
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
  });

  it('returns filtered data for group_admin (RLS-filtered)', async () => {
    // group_admin only sees their own group via RLS
    const filteredGroups = [sampleGroups[0]]; // Only g1
    const filteredMembers = [sampleMembers[0], sampleMembers[1], sampleMembers[3]]; // Only g1 members
    const filteredHealth = [sampleBotHealth[0]]; // Only g1 bot health

    const mock = createDashboardMock({
      groups: { data: filteredGroups, error: null },
      bot_pool: { data: [], error: null }, // bot_pool not accessible to group_admin per RLS
      bot_health: { data: filteredHealth, error: null },
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
    expect(body.data.groups).toHaveLength(1);
    expect(body.data.groups[0].name).toBe('Grupo Alpha');
    expect(body.data.summary.members.total).toBe(2); // ativo + trial (removido excluded)
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
});
