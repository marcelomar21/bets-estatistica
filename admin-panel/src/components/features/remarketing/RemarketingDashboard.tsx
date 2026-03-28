'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Segment {
  key: string;
  label: string;
  description: string;
  count: number;
  membersLink: string | null;
}

interface RemarketingDashboardProps {
  role: 'super_admin' | 'group_admin';
}

const SEGMENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  trial_expired: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  trial_expiring: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  subscription_expiring: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  subscription_expired: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  inadimplente: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  cancelled_recent: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  cancelled_old: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
};

export function RemarketingDashboard({ role }: RemarketingDashboardProps) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const fetchSegments = useCallback(async (groupId: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (groupId) params.set('group_id', groupId);

      const response = await fetch(`/api/remarketing/segments?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? `Erro HTTP ${response.status}`);
        return;
      }

      const payload = await response.json();
      if (!payload.success) {
        setError(payload.error?.message ?? 'Erro ao carregar segmentos');
        return;
      }

      setSegments(payload.data.segments);
    } catch {
      setError('Erro de conexao. Verifique sua internet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role !== 'super_admin') return;
    let cancelled = false;

    async function loadGroups() {
      try {
        const res = await fetch('/api/groups');
        if (cancelled) return;
        if (res.ok) {
          const payload = await res.json();
          if (!cancelled && payload.success) setGroups(payload.data);
        }
      } catch {
        // ignore
      }
    }

    loadGroups();
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    fetchSegments(selectedGroupId);
  }, [fetchSegments, selectedGroupId]);

  async function handleExport(segmentKey: string) {
    setExportingKey(segmentKey);
    try {
      const params = new URLSearchParams({ segment: segmentKey });
      if (selectedGroupId) params.set('group_id', selectedGroupId);

      const response = await fetch(`/api/remarketing/export?${params.toString()}`);

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? 'Erro ao exportar');
        return;
      }

      const truncated = response.headers.get('X-Export-Truncated') === 'true';
      const totalHeader = response.headers.get('X-Export-Total');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remarketing-${segmentKey}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      if (truncated && totalHeader) {
        setError(`Export limitado a 5000 registros (total: ${totalHeader}). Filtre por grupo para reduzir.`);
      }
    } catch {
      setError('Erro ao baixar CSV.');
    } finally {
      setExportingKey(null);
    }
  }

  const totalUsers = segments.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Remarketing</h1>
          <p className="mt-1 text-sm text-gray-500">Segmentos de usuarios para campanhas</p>
        </div>
        <div className="rounded-lg bg-white p-3 shadow">
          <p className="text-xs text-gray-500">Total em segmentos</p>
          <p className="text-xl font-bold text-gray-900">{totalUsers}</p>
        </div>
      </div>

      {role === 'super_admin' && groups.length > 0 && (
        <div className="rounded-lg bg-white p-4 shadow">
          <label htmlFor="group-filter" className="mb-1 block text-sm font-medium text-gray-700">
            Filtrar por grupo
          </label>
          <select
            id="group-filter"
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm md:w-56"
          >
            <option value="">Todos os grupos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-500">Carregando segmentos...</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {segments.map((seg) => {
            const colors = SEGMENT_COLORS[seg.key] ?? SEGMENT_COLORS.cancelled_old;
            return (
              <div
                key={seg.key}
                className={`rounded-lg border ${colors.border} ${colors.bg} p-4 shadow-sm`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className={`text-sm font-semibold ${colors.text}`}>{seg.label}</h3>
                    <p className="mt-1 text-xs text-gray-500">{seg.description}</p>
                  </div>
                  <span className={`text-2xl font-bold ${colors.text}`}>{seg.count}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleExport(seg.key)}
                    disabled={seg.count === 0 || exportingKey === seg.key}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {exportingKey === seg.key ? 'Exportando...' : 'Exportar CSV'}
                  </button>
                  {seg.membersLink && (
                    <Link
                      href={seg.membersLink}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Ver lista
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
