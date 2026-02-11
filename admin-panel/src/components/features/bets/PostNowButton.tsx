'use client';

import { useState, useRef, useCallback } from 'react';

interface PostNowButtonProps {
  readyCount: number;
  groupId?: string;
  onPostComplete: () => void;
}

type PostingPhase = 'idle' | 'confirming' | 'requesting' | 'polling' | 'done' | 'timeout';

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 60_000;

export function PostNowButton({ readyCount, groupId, onPostComplete }: PostNowButtonProps) {
  const [phase, setPhase] = useState<PostingPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [postedCount, setPostedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disabled = readyCount === 0 || phase === 'requesting' || phase === 'polling';

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
  }, []);

  function startPolling(betIds: number[]) {
    setPhase('polling');
    setTotalCount(betIds.length);
    setPostedCount(0);
    setStatusMessage(`Aguardando bot... 0/${betIds.length} postada(s)`);

    const idsParam = betIds.join(',');

    async function poll() {
      try {
        const res = await fetch(`/api/bets/post-now/status?bet_ids=${idsParam}`);
        const json = await res.json();
        if (!json.success) return;

        const { posted, allPosted } = json.data;
        setPostedCount(posted.length);
        setStatusMessage(`${allPosted ? 'Concluido!' : 'Aguardando bot...'} ${posted.length}/${betIds.length} postada(s)`);

        if (allPosted) {
          stopPolling();
          setPhase('done');
          onPostComplete();
          setTimeout(() => { setPhase('idle'); setStatusMessage(null); }, 5000);
        }
      } catch {
        // Network error during poll, just keep trying
      }
    }

    // First poll immediately
    poll();
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    // Timeout after 60s
    pollTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setPhase('timeout');
      setStatusMessage(null);
      onPostComplete();
    }, POLL_TIMEOUT_MS);
  }

  async function handlePost() {
    setPhase('requesting');
    setError(null);
    setErrorDetails([]);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/bets/post-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupId ? { group_id: groupId } : {}),
      });

      const json = await res.json();
      if (!json.success) {
        setPhase('confirming');
        setError(json.error?.message ?? 'Erro ao solicitar postagem');
        if (json.error?.details) setErrorDetails(json.error.details);
        return;
      }

      // Start polling for posting status
      const betIds: number[] = json.data?.betIds ?? [];
      if (betIds.length > 0) {
        startPolling(betIds);
      } else {
        setPhase('done');
        setStatusMessage(json.data?.message ?? 'Postagem solicitada');
        onPostComplete();
        setTimeout(() => { setPhase('idle'); setStatusMessage(null); }, 5000);
      }
    } catch {
      setPhase('confirming');
      setError('Erro de conexao');
    }
  }

  const progressPct = totalCount > 0 ? Math.round((postedCount / totalCount) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setPhase('confirming')}
        disabled={disabled}
        title={readyCount === 0 ? 'Nenhuma aposta pronta' : `Postar ${readyCount} aposta(s) agora`}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {phase === 'requesting' ? 'Enviando...' : phase === 'polling' ? 'Postando...' : 'Postar Agora'}
      </button>

      {phase === 'polling' && statusMessage && (
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${Math.max(progressPct, 10)}%` }}
            />
          </div>
          <span className="text-xs text-gray-600">{statusMessage}</span>
        </div>
      )}

      {phase === 'done' && statusMessage && (
        <p className="text-sm font-medium text-green-700">{statusMessage}</p>
      )}

      {phase === 'timeout' && (
        <p className="text-sm text-amber-700">
          Bot nao respondeu em 60s. Verifique se o bot esta rodando no Render.
        </p>
      )}

      {phase === 'confirming' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Confirmar Postagem</h3>
            <p className="mt-2 text-sm text-gray-600">
              {readyCount} aposta{readyCount > 1 ? 's' : ''} pronta{readyCount > 1 ? 's' : ''} ser{readyCount > 1 ? 'ao' : 'a'} postada{readyCount > 1 ? 's' : ''} no grupo do Telegram.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Apos confirmar, o status sera acompanhado em tempo real.
            </p>

            {error && (
              <div className="mt-3 rounded-md bg-red-50 p-3">
                <p className="text-sm font-medium text-red-700">{error}</p>
                {errorDetails.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-red-600">
                    {errorDetails.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => { setPhase('idle'); setError(null); setErrorDetails([]); }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handlePost}
                disabled={phase === 'requesting'}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
