'use client';

import { useEffect, useState, useCallback } from 'react';
import type { DashboardData, Notification } from '@/types/database';
import Link from 'next/link';
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
  postedOnly: { rate: number; wins: number; losses: number; total: number };
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
  const [channelFilter, setChannelFilter] = useState<string>('');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = channelFilter ? `?channel=${channelFilter}` : '';
      const res = await fetch(`/api/dashboard/stats${params}`);
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
  }, [channelFilter]);

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

  const handleMarkAsRead = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    // Optimistic update for all grouped notification IDs
    setNotifications(prev => prev.map(n => idSet.has(n.id) ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - ids.length));
    try {
      await Promise.all(ids.map(id =>
        fetch(`/api/notifications/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ read: true }),
          headers: { 'Content-Type': 'application/json' },
        }),
      ));
    } catch {
      // Rollback on failure
      setNotifications(prev => prev.map(n => idSet.has(n.id) ? { ...n, read: false } : n));
      setUnreadCount(prev => prev + ids.length);
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
      // fetchDashboard is handled by the channelFilter useEffect below
      fetchNotifications();
      fetchJobHealth();
      fetchAccuracy();
    }

    initialize();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchNotifications, fetchJobHealth, fetchAccuracy]);

  // Re-fetch dashboard when channel filter changes
  useEffect(() => {
    if (roleResolved && role === 'super_admin') {
      fetchDashboard();
    }
  }, [channelFilter, fetchDashboard, roleResolved, role]);

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos os Canais</option>
          <option value="telegram">Telegram</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </div>

      <div className="space-y-8">
        {/* Performance / Accuracy */}
        {accuracy && accuracy.total.total > 0 ? (
          <PerformanceCards periods={accuracy.periods} overallRate={accuracy.total} postedRate={accuracy.postedOnly} byGroup={
            // Merge all dashboard groups with accuracy data so every group appears in the ticker
            data.groups.map((g) => {
              const acc = accuracy.byGroup.find((a) => a.group_id === g.id);
              return acc ?? { group_id: g.id, group_name: g.name, rate: 0, wins: 0, total: 0 };
            })
          } />
        ) : accuracy && accuracy.total.total === 0 ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Performance</h2>
            <p className="text-sm text-gray-500">Sem dados suficientes</p>
          </div>
        ) : null}

        {/* Job health bar */}
        {jobHealth && (
          <Link href="/job-executions" className="block">
            <div className={`rounded-lg p-3 flex items-center justify-between transition-colors ${
              jobHealth.status === 'degraded'
                ? 'bg-red-50 border border-red-200 hover:bg-red-100'
                : 'bg-green-50 border border-green-200 hover:bg-green-100'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${jobHealth.status === 'degraded' ? 'bg-red-500' : 'bg-green-500'}`} />
                <p className="text-sm text-gray-700">
                  Jobs: {jobHealth.status === 'healthy' ? 'Saudável' : 'Degradado'}
                  {jobHealth.status === 'degraded' && jobHealth.last_error && (
                    <span className="text-red-600 ml-1">
                      — {jobHealth.last_error.job_name}: {jobHealth.last_error.error_message ?? 'Erro desconhecido'}
                    </span>
                  )}
                  {jobHealth.status === 'healthy' && (
                    <span className="text-gray-500 ml-1">— {jobHealth.total_jobs} monitorados</span>
                  )}
                </p>
              </div>
              <span className="text-xs text-gray-400">detalhes &rarr;</span>
            </div>
          </Link>
        )}

        {/* Groups section with inline context */}
        {data.groups.length > 0 && (
          <div>
            <div className="flex items-baseline gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Grupos</h2>
              <span className="text-sm text-gray-400">
                {data.summary.groups.active} ativos &middot; {data.summary.members.total} membros
              </span>
            </div>
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
