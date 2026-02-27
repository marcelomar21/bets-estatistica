'use client';

import { useEffect, useState, useCallback } from 'react';
import type { DashboardData, Notification } from '@/types/database';
import Link from 'next/link';
import StatCard from '@/components/features/dashboard/StatCard';
import GroupSummaryCard from '@/components/features/dashboard/GroupSummaryCard';
import NotificationsPanel from '@/components/features/dashboard/NotificationsPanel';
import PerformanceCards from '@/components/features/dashboard/PerformanceCards';
import type { AccuracyPeriods, GroupAccuracy } from '@/components/features/dashboard/PerformanceCards';
import GroupAdminDashboard from '@/components/features/dashboard/GroupAdminDashboard';

interface JobHealthData {
  total_jobs: number;
  failed_count: number;
  status: 'healthy' | 'degraded';
  last_error: { job_name: string; error_message: string | null; started_at: string } | null;
}

interface AccuracyData {
  total: { rate: number; wins: number; losses: number; total: number };
  periods: AccuracyPeriods;
  byGroup: GroupAccuracy[];
}

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
      {/* Notifications skeleton */}
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [role, setRole] = useState<'super_admin' | 'group_admin' | null>(null);
  const [roleResolved, setRoleResolved] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [jobHealth, setJobHealth] = useState<JobHealthData | null>(null);
  const [accuracy, setAccuracy] = useState<AccuracyData | null>(null);

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

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=20');
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success) return;
      setNotifications(json.data.notifications);
      setUnreadCount(json.data.unread_count);
    } catch {
      /* notifications are non-critical — fail silently */
    }
  }, []);

  const fetchJobHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/job-executions/summary');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setJobHealth(json.data.health);
      }
    } catch {
      /* job health is non-critical */
    }
  }, []);

  const fetchAccuracy = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics/accuracy');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setAccuracy(json.data);
      }
    } catch {
      /* accuracy is non-critical */
    }
  }, []);

  const handleMarkAsRead = useCallback(async (id: string) => {
    // Optimistic update via functional updaters (avoids stale closure on rapid clicks)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Rollback on failure
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false } : n));
      setUnreadCount(prev => prev + 1);
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      const res = await fetch('/api/notifications/mark-all-read', { method: 'PATCH' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Rollback: re-fetch to get accurate state
      fetchNotifications();
    }
  }, [fetchNotifications]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setRoleResolved(false);

      try {
        const res = await fetch('/api/me');
        if (cancelled) return;

        if (res.ok) {
          const json = await res.json();
          if (cancelled) return;

          const fetchedRole = json?.success ? json?.data?.role : null;
          if (fetchedRole === 'group_admin') {
            setRole('group_admin');
            setRoleResolved(true);
            return;
          }

          setRole('super_admin');
        } else {
          setRole('super_admin');
        }
      } catch {
        // If role fetch fails, fallback to super_admin view
        setRole('super_admin');
      }

      setRoleResolved(true);
      fetchDashboard();
      fetchNotifications();
      fetchJobHealth();
      fetchAccuracy();
    }

    initialize();
    return () => {
      cancelled = true;
    };
  }, [fetchDashboard, fetchNotifications, fetchJobHealth, fetchAccuracy]);

  // Render GroupAdminDashboard for group_admin role
  if (role === 'group_admin') {
    return <GroupAdminDashboard />;
  }

  if (!roleResolved) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
        <DashboardSkeleton />
      </div>
    );
  }

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
            onClick={() => { fetchDashboard(); fetchNotifications(); fetchJobHealth(); fetchAccuracy(); }}
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
        {/* Performance / Accuracy */}
        {accuracy && accuracy.total.total > 0 ? (
          <PerformanceCards periods={accuracy.periods} overallRate={accuracy.total} byGroup={accuracy.byGroup} />
        ) : accuracy && accuracy.total.total === 0 ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Performance</h2>
            <p className="text-sm text-gray-500">Sem dados suficientes</p>
          </div>
        ) : null}

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Grupos Ativos" value={data.summary.groups.active} subtitle={`${data.summary.groups.total} total`} icon="👥" />
          <StatCard title="Membros Ativos" value={data.summary.members.total} icon="👤" />
          <StatCard title="Bots em Uso" value={data.summary.bots.in_use} subtitle={`${data.summary.bots.total} total`} icon="🤖" />
          <StatCard title="Bots Online" value={data.summary.bots.online} subtitle={data.summary.bots.offline > 0 ? `${data.summary.bots.offline} offline` : undefined} icon="📡" />
        </div>

        {/* Job health card */}
        {jobHealth && (
          <Link href="/job-executions" className="block">
            <div className={`rounded-lg shadow p-4 flex items-center justify-between transition-colors ${
              jobHealth.status === 'degraded'
                ? 'bg-red-50 border border-red-200 hover:bg-red-100'
                : 'bg-green-50 border border-green-200 hover:bg-green-100'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{jobHealth.status === 'degraded' ? '🔴' : '🟢'}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Jobs: {jobHealth.status === 'healthy' ? 'Saudável' : 'Degradado'}
                  </p>
                  {jobHealth.status === 'degraded' && jobHealth.last_error && (
                    <p className="text-xs text-red-600 mt-0.5">
                      Falha em {jobHealth.last_error.job_name}: {jobHealth.last_error.error_message ?? 'Erro desconhecido'}
                    </p>
                  )}
                  {jobHealth.status === 'healthy' && (
                    <p className="text-xs text-green-700 mt-0.5">
                      {jobHealth.total_jobs} jobs monitorados — todos OK
                    </p>
                  )}
                </div>
              </div>
              <span className="text-sm text-gray-500">Ver detalhes →</span>
            </div>
          </Link>
        )}

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

        {/* Notifications (unread only) */}
        <NotificationsPanel
          notifications={notifications.filter(n => !n.read)}
          unreadCount={unreadCount}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllRead={handleMarkAllRead}
        />
      </div>
    </div>
  );
}
