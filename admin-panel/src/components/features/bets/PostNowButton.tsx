'use client';

import { useState } from 'react';

interface PostNowButtonProps {
  readyCount: number;
  groupId?: string;
  onPostComplete: () => void;
}

export function PostNowButton({ readyCount, groupId, onPostComplete }: PostNowButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const disabled = readyCount === 0 || loading;

  async function handlePost() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/bets/post-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupId ? { group_id: groupId } : {}),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao solicitar postagem');
        return;
      }

      setSuccessMessage(json.data?.message ?? 'Postagem solicitada');
      setShowConfirm(false);
      onPostComplete();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={disabled}
        title={readyCount === 0 ? 'Nenhuma aposta pronta' : `Postar ${readyCount} aposta(s) agora`}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Enviando...' : 'Postar Agora'}
      </button>

      {successMessage && (
        <p className="mt-2 text-sm text-green-700">{successMessage}</p>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Confirmar Postagem</h3>
            <p className="mt-2 text-sm text-gray-600">
              {readyCount} aposta{readyCount > 1 ? 's' : ''} pronta{readyCount > 1 ? 's' : ''} ser{readyCount > 1 ? 'ao' : 'a'} postada{readyCount > 1 ? 's' : ''} no grupo do Telegram.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              A postagem sera processada pelo bot em ate 30 segundos.
            </p>

            {error && (
              <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => { setShowConfirm(false); setError(null); }}
                disabled={loading}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handlePost}
                disabled={loading}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
