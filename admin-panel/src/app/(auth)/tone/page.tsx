'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/contexts/RoleContext';
import ToneConfigForm from '@/components/features/tone/ToneConfigForm';

export default function ToneTopLevelPage() {
  const role = useRole();
  const router = useRouter();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (role !== 'group_admin') {
      setChecked(true);
      return;
    }
    // Fetch the group_admin's group and redirect to /groups/:id/tone
    async function fetchAdminGroup() {
      try {
        const res = await fetch('/api/me');
        const json = await res.json();
        if (json.success && json.data?.groupId) {
          router.replace(`/groups/${json.data.groupId}/tone`);
          return;
        }
      } catch { /* fallback below */ }
      setChecked(true);
    }
    fetchAdminGroup();
  }, [role, router]);

  if (!checked) return null;

  return <ToneConfigForm showGroupSelector />;
}
