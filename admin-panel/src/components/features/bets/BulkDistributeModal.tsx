'use client';

import { useState } from 'react';

interface BulkDistributeModalProps {
  selectedCount: number;
  groups: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (groupIds: string[]) => Promise<void>;
}

export function BulkDistributeModal({ selectedCount, groups, onClose, onSave }: BulkDistributeModalProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedGroupIds.size === groups.length) {
      setSelectedGroupIds(new Set());
    } else {
      setSelectedGroupIds(new Set(groups.map((g) => g.id)));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (selectedGroupIds.size === 0) {
      setError('Selecione ao menos um grupo destino');
      return;
    }

    setSaving(true);
    try {
      await onSave(Array.from(selectedGroupIds));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao distribuir em lote');
    } finally {
      setSaving(false);
    }
  }

  const totalAssignments = selectedCount * selectedGroupIds.size;

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
          Distribuir <strong>{selectedCount}</strong> aposta{selectedCount > 1 ? 's' : ''} selecionada{selectedCount > 1 ? 's' : ''} para os grupos escolhidos.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Grupos destino
              </label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {selectedGroupIds.size === groups.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
              {groups.map((group) => (
                <label
                  key={group.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.has(group.id)}
                    onChange={() => toggleGroup(group.id)}
                    disabled={saving}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">{group.name}</span>
                </label>
              ))}
            </div>
          </div>

          {totalAssignments > 0 && (
            <p className="text-xs text-gray-500">
              {totalAssignments} assignment{totalAssignments > 1 ? 's' : ''} ({selectedCount} aposta{selectedCount > 1 ? 's' : ''} x {selectedGroupIds.size} grupo{selectedGroupIds.size > 1 ? 's' : ''})
            </p>
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
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              disabled={saving || selectedGroupIds.size === 0}
            >
              {saving ? 'Distribuindo...' : `Distribuir ${selectedCount} Aposta${selectedCount > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
