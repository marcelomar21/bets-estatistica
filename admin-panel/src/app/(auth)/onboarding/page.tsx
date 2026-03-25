'use client';

import { useEffect, useState } from 'react';
import { useRole } from '@/contexts/RoleContext';
import OnboardingEditor from '@/components/features/community/OnboardingEditor';

interface GroupOption {
  id: string;
  name: string;
}

interface SettingsData {
  trial_days: number;
  subscription_price: number | null;
  welcome_message_template: string | null;
}

export default function OnboardingPage() {
  const role = useRole();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // F15: Removed router from deps — not used inside effect
  useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch('/api/me');
        const meJson = await meRes.json();

        if (!meJson.success) {
          setError('Erro ao carregar usuário');
          setLoading(false);
          return;
        }

        if (meJson.data.role === 'group_admin' && meJson.data.groupId) {
          setGroupId(meJson.data.groupId);
        } else if (meJson.data.role === 'super_admin') {
          const groupsRes = await fetch('/api/groups');
          const groupsJson = await groupsRes.json();
          if (groupsJson.success && groupsJson.data) {
            const activeGroups = groupsJson.data.filter(
              (g: GroupOption & { status: string }) => g.status !== 'deleted',
            );
            setGroups(activeGroups);
            if (activeGroups.length > 0) {
              setGroupId(activeGroups[0].id);
            }
          }
        }
      } catch {
        setError('Erro de conexão');
      }
      setLoading(false);
    }
    init();
  }, [role]);

  // Fetch settings when groupId changes
  useEffect(() => {
    if (!groupId) return;

    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const [settingsRes, groupRes] = await Promise.all([
          fetch(`/api/groups/${groupId}/community-settings`),
          fetch(`/api/groups/${groupId}`),
        ]);
        const settingsJson = await settingsRes.json();
        const groupJson = await groupRes.json();

        if (settingsJson.success) {
          setSettings(settingsJson.data);
        } else {
          setError(settingsJson.error?.message || 'Erro ao carregar configurações');
        }

        if (groupJson.success) {
          setGroupName(groupJson.data.name || '');
        }
      } catch {
        setError('Erro de conexão');
      }
      setLoading(false);
    }
    loadSettings();
  }, [groupId]);

  if (loading && !settings) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-700 rounded w-48" />
          <div className="h-64 bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  // F7: Show message when super_admin has no active groups
  if (!groupId && !loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Onboarding</h1>
        <p className="text-gray-500">Nenhum grupo ativo encontrado.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>

      {/* Group selector for super_admin */}
      {groups.length > 1 && (
        <div>
          <label htmlFor="group-select" className="block text-sm font-medium text-gray-700 mb-1">
            Grupo
          </label>
          <select
            id="group-select"
            value={groupId || ''}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {settings && groupId && (
        <OnboardingEditor
          key={groupId}
          groupId={groupId}
          initialTemplate={settings.welcome_message_template}
          groupName={groupName}
          trialDays={settings.trial_days}
          subscriptionPrice={settings.subscription_price}
        />
      )}
    </div>
  );
}
