'use client';

import { useState, useEffect, useCallback } from 'react';
import { PostingHistoryTable } from '@/components/features/posting/PostingHistoryTable';
import type { HistoryBet } from '@/components/features/posting/PostingHistoryTable';

interface GroupOption {
  id: string;
  name: string;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

interface Counters {
  total: number;
  posted: number;
  pending: number;
  success_rate: number;
}

const DEFAULT_PAGINATION: Pagination = { page: 1, per_page: 50, total: 0, total_pages: 0 };
const DEFAULT_COUNTERS: Counters = { total: 0, posted: 0, pending: 0, success_rate: 100 };

export default function PostingHistoryPage() {
  const [role, setRole] = useState<'super_admin' | 'group_admin'>('group_admin');
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [groupsLoaded, setGroupsLoaded] = useState(false);

  const [bets, setBets] = useState<HistoryBet[]>([]);
  const [pagination, setPagination] = useState<Pagination>(DEFAULT_PAGINATION);
  const [counters, setCounters] = useState<Counters>(DEFAULT_COUNTERS);
  const [sortBy, setSortBy] = useState('telegram_posted_at');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch groups to determine role
  useEffect(() => {
    async function fetchGroups() {
      try {
        const res = await fetch('/api/groups');
        const json = await res.json();

        if (res.ok && json.success && json.data) {
          const groupList = Array.isArray(json.data) ? json.data : json.data.items ?? [];
          setGroups(groupList.map((g: GroupOption) => ({ id: g.id, name: g.name })));
          setRole('super_admin');
          // Don't pre-select — show all groups by default for super_admin
        } else {
          setGroups([]);
          setRole('group_admin');
        }
      } catch {
        setGroups([]);
        setRole('group_admin');
      } finally {
        setGroupsLoaded(true);
      }
    }
    fetchGroups();
  }, []);

  const fetchHistory = useCallback(async (page = 1) => {
    if (!groupsLoaded) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('per_page', '50');
      params.set('sort_by', sortBy);
      params.set('sort_dir', sortDir);
      if (selectedGroupId) params.set('group_id', selectedGroupId);

      const res = await fetch(`/api/bets/posting-history?${params}`);
      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao carregar historico');
        return;
      }

      setBets(json.data.items);
      setPagination(json.data.pagination);
      setCounters(json.data.counters);
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId, sortBy, sortDir, groupsLoaded]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Historico de Postagens</h1>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{counters.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Postadas</p>
          <p className="text-2xl font-bold text-blue-600">{counters.posted}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Pendentes</p>
          <p className="text-2xl font-bold text-yellow-600">{counters.pending}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Taxa de Sucesso</p>
          <p className="text-2xl font-bold text-green-600">{counters.success_rate}%</p>
        </div>
      </div>

      {/* Group filter (super_admin only) */}
      {role === 'super_admin' && groups.length > 0 && (
        <div className="flex items-center gap-3">
          <label htmlFor="group-filter" className="text-sm font-medium text-gray-700">
            Grupo:
          </label>
          <select
            id="group-filter"
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white"
          >
            <option value="">Todos os grupos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Carregando...</div>
        ) : (
          <PostingHistoryTable
            bets={bets}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}
      </div>

      {/* Pagination */}
      {!loading && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            Pagina {pagination.page} de {pagination.total_pages} ({pagination.total} registros)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchHistory(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Anterior
            </button>
            <button
              onClick={() => fetchHistory(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Proximo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
