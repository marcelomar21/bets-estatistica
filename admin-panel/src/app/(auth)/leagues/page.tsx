'use client';

import { useState, useEffect, useCallback } from 'react';

type TabId = 'classificacao' | 'precos' | 'descontos';

interface LeagueTier {
  league_name: string;
  country: string;
  tier: 'standard' | 'extra';
}

interface LeaguePricing {
  league_name: string;
  country: string;
  monthly_price: number;
}

interface LeagueDiscount {
  league_name: string;
  discount_percent: number;
}

interface GroupOption {
  id: string;
  name: string;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'classificacao', label: 'Classificacao' },
  { id: 'precos', label: 'Precos' },
  { id: 'descontos', label: 'Descontos' },
];

export default function LeagueManagementPage() {
  const [activeTab, setActiveTab] = useState<TabId>('classificacao');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestao de Ligas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Classifique ligas como padrao (incluidas) ou extra (upsell), defina precos e aplique descontos por grupo.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'classificacao' && (
        <TierClassificationTab showToast={showToast} />
      )}
      {activeTab === 'precos' && (
        <PricingTab showToast={showToast} />
      )}
      {activeTab === 'descontos' && (
        <DiscountsTab showToast={showToast} />
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

// ============================================================
// Tab 1: Tier Classification
// ============================================================

interface TabProps {
  showToast: (message: string, type: 'success' | 'error') => void;
}

function TierClassificationTab({ showToast }: TabProps) {
  const [leagues, setLeagues] = useState<LeagueTier[]>([]);
  const [original, setOriginal] = useState<LeagueTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(leagues) !== JSON.stringify(original);

  const loadTiers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leagues/tiers');
      const json = await res.json();
      if (json.success) {
        const data = json.data.leagues.map((l: LeagueTier) => ({
          ...l,
          tier: l.tier || 'standard',
        }));
        setLeagues(data);
        setOriginal(data);
      } else {
        showToast(json.error?.message || 'Erro ao carregar ligas', 'error');
      }
    } catch {
      showToast('Erro de conexao', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadTiers();
  }, [loadTiers]);

  function handleTierChange(leagueName: string, tier: 'standard' | 'extra') {
    setLeagues((prev) =>
      prev.map((l) =>
        l.league_name === leagueName ? { ...l, tier } : l,
      ),
    );
  }

  async function handleSave() {
    const changed = leagues.filter((l) => {
      const orig = original.find((o) => o.league_name === l.league_name);
      return orig && orig.tier !== l.tier;
    });

    if (changed.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch('/api/leagues/tiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagues: changed.map((l) => ({
            league_name: l.league_name,
            tier: l.tier,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Classificacao salva com sucesso!', 'success');
        setOriginal([...leagues]);
      } else {
        showToast(json.error?.message || 'Erro ao salvar', 'error');
      }
    } catch {
      showToast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  const byCountry = leagues.reduce<Record<string, LeagueTier[]>>((acc, l) => {
    if (!acc[l.country]) acc[l.country] = [];
    acc[l.country].push(l);
    return acc;
  }, {});

  const extraCount = leagues.filter((l) => l.tier === 'extra').length;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
        <span className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{leagues.length}</span> ligas totais
          {extraCount > 0 && (
            <>
              {' '}| <span className="font-semibold text-orange-600">{extraCount}</span> extras
            </>
          )}
        </span>
      </div>

      {/* Leagues grouped by country */}
      {Object.entries(byCountry).map(([country, countryLeagues]) => (
        <div key={country} className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700">{country}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {countryLeagues.map((league) => (
              <div
                key={league.league_name}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm text-gray-900">{league.league_name}</span>
                <div className="flex rounded-md border border-gray-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleTierChange(league.league_name, 'standard')}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      league.tier === 'standard'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Padrao
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTierChange(league.league_name, 'extra')}
                    className={`px-3 py-1 text-xs font-medium transition-colors border-l border-gray-300 ${
                      league.tier === 'extra'
                        ? 'bg-orange-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Extra
                  </button>
                </div>
              </div>
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
          {saving ? 'Salvando...' : 'Salvar Classificacao'}
        </button>
        {dirty && (
          <span className="text-xs text-amber-600">Alteracoes nao salvas</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Tab 2: Pricing
// ============================================================

function PricingTab({ showToast }: TabProps) {
  const [leagues, setLeagues] = useState<LeaguePricing[]>([]);
  const [original, setOriginal] = useState<LeaguePricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(leagues) !== JSON.stringify(original);

  const loadPricing = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leagues/pricing');
      const json = await res.json();
      if (json.success) {
        setLeagues(json.data.leagues);
        setOriginal(json.data.leagues);
      } else {
        showToast(json.error?.message || 'Erro ao carregar precos', 'error');
      }
    } catch {
      showToast('Erro de conexao', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPricing();
  }, [loadPricing]);

  function handlePriceChange(leagueName: string, value: string) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    setLeagues((prev) =>
      prev.map((l) =>
        l.league_name === leagueName ? { ...l, monthly_price: numValue } : l,
      ),
    );
  }

  async function handleSave() {
    const invalid = leagues.filter((l) => l.monthly_price <= 0);
    if (invalid.length > 0) {
      showToast('Todos os precos devem ser maiores que zero', 'error');
      return;
    }

    const changed = leagues.filter((l) => {
      const orig = original.find((o) => o.league_name === l.league_name);
      return orig && orig.monthly_price !== l.monthly_price;
    });

    if (changed.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch('/api/leagues/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prices: changed.map((l) => ({
            league_name: l.league_name,
            monthly_price: l.monthly_price,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Precos salvos com sucesso!', 'success');
        setOriginal([...leagues]);
      } else {
        showToast(json.error?.message || 'Erro ao salvar', 'error');
      }
    } catch {
      showToast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  const byCountry = leagues.reduce<Record<string, LeaguePricing[]>>((acc, l) => {
    if (!acc[l.country]) acc[l.country] = [];
    acc[l.country].push(l);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (leagues.length === 0) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          Nenhuma liga classificada como &quot;Extra&quot;. Classifique ligas na aba &quot;Classificacao&quot; primeiro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
        <p className="text-sm text-gray-600">
          Defina o preco mensal para cada liga extra. O valor padrao e <span className="font-semibold">R$200,00</span>.
        </p>
      </div>

      {/* Leagues grouped by country */}
      {Object.entries(byCountry).map(([country, countryLeagues]) => (
        <div key={country} className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700">{country}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {countryLeagues.map((league) => (
              <div
                key={league.league_name}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm text-gray-900">{league.league_name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500">R$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={league.monthly_price}
                    onChange={(e) =>
                      handlePriceChange(league.league_name, e.target.value)
                    }
                    className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm text-right focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar Precos'}
        </button>
        {dirty && (
          <span className="text-xs text-amber-600">Alteracoes nao salvas</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Tab 3: Discounts
// ============================================================

function DiscountsTab({ showToast }: TabProps) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [extraLeagues, setExtraLeagues] = useState<LeaguePricing[]>([]);
  const [discounts, setDiscounts] = useState<LeagueDiscount[]>([]);
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [savingLeague, setSavingLeague] = useState<string | null>(null);

  // Load groups on mount
  useEffect(() => {
    async function fetchGroups() {
      try {
        const res = await fetch('/api/groups');
        const json = await res.json();
        if (json.success) {
          const groupList = (json.data || []).map((g: { id: string; name: string }) => ({
            id: g.id,
            name: g.name,
          }));
          setGroups(groupList);
        }
      } catch {
        showToast('Erro ao carregar grupos', 'error');
      } finally {
        setLoadingGroups(false);
      }
    }
    fetchGroups();
  }, [showToast]);

  // Load data when group is selected
  const loadGroupData = useCallback(async (groupId: string) => {
    if (!groupId) return;
    setLoadingData(true);
    try {
      const [pricingRes, discountRes] = await Promise.all([
        fetch('/api/leagues/pricing'),
        fetch(`/api/groups/${groupId}/league-discounts`),
      ]);
      const [pricingJson, discountJson] = await Promise.all([
        pricingRes.json(),
        discountRes.json(),
      ]);

      if (pricingJson.success) {
        setExtraLeagues(pricingJson.data.leagues);
      }
      if (discountJson.success) {
        setDiscounts(discountJson.data.discounts);
        const inputs: Record<string, string> = {};
        for (const d of discountJson.data.discounts) {
          inputs[d.league_name] = String(d.discount_percent);
        }
        setDiscountInputs(inputs);
      }
    } catch {
      showToast('Erro ao carregar dados', 'error');
    } finally {
      setLoadingData(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (selectedGroupId) {
      loadGroupData(selectedGroupId);
    }
  }, [selectedGroupId, loadGroupData]);

  function handleGroupChange(groupId: string) {
    setSelectedGroupId(groupId);
    setExtraLeagues([]);
    setDiscounts([]);
    setDiscountInputs({});
  }

  function handleDiscountInput(leagueName: string, value: string) {
    setDiscountInputs((prev) => ({ ...prev, [leagueName]: value }));
  }

  function getDiscountPercent(leagueName: string): number | null {
    const existing = discounts.find((d) => d.league_name === leagueName);
    return existing ? existing.discount_percent : null;
  }

  function getInputPercent(leagueName: string): number {
    const val = parseInt(discountInputs[leagueName] || '', 10);
    return isNaN(val) ? 0 : val;
  }

  async function handleApplyDiscount(leagueName: string) {
    const percent = getInputPercent(leagueName);
    if (percent < 1 || percent > 100) {
      showToast('Desconto deve ser entre 1 e 100%', 'error');
      return;
    }

    setSavingLeague(leagueName);
    try {
      const res = await fetch(`/api/groups/${selectedGroupId}/league-discounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_name: leagueName,
          discount_percent: percent,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Desconto de ${percent}% aplicado para ${leagueName}`, 'success');
        await loadGroupData(selectedGroupId);
      } else {
        showToast(json.error?.message || 'Erro ao aplicar desconto', 'error');
      }
    } catch {
      showToast('Erro de conexao', 'error');
    } finally {
      setSavingLeague(null);
    }
  }

  async function handleRemoveDiscount(leagueName: string) {
    setSavingLeague(leagueName);
    try {
      const res = await fetch(`/api/groups/${selectedGroupId}/league-discounts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_name: leagueName }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Desconto removido de ${leagueName}`, 'success');
        await loadGroupData(selectedGroupId);
      } else {
        showToast(json.error?.message || 'Erro ao remover desconto', 'error');
      }
    } catch {
      showToast('Erro de conexao', 'error');
    } finally {
      setSavingLeague(null);
    }
  }

  if (loadingGroups) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Group selector */}
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
        <label htmlFor="group-select" className="block text-sm font-medium text-gray-700 mb-2">
          Selecione o grupo
        </label>
        <select
          id="group-select"
          value={selectedGroupId}
          onChange={(e) => handleGroupChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">-- Selecione um grupo --</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {/* Loading data */}
      {loadingData && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      )}

      {/* No group selected */}
      {!selectedGroupId && !loadingData && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            Selecione um grupo acima para gerenciar descontos.
          </p>
        </div>
      )}

      {/* No extra leagues */}
      {selectedGroupId && !loadingData && extraLeagues.length === 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            Nenhuma liga extra encontrada. Classifique ligas na aba &quot;Classificacao&quot; primeiro.
          </p>
        </div>
      )}

      {/* Extra leagues with discount inputs */}
      {selectedGroupId && !loadingData && extraLeagues.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Descontos para ligas extras
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {extraLeagues.map((league) => {
              const currentDiscount = getDiscountPercent(league.league_name);
              const inputPercent = getInputPercent(league.league_name);
              const discountedPrice = inputPercent > 0 && inputPercent <= 100
                ? league.monthly_price * (1 - inputPercent / 100)
                : league.monthly_price;
              const isSaving = savingLeague === league.league_name;

              return (
                <div
                  key={league.league_name}
                  className="px-4 py-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {league.league_name}
                      </span>
                      <span className="ml-2 text-sm text-gray-500">
                        R${league.monthly_price.toFixed(2)}/mes
                      </span>
                    </div>
                    {currentDiscount !== null && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        {currentDiscount}% desconto ativo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        placeholder="% desconto"
                        value={discountInputs[league.league_name] || ''}
                        onChange={(e) =>
                          handleDiscountInput(league.league_name, e.target.value)
                        }
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm text-right focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                    {inputPercent > 0 && inputPercent <= 100 && (
                      <span className="text-xs text-gray-500">
                        = R${discountedPrice.toFixed(2)}/mes
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleApplyDiscount(league.league_name)}
                      disabled={isSaving}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isSaving ? 'Salvando...' : 'Aplicar Desconto'}
                    </button>
                    {currentDiscount !== null && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDiscount(league.league_name)}
                        disabled={isSaving}
                        className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
