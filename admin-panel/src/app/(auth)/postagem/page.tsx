'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PostingQueueTable } from '@/components/features/posting/PostingQueueTable';
import type { QueueBet } from '@/components/features/posting/PostingQueueTable';

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

// Preview types matching the API response
interface PreviewBetInfo {
  homeTeam: string;
  awayTeam: string;
  market: string;
  pick: string;
  odds: number;
  kickoffTime: string;
  deepLink: string;
}

interface PreviewBet {
  betId: number;
  preview: string;
  betInfo: PreviewBetInfo;
}

interface PreviewData {
  previewId: string;
  groupId: string;
  groupName: string;
  bets: PreviewBet[];
  expiresInMinutes: number;
}

type PreviewPhase = 'idle' | 'loading' | 'reviewing' | 'sending' | 'polling' | 'done' | 'timeout';

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 60_000;

function formatKickoffShort(isoString: string) {
  return new Date(isoString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
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

  // Bulk schedule
  const [bulkScheduleTime, setBulkScheduleTime] = useState<string>('');
  const [bulkScheduling, setBulkScheduling] = useState(false);

  // Edit modals
  const [editingOddsBet, setEditingOddsBet] = useState<QueueBet | null>(null);
  const [editingLinkBet, setEditingLinkBet] = useState<QueueBet | null>(null);
  const [oddsInput, setOddsInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Preview state
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>('idle');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewBets, setPreviewBets] = useState<PreviewBet[]>([]);
  const [editingPreviewIdx, setEditingPreviewIdx] = useState<number | null>(null);
  const [editingPreviewText, setEditingPreviewText] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [removingPreviewIdx, setRemovingPreviewIdx] = useState<number | null>(null);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [sendStatusMessage, setSendStatusMessage] = useState<string | null>(null);
  const [postedCount, setPostedCount] = useState(0);
  const [totalSendCount, setTotalSendCount] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function handleScheduleBet(betId: number, postAt: string | null) {
    try {
      const res = await fetch(`/api/bets/${betId}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_at: postAt }),
      });
      const json = await res.json();
      if (!json.success) {
        showToast(json.error?.message ?? 'Erro ao agendar horario', 'error');
        return;
      }
      // Optimistic update: patch local data instead of full refetch
      if (queueData) {
        setQueueData({
          ...queueData,
          bets: queueData.bets.map(b => b.id === betId ? { ...b, post_at: postAt } : b),
        });
      }
    } catch {
      showToast('Erro de conexao', 'error');
    }
  }

  async function handleBulkSchedule() {
    if (!bulkScheduleTime || !queueData) return;
    const betIds = postableBets.map(b => b.id);
    if (betIds.length === 0) return;

    setBulkScheduling(true);
    try {
      const res = await fetch('/api/bets/schedule-bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bet_ids: betIds,
          post_at: bulkScheduleTime,
          group_id: selectedGroupId,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        showToast(json.error?.message ?? 'Erro ao aplicar horario em massa', 'error');
        return;
      }
      // Optimistic update
      setQueueData({
        ...queueData,
        bets: queueData.bets.map(b =>
          betIds.includes(b.id) ? { ...b, post_at: bulkScheduleTime } : b
        ),
      });
      showToast(`Horario ${bulkScheduleTime} aplicado a ${betIds.length} aposta(s)`, 'success');
    } catch {
      showToast('Erro de conexao', 'error');
    } finally {
      setBulkScheduling(false);
    }
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

  // ──────────────────────────────────────────────────────
  // Preview flow handlers
  // ──────────────────────────────────────────────────────

  async function handlePreparePreview(betId?: number) {
    setPreviewPhase('loading');
    setPreviewError(null);

    try {
      const payload: Record<string, string | number> = {};
      if (selectedGroupId) payload.group_id = selectedGroupId;
      if (betId) payload.bet_id = betId;

      const res = await fetch('/api/bets/post-now/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!json.success) {
        setPreviewError(json.error?.message ?? 'Erro ao gerar previews');
        setPreviewPhase('idle');
        return;
      }

      const data: PreviewData = json.data;
      setPreviewData(data);
      setPreviewBets([...data.bets]);
      setPreviewPhase('reviewing');
    } catch {
      setPreviewError('Erro de conexao ao gerar previews');
      setPreviewPhase('idle');
    }
  }

  function handleCancelPreview() {
    setPreviewPhase('idle');
    setPreviewData(null);
    setPreviewBets([]);
    setEditingPreviewIdx(null);
    setPreviewError(null);
    setRemovingPreviewIdx(null);
    setRegeneratingIdx(null);
  }

  function handleEditPreview(idx: number) {
    setEditingPreviewIdx(idx);
    setEditingPreviewText(previewBets[idx].preview);
  }

  function handleSavePreviewEdit(idx: number) {
    setPreviewBets(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], preview: editingPreviewText };
      return updated;
    });
    setEditingPreviewIdx(null);
    setEditingPreviewText('');
  }

  function handleCancelPreviewEdit() {
    setEditingPreviewIdx(null);
    setEditingPreviewText('');
  }

  async function handleRegeneratePreview(idx: number) {
    if (!previewData) return;
    setRegeneratingIdx(idx);

    try {
      const regenPayload: Record<string, string | number> = {};
      if (selectedGroupId) regenPayload.group_id = selectedGroupId;
      const currentBetId = previewBets[idx].betId;
      if (currentBetId) regenPayload.bet_id = currentBetId;

      const res = await fetch('/api/bets/post-now/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regenPayload),
      });

      const json = await res.json();

      if (!json.success) {
        showToast(json.error?.message ?? 'Erro ao regenerar preview', 'error');
        return;
      }

      const freshData: PreviewData = json.data;
      const freshBet = freshData.bets.find(b => b.betId === currentBetId);

      if (freshBet) {
        setPreviewBets(prev => {
          const updated = [...prev];
          updated[idx] = freshBet;
          return updated;
        });
        // Update the previewId to the latest one from the fresh call
        setPreviewData(prev => prev ? { ...prev, previewId: freshData.previewId } : prev);
        showToast('Preview regenerado com sucesso', 'success');
      } else {
        showToast('Aposta nao encontrada na nova geracao de previews', 'error');
      }
    } catch {
      showToast('Erro de conexao ao regenerar', 'error');
    } finally {
      setRegeneratingIdx(null);
    }
  }

  function handleRemovePreviewConfirm(idx: number) {
    setRemovingPreviewIdx(idx);
  }

  function handleRemovePreviewExecute(idx: number) {
    setPreviewBets(prev => prev.filter((_, i) => i !== idx));
    setRemovingPreviewIdx(null);

    // If no bets left, go back to idle
    if (previewBets.length <= 1) {
      handleCancelPreview();
      showToast('Todas as apostas foram removidas do preview', 'error');
    }
  }

  function handleRemovePreviewCancel() {
    setRemovingPreviewIdx(null);
  }

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
  }, []);

  function startPolling(betIds: number[]) {
    setPreviewPhase('polling');
    setTotalSendCount(betIds.length);
    setPostedCount(0);
    setSendStatusMessage(`Aguardando bot... 0/${betIds.length} postada(s)`);

    const idsParam = betIds.join(',');

    async function poll() {
      try {
        const res = await fetch(`/api/bets/post-now/status?bet_ids=${idsParam}`);
        const json = await res.json();
        if (!json.success) return;

        const { posted, allPosted } = json.data;
        setPostedCount(posted.length);
        setSendStatusMessage(`${allPosted ? 'Concluido!' : 'Aguardando bot...'} ${posted.length}/${betIds.length} postada(s)`);

        if (allPosted) {
          stopPolling();
          setPreviewPhase('done');
          fetchQueue();
          setTimeout(() => {
            handleCancelPreview();
            setSendStatusMessage(null);
          }, 5000);
        }
      } catch {
        // Network error during poll, keep trying
      }
    }

    poll();
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    pollTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setPreviewPhase('timeout');
      setSendStatusMessage(null);
      fetchQueue();
    }, POLL_TIMEOUT_MS);
  }

  async function handleSendAll() {
    if (!previewData || previewBets.length === 0) return;

    setPreviewPhase('sending');
    setPreviewError(null);

    try {
      const res = await fetch('/api/bets/post-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: previewData.groupId,
          previewId: previewData.previewId,
          betIds: previewBets.map(b => b.betId),
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setPreviewError(json.error?.message ?? 'Erro ao enviar postagem');
        setPreviewPhase('reviewing');
        return;
      }

      const betIds: number[] = json.data?.betIds ?? [];
      if (betIds.length > 0) {
        startPolling(betIds);
      } else {
        setPreviewPhase('done');
        setSendStatusMessage(json.data?.message ?? 'Postagem solicitada');
        fetchQueue();
        setTimeout(() => {
          handleCancelPreview();
          setSendStatusMessage(null);
        }, 5000);
      }
    } catch {
      setPreviewError('Erro de conexao ao enviar');
      setPreviewPhase('reviewing');
    }
  }

  const currentGroup = groups.find(g => g.id === selectedGroupId);
  const scheduleForGroup = currentGroup?.posting_schedule ?? queueData?.postingSchedule ?? { enabled: true, times: ['10:00', '15:00', '22:00'] };

  // Separate bets the bot WILL post from bets still missing data or removed
  const MIN_ODDS = 1.60;
  function isPostable(b: QueueBet): boolean {
    if (b.elegibilidade === 'removida') return false;
    if (b.bet_status === 'posted') return true;
    if (!b.has_link) return false;
    return b.promovida_manual || (b.odds !== null && b.odds >= MIN_ODDS);
  }
  const postableBets = queueData?.bets.filter(isPostable) ?? [];
  const pendingBets = queueData?.bets.filter(b => !isPostable(b)) ?? [];

  const isPreviewActive = previewPhase !== 'idle';
  const progressPct = totalSendCount > 0 ? Math.round((postedCount / totalSendCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Postagem</h1>

        {role === 'super_admin' && groups.length > 0 && (
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            disabled={isPreviewActive}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Queue Summary */}
      {queueData && !isPreviewActive && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Resumo da Fila</h3>
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
      {error && !isPreviewActive && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button onClick={fetchQueue} className="ml-2 underline hover:no-underline">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Preview error (shown at top when not in preview mode) */}
      {previewError && !isPreviewActive && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {previewError}
        </div>
      )}

      {/* Loading */}
      {loading && !queueData && !isPreviewActive && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* PREVIEW FLOW                                      */}
      {/* ══════════════════════════════════════════════════ */}

      {/* Loading preview */}
      {previewPhase === 'loading' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-300 border-t-blue-600" />
          <p className="mt-3 text-sm font-medium text-blue-800">Gerando previews...</p>
          <p className="mt-1 text-xs text-blue-600">Preparando mensagens para revisao</p>
        </div>
      )}

      {/* Preview reviewing / sending / polling / done / timeout */}
      {isPreviewActive && previewPhase !== 'loading' && (
        <div className="space-y-4">
          {/* Top bar — counter + actions */}
          <div className="rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Preview da Postagem
                    {previewData && (
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        Grupo: {previewData.groupName}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {previewBets.length} de {previewData?.bets.length ?? 0} aposta{(previewData?.bets.length ?? 0) !== 1 ? 's' : ''} selecionada{(previewData?.bets.length ?? 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Polling progress */}
                {previewPhase === 'polling' && sendStatusMessage && (
                  <div className="flex items-center gap-2 mr-3">
                    <div className="h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all duration-500"
                        style={{ width: `${Math.max(progressPct, 10)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600">{sendStatusMessage}</span>
                  </div>
                )}

                {/* Done message */}
                {previewPhase === 'done' && sendStatusMessage && (
                  <p className="text-sm font-medium text-green-700 mr-3">{sendStatusMessage}</p>
                )}

                {/* Timeout message */}
                {previewPhase === 'timeout' && (
                  <p className="text-xs text-amber-700 mr-3">
                    Bot nao respondeu em 60s. Verifique se o bot esta rodando.
                  </p>
                )}

                {/* Action buttons */}
                {previewPhase === 'reviewing' && (
                  <>
                    <button
                      onClick={handleCancelPreview}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSendAll}
                      disabled={previewBets.length === 0}
                      className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Enviar Todas ({previewBets.length})
                    </button>
                  </>
                )}

                {(previewPhase === 'done' || previewPhase === 'timeout') && (
                  <button
                    onClick={handleCancelPreview}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Voltar
                  </button>
                )}
              </div>
            </div>

            {/* Preview error */}
            {previewError && (
              <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {previewError}
              </div>
            )}
          </div>

          {/* Sending overlay indicator */}
          {previewPhase === 'sending' && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-green-300 border-t-green-600" />
              <p className="mt-2 text-sm font-medium text-green-800">Enviando postagem...</p>
            </div>
          )}

          {/* Preview cards */}
          {(previewPhase === 'reviewing' || previewPhase === 'sending') && (
            <div className="space-y-3">
              {previewBets.map((bet, idx) => (
                <div
                  key={bet.betId}
                  className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden"
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {bet.betInfo.homeTeam} x {bet.betInfo.awayTeam}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatKickoffShort(bet.betInfo.kickoffTime)} &middot; {bet.betInfo.market}: {bet.betInfo.pick} &middot; Odd: {bet.betInfo.odds}
                        </p>
                      </div>
                    </div>

                    {/* Card actions */}
                    {previewPhase === 'reviewing' && (
                      <div className="flex items-center gap-1">
                        {removingPreviewIdx === idx ? (
                          <>
                            <span className="text-xs text-red-600 mr-1">Remover?</span>
                            <button
                              onClick={() => handleRemovePreviewExecute(idx)}
                              className="rounded px-2 py-1 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200"
                            >
                              Sim
                            </button>
                            <button
                              onClick={handleRemovePreviewCancel}
                              className="rounded px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
                            >
                              Nao
                            </button>
                          </>
                        ) : (
                          <>
                            {editingPreviewIdx !== idx && (
                              <button
                                onClick={() => handleEditPreview(idx)}
                                className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                                title="Editar texto"
                              >
                                Editar
                              </button>
                            )}
                            <button
                              onClick={() => handleRegeneratePreview(idx)}
                              disabled={regeneratingIdx === idx}
                              className="rounded px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                              title="Regenerar preview"
                            >
                              {regeneratingIdx === idx ? '...' : 'Regenerar'}
                            </button>
                            <button
                              onClick={() => handleRemovePreviewConfirm(idx)}
                              className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50"
                              title="Remover do batch"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card body — preview text or edit textarea */}
                  <div className="px-4 py-3">
                    {editingPreviewIdx === idx ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingPreviewText}
                          onChange={(e) => setEditingPreviewText(e.target.value)}
                          rows={6}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={handleCancelPreviewEdit}
                            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleSavePreviewEdit(idx)}
                            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                          >
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                        {bet.preview}
                      </pre>
                    )}
                  </div>
                </div>
              ))}

              {previewBets.length === 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                  <p className="text-sm text-gray-500">Todas as apostas foram removidas do preview.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* QUEUE TABLES (hidden during active preview)       */}
      {/* ══════════════════════════════════════════════════ */}

      {/* Postable Bets — Fila de Postagem */}
      {queueData && !isPreviewActive && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Fila de Postagem
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({postableBets.length} aposta{postableBets.length !== 1 ? 's' : ''} elegivel{postableBets.length !== 1 ? 'is' : ''})
              </span>
            </h2>
            <div className="flex items-center gap-3">
              {/* Bulk schedule toolbar */}
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={bulkScheduleTime}
                  onChange={(e) => setBulkScheduleTime(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleBulkSchedule}
                  disabled={!bulkScheduleTime || postableBets.length === 0 || bulkScheduling}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkScheduling ? '...' : 'Aplicar a todas'}
                </button>
              </div>
              <button
                onClick={() => handlePreparePreview()}
                disabled={postableBets.length === 0}
                title={postableBets.length === 0 ? 'Nenhuma aposta pronta' : `Preparar postagem de ${postableBets.length} aposta(s)`}
                className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Preparar Postagem
              </button>
            </div>
          </div>
          <PostingQueueTable
            bets={postableBets}
            onRemove={handleRemoveBet}
            onPreview={(betId) => handlePreparePreview(betId)}
            onScheduleBet={handleScheduleBet}
            emptyMessage="Nenhuma aposta elegivel para postagem."
          />
        </div>
      )}

      {/* Pending/Removed Bets — Apostas Fora da Fila */}
      {queueData && pendingBets.length > 0 && !isPreviewActive && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Apostas Fora da Fila
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({pendingBets.length} aposta{pendingBets.length !== 1 ? 's' : ''})
            </span>
          </h2>
          <p className="text-sm text-gray-500">
            Apostas removidas ou faltando dados. Promova para incluir na fila de postagem.
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
      {role === 'super_admin' && !selectedGroupId && groupsLoaded && !isPreviewActive && (
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
