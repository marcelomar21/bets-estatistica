'use client';

import { useState } from 'react';
import { BetResultBadge } from './BetResultBadge';
import type { BetResult } from './BetResultBadge';
import { useTeamDisplayNames } from '@/hooks/useTeamDisplayNames';

interface ResultEditBet {
  id: number;
  bet_market: string;
  bet_pick: string;
  bet_result: BetResult;
  result_reason: string | null;
  result_source: string | null;
  league_matches: {
    home_team_name: string;
    away_team_name: string;
    kickoff_time: string;
  };
}

interface ResultEditModalProps {
  bet: ResultEditBet;
  onClose: () => void;
  onSave: (betId: number, result: string, reason: string) => Promise<void>;
}

const RESULT_OPTIONS = [
  { value: 'success', label: 'Acerto (Green)' },
  { value: 'failure', label: 'Erro (Red)' },
  { value: 'unknown', label: 'Indefinido' },
  { value: 'cancelled', label: 'Cancelada' },
];

const SOURCE_LABELS: Record<string, string> = {
  deterministic: 'Determinístico',
  llm: 'LLM',
  consensus: 'Consenso Multi-LLM',
  manual: 'Manual',
};

export function ResultEditModal({ bet, onClose, onSave }: ResultEditModalProps) {
  const { resolve } = useTeamDisplayNames();
  const [selectedResult, setSelectedResult] = useState(bet.bet_result ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!selectedResult) {
      setError('Selecione um resultado');
      return;
    }

    if (!reason.trim()) {
      setError('Informe o motivo da alteração');
      return;
    }

    setSaving(true);
    try {
      await onSave(bet.id, selectedResult, reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar resultado');
    } finally {
      setSaving(false);
    }
  }

  const match = bet.league_matches;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Editar Resultado</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Match info */}
        <div className="mb-4 rounded-md bg-gray-50 p-3">
          <p className="text-sm font-medium text-gray-900">
            {resolve(match.home_team_name)} vs {resolve(match.away_team_name)}
          </p>
          <p className="text-xs text-gray-500">
            {bet.bet_market} — {bet.bet_pick}
          </p>
        </div>

        {/* Current result */}
        <div className="mb-4 rounded-md border border-gray-200 p-3">
          <p className="mb-1 text-xs font-medium text-gray-500">Resultado atual</p>
          <div className="flex items-center gap-2">
            <BetResultBadge result={bet.bet_result} />
            {bet.result_source && (
              <span className="text-xs text-gray-400">
                via {SOURCE_LABELS[bet.result_source] ?? bet.result_source}
              </span>
            )}
          </div>
          {bet.result_reason && (
            <p className="mt-1 text-xs text-gray-500 line-clamp-2">{bet.result_reason}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="result-select" className="block text-sm font-medium text-gray-700">
              Novo resultado
            </label>
            <select
              id="result-select"
              value={selectedResult}
              onChange={(e) => setSelectedResult(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
              disabled={saving}
            >
              <option value="">Selecione...</option>
              {RESULT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reason-input" className="block text-sm font-medium text-gray-700">
              Motivo da alteração
            </label>
            <textarea
              id="reason-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Resultado corrigido após revisão manual do placar"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
              disabled={saving}
            />
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
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
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
