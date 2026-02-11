'use client';

import { useState, useEffect, useCallback } from 'react';
import { PostNowButton } from './PostNowButton';

interface QueueData {
  readyCount: number;
  pendingLinkCount: number;
  pendingOddsCount: number;
  totalQueue: number;
  nextPostTime: { time: string; diff: string };
  postingSchedule: { enabled: boolean; times: string[] };
  bets: Array<{
    id: number;
    bet_market: string;
    bet_pick: string;
    bet_status: string;
    odds: number | null;
    has_link: boolean;
    match: { home_team_name: string; away_team_name: string; kickoff_time: string };
  }>;
}

interface PostingQueueCardProps {
  groupId?: string;
  requireGroupSelection?: boolean;
}

function getBetVisualStatus(bet: QueueData['bets'][number]) {
  if (bet.bet_status === 'ready') {
    return { label: 'pronta', className: 'bg-green-100 text-green-800' };
  }
  if (!bet.has_link) {
    return { label: 'faltando link', className: 'bg-yellow-100 text-yellow-800' };
  }
  return { label: 'faltando odds', className: 'bg-orange-100 text-orange-800' };
}

export function PostingQueueCard({ groupId, requireGroupSelection = false }: PostingQueueCardProps) {
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (groupId) params.set('group_id', groupId);

      const res = await fetch(`/api/bets/queue?${params}`);
      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao carregar fila');
        return;
      }

      setData(json.data);
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (requireGroupSelection && !groupId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    fetchQueue();
  }, [fetchQueue, groupId, requireGroupSelection]);

  if (requireGroupSelection && !groupId) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          Selecione um grupo no filtro para visualizar a fila e usar o &quot;Postar Agora&quot;.
        </p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          <span className="text-sm text-gray-500">Carregando fila...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={fetchQueue} className="mt-2 text-sm text-red-600 underline hover:no-underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { readyCount, pendingLinkCount, pendingOddsCount, nextPostTime, postingSchedule, bets } = data;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Proxima Postagem</h3>
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

      <div className="flex items-center gap-4 mb-3">
        <div className="text-lg font-bold text-gray-900">
          {nextPostTime.time}
          <span className="ml-2 text-sm font-normal text-gray-500">
            (em {nextPostTime.diff})
          </span>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            postingSchedule.enabled
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {postingSchedule.enabled ? 'Habilitada' : 'Desabilitada'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="rounded-md bg-green-50 p-2 text-center">
          <div className="text-lg font-bold text-green-700">{readyCount}</div>
          <div className="text-xs text-green-600">prontas</div>
        </div>
        <div className="rounded-md bg-yellow-50 p-2 text-center">
          <div className="text-lg font-bold text-yellow-700">{pendingLinkCount}</div>
          <div className="text-xs text-yellow-600">sem link</div>
        </div>
        <div className="rounded-md bg-orange-50 p-2 text-center">
          <div className="text-lg font-bold text-orange-700">{pendingOddsCount}</div>
          <div className="text-xs text-orange-600">sem odds</div>
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Status por aposta</p>
        <div className="space-y-1">
          {bets.slice(0, 6).map((bet) => {
            const status = getBetVisualStatus(bet);
            return (
              <div key={bet.id} className="flex items-center justify-between rounded-md border border-gray-100 px-2 py-1.5">
                <span className="truncate pr-2 text-xs text-gray-700">
                  {bet.match.home_team_name} x {bet.match.away_team_name}
                </span>
                <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
            );
          })}
          {bets.length === 0 && (
            <p className="text-xs text-gray-500">Nenhuma aposta na fila.</p>
          )}
        </div>
      </div>

      <PostNowButton
        readyCount={readyCount}
        groupId={groupId}
        onPostComplete={fetchQueue}
      />
    </div>
  );
}
