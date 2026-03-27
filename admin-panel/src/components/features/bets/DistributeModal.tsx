'use client';

import { useState } from 'react';
import type { SuggestedBetListItem } from '@/types/database';
import { formatPickDisplay } from '@/lib/bet-categories';
import { useTeamDisplayNames } from '@/hooks/useTeamDisplayNames';

interface DistributeModalProps {
  bet: SuggestedBetListItem;
  groups: Array<{ id: string; name: string }>;
  onClose: () => void;
  onDistribute: (betId: number, groupId: string) => Promise<void>;
}

export function DistributeModal({ bet, groups, onClose, onDistribute }: DistributeModalProps) {
  const { resolve } = useTeamDisplayNames();
  const [selectedGroupId, setSelectedGroupId] = useState(bet.group_id ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const matchInfo = bet.league_matches;
  const isRedistribution = bet.group_id !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!selectedGroupId) {
      setError('Selecione um grupo destino');
      return;
    }

    if (selectedGroupId === bet.group_id) {
      setError('Selecione um grupo diferente do atual');
      return;
    }

    setSaving(true);
    try {
      await onDistribute(bet.id, selectedGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao distribuir aposta');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isRedistribution ? 'Redistribuir Aposta' : 'Distribuir Aposta'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {matchInfo && (
          <div className="mb-4 rounded-md bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-900">
              {resolve(matchInfo.home_team_name)} vs {resolve(matchInfo.away_team_name)}
            </p>
            <p className="text-xs text-gray-500">
              {formatPickDisplay(bet.bet_market, bet.bet_pick)}
            </p>
          </div>
        )}

        {isRedistribution && bet.groups?.name && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">
              Atualmente distribuida para: <span className="font-medium">{bet.groups.name}</span>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="group-select" className="block text-sm font-medium text-gray-700">
              Grupo destino
            </label>
            <select
              id="group-select"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              disabled={saving}
            >
              <option value="">Selecione um grupo...</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

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
              disabled={saving || !selectedGroupId}
            >
              {saving ? 'Distribuindo...' : isRedistribution ? 'Redistribuir' : 'Distribuir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
