'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SuggestedBetListItem, BetPagination, BetCounters, OddsHistoryEntry } from '@/types/database';
import { BetTable } from '@/components/features/bets/BetTable';
import { BetStatsBar } from '@/components/features/bets/BetStatsBar';
import { BetFilters, type BetFilterValues } from '@/components/features/bets/BetFilters';
import { OddsEditModal } from '@/components/features/bets/OddsEditModal';
import { BulkOddsModal } from '@/components/features/bets/BulkOddsModal';
import { LinkEditModal } from '@/components/features/bets/LinkEditModal';
import { BulkLinksModal } from '@/components/features/bets/BulkLinksModal';

const DEFAULT_FILTERS: BetFilterValues = {
  status: '',
  elegibilidade: '',
  group_id: '',
  has_odds: '',
  has_link: '',
  search: '',
  future_only: 'true',
  date_from: '',
  date_to: '',
};

const DEFAULT_COUNTERS: BetCounters = {
  total: 0,
  ready: 0,
  posted: 0,
  pending_link: 0,
  pending_odds: 0,
  sem_odds: 0,
  sem_link: 0,
};

const DEFAULT_PAGINATION: BetPagination = {
  page: 1,
  per_page: 50,
  total: 0,
  total_pages: 0,
};

export default function BetsPage() {
  const [bets, setBets] = useState<SuggestedBetListItem[]>([]);
  const [pagination, setPagination] = useState<BetPagination>(DEFAULT_PAGINATION);
  const [counters, setCounters] = useState<BetCounters>(DEFAULT_COUNTERS);
  const [filters, setFilters] = useState<BetFilterValues>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState('kickoff_time');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<'super_admin' | 'group_admin'>('group_admin');
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Modal state
  const [editingBet, setEditingBet] = useState<SuggestedBetListItem | null>(null);
  const [oddsHistory, setOddsHistory] = useState<OddsHistoryEntry[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Link modal state
  const [linkEditBet, setLinkEditBet] = useState<SuggestedBetListItem | null>(null);
  const [showBulkLinks, setShowBulkLinks] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const fetchBets = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', '50');
    params.set('sort_by', sortBy);
    params.set('sort_dir', sortDir);

    if (filters.status) params.set('status', filters.status);
    if (filters.elegibilidade) params.set('elegibilidade', filters.elegibilidade);
    if (filters.group_id) params.set('group_id', filters.group_id);
    if (filters.has_odds) params.set('has_odds', filters.has_odds);
    if (filters.has_link) params.set('has_link', filters.has_link);
    if (filters.search) params.set('search', filters.search);
    if (filters.future_only) params.set('future_only', filters.future_only);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);

    try {
      const res = await fetch(`/api/bets?${params}`);
      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao carregar apostas');
        return;
      }

      setBets(json.data.items);
      setPagination(json.data.pagination);
      setCounters(json.data.counters);

      // Detect role from response (if group_admin, items will have same group_id)
      // Role is inferred from session, but we check if groups filter is available
    } catch {
      setError('Erro de conexao ao carregar apostas');
    } finally {
      setLoading(false);
    }
  }, [filters, sortBy, sortDir]);

  // Fetch groups for super admin filter
  useEffect(() => {
    async function fetchGroups() {
      try {
        const res = await fetch('/api/groups');
        const json = await res.json();

        if (res.ok && json.success && json.data) {
          const groupList = Array.isArray(json.data) ? json.data : json.data.items ?? [];
          setGroups(groupList.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })));
          setRole('super_admin');
          return;
        }

        setGroups([]);
        setRole('group_admin');
      } catch {
        // Default to safest role on fetch failure
        setGroups([]);
        setRole('group_admin');
      }
    }
    fetchGroups();
  }, []);

  useEffect(() => {
    fetchBets(1);
  }, [fetchBets]);

  function handlePageChange(page: number) {
    setSelectedIds(new Set());
    fetchBets(page);
  }

  function handleFilterChange(newFilters: BetFilterValues) {
    setFilters(newFilters);
    setSelectedIds(new Set());
  }

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setSelectedIds(new Set());
  }

  async function handleEditOdds(bet: SuggestedBetListItem) {
    setEditingBet(bet);
    setHistoryLoading(true);
    setOddsHistory([]);

    try {
      const res = await fetch(`/api/bets/${bet.id}`);
      const json = await res.json();
      if (json.success) {
        setOddsHistory(json.data.odds_history);
      }
    } catch {
      // History fetch is best-effort
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSaveOdds(betId: number, odds: number) {
    const res = await fetch(`/api/bets/${betId}/odds`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ odds }),
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error?.message ?? 'Erro ao salvar');
    }

    const promoted = json.data.promoted;
    showToast(
      promoted
        ? `Odds atualizado para ${odds.toFixed(2)}. Aposta promovida para "ready"!`
        : `Odds atualizado para ${odds.toFixed(2)}`,
      'success',
    );

    setEditingBet(null);
    fetchBets(pagination.page);
  }

  function handleEditLink(bet: SuggestedBetListItem) {
    setLinkEditBet(bet);
  }

  async function handleSaveLink(betId: number, link: string | null) {
    const res = await fetch(`/api/bets/${betId}/link`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link }),
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error?.message ?? 'Erro ao salvar');
    }

    const promoted = json.data.promoted;
    showToast(
      promoted
        ? 'Link atualizado. Aposta promovida para "ready"!'
        : link ? 'Link atualizado' : 'Link removido',
      'success',
    );

    setLinkEditBet(null);
    fetchBets(pagination.page);
  }

  async function handleBulkLinksSave(link: string) {
    const updates = Array.from(selectedIds).map((id) => ({ id, link }));

    const res = await fetch('/api/bets/bulk/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error?.message ?? 'Erro ao atualizar em lote');
    }

    const { updated, promoted, failed } = json.data;
    showToast(
      `${updated} atualizada${updated > 1 ? 's' : ''}${promoted > 0 ? `, ${promoted} promovida${promoted > 1 ? 's' : ''}` : ''}${failed > 0 ? `, ${failed} falha${failed > 1 ? 's' : ''}` : ''}`,
      failed > 0 ? 'error' : 'success',
    );

    setShowBulkLinks(false);
    setSelectedIds(new Set());
    fetchBets(pagination.page);
  }

  async function handleBulkSave(odds: number) {
    const updates = Array.from(selectedIds).map((id) => ({ id, odds }));

    const res = await fetch('/api/bets/bulk/odds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error?.message ?? 'Erro ao atualizar em lote');
    }

    const { updated, promoted, failed } = json.data;
    showToast(
      `${updated} atualizada${updated > 1 ? 's' : ''}${promoted > 0 ? `, ${promoted} promovida${promoted > 1 ? 's' : ''}` : ''}${failed > 0 ? `, ${failed} falha${failed > 1 ? 's' : ''}` : ''}`,
      failed > 0 ? 'error' : 'success',
    );

    setShowBulkModal(false);
    setSelectedIds(new Set());
    fetchBets(pagination.page);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Apostas</h1>
      </div>

      <BetStatsBar counters={counters} />

      <BetFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        groups={groups}
        showGroupFilter={role === 'super_admin'}
      />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && role === 'super_admin' && (
        <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-700">
            {selectedIds.size} aposta{selectedIds.size > 1 ? 's' : ''} selecionada{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setShowBulkModal(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Atualizar Odds em Lote
          </button>
          <button
            onClick={() => setShowBulkLinks(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Adicionar Links em Lote
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Limpar selecao
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      ) : (
        <BetTable
          bets={bets}
          pagination={pagination}
          role={role}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onPageChange={handlePageChange}
          onEditOdds={handleEditOdds}
          onEditLink={handleEditLink}
          onSort={handleSort}
          sortBy={sortBy}
          sortDir={sortDir}
        />
      )}

      {/* Edit Modal */}
      {editingBet && (
        <OddsEditModal
          bet={editingBet}
          onClose={() => setEditingBet(null)}
          onSave={handleSaveOdds}
          oddsHistory={oddsHistory}
          loading={historyLoading}
        />
      )}

      {/* Bulk Odds Modal */}
      {showBulkModal && (
        <BulkOddsModal
          selectedCount={selectedIds.size}
          onClose={() => setShowBulkModal(false)}
          onSave={handleBulkSave}
        />
      )}

      {/* Link Edit Modal */}
      {linkEditBet && (
        <LinkEditModal
          bet={linkEditBet}
          onClose={() => setLinkEditBet(null)}
          onSave={handleSaveLink}
        />
      )}

      {/* Bulk Links Modal */}
      {showBulkLinks && (
        <BulkLinksModal
          selectedCount={selectedIds.size}
          onClose={() => setShowBulkLinks(false)}
          onSave={handleBulkLinksSave}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 bottom-4 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
