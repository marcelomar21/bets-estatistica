'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface TeamDisplayName {
  id: number;
  api_name: string;
  display_name: string;
  is_override: boolean;
  updated_at: string;
}

export default function TeamNamesPage() {
  const [teams, setTeams] = useState<TeamDisplayName[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [modifiedOnly, setModifiedOnly] = useState(false);
  const [editingApiName, setEditingApiName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [originalValue, setOriginalValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cancelledRef = useRef(false); // F8/F9: track if edit was cancelled

  // F6: Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (modifiedOnly) params.set('modified_only', 'true');

      const res = await fetch(`/api/team-display-names?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setTeams(json.data);
      } else {
        setError(json.error?.message || 'Erro ao carregar times');
      }
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, modifiedOnly]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // F18: Always count overrides from full data, not filtered view
  const totalTeams = teams.length;
  const customizedCount = useMemo(
    () => teams.filter((t) => t.is_override).length,
    [teams],
  );

  function startEditing(team: TeamDisplayName) {
    cancelledRef.current = false;
    setEditingApiName(team.api_name);
    setEditValue(team.display_name);
    setOriginalValue(team.display_name);
  }

  async function saveEdit(apiName: string) {
    // F8/F9: Don't save if cancelled
    if (cancelledRef.current) return;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    // F16: Don't save if value unchanged
    if (trimmed === originalValue) {
      setEditingApiName(null);
      return;
    }
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/team-display-names', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ api_name: apiName, display_name: trimmed }],
        }),
      });

      const json = await res.json();
      if (json.success) {
        setTeams((prev) =>
          prev.map((t) =>
            t.api_name === apiName
              ? { ...t, display_name: trimmed, is_override: apiName !== trimmed }
              : t,
          ),
        );
        setEditingApiName(null);
      } else {
        setError(json.error?.message || 'Erro ao salvar');
      }
    } catch {
      setError('Erro de conexao');
    } finally {
      setSaving(false);
    }
  }

  async function resetName(team: TeamDisplayName) {
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/team-display-names', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ api_name: team.api_name, display_name: team.api_name }],
        }),
      });

      const json = await res.json();
      if (json.success) {
        setTeams((prev) =>
          prev.map((t) =>
            t.api_name === team.api_name
              ? { ...t, display_name: team.api_name, is_override: false }
              : t,
          ),
        );
      } else {
        setError(json.error?.message || 'Erro ao resetar');
      }
    } catch {
      setError('Erro de conexao');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, apiName: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // F9: Prevent onBlur from also saving by removing editing state first
      const target = e.currentTarget as HTMLElement;
      saveEdit(apiName).then(() => target.blur?.());
    } else if (e.key === 'Escape') {
      // F8: Set cancelled flag before blur fires
      cancelledRef.current = true;
      setEditingApiName(null);
    }
  }

  function handleBlur(apiName: string) {
    // F8: Don't save if escape was pressed
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    saveEdit(apiName);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nomes de Times</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gerencie como os nomes dos times aparecem em mensagens, relatorios e no admin panel.
        </p>
      </div>

      {/* Counters */}
      <div className="flex gap-4 text-sm text-gray-600">
        <span>{totalTeams} times</span>
        <span>{customizedCount} com nome customizado</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por nome..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-64"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={modifiedOnly}
            onChange={(e) => setModifiedOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          Mostrar apenas editados
        </label>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nome API
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nome de Exibicao
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Acoes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : teams.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                  Nenhum time encontrado
                </td>
              </tr>
            ) : (
              teams.map((team) => {
                const isEditing = editingApiName === team.api_name;
                const isOverride = team.is_override;

                return (
                  <tr key={team.api_name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {team.api_name}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleBlur(team.api_name)}
                          onKeyDown={(e) => handleKeyDown(e, team.api_name)}
                          maxLength={200}
                          disabled={saving}
                          autoFocus
                          className="rounded border border-blue-300 px-2 py-1 text-sm w-full focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <button
                          onClick={() => startEditing(team)}
                          className="text-left hover:text-blue-600 cursor-pointer w-full"
                          title="Clique para editar"
                        >
                          <span className={isOverride ? 'font-medium text-blue-700' : 'text-gray-900'}>
                            {team.display_name}
                          </span>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isOverride && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          editado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isOverride && (
                        <button
                          onClick={() => resetName(team)}
                          disabled={saving}
                          className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
                          title="Resetar para nome original"
                        >
                          Resetar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
