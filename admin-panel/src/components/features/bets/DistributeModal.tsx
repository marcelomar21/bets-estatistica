'use client';

import { useState, useEffect } from 'react';

interface DistributeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBetIds: number[];
  onDistributed: () => void;
  /** Role determines group behavior: group_admin sees only their group auto-selected */
  role: 'super_admin' | 'group_admin';
  /** For group_admin, the single group they belong to */
  userGroupId?: string | null;
}

interface GroupOption {
  id: string;
  name: string;
}

export function DistributeModal({
  isOpen,
  onClose,
  selectedBetIds,
  onDistributed,
  role,
  userGroupId,
}: DistributeModalProps) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [existingAssignments, setExistingAssignments] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; alreadyExisted: number } | null>(null);

  const betCount = selectedBetIds.length;
  const isSingleBet = betCount === 1;

  // Fetch groups and existing assignments when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setSelectedGroupIds(new Set());
    setError('');
    setResult(null);
    setLoading(true);

    async function fetchData() {
      try {
        // Fetch groups and existing assignments in parallel
        const [groupsRes, assignmentsRes] = await Promise.all([
          fetch('/api/groups'),
          fetch(`/api/bets/distribute?${new URLSearchParams({ betIds: selectedBetIds.join(',') })}`),
        ]);

        const groupsJson = await groupsRes.json();
        if (groupsJson.success) {
          const groupList = Array.isArray(groupsJson.data)
            ? groupsJson.data
            : groupsJson.data?.items ?? [];
          setGroups(groupList.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })));
        }

        // Existing assignments: count how many selected bets are already in each group
        if (assignmentsRes.ok) {
          const assignJson = await assignmentsRes.json();
          if (assignJson.success && assignJson.data) {
            const map = new Map<string, number>();
            for (const a of assignJson.data) {
              map.set(a.group_id, (map.get(a.group_id) ?? 0) + 1);
            }
            setExistingAssignments(map);
          }
        }

        // Group admin: auto-select their group
        if (role === 'group_admin' && userGroupId) {
          setSelectedGroupIds(new Set([userGroupId]));
        }
      } catch {
        setError('Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [isOpen, selectedBetIds, role, userGroupId]);

  if (!isOpen) return null;

  function toggleGroup(groupId: string) {
    // Group admin cannot deselect their auto-selected group
    if (role === 'group_admin' && groupId === userGroupId) return;

    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function isFullyAssigned(groupId: string): boolean {
    return (existingAssignments.get(groupId) ?? 0) >= betCount;
  }

  // Calculate preview: new assignments = (bets x selected groups) - already existing
  const selectedGroups = Array.from(selectedGroupIds);
  const totalPossible = betCount * selectedGroups.length;
  const alreadyExistingInSelected = selectedGroups.reduce(
    (sum, gid) => sum + Math.min(existingAssignments.get(gid) ?? 0, betCount),
    0,
  );
  const newAssignments = totalPossible - alreadyExistingInSelected;

  async function handleConfirm() {
    if (selectedGroups.length === 0) {
      setError('Selecione pelo menos um grupo');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/bets/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betIds: selectedBetIds,
          groupIds: selectedGroups,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao distribuir');
        return;
      }

      setResult(json.data);
    } catch {
      setError('Erro de conexao');
    } finally {
      setSaving(false);
    }
  }

  function handleDone() {
    onDistributed();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isSingleBet ? 'Distribuir Aposta' : 'Distribuir Apostas'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Bet count info */}
        <p className="mb-4 text-sm text-gray-600">
          {isSingleBet
            ? 'Selecione os grupos para distribuir esta aposta.'
            : <>Distribuir <strong>{betCount}</strong> aposta{betCount > 1 ? 's' : ''} selecionada{betCount > 1 ? 's' : ''} para os grupos escolhidos.</>
          }
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          </div>
        ) : result ? (
          /* Success result */
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
          /* Group selection */
          <div className="space-y-4">
            {/* Group checkboxes */}
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">Grupos destino</legend>
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
                {groups.map((group) => {
                  const fullyAssigned = isFullyAssigned(group.id);
                  const existingCount = existingAssignments.get(group.id) ?? 0;
                  const isGroupAdmin = role === 'group_admin' && group.id === userGroupId;
                  const disabled = fullyAssigned || saving;

                  return (
                    <label
                      key={group.id}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 ${
                        fullyAssigned
                          ? 'cursor-not-allowed bg-gray-50 opacity-60'
                          : 'cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.has(group.id) || fullyAssigned}
                        disabled={disabled || isGroupAdmin}
                        onChange={() => toggleGroup(group.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 disabled:opacity-50"
                      />
                      <span className="flex-1 text-sm text-gray-900">{group.name}</span>
                      {fullyAssigned && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          ja distribuido
                        </span>
                      )}
                      {!fullyAssigned && existingCount > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          {existingCount}/{betCount} ja distribuido{existingCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {isGroupAdmin && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          seu grupo
                        </span>
                      )}
                    </label>
                  );
                })}
                {groups.length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-500">Nenhum grupo disponivel</p>
                )}
              </div>
            </fieldset>

            {/* Preview counter */}
            {selectedGroups.length > 0 && (
              <div className="rounded-md bg-blue-50 p-3">
                <p className="text-sm text-blue-800">
                  {betCount} aposta{betCount > 1 ? 's' : ''} &times; {selectedGroups.length} grupo{selectedGroups.length > 1 ? 's' : ''} = <strong>{newAssignments} novo{newAssignments !== 1 ? 's' : ''} assignment{newAssignments !== 1 ? 's' : ''}</strong>
                  {alreadyExistingInSelected > 0 && (
                    <span className="text-blue-600"> ({alreadyExistingInSelected} ja existe{alreadyExistingInSelected !== 1 ? 'm' : ''})</span>
                  )}
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600">{error}</p>
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
                onClick={handleConfirm}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={saving || selectedGroups.length === 0 || newAssignments === 0}
              >
                {saving ? 'Distribuindo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
