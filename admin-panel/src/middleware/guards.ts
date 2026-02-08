import { TenantContext } from './tenant';

export interface GuardResult {
  allowed: boolean;
  error?: { code: string; message: string };
}

/**
 * Prevents a group_admin from changing their own role.
 * Must be invoked explicitly in routes that update admin_users.
 * Returns { allowed: false } with 403-level error if self-role-change is detected.
 */
export function preventSelfRoleChange(
  context: TenantContext,
  body: Record<string, unknown>,
): GuardResult {
  if (context.role === 'group_admin' && body && 'role' in body) {
    return {
      allowed: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Group admins cannot modify roles',
      },
    };
  }

  return { allowed: true };
}
