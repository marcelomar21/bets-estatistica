'use client';

import { useState } from 'react';

interface BulkOddsModalProps {
  selectedCount: number;
  onClose: () => void;
  onSave: (odds: number) => Promise<void>;
}

export function BulkOddsModal({ selectedCount, onClose, onSave }: BulkOddsModalProps) {
  const [oddsInput, setOddsInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
      await onSave(newOdds);
    } catch {
      setError('Erro ao atualizar odds em lote');
    } finally {
      setSaving(false);
    }
  }

  const showWarning = oddsInput && parseFloat(oddsInput) < MIN_ODDS && parseFloat(oddsInput) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Atualizar Odds em Lote</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          Aplicar o mesmo valor de odds para <strong>{selectedCount}</strong> aposta{selectedCount > 1 ? 's' : ''} selecionada{selectedCount > 1 ? 's' : ''}.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="bulk-odds-input" className="block text-sm font-medium text-gray-700">
              Novo valor de odds
            </label>
            <input
              id="bulk-odds-input"
              type="number"
              step="0.01"
              min="0.01"
              value={oddsInput}
              onChange={(e) => setOddsInput(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              disabled={saving}
            />
            {showWarning && (
              <p className="mt-1 text-xs text-orange-600">
                Odds abaixo de {MIN_ODDS}. Apostas nao serao promovidas automaticamente.
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
              disabled={saving}
            >
              {saving ? 'Atualizando...' : `Atualizar ${selectedCount} Aposta${selectedCount > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
