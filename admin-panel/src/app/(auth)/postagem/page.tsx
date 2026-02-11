'use client';

import { useState, useEffect, useCallback } from 'react';
import { PostingScheduleSection } from '@/components/features/posting/PostingScheduleSection';
import { PostingQueueTable } from '@/components/features/posting/PostingQueueTable';
import type { QueueBet } from '@/components/features/posting/PostingQueueTable';
import { PostNowButton } from '@/components/features/bets/PostNowButton';

interface QueueData {
  readyCount: number;
  pendingLinkCount: number;
  pendingOddsCount: number;
  totalQueue: number;
  nextPostTime: { time: string; diff: string };
  postingSchedule: { enabled: boolean; times: string[] };
  bets: QueueBet[];
}

interface GroupOption {
  id: string;
  name: string;
  posting_schedule?: { enabled: boolean; times: string[] };
}

export default function PostagemPage() {
  const [role, setRole] = useState<'super_admin' | 'group_admin'>('group_admin');
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [queueData, setQueueData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Edit modals
  const [editingOddsBet, setEditingOddsBet] = useState<QueueBet | null>(null);
  const [editingLinkBet, setEditingLinkBet] = useState<QueueBet | null>(null);
  const [oddsInput, setOddsInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  // Fetch groups to determine role and populate selector
  useEffect(() => {
    async function fetchGroups() {
      try {
        const res = await fetch('/api/groups');
        const json = await res.json();

        if (res.ok && json.success && json.data) {
          const groupList = Array.isArray(json.data) ? json.data : json.data.items ?? [];
          setGroups(groupList.map((g: GroupOption) => ({
            id: g.id,
            name: g.name,
            posting_schedule: g.posting_schedule,
          })));
          setRole('super_admin');

          if (groupList.length > 0) {
            setSelectedGroupId(groupList[0].id);
          }
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

  const fetchQueue = useCallback(async () => {
    if (!groupsLoaded) return;

    if (role === 'super_admin' && !selectedGroupId) {
      setQueueData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedGroupId) params.set('group_id', selectedGroupId);

      const res = await fetch(`/api/bets/queue?${params}`);
      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao carregar fila');
        return;
      }

      setQueueData(json.data);
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId, role, groupsLoaded]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  async function handlePromoteBet(betId: number) {
    try {
      const res = await fetch(`/api/bets/${betId}/promote`, { method: 'POST' });
      const json = await res.json();

      if (!json.success) {
        showToast(json.error?.message ?? 'Erro ao promover aposta', 'error');
        return;
      }

      showToast('Aposta promovida para a fila de postagem!', 'success');
      fetchQueue();
    } catch {
      showToast('Erro de conexao', 'error');
    }
  }

  async function handleRemoveBet(betId: number) {
    try {
      const res = await fetch(`/api/bets/${betId}/remove`, { method: 'POST' });
      const json = await res.json();

      if (!json.success) {
        showToast(json.error?.message ?? 'Erro ao remover aposta', 'error');
        return;
      }

      showToast('Aposta removida da fila', 'success');
      fetchQueue();
    } catch {
      showToast('Erro de conexao', 'error');
    }
  }

  function handleEditOdds(bet: QueueBet) {
    setEditingOddsBet(bet);
    setOddsInput(bet.odds?.toString() ?? '');
    setModalError('');
  }

  function handleEditLink(bet: QueueBet) {
    setEditingLinkBet(bet);
    setLinkInput(bet.deep_link ?? '');
    setModalError('');
  }

  async function handleSaveOdds() {
    if (!editingOddsBet) return;
    const odds = parseFloat(oddsInput);

    if (isNaN(odds) || odds <= 1) {
      setModalError('Odds deve ser um numero maior que 1');
      return;
    }

    setModalSaving(true);
    setModalError('');

    try {
      const res = await fetch(`/api/bets/${editingOddsBet.id}/odds`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ odds }),
      });

      const json = await res.json();
      if (!json.success) {
        setModalError(json.error?.message ?? 'Erro ao salvar');
        return;
      }

      const promoted = json.data.promoted;
      showToast(
        promoted
          ? `Odds ${odds.toFixed(2)} salvo. Aposta promovida para a fila!`
          : `Odds atualizado para ${odds.toFixed(2)}`,
        'success',
      );
      setEditingOddsBet(null);
      fetchQueue();
    } catch {
      setModalError('Erro de conexao');
    } finally {
      setModalSaving(false);
    }
  }

  async function handleSaveLink() {
    if (!editingLinkBet) return;
    const link = linkInput.trim() || null;

    if (link && !link.startsWith('http')) {
      setModalError('Link deve comecar com http:// ou https://');
      return;
    }

    setModalSaving(true);
    setModalError('');

    try {
      const res = await fetch(`/api/bets/${editingLinkBet.id}/link`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link }),
      });

      const json = await res.json();
      if (!json.success) {
        setModalError(json.error?.message ?? 'Erro ao salvar');
        return;
      }

      const promoted = json.data.promoted;
      showToast(
        promoted
          ? 'Link salvo. Aposta promovida para a fila!'
          : 'Link atualizado',
        'success',
      );
      setEditingLinkBet(null);
      fetchQueue();
    } catch {
      setModalError('Erro de conexao');
    } finally {
      setModalSaving(false);
    }
  }

  const currentGroup = groups.find(g => g.id === selectedGroupId);
  const scheduleForGroup = currentGroup?.posting_schedule ?? queueData?.postingSchedule ?? { enabled: true, times: ['10:00', '15:00', '22:00'] };

  // Separate bets the bot WILL post from bets still missing data
  // Mirrors getBetsReadyForPosting(): has link + (odds >= 1.60 OR promovida_manual)
  // Already-posted bets are always postable (they stay in queue until kickoff)
  const MIN_ODDS = 1.60;
  function isPostable(b: QueueBet): boolean {
    if (b.bet_status === 'posted') return true;
    if (!b.has_link) return false;
    return b.promovida_manual || (b.odds !== null && b.odds >= MIN_ODDS);
  }
  const postableBets = queueData?.bets.filter(isPostable) ?? [];
  const pendingBets = queueData?.bets.filter(b => !isPostable(b)) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Postagem</h1>

        {role === 'super_admin' && groups.length > 0 && (
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Configuration Section */}
      {(selectedGroupId || role === 'group_admin') && groupsLoaded && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <PostingScheduleSection
            groupId={selectedGroupId}
            initialSchedule={scheduleForGroup}
            onSaved={fetchQueue}
            standalone={true}
          />
        </div>
      )}

      {/* Queue Summary */}
      {queueData && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Resumo da Fila</h3>
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-600">
                Proximo horario:{' '}
                <span className="font-semibold text-gray-900">{queueData.nextPostTime.time}</span>
                <span className="ml-1 text-gray-500">(em {queueData.nextPostTime.diff})</span>
              </div>
              <button
                onClick={fetchQueue}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                title="Atualizar"
              >
                <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md bg-green-50 p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{queueData.readyCount}</div>
              <div className="text-xs text-green-600">prontas</div>
            </div>
            <div className="rounded-md bg-yellow-50 p-3 text-center">
              <div className="text-2xl font-bold text-yellow-700">{queueData.pendingLinkCount}</div>
              <div className="text-xs text-yellow-600">sem link</div>
            </div>
            <div className="rounded-md bg-orange-50 p-3 text-center">
              <div className="text-2xl font-bold text-orange-700">{queueData.pendingOddsCount}</div>
              <div className="text-xs text-orange-600">sem odds</div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button onClick={fetchQueue} className="ml-2 underline hover:no-underline">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && !queueData && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      )}

      {/* Postable Bets — Fila de Postagem */}
      {queueData && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Fila de Postagem
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({postableBets.length} aposta{postableBets.length !== 1 ? 's' : ''} elegivel{postableBets.length !== 1 ? 'is' : ''})
              </span>
            </h2>
            <PostNowButton
              readyCount={postableBets.length}
              groupId={selectedGroupId || undefined}
              onPostComplete={fetchQueue}
            />
          </div>
          <PostingQueueTable
            bets={postableBets}
            onRemove={handleRemoveBet}
            emptyMessage="Nenhuma aposta elegivel para postagem."
          />
        </div>
      )}

      {/* Pending Bets — Apostas Pendentes */}
      {queueData && pendingBets.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Apostas Pendentes
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({pendingBets.length} aposta{pendingBets.length !== 1 ? 's' : ''} faltando dados)
            </span>
          </h2>
          <p className="text-sm text-gray-500">
            Preencha odds e link para promover a aposta para a fila de postagem.
          </p>
          <PostingQueueTable
            bets={pendingBets}
            onPromote={handlePromoteBet}
            onEditOdds={handleEditOdds}
            onEditLink={handleEditLink}
            emptyMessage="Nenhuma aposta pendente."
          />
        </div>
      )}

      {/* No group selected */}
      {role === 'super_admin' && !selectedGroupId && groupsLoaded && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            Selecione um grupo para visualizar a fila de postagem.
          </p>
        </div>
      )}

      {/* Odds Edit Modal */}
      {editingOddsBet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Editar Odds</h3>
            <p className="mt-1 text-sm text-gray-500">
              {editingOddsBet.match.home_team_name} x {editingOddsBet.match.away_team_name}
            </p>
            <p className="text-xs text-gray-400">
              {editingOddsBet.bet_market} — {editingOddsBet.bet_pick}
            </p>

            <input
              type="number"
              step="0.01"
              min="1.01"
              value={oddsInput}
              onChange={(e) => setOddsInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveOdds()}
              className="mt-3 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Ex: 1.85"
              autoFocus
            />

            {modalError && (
              <p className="mt-2 text-sm text-red-600">{modalError}</p>
            )}

            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => setEditingOddsBet(null)}
                disabled={modalSaving}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveOdds}
                disabled={modalSaving}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {modalSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Edit Modal */}
      {editingLinkBet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Editar Link</h3>
            <p className="mt-1 text-sm text-gray-500">
              {editingLinkBet.match.home_team_name} x {editingLinkBet.match.away_team_name}
            </p>
            <p className="text-xs text-gray-400">
              {editingLinkBet.bet_market} — {editingLinkBet.bet_pick}
            </p>

            <input
              type="url"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveLink()}
              className="mt-3 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="https://..."
              autoFocus
            />

            {modalError && (
              <p className="mt-2 text-sm text-red-600">{modalError}</p>
            )}

            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => setEditingLinkBet(null)}
                disabled={modalSaving}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveLink}
                disabled={modalSaving}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {modalSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
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
