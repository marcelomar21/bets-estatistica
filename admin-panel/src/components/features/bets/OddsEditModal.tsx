'use client';

import { useState } from 'react';
import type { SuggestedBetListItem, OddsHistoryEntry } from '@/types/database';

interface OddsEditModalProps {
  bet: SuggestedBetListItem;
  onClose: () => void;
  onSave: (betId: number, odds: number) => Promise<void>;
  oddsHistory: OddsHistoryEntry[];
  loading?: boolean;
}

export function OddsEditModal({ bet, onClose, onSave, oddsHistory, loading }: OddsEditModalProps) {
  const [oddsInput, setOddsInput] = useState(bet.odds?.toString() ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const matchInfo = bet.league_matches;
  const MIN_ODDS = 1.60;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const newOdds = parseFloat(oddsInput);
    if (isNaN(newOdds) || newOdds <= 0) {
      setError('Odds deve ser um numero positivo');
      return;
    }

    setSaving(true);
    try {
      await onSave(bet.id, newOdds);
    } catch {
      setError('Erro ao salvar odds');
    } finally {
      setSaving(false);
    }
  }

  const showWarning = oddsInput && parseFloat(oddsInput) < MIN_ODDS && parseFloat(oddsInput) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Editar Odds</h2>
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
            <label htmlFor="odds-input" className="block text-sm font-medium text-gray-700">
              Novo valor de odds
            </label>
            <input
              id="odds-input"
              type="number"
              step="0.01"
              min="0.01"
              value={oddsInput}
              onChange={(e) => setOddsInput(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              disabled={saving || loading}
            />
            {showWarning && (
              <p className="mt-1 text-xs text-orange-600">
                Odds abaixo de {MIN_ODDS}. A aposta nao sera promovida automaticamente.
              </p>
            )}
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
              disabled={saving || loading}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>

        {oddsHistory.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <h3 className="mb-2 text-sm font-medium text-gray-700">Historico de Odds</h3>
            <div className="max-h-40 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-1">Anterior</th>
                    <th className="pb-1">Novo</th>
                    <th className="pb-1">Origem</th>
                    <th className="pb-1">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {oddsHistory.map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-100">
                      <td className="py-1 text-gray-600">{entry.old_value ?? '-'}</td>
                      <td className="py-1 font-medium">{entry.new_value}</td>
                      <td className="py-1 text-gray-500">{entry.job_name}</td>
                      <td className="py-1 text-gray-400">
                        {new Date(entry.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
