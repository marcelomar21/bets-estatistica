'use client';

import { useState, useMemo } from 'react';

interface DistributeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBetIds: number[];
  existingAssignments: Map<number, string[]>;
  groups: Array<{ id: string; name: string }>;
  role: 'super_admin' | 'group_admin';
  userGroupId?: string | null;
  onDistributed: () => void;
}

export function DistributeModal({
  isOpen,
  onClose,
  selectedBetIds,
  existingAssignments,
  groups,
  role,
  userGroupId,
  onDistributed,
}: DistributeModalProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => {
    if (role === 'group_admin' && userGroupId) {
      return new Set([userGroupId]);
    }
    return new Set();
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; alreadyExisted: number } | null>(null);

  const betCount = selectedBetIds.length;
  const isGroupAdmin = role === 'group_admin';

  // Calculate which groups are already fully assigned (all selected bets already in that group)
  const groupAssignmentInfo = useMemo(() => {
    const info = new Map<string, { assignedCount: number; totalBets: number }>();
    for (const group of groups) {
      let assignedCount = 0;
      for (const betId of selectedBetIds) {
        const assignments = existingAssignments.get(betId) ?? [];
        if (assignments.includes(group.id)) {
          assignedCount++;
        }
      }
      info.set(group.id, { assignedCount, totalBets: betCount });
    }
    return info;
  }, [groups, selectedBetIds, existingAssignments, betCount]);

  // Preview counter: total new assignments = (bets * selected groups) - already existing
  const previewCounts = useMemo(() => {
    let alreadyExisting = 0;
    for (const groupId of selectedGroupIds) {
      for (const betId of selectedBetIds) {
        const assignments = existingAssignments.get(betId) ?? [];
        if (assignments.includes(groupId)) {
          alreadyExisting++;
        }
      }
    }
    const totalPossible = betCount * selectedGroupIds.size;
    const newAssignments = totalPossible - alreadyExisting;
    return { totalPossible, newAssignments, alreadyExisting };
  }, [selectedGroupIds, selectedBetIds, existingAssignments, betCount]);

  function toggleGroup(groupId: string) {
    if (isGroupAdmin) return;
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

  async function handleConfirm() {
    if (selectedGroupIds.size === 0) {
      setError('Selecione pelo menos um grupo');
      return;
    }

    setError('');
    setSaving(true);

    try {
      const res = await fetch('/api/bets/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betIds: selectedBetIds,
          groupIds: Array.from(selectedGroupIds),
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao distribuir');
        return;
      }

      setResult(json.data);
    } catch {
      setError('Erro de conexao ao distribuir');
    } finally {
      setSaving(false);
    }
  }

  function handleDone() {
    onDistributed();
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Distribuir {betCount} aposta{betCount > 1 ? 's' : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success result */}
        {result ? (
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                {result.created} criado{result.created !== 1 ? 's' : ''}
                {result.alreadyExisted > 0 && (
                  <>, {result.alreadyExisted} ja existia{result.alreadyExisted !== 1 ? 'm' : ''}</>
                )}
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleDone}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Group checkboxes */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Selecione os grupos
              </label>
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
                {groups.length === 0 && (
                  <p className="py-2 text-center text-sm text-gray-500">Nenhum grupo disponivel</p>
                )}
                {groups.map((group) => {
                  const info = groupAssignmentInfo.get(group.id);
                  const allAssigned = info ? info.assignedCount === info.totalBets && info.totalBets > 0 : false;
                  const someAssigned = info ? info.assignedCount > 0 && !allAssigned : false;
                  const isDisabled = allAssigned || (isGroupAdmin && group.id !== userGroupId);
                  const isChecked = selectedGroupIds.has(group.id) || allAssigned;
                  const isNonDeselectable = isGroupAdmin && group.id === userGroupId;

                  return (
                    <label
                      key={group.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${
                        isDisabled
                          ? 'cursor-not-allowed bg-gray-50 opacity-60'
                          : isChecked
                            ? 'bg-emerald-50'
                            : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => !isDisabled && !isNonDeselectable && toggleGroup(group.id)}
                        disabled={isDisabled || isNonDeselectable}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        aria-label={group.name}
                      />
                      <span className="flex-1 text-sm text-gray-900">{group.name}</span>
                      {allAssigned && (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                          ja distribuido
                        </span>
                      )}
                      {someAssigned && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          {info!.assignedCount}/{info!.totalBets} ja distribuido{info!.assignedCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Preview counter */}
            {selectedGroupIds.size > 0 && (
              <div className="mb-4 rounded-md bg-blue-50 p-3">
                <p className="text-sm text-blue-800">
                  {betCount} aposta{betCount > 1 ? 's' : ''} &times; {selectedGroupIds.size} grupo{selectedGroupIds.size > 1 ? 's' : ''} ={' '}
                  <strong>{previewCounts.newAssignments}</strong> novo{previewCounts.newAssignments !== 1 ? 's' : ''} assignment{previewCounts.newAssignments !== 1 ? 's' : ''}
                  {previewCounts.alreadyExisting > 0 && (
                    <> ({previewCounts.alreadyExisting} ja existente{previewCounts.alreadyExisting !== 1 ? 's' : ''})</>
                  )}
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="mb-4 text-sm text-red-600">{error}</p>
            )}

            {/* Actions */}
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
                type="button"
                onClick={handleConfirm}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={saving || selectedGroupIds.size === 0}
              >
                {saving ? 'Distribuindo...' : 'Confirmar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
