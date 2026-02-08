'use client';

import { useEffect, useState, useCallback } from 'react';
import type { DashboardData } from '@/types/database';
import StatCard from '@/components/features/dashboard/StatCard';
import GroupSummaryCard from '@/components/features/dashboard/GroupSummaryCard';
import AlertsSection from '@/components/features/dashboard/AlertsSection';

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
            <div className="h-8 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
      {/* Group cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-32 mb-3" />
            <div className="h-4 bg-gray-200 rounded w-20" />
          </div>
        ))}
      </div>
      {/* Alerts skeleton */}
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-24 mb-4" />
        <div className="h-4 bg-gray-200 rounded w-full" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? `Erro HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao carregar dashboard');
        return;
      }
      setData(json.data);
    } catch {
      setError('Erro de conexao. Verifique sua internet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchDashboard}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="space-y-8">
        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Grupos Ativos" value={data.summary.groups.active} subtitle={`${data.summary.groups.total} total`} icon="👥" />
          <StatCard title="Membros Ativos" value={data.summary.members.total} icon="👤" />
          <StatCard title="Bots em Uso" value={data.summary.bots.in_use} subtitle={`${data.summary.bots.total} total`} icon="🤖" />
          <StatCard title="Bots Online" value={data.summary.bots.online} subtitle={data.summary.bots.offline > 0 ? `${data.summary.bots.offline} offline` : undefined} icon="📡" />
        </div>

        {/* Group cards */}
        {data.groups.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Grupos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.groups.map((group) => (
                <GroupSummaryCard key={group.id} group={group} />
              ))}
            </div>
          </div>
        )}

        {/* Alerts */}
        <AlertsSection alerts={data.alerts} />
      </div>
    </div>
  );
}
