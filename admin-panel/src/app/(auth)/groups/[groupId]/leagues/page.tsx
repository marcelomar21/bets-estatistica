'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface LeaguePreference {
  league_name: string;
  country: string;
  tier: 'standard' | 'extra';
  monthly_price: number | null;
  enabled: boolean;
}

export default function LeaguePreferencesPage() {
  const params = useParams();
  const groupId = params.groupId as string;

  const [leagues, setLeagues] = useState<LeaguePreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const loadLeagues = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/leagues`);
      const json = await res.json();

      if (json.success) {
        setLeagues(json.data.leagues);
        setDirty(false);
      } else {
        showToast(json.error?.message || 'Erro ao carregar ligas', 'error');
      }
    } catch {
      showToast('Erro de conexão', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadLeagues();
  }, [loadLeagues]);

  function handleToggle(leagueName: string) {
    setLeagues((prev) =>
      prev.map((l) =>
        l.league_name === leagueName ? { ...l, enabled: !l.enabled } : l,
      ),
    );
    setDirty(true);
  }

  function handleToggleAll(enabled: boolean) {
    setLeagues((prev) => prev.map((l) => ({ ...l, enabled })));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/leagues`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagues: leagues.map((l) => ({
            league_name: l.league_name,
            enabled: l.enabled,
          })),
        }),
      });
      const json = await res.json();

      if (json.success) {
        showToast('Preferências salvas com sucesso!', 'success');
        setDirty(false);
      } else {
        showToast(json.error?.message || 'Erro ao salvar', 'error');
      }
    } catch {
      showToast('Erro de conexão', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Group leagues by country
  const byCountry = leagues.reduce<Record<string, LeaguePreference[]>>((acc, l) => {
    if (!acc[l.country]) acc[l.country] = [];
    acc[l.country].push(l);
    return acc;
  }, {});

  const enabledCount = leagues.filter((l) => l.enabled).length;
  const extraCount = leagues.filter((l) => l.tier === 'extra').length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Voltar para Grupo
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Campeonatos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure quais campeonatos este grupo recebe na distribuição de apostas.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      )}

      {/* Content */}
      {!loading && (
        <>
          {/* Summary + bulk actions */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
            <span className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{enabledCount}</span> de{' '}
              <span className="font-semibold text-gray-900">{leagues.length}</span> ligas ativas
              {extraCount > 0 && (
                <>
                  {' '}| <span className="font-semibold text-orange-600">{extraCount}</span> ligas extras
                </>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleAll(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Ativar todas
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => handleToggleAll(false)}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Desativar todas
              </button>
            </div>
          </div>

          {/* Leagues grouped by country */}
          {Object.entries(byCountry).map(([country, countryLeagues]) => (
            <div key={country} className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-700">{country}</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {countryLeagues.map((league) => (
                  <label
                    key={league.league_name}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900">{league.league_name}</span>
                      {league.tier === 'extra' && (
                        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                          Extra {league.monthly_price ? `R$${league.monthly_price}/mes` : 'R$200/mes'}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={league.enabled}
                      onClick={() => handleToggle(league.league_name)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        league.enabled ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          league.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {leagues.length === 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-blue-800">
                Nenhum campeonato ativo encontrado no sistema.
              </p>
            </div>
          )}

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar Preferências'}
            </button>
            {dirty && (
              <span className="text-xs text-amber-600">Alterações não salvas</span>
            )}
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 bottom-4 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
