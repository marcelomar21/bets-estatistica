'use client';

import { useEffect, useState, useCallback } from 'react';
import type { GroupAdminDashboardData, Notification } from '@/types/database';
import { statusConfig } from '@/components/features/groups/group-utils';
import type { Group } from '@/types/database';
import StatCard from '@/components/features/dashboard/StatCard';
import NotificationsPanel from '@/components/features/dashboard/NotificationsPanel';
import PerformanceCards from '@/components/features/dashboard/PerformanceCards';
import type { AccuracyPeriods } from '@/components/features/dashboard/PerformanceCards';

function GroupAdminSkeleton() {
  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-40 mb-3" />
        <div className="h-4 bg-gray-200 rounded w-24" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
            <div className="h-8 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
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

export default function GroupAdminDashboard() {
  const [data, setData] = useState<GroupAdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [accuracyPeriods, setAccuracyPeriods] = useState<AccuracyPeriods | null>(null);

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
      /* notifications are non-critical */
    }
  }, []);

  const fetchAccuracy = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics/accuracy');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setAccuracyPeriods(json.data.periods);
      }
    } catch {
      /* accuracy is non-critical */
    }
  }, []);

  const handleMarkAsRead = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
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
    fetchDashboard();
    fetchNotifications();
    fetchAccuracy();
  }, [fetchDashboard, fetchNotifications, fetchAccuracy]);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
        <GroupAdminSkeleton />
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
            onClick={() => { fetchDashboard(); fetchNotifications(); fetchAccuracy(); }}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const groupStatus = data.group?.status as Group['status'] | undefined;
  const badge = groupStatus ? statusConfig[groupStatus] : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="space-y-8">
        {/* Group card */}
        {data.group && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{data.group.name}</h2>
                {badge && (
                  <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Performance / Accuracy */}
        {accuracyPeriods && accuracyPeriods.allTime.total > 0 ? (
          <PerformanceCards periods={accuracyPeriods} />
        ) : accuracyPeriods && accuracyPeriods.allTime.total === 0 ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Performance</h2>
            <p className="text-sm text-gray-500">Sem dados suficientes</p>
          </div>
        ) : null}

        {/* Member stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Membros Ativos" value={data.summary.members.total} icon="👤" />
          <StatCard title="Em Trial" value={data.summary.members.trial} icon="🕐" />
          <StatCard title="Pagantes" value={data.summary.members.ativo} icon="💰" />
          <StatCard title="Vencendo em 7d" value={data.summary.members.vencendo} icon="⚠️" />
        </div>

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
