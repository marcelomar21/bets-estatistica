'use client';

import { useState, useEffect, useCallback } from 'react';
import { PostingHistoryTable } from '@/components/features/posting/PostingHistoryTable';
import { PostingHistoryFilters } from '@/components/features/posting/PostingHistoryFilters';
import { ResultEditModal } from '@/components/features/posting/ResultEditModal';
import type { HistoryBet } from '@/components/features/posting/PostingHistoryTable';
import type { PostingHistoryFilterState } from '@/components/features/posting/PostingHistoryFilters';

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
  success: number;
  failure: number;
  hit_rate: number;
}

const DEFAULT_PAGINATION: Pagination = { page: 1, per_page: 50, total: 0, total_pages: 0 };
const DEFAULT_COUNTERS: Counters = { total: 0, success: 0, failure: 0, hit_rate: 0 };
const DEFAULT_FILTERS: PostingHistoryFilterState = {
  group_id: '',
  bet_result: '',
  championship: '',
  market: '',
  date_from: '',
  date_to: '',
};

export default function PostingHistoryPage() {
  const [role, setRole] = useState<'super_admin' | 'group_admin'>('group_admin');
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);

  const [filters, setFilters] = useState<PostingHistoryFilterState>(DEFAULT_FILTERS);
  const [bets, setBets] = useState<HistoryBet[]>([]);
  const [pagination, setPagination] = useState<Pagination>(DEFAULT_PAGINATION);
  const [counters, setCounters] = useState<Counters>(DEFAULT_COUNTERS);
  const [sortBy, setSortBy] = useState('telegram_posted_at');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Result edit modal
  const [editingBet, setEditingBet] = useState<HistoryBet | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
      if (filters.group_id) params.set('group_id', filters.group_id);
      if (filters.bet_result) params.set('bet_result', filters.bet_result);
      if (filters.championship) params.set('championship', filters.championship);
      if (filters.market) params.set('market', filters.market);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);

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
  }, [filters, sortBy, sortDir, groupsLoaded]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  }

  async function handleSaveResult(betId: number, betResult: string, reason: string) {
    const res = await fetch(`/api/bets/${betId}/result`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bet_result: betResult, result_reason: reason }),
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error?.message ?? 'Erro ao salvar resultado');
    }

    setEditingBet(null);
    setToast({ message: 'Resultado atualizado com sucesso', type: 'success' });
    fetchHistory(pagination.page);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Histórico de Postagens</h1>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Postadas</p>
          <p className="text-2xl font-bold text-gray-900">{counters.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Acertos</p>
          <p className="text-2xl font-bold text-green-600">{counters.success}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Erros</p>
          <p className="text-2xl font-bold text-red-600">{counters.failure}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Taxa de Acerto</p>
          <p className="text-2xl font-bold text-blue-600">{counters.hit_rate}%</p>
        </div>
      </div>

      {/* Filters */}
      <PostingHistoryFilters
        filters={filters}
        onChange={setFilters}
        groups={groups}
        showGroupFilter={role === 'super_admin'}
      />

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
            onEditResult={setEditingBet}
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

      {/* Result edit modal */}
      {editingBet && (
        <ResultEditModal
          bet={editingBet}
          onClose={() => setEditingBet(null)}
          onSave={handleSaveResult}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
