import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TenantResult } from '@/middleware/tenant';

// Mock the tenant module
const mockWithTenant = vi.fn<() => Promise<TenantResult>>();
vi.mock('@/middleware/tenant', () => ({
  withTenant: () => mockWithTenant(),
}));

// Mock supabase-admin
const mockCreateUser = vi.fn();
const mockDeleteAuthUser = vi.fn();
const mockUpdateUserById = vi.fn();
const mockGetUserById = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: mockCreateUser,
        deleteUser: mockDeleteAuthUser,
        updateUserById: mockUpdateUserById,
        getUserById: mockGetUserById,
      },
    },
    from: mockAdminFrom,
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockChain(resolvedValue: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => resolvedValue);
  chain.maybeSingle = vi.fn(() => resolvedValue);
  chain.single = vi.fn(() => resolvedValue);
  return chain;
}

function superAdminContext() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: Record<string, any> = {};
  const chain = createMockChain({ data: [], error: null });
  supabase.from = vi.fn(() => chain);

  return {
    success: true as const,
    context: {
      user: { id: 'super-user-id', email: 'super@admin.test' },
      role: 'super_admin' as const,
      groupFilter: null,
      supabase,
    },
  };
}

function groupAdminContext() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: Record<string, any> = {};
  const chain = createMockChain({ data: [], error: null });
  supabase.from = vi.fn(() => chain);

  return {
    success: true as const,
    context: {
      user: { id: 'group-user-id', email: 'group@admin.test' },
      role: 'group_admin' as const,
      groupFilter: 'group-uuid',
      supabase,
    },
  };
}

describe('GET /api/admin-users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns list of admin users for super_admin', async () => {
    const ctx = superAdminContext();
    const users = [
      { id: '1', email: 'a@b.com', role: 'super_admin', group_id: null, created_at: '2026-01-01', groups: null },
      { id: '2', email: 'c@d.com', role: 'group_admin', group_id: 'g1', created_at: '2026-01-02', groups: { name: 'Test' } },
    ];
    const chain = createMockChain({ data: users, error: null });
    ctx.context.supabase.from = vi.fn(() => chain);
    mockWithTenant.mockResolvedValue(ctx);

    const { GET } = await import('../admin-users/route');
    const res = await GET(new NextRequest('http://localhost/api/admin-users'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('returns 403 for group_admin', async () => {
    mockWithTenant.mockResolvedValue(groupAdminContext());

    const { GET } = await import('../admin-users/route');
    const res = await GET(new NextRequest('http://localhost/api/admin-users'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });
});

describe('POST /api/admin-users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('creates admin user with email and password', async () => {
    const ctx = superAdminContext();
    mockWithTenant.mockResolvedValue(ctx);

    // Mock admin from calls: 1) groups check → found, 2) admin_users duplicate check → not found, 3) admin_users insert → ok
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'groups') {
        return createMockChain({ data: { id: 'group-uuid' }, error: null });
      }
      // admin_users: first call = duplicate check (null), second call = insert (ok)
      return createMockChain({ data: null, error: null });
    });

    // Mock: auth createUser success
    mockCreateUser.mockResolvedValue({
      data: { user: { id: 'new-user-id' } },
      error: null,
    });

    const { POST } = await import('../admin-users/route');
    const req = new NextRequest('http://localhost/api/admin-users', {
      method: 'POST',
      body: JSON.stringify({ email: 'osmar@test.com', password: 'secret123', role: 'group_admin', group_id: 'group-uuid' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('osmar@test.com');
    expect(body.data.role).toBe('group_admin');
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'osmar@test.com',
      password: 'secret123',
      email_confirm: true,
    });
  });

  it('rejects password shorter than 6 chars', async () => {
    mockWithTenant.mockResolvedValue(superAdminContext());

    const { POST } = await import('../admin-users/route');
    const req = new NextRequest('http://localhost/api/admin-users', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', password: '123', role: 'group_admin', group_id: 'g1' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.message).toContain('6 caracteres');
  });

  it('rejects invalid role', async () => {
    mockWithTenant.mockResolvedValue(superAdminContext());

    const { POST } = await import('../admin-users/route');
    const req = new NextRequest('http://localhost/api/admin-users', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', password: 'secret123', role: 'invalid_role' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects group_admin without group_id', async () => {
    mockWithTenant.mockResolvedValue(superAdminContext());

    const { POST } = await import('../admin-users/route');
    const req = new NextRequest('http://localhost/api/admin-users', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', password: 'secret123', role: 'group_admin' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.message).toContain('group_id');
  });

  it('rejects duplicate email', async () => {
    const ctx = superAdminContext();
    mockWithTenant.mockResolvedValue(ctx);

    // Mock: groups check → found, admin_users duplicate check → existing user found
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'groups') {
        return createMockChain({ data: { id: 'g1' }, error: null });
      }
      return createMockChain({ data: { id: 'existing' }, error: null });
    });

    // Mock: auth user exists for the existing admin_users record
    mockGetUserById.mockResolvedValue({ data: { user: { id: 'existing' } }, error: null });

    const { POST } = await import('../admin-users/route');
    const req = new NextRequest('http://localhost/api/admin-users', {
      method: 'POST',
      body: JSON.stringify({ email: 'existing@test.com', password: 'secret123', role: 'group_admin', group_id: 'g1' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('DUPLICATE');
  });

  it('returns 403 for group_admin', async () => {
    mockWithTenant.mockResolvedValue(groupAdminContext());

    const { POST } = await import('../admin-users/route');
    const req = new NextRequest('http://localhost/api/admin-users', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', password: 'secret123', role: 'group_admin', group_id: 'g1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin-users/[id]/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('resets password for existing admin user', async () => {
    mockWithTenant.mockResolvedValue(superAdminContext());

    mockAdminFrom.mockImplementation(() => {
      return createMockChain({ data: { id: 'target-id', email: 'target@test.com' }, error: null });
    });

    mockUpdateUserById.mockResolvedValue({ data: { user: {} }, error: null });

    const { POST } = await import('../admin-users/[id]/reset-password/route');
    const req = new NextRequest('http://localhost/api/admin-users/target-id/reset-password', {
      method: 'POST',
      body: JSON.stringify({ password: 'newpassword123' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'target-id' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('target@test.com');
    expect(mockUpdateUserById).toHaveBeenCalledWith('target-id', { password: 'newpassword123' });
  });

  it('rejects short password', async () => {
    mockWithTenant.mockResolvedValue(superAdminContext());

    const { POST } = await import('../admin-users/[id]/reset-password/route');
    const req = new NextRequest('http://localhost/api/admin-users/target-id/reset-password', {
      method: 'POST',
      body: JSON.stringify({ password: '12' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'target-id' }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.message).toContain('6 caracteres');
  });

  it('returns 404 for non-existent user', async () => {
    mockWithTenant.mockResolvedValue(superAdminContext());

    mockAdminFrom.mockImplementation(() => {
      return createMockChain({ data: null, error: null });
    });

    const { POST } = await import('../admin-users/[id]/reset-password/route');
    const req = new NextRequest('http://localhost/api/admin-users/nonexistent/reset-password', {
      method: 'POST',
      body: JSON.stringify({ password: 'newpassword123' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'nonexistent' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 for group_admin', async () => {
    mockWithTenant.mockResolvedValue(groupAdminContext());

    const { POST } = await import('../admin-users/[id]/reset-password/route');
    const req = new NextRequest('http://localhost/api/admin-users/target-id/reset-password', {
      method: 'POST',
      body: JSON.stringify({ password: 'newpassword123' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'target-id' }) });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin-users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('deletes admin user', async () => {
    const ctx = superAdminContext();
    mockWithTenant.mockResolvedValue(ctx);

    // Mock: user exists
    const selectChain = createMockChain({ data: { id: 'target-id', email: 't@t.com' }, error: null });
    const deleteChain = createMockChain({ data: null, error: null });
    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? selectChain : deleteChain;
    });

    mockDeleteAuthUser.mockResolvedValue({ data: null, error: null });

    const { DELETE } = await import('../admin-users/[id]/route');
    const req = new NextRequest('http://localhost/api/admin-users/target-id', { method: 'DELETE' });

    const res = await DELETE(req, { params: Promise.resolve({ id: 'target-id' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDeleteAuthUser).toHaveBeenCalledWith('target-id');
  });

  it('prevents self-deletion', async () => {
    const ctx = superAdminContext();
    mockWithTenant.mockResolvedValue(ctx);

    const { DELETE } = await import('../admin-users/[id]/route');
    const req = new NextRequest('http://localhost/api/admin-users/super-user-id', { method: 'DELETE' });

    const res = await DELETE(req, { params: Promise.resolve({ id: 'super-user-id' }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
