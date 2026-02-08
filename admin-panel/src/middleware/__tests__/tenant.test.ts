import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTenant, applyTenantFilter, TenantContext } from '../tenant';

// Mock Supabase client functions
const mockGetUser = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

describe('withTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns UNAUTHORIZED when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await withTenant();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
      expect(result.error.message).toBe('Authentication required');
      expect(result.status).toBe(401);
    }
  });

  it('returns FORBIDDEN when user has no email', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: null } },
    });

    const result = await withTenant();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
      expect(result.error.message).toBe('User email not available');
      expect(result.status).toBe(403);
    }
  });

  it('returns FORBIDDEN when user is not in admin_users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@test.com' } },
    });
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

    const result = await withTenant();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
      expect(result.error.message).toBe('User not authorized for admin access');
      expect(result.status).toBe(403);
    }
  });

  it('returns FORBIDDEN when admin role is unknown', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@test.com' } },
    });
    mockSingle.mockResolvedValue({
      data: { role: 'viewer', group_id: null },
      error: null,
    });

    const result = await withTenant();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
      expect(result.error.message).toBe('Unknown admin role');
      expect(result.status).toBe(403);
    }
  });

  it('returns groupFilter null for super_admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'admin@test.com' } },
    });
    mockSingle.mockResolvedValue({
      data: { role: 'super_admin', group_id: null },
      error: null,
    });

    const result = await withTenant();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.context.role).toBe('super_admin');
      expect(result.context.groupFilter).toBeNull();
      expect(result.context.user.id).toBe('user-1');
      expect(result.context.user.email).toBe('admin@test.com');
      expect(result.context.supabase).toBeDefined();
    }
  });

  it('returns groupFilter with UUID for group_admin', async () => {
    const groupId = '550e8400-e29b-41d4-a716-446655440000';
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-2', email: 'group@test.com' } },
    });
    mockSingle.mockResolvedValue({
      data: { role: 'group_admin', group_id: groupId },
      error: null,
    });

    const result = await withTenant();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.context.role).toBe('group_admin');
      expect(result.context.groupFilter).toBe(groupId);
      expect(result.context.user.id).toBe('user-2');
    }
  });

  it('returns FORBIDDEN when group_admin has null group_id (privilege escalation prevention)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-3', email: 'broken@test.com' } },
    });
    mockSingle.mockResolvedValue({
      data: { role: 'group_admin', group_id: null },
      error: null,
    });

    const result = await withTenant();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
      expect(result.error.message).toBe('Group admin without group assignment');
      expect(result.status).toBe(403);
    }
  });

  it('queries admin_users with the authenticated user id', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-abc', email: 'abc@test.com' } },
    });
    mockSingle.mockResolvedValue({
      data: { role: 'super_admin', group_id: null },
      error: null,
    });

    await withTenant();

    expect(mockFrom).toHaveBeenCalledWith('admin_users');
    expect(mockSelect).toHaveBeenCalledWith('role, group_id');
    expect(mockEq).toHaveBeenCalledWith('id', 'user-abc');
  });
});

describe('applyTenantFilter', () => {
  it('does NOT add filter for super_admin (groupFilter is null)', () => {
    const mockQuery = { eq: vi.fn().mockReturnThis() };
    const context: TenantContext = {
      user: { id: 'u1', email: 'a@a.com' },
      role: 'super_admin',
      groupFilter: null,
      supabase: {} as TenantContext['supabase'],
    };

    const result = applyTenantFilter(mockQuery, context);

    expect(mockQuery.eq).not.toHaveBeenCalled();
    expect(result).toBe(mockQuery);
  });

  it('adds .eq("group_id", ...) filter for group_admin', () => {
    const groupId = '550e8400-e29b-41d4-a716-446655440000';
    const mockQuery = { eq: vi.fn().mockReturnThis() };
    const context: TenantContext = {
      user: { id: 'u2', email: 'b@b.com' },
      role: 'group_admin',
      groupFilter: groupId,
      supabase: {} as TenantContext['supabase'],
    };

    const result = applyTenantFilter(mockQuery, context);

    expect(mockQuery.eq).toHaveBeenCalledWith('group_id', groupId);
    expect(result).toBe(mockQuery);
  });
});
