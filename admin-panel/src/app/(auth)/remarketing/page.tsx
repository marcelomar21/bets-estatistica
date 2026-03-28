'use client';

import { useEffect, useState } from 'react';
import { RemarketingDashboard } from '@/components/features/remarketing/RemarketingDashboard';

export default function RemarketingPage() {
  const [role, setRole] = useState<'super_admin' | 'group_admin'>('group_admin');
  const [roleResolved, setRoleResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveRole() {
      try {
        const response = await fetch('/api/me');
        if (cancelled) return;
        if (response.ok) {
          const payload = await response.json();
          if (cancelled) return;
          const roleValue = payload?.success ? payload?.data?.role : null;
          if (roleValue === 'super_admin' || roleValue === 'group_admin') {
            setRole(roleValue);
          }
        }
      } catch {
        // fallback: group_admin
      } finally {
        if (!cancelled) setRoleResolved(true);
      }
    }

    resolveRole();
    return () => { cancelled = true; };
  }, []);

  if (!roleResolved) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    );
  }

  return <RemarketingDashboard role={role} />;
}
