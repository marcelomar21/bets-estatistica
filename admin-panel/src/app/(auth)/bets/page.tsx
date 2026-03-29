'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SuggestedBetListItem, BetPagination, BetCounters, OddsHistoryEntry } from '@/types/database';
import { BetTable } from '@/components/features/bets/BetTable';
import { BetStatsBar } from '@/components/features/bets/BetStatsBar';
import { BetFilters, type BetFilterValues } from '@/components/features/bets/BetFilters';
import { BetEditDrawer } from '@/components/features/bets/BetEditDrawer';
import { BulkOddsModal } from '@/components/features/bets/BulkOddsModal';
import { BulkLinksModal } from '@/components/features/bets/BulkLinksModal';
import { DistributeModal } from '@/components/features/bets/DistributeModal';

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
  championship: '',
};

const DEFAULT_COUNTERS: BetCounters = {
  total: 0,
  ready: 0,
  posted: 0,
  pending_link: 0,
  pending_odds: 0,
  sem_odds: 0,
  sem_link: 0,
  pool: 0,
  distributed: 0,
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
  const [groups, setGroups] = useState<Array<{ id: string; name: string; enabled_modules?: string[] }>>([]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Drawer state (replaces separate odds/link modals)
  const [drawerBet, setDrawerBet] = useState<SuggestedBetListItem | null>(null);
  const [oddsHistory, setOddsHistory] = useState<OddsHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Bulk modal state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showBulkLinks, setShowBulkLinks] = useState(false);

  // Distribute modal state (unified for single + multi-bet)
  const [distributeBetIds, setDistributeBetIds] = useState<number[]>([]);
  const [showDistributeModal, setShowDistributeModal] = useState(false);

  // Championships extracted from loaded bets for filter dropdown
  const [knownChampionships, setKnownChampionships] = useState<string[]>([]);

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

    // hit_rate and league_name are sorted client-side (not supported by Supabase server-side)
    const isClientSort = sortBy === 'hit_rate' || sortBy === 'league_name';
    params.set('sort_by', isClientSort ? 'kickoff_time' : sortBy);
    params.set('sort_dir', isClientSort ? 'desc' : sortDir);

    if (filters.status) params.set('status', filters.status);
    if (filters.elegibilidade) params.set('elegibilidade', filters.elegibilidade);
    if (filters.group_id) params.set('group_id', filters.group_id);
    if (filters.has_odds) params.set('has_odds', filters.has_odds);
    if (filters.has_link) params.set('has_link', filters.has_link);
    if (filters.search) params.set('search', filters.search);
    if (filters.future_only) params.set('future_only', filters.future_only);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    if (filters.championship) params.set('championship', filters.championship);

    try {
      const res = await fetch(`/api/bets?${params}`);
      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao carregar apostas');
        return;
      }

      let items = json.data.items;

      // Client-side sort for fields not sortable via Supabase
      if (isClientSort) {
        items = [...items].sort((a: SuggestedBetListItem, b: SuggestedBetListItem) => {
          if (sortBy === 'league_name') {
            const nameA = a.league_matches?.league_seasons?.league_name ?? '';
            const nameB = b.league_matches?.league_seasons?.league_name ?? '';
            const cmp = nameA.localeCompare(nameB, 'pt-BR');
            return sortDir === 'asc' ? cmp : -cmp;
          }
          const rateA = a.hit_rate?.rate ?? -1;
          const rateB = b.hit_rate?.rate ?? -1;
          return sortDir === 'asc' ? rateA - rateB : rateB - rateA;
        });
      }

      setBets(items);
      setPagination(json.data.pagination);
      setCounters(json.data.counters);

      // Extract unique championship names for filter dropdown (accumulate across loads)
      const newLeagues = new Set<string>();
      for (const item of items) {
        const name = item.league_matches?.league_seasons?.league_name;
        if (name) newLeagues.add(name);
      }
      if (newLeagues.size > 0) {
        setKnownChampionships(prev => {
          const merged = new Set([...prev, ...newLeagues]);
          const sorted = Array.from(merged).sort((a, b) => a.localeCompare(b, 'pt-BR'));
          if (sorted.length === prev.length && sorted.every((v, i) => v === prev[i])) return prev;
          return sorted;
        });
      }
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
          setGroups(groupList.map((g: { id: string; name: string; enabled_modules?: string[] }) => ({ id: g.id, name: g.name, enabled_modules: g.enabled_modules })));
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

  // Open the drawer for a bet and load odds history
  async function handleEditBet(bet: SuggestedBetListItem) {
    setDrawerBet(bet);
    setHistoryLoading(true);
    setOddsHistory([]);

    // Scroll to the bet row
    setTimeout(() => {
      document.getElementById(`bet-row-${bet.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

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

  // Optimistic update helper: update a bet in local state
  function updateBetLocally(betId: number, updates: Partial<SuggestedBetListItem>) {
    setBets(prev => prev.map(b =>
      b.id === betId ? { ...b, ...updates } : b
    ));
    // Also update drawer bet if it's the one being edited
    setDrawerBet(prev =>
      prev && prev.id === betId ? { ...prev, ...updates } : prev
    );
  }

  // Save odds with optimistic update (drawer stays open)
  async function handleDrawerSaveOdds(betId: number, odds: number) {
    const res = await fetch(`/api/bets/${betId}/odds`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ odds }),
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error?.message ?? 'Erro ao salvar');
    }

    const newStatus = json.data.bet?.bet_status ?? json.data.promoted ? 'ready' : undefined;
    updateBetLocally(betId, {
      odds,
      ...(newStatus ? { bet_status: newStatus } : {}),
    });

    // Refresh counters in background
    fetchCounters();

    // Refresh odds history
    try {
      const histRes = await fetch(`/api/bets/${betId}`);
      const histJson = await histRes.json();
      if (histJson.success) {
        setOddsHistory(histJson.data.odds_history);
      }
    } catch {
      // best-effort
    }

    const promoted = json.data.promoted;
    showToast(
      promoted
        ? `Odds atualizado para ${odds.toFixed(2)}. Aposta promovida para "ready"!`
        : `Odds atualizado para ${odds.toFixed(2)}`,
      'success',
    );
  }

  // Save link with optimistic update (drawer stays open)
  async function handleDrawerSaveLink(betId: number, link: string | null) {
    const res = await fetch(`/api/bets/${betId}/link`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link }),
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error?.message ?? 'Erro ao salvar');
    }

    const newStatus = json.data.bet?.bet_status ?? json.data.promoted ? 'ready' : undefined;
    updateBetLocally(betId, {
      deep_link: link,
      ...(newStatus ? { bet_status: newStatus } : {}),
    });

    // Refresh counters in background
    fetchCounters();

    const promoted = json.data.promoted;
    showToast(
      promoted
        ? 'Link atualizado. Aposta promovida para "ready"!'
        : link ? 'Link atualizado' : 'Link removido',
      'success',
    );
  }

  // Fetch only counters (lightweight refresh after optimistic update)
  async function fetchCounters() {
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('per_page', '1');
      if (filters.status) params.set('status', filters.status);
      if (filters.elegibilidade) params.set('elegibilidade', filters.elegibilidade);
      if (filters.group_id) params.set('group_id', filters.group_id);
      if (filters.has_odds) params.set('has_odds', filters.has_odds);
      if (filters.has_link) params.set('has_link', filters.has_link);
      if (filters.search) params.set('search', filters.search);
      if (filters.future_only) params.set('future_only', filters.future_only);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      if (filters.championship) params.set('championship', filters.championship);

      const res = await fetch(`/api/bets?${params}`);
      const json = await res.json();
      if (json.success) {
        setCounters(json.data.counters);
      }
    } catch {
      // best-effort counter refresh
    }
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

  function openDistributeModal(betIds: number[]) {
    setDistributeBetIds(betIds);
    setShowDistributeModal(true);
  }

  function handleDistributed() {
    setShowDistributeModal(false);
    setDistributeBetIds([]);
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
        championships={knownChampionships}
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
            onClick={() => openDistributeModal(Array.from(selectedIds))}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Distribuir Selecionadas
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
          onEditOdds={handleEditBet}
          onEditBet={handleEditBet}
          onDistribute={role === 'super_admin' ? (bet) => openDistributeModal([bet.id]) : undefined}
          onSort={handleSort}
          sortBy={sortBy}
          sortDir={sortDir}
          activeBetId={drawerBet?.id ?? null}
        />
      )}

      {/* Edit Drawer (replaces separate OddsEditModal + LinkEditModal) */}
      {drawerBet && (
        <BetEditDrawer
          bet={drawerBet}
          onClose={() => setDrawerBet(null)}
          onSaveOdds={handleDrawerSaveOdds}
          onSaveLink={handleDrawerSaveLink}
          oddsHistory={oddsHistory}
          historyLoading={historyLoading}
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

      {/* Distribute Modal (unified: single + multi-bet, multi-group) */}
      <DistributeModal
        isOpen={showDistributeModal}
        onClose={() => { setShowDistributeModal(false); setDistributeBetIds([]); }}
        selectedBetIds={distributeBetIds}
        onDistributed={handleDistributed}
        role={role}
        userGroupId={role === 'group_admin' && groups.length === 1 ? groups[0].id : null}
      />

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
