'use client';

import { useState } from 'react';
import type { SuggestedBetListItem } from '@/types/database';

interface LinkEditModalProps {
  bet: SuggestedBetListItem;
  onClose: () => void;
  onSave: (betId: number, link: string | null) => Promise<void>;
}

export function LinkEditModal({ bet, onClose, onSave }: LinkEditModalProps) {
  const [linkInput, setLinkInput] = useState(bet.deep_link ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const matchInfo = bet.league_matches;

  function validateUrl(url: string): string | null {
    const trimmed = url.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > 2048) return 'URL muito longa (maximo 2048 caracteres)';
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return 'O link deve comecar com http:// ou https://';
    }
    try {
      new URL(trimmed);
      return null;
    } catch {
      return 'URL invalida';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = linkInput.trim();
    const validationError = validateUrl(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }

    const newLink = trimmed.length === 0 ? null : trimmed;

    setSaving(true);
    try {
      await onSave(bet.id, newLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar link');
    } finally {
      setSaving(false);
    }
  }

  function handleClearLink() {
    setLinkInput('');
    setError('');
  }

  const trimmed = linkInput.trim();
  const hasLink = trimmed.length > 0;
  const isValid = !validateUrl(trimmed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Editar Link</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {matchInfo && (
          <div className="mb-4 rounded-md bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-900">
              {matchInfo.home_team_name} vs {matchInfo.away_team_name}
            </p>
            <p className="text-xs text-gray-500">
              {bet.bet_market} - {bet.bet_pick}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="link-input" className="block text-sm font-medium text-gray-700">
              URL do link de aposta
            </label>
            <input
              id="link-input"
              type="text"
              placeholder="https://..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              disabled={saving}
            />
            {hasLink && isValid && (
              <p className="mt-1 text-xs text-green-600">
                URL valida
              </p>
            )}
          </div>

          {hasLink && isValid && (
            <div className="rounded-md bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium text-gray-500">Preview</p>
              <a
                href={trimmed}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline break-all"
              >
                {trimmed}
              </a>
            </div>
          )}

          {bet.deep_link && (
            <button
              type="button"
              onClick={handleClearLink}
              className="text-sm text-red-600 hover:text-red-800"
              disabled={saving}
            >
              Limpar Link
            </button>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
