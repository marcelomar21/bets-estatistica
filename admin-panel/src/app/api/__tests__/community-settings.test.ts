import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Helper to create route context with params (Next.js 16 Promise-based params)
function createRouteContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

// Mock query builder for GET/PUT with audit log support
function createMockQueryBuilder(overrides: {
  currentData?: Record<string, unknown> | null;
  updatedData?: Record<string, unknown> | null;
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
  auditInsertError?: { message: string } | null;
} = {}) {
  const mockAuditInsert = vi.fn(() => ({
    data: null,
    error: overrides.auditInsertError ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createChainBuilder(table: string): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.insert = vi.fn((payload: unknown) => {
      if (table === 'audit_log') {
        return mockAuditInsert(payload);
      }
      return chain;
    });
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);

    chain.single = vi.fn(() => {
      if (table === 'groups') {
        if (chain.update.mock.calls.length > 0) {
          return {
            data: overrides.updatedData ?? null,
            error: overrides.updateError ?? null,
          };
        }
        return {
          data: overrides.currentData ?? null,
          error: overrides.selectError ?? null,
        };
      }
      return { data: null, error: null };
    });

    return chain;
  }

  const mockFrom = vi.fn((table: string) => createChainBuilder(table));
  return { from: mockFrom, mockAuditInsert };
}

function createSuperAdminContext(supabaseMock: { from: ReturnType<typeof vi.fn> }) {
  return {
    user: { id: 'user-super', email: 'super@admin.test' },
    role: 'super_admin' as const,
    groupFilter: null,
    supabase: supabaseMock,
  };
}

function createGroupAdminContext(supabaseMock: { from: ReturnType<typeof vi.fn> }, groupId = 'group-1') {
  return {
    user: { id: 'user-admin', email: 'admin@test.com' },
    role: 'group_admin' as const,
    groupFilter: groupId,
    supabase: supabaseMock,
  };
}

describe('community-settings API route', () => {
  let GET: (req: NextRequest, ...rest: unknown[]) => Promise<Response>;
  let PUT: (req: NextRequest, ...rest: unknown[]) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../groups/[groupId]/community-settings/route');
    GET = mod.GET as unknown as typeof GET;
    PUT = mod.PUT as unknown as typeof PUT;
  });

  describe('GET', () => {
    it('returns settings for the group', async () => {
      const settingsData = {
        trial_days: 5,
        subscription_price: 'R$ 49,90/mês',
        welcome_message_template: null,
      };

      const { from } = createMockQueryBuilder({ currentData: settingsData });
      mockWithTenant.mockResolvedValue({
        success: true,
        context: createSuperAdminContext({ from }),
      });

      const req = new NextRequest('http://localhost/api/groups/group-1/community-settings');
      const res = await GET(req, createRouteContext({ groupId: 'group-1' }));
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.trial_days).toBe(5);
      expect(json.data.subscription_price).toBe('R$ 49,90/mês');
    });

    it('returns 403 when group_admin tries to access another group', async () => {
      const { from } = createMockQueryBuilder();
      mockWithTenant.mockResolvedValue({
        success: true,
        context: createGroupAdminContext({ from }, 'group-1'),
      });

      const req = new NextRequest('http://localhost/api/groups/group-other/community-settings');
      const res = await GET(req, createRouteContext({ groupId: 'group-other' }));
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PUT', () => {
    it('validates trial_days min (rejects 0)', async () => {
      const { from } = createMockQueryBuilder();
      mockWithTenant.mockResolvedValue({
        success: true,
        context: createSuperAdminContext({ from }),
      });

      const req = new NextRequest('http://localhost/api/groups/group-1/community-settings', {
        method: 'PUT',
        body: JSON.stringify({ trial_days: 0 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, createRouteContext({ groupId: 'group-1' }));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates trial_days max (rejects 31)', async () => {
      const { from } = createMockQueryBuilder();
      mockWithTenant.mockResolvedValue({
        success: true,
        context: createSuperAdminContext({ from }),
      });

      const req = new NextRequest('http://localhost/api/groups/group-1/community-settings', {
        method: 'PUT',
        body: JSON.stringify({ trial_days: 31 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, createRouteContext({ groupId: 'group-1' }));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('validates subscription_price max length', async () => {
      const { from } = createMockQueryBuilder();
      mockWithTenant.mockResolvedValue({
        success: true,
        context: createSuperAdminContext({ from }),
      });

      const req = new NextRequest('http://localhost/api/groups/group-1/community-settings', {
        method: 'PUT',
        body: JSON.stringify({ subscription_price: 'x'.repeat(51) }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, createRouteContext({ groupId: 'group-1' }));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('updates and returns success', async () => {
      const updatedData = {
        trial_days: 5,
        subscription_price: 'R$ 39,90/mês',
        welcome_message_template: null,
      };

      const { from } = createMockQueryBuilder({
        currentData: { trial_days: 7, subscription_price: 'R$ 49,90/mês', welcome_message_template: null },
        updatedData,
      });
      mockWithTenant.mockResolvedValue({
        success: true,
        context: createSuperAdminContext({ from }),
      });

      const req = new NextRequest('http://localhost/api/groups/group-1/community-settings', {
        method: 'PUT',
        body: JSON.stringify({ trial_days: 5, subscription_price: 'R$ 39,90/mês' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, createRouteContext({ groupId: 'group-1' }));
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.trial_days).toBe(5);
    });

    it('registers audit_log on update', async () => {
      const { from, mockAuditInsert } = createMockQueryBuilder({
        currentData: { trial_days: 7, subscription_price: null, welcome_message_template: null },
        updatedData: { trial_days: 5, subscription_price: null, welcome_message_template: null },
      });
      mockWithTenant.mockResolvedValue({
        success: true,
        context: createSuperAdminContext({ from }),
      });

      const req = new NextRequest('http://localhost/api/groups/group-1/community-settings', {
        method: 'PUT',
        body: JSON.stringify({ trial_days: 5 }),
        headers: { 'Content-Type': 'application/json' },
      });
      await PUT(req, createRouteContext({ groupId: 'group-1' }));

      expect(mockAuditInsert).toHaveBeenCalled();
      const auditPayload = mockAuditInsert.mock.calls[0][0] as Record<string, unknown>;
      expect(auditPayload.table_name).toBe('groups');
      expect(auditPayload.action).toBe('update');
    });

    it('returns 403 when group_admin tries to access another group', async () => {
      const { from } = createMockQueryBuilder();
      mockWithTenant.mockResolvedValue({
        success: true,
        context: createGroupAdminContext({ from }, 'group-1'),
      });

      const req = new NextRequest('http://localhost/api/groups/group-other/community-settings', {
        method: 'PUT',
        body: JSON.stringify({ trial_days: 5 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, createRouteContext({ groupId: 'group-other' }));

      expect(res.status).toBe(403);
    });

    it('validates negative trial_days', async () => {
      const { from } = createMockQueryBuilder();
      mockWithTenant.mockResolvedValue({
        success: true,
        context: createSuperAdminContext({ from }),
      });

      const req = new NextRequest('http://localhost/api/groups/group-1/community-settings', {
        method: 'PUT',
        body: JSON.stringify({ trial_days: -1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PUT(req, createRouteContext({ groupId: 'group-1' }));

      expect(res.status).toBe(400);
    });
  });
});
