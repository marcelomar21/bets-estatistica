'use client';

import { useState } from 'react';

interface BulkDistributeModalProps {
  selectedCount: number;
  groups: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (groupId: string) => Promise<void>;
}

export function BulkDistributeModal({ selectedCount, groups, onClose, onSave }: BulkDistributeModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!selectedGroupId) {
      setError('Selecione um grupo destino');
      return;
    }

    setSaving(true);
    try {
      await onSave(selectedGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao distribuir em lote');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Distribuir em Lote</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          Distribuir <strong>{selectedCount}</strong> aposta{selectedCount > 1 ? 's' : ''} selecionada{selectedCount > 1 ? 's' : ''} para o grupo escolhido.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="bulk-group-select" className="block text-sm font-medium text-gray-700">
              Grupo destino
            </label>
            <select
              id="bulk-group-select"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
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
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              disabled={saving || !selectedGroupId}
            >
              {saving ? 'Distribuindo...' : `Distribuir ${selectedCount} Aposta${selectedCount > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
