'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/contexts/RoleContext';

/**
 * Redirects group_admin users to /dashboard.
 * Renders children only for super_admin.
 */
export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const role = useRole();
  const router = useRouter();

  useEffect(() => {
    if (role && role !== 'super_admin') {
      router.replace('/dashboard');
    }
  }, [role, router]);

  if (!role || role !== 'super_admin') {
    return null;
  }

  return <>{children}</>;
}
