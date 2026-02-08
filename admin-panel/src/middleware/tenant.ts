import { createClient } from '@/lib/supabase-server';
import type { AdminUser } from '@/types/database';

export interface TenantContext {
  user: { id: string; email: string };
  role: AdminUser['role'];
  groupFilter: string | null; // null = ve tudo (super_admin)
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export type TenantResult =
  | { success: true; context: TenantContext }
  | { success: false; error: { code: string; message: string }; status: number };

export async function withTenant(): Promise<TenantResult> {
  // CRITICAL: createClient uses anon key, NEVER service_role — RLS MUST apply to enforce tenant isolation
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      status: 401,
    };
  }

  if (!user.email) {
    return {
      success: false,
      error: { code: 'FORBIDDEN', message: 'User email not available' },
      status: 403,
    };
  }

  const { data: adminUser, error: dbError } = await supabase
    .from('admin_users')
    .select('role, group_id')
    .eq('id', user.id)
    .single();

  if (dbError || !adminUser) {
    return {
      success: false,
      error: { code: 'FORBIDDEN', message: 'User not authorized for admin access' },
      status: 403,
    };
  }

  const { role } = adminUser;

  // Validate role is a known value
  if (role !== 'super_admin' && role !== 'group_admin') {
    return {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Unknown admin role' },
      status: 403,
    };
  }

  // CRITICAL: Prevent privilege escalation from corrupted data
  // If group_admin has null group_id, deny access instead of granting super_admin-like access
  if (role === 'group_admin' && !adminUser.group_id) {
    return {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Group admin without group assignment' },
      status: 403,
    };
  }

  return {
    success: true,
    context: {
      user: { id: user.id, email: user.email },
      role,
      groupFilter: role === 'super_admin' ? null : adminUser.group_id,
      supabase,
    },
  };
}

/**
 * Helper to apply tenant filter to Supabase queries.
 * MUST be used on every query to tables with group_id column.
 * Super admin: no filter (sees all). Group admin: filters by group_id.
 */
export function applyTenantFilter<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  context: TenantContext,
): T {
  if (context.groupFilter) {
    return query.eq('group_id', context.groupFilter);
  }
  return query;
}
