import { describe, it, expect } from 'vitest';
import { preventSelfRoleChange } from '../guards';
import type { TenantContext } from '../tenant';

function makeContext(role: 'super_admin' | 'group_admin'): TenantContext {
  return {
    user: { id: 'user-1', email: 'test@test.com' },
    role,
    groupFilter: role === 'super_admin' ? null : 'group-id-1',
    supabase: {} as TenantContext['supabase'],
  };
}

describe('preventSelfRoleChange', () => {
  it('blocks group_admin from changing role', () => {
    const context = makeContext('group_admin');
    const body = { role: 'super_admin', name: 'test' };

    const result = preventSelfRoleChange(context, body);

    expect(result.allowed).toBe(false);
    expect(result.error?.code).toBe('FORBIDDEN');
    expect(result.error?.message).toBe('Group admins cannot modify roles');
  });

  it('allows group_admin to update other fields without role', () => {
    const context = makeContext('group_admin');
    const body = { name: 'New Name', email: 'new@test.com' };

    const result = preventSelfRoleChange(context, body);

    expect(result.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('allows super_admin to change roles', () => {
    const context = makeContext('super_admin');
    const body = { role: 'group_admin' };

    const result = preventSelfRoleChange(context, body);

    expect(result.allowed).toBe(true);
  });

  it('allows group_admin with empty body', () => {
    const context = makeContext('group_admin');
    const body = {};

    const result = preventSelfRoleChange(context, body);

    expect(result.allowed).toBe(true);
  });

  it('blocks group_admin even if role value is same', () => {
    const context = makeContext('group_admin');
    const body = { role: 'group_admin' }; // Same role, still blocked

    const result = preventSelfRoleChange(context, body);

    expect(result.allowed).toBe(false);
  });
});
