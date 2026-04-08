'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Subscription {
  league_name: string;
  status: string;
  mp_checkout_url: string | null;
  monthly_price: number;
  discount_percent: number;
  activated_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

interface ExtraLeague {
  league_name: string;
  country: string;
  monthly_price: number;
  discount_percent: number;
}

export default function LeagueCheckoutPage() {
  const params = useParams();
  const groupId = params.groupId as string;

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [availableLeagues, setAvailableLeagues] = useState<ExtraLeague[]>([]);
  const [selectedLeagues, setSelectedLeagues] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [cancellingLeague, setCancellingLeague] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subsRes, leaguesRes, pricingRes, discountsRes] = await Promise.all([
        fetch(`/api/groups/${groupId}/league-subscriptions`),
        fetch(`/api/groups/${groupId}/leagues`),
        fetch('/api/leagues/pricing'),
        fetch(`/api/groups/${groupId}/league-discounts`),
      ]);

      const [subsJson, leaguesJson, pricingJson, discountsJson] = await Promise.all([
        subsRes.json(),
        leaguesRes.json(),
        pricingRes.json(),
        discountsRes.json(),
      ]);

      // Set subscriptions
      if (subsJson.success) {
        setSubscriptions(subsJson.data.subscriptions || []);
      }

      // Build available extra leagues list
      if (leaguesJson.success) {
        const allLeagues: Array<{ league_name: string; country: string; tier?: string }> = leaguesJson.data.leagues || [];

        // Get pricing map
        const priceMap = new Map<string, number>();
        if (pricingJson.success) {
          for (const p of pricingJson.data.pricing || []) {
            priceMap.set(p.league_name, Number(p.monthly_price));
          }
        }

        // Get discount map
        const discountMap = new Map<string, number>();
        if (discountsJson.success) {
          for (const d of discountsJson.data.discounts || []) {
            discountMap.set(d.league_name, d.discount_percent);
          }
        }

        // We need to know which leagues are tier='extra'
        // Fetch tiers data
        const tiersRes = await fetch('/api/leagues/tiers');
        const tiersJson = await tiersRes.json();
        const tierMap = new Map<string, string>();
        if (tiersJson.success) {
          for (const t of tiersJson.data.leagues || []) {
            tierMap.set(t.league_name, t.tier);
          }
        }

        // Filter: only tier='extra' leagues that aren't already subscribed (active or pending)
        const subscribedNames = new Set(
          (subsJson.success ? subsJson.data.subscriptions || [] : [])
            .filter((s: Subscription) => s.status === 'active' || s.status === 'pending')
            .map((s: Subscription) => s.league_name),
        );

        const extras: ExtraLeague[] = allLeagues
          .filter((l) => tierMap.get(l.league_name) === 'extra' && !subscribedNames.has(l.league_name))
          .map((l) => ({
            league_name: l.league_name,
            country: l.country,
            monthly_price: priceMap.get(l.league_name) ?? 200,
            discount_percent: discountMap.get(l.league_name) ?? 0,
          }));

        setAvailableLeagues(extras);
      }
    } catch {
      showToast('Erro de conexão ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleLeague(leagueName: string) {
    setSelectedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(leagueName)) {
        next.delete(leagueName);
      } else {
        next.add(leagueName);
      }
      return next;
    });
  }

  // Calculate order summary
  const selectedList = availableLeagues.filter((l) => selectedLeagues.has(l.league_name));
  const subtotal = selectedList.reduce((sum, l) => sum + l.monthly_price, 0);
  const totalDiscount = selectedList.reduce(
    (sum, l) => sum + l.monthly_price * (l.discount_percent / 100),
    0,
  );
  const total = Math.round((subtotal - totalDiscount) * 100) / 100;

  async function handleCheckout() {
    if (selectedLeagues.size === 0) return;
    setCheckingOut(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/league-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_names: Array.from(selectedLeagues) }),
      });
      const json = await res.json();

      if (json.success) {
        showToast('Checkout gerado! Complete o pagamento na aba que foi aberta.', 'success');
        window.open(json.data.checkoutUrl, '_blank');
        setSelectedLeagues(new Set());
        // Reload data to reflect pending subscriptions
        await loadData();
      } else {
        showToast(json.error?.message || 'Erro ao gerar checkout', 'error');
      }
    } catch {
      showToast('Erro de conexão', 'error');
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleCancel(leagueName: string) {
    if (!window.confirm(`Deseja cancelar a assinatura de ${leagueName}?`)) return;

    setCancellingLeague(leagueName);
    try {
      const res = await fetch(`/api/groups/${groupId}/league-subscriptions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_name: leagueName }),
      });
      const json = await res.json();

      if (json.success) {
        showToast(`Assinatura de ${leagueName} cancelada.`, 'success');
        await loadData();
      } else {
        showToast(json.error?.message || 'Erro ao cancelar assinatura', 'error');
      }
    } catch {
      showToast('Erro de conexão', 'error');
    } finally {
      setCancellingLeague(null);
    }
  }

  function formatPrice(value: number): string {
    return `R$${value.toFixed(2).replace('.', ',')}`;
  }

  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');
  const pendingSubscriptions = subscriptions.filter((s) => s.status === 'pending');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/groups/${groupId}/leagues`}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Voltar para Campeonatos
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Ligas Extras</h1>
        <p className="text-sm text-gray-500 mt-1">
          Adquira ligas extras para receber apostas de campeonatos adicionais.
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
          {/* Section 1: Active subscriptions */}
          {activeSubscriptions.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-700">Suas Ligas Extras Ativas</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {activeSubscriptions.map((sub) => {
                  const discountedPrice = sub.monthly_price * (1 - sub.discount_percent / 100);
                  const hasDiscount = sub.discount_percent > 0;

                  return (
                    <div
                      key={sub.league_name}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-sm text-gray-900">{sub.league_name}</span>
                        <span className="text-sm text-gray-500">
                          {hasDiscount ? (
                            <>
                              <span className="line-through text-gray-400">
                                {formatPrice(sub.monthly_price)}
                              </span>{' '}
                              {formatPrice(Math.round(discountedPrice * 100) / 100)}/mes ({sub.discount_percent}% desc.)
                            </>
                          ) : (
                            <>{formatPrice(sub.monthly_price)}/mes</>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancel(sub.league_name)}
                        disabled={cancellingLeague === sub.league_name}
                        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {cancellingLeague === sub.league_name ? 'Cancelando...' : 'Cancelar'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending subscriptions */}
          {pendingSubscriptions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50">
              <div className="border-b border-amber-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-amber-800">Aguardando Pagamento</h2>
              </div>
              <div className="divide-y divide-amber-200">
                {pendingSubscriptions.map((sub) => (
                  <div
                    key={sub.league_name}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
                      <span className="text-sm text-amber-900">{sub.league_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {sub.mp_checkout_url && (
                        <a
                          href={sub.mp_checkout_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          Completar pagamento
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCancel(sub.league_name)}
                        disabled={cancellingLeague === sub.league_name}
                        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {cancellingLeague === sub.league_name ? 'Cancelando...' : 'Cancelar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Available extra leagues */}
          {availableLeagues.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-700">Ligas Disponíveis</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {availableLeagues.map((league) => {
                  const hasDiscount = league.discount_percent > 0;
                  const discountedPrice = league.monthly_price * (1 - league.discount_percent / 100);

                  return (
                    <label
                      key={league.league_name}
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedLeagues.has(league.league_name)}
                          onChange={() => toggleLeague(league.league_name)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-sm text-gray-900">{league.league_name}</span>
                          <span className="ml-2 text-xs text-gray-400">{league.country}</span>
                        </div>
                      </div>
                      <span className="text-sm text-gray-600">
                        {hasDiscount ? (
                          <>
                            <span className="line-through text-gray-400">
                              {formatPrice(league.monthly_price)}
                            </span>{' '}
                            <span className="font-medium text-gray-900">
                              {formatPrice(Math.round(discountedPrice * 100) / 100)}/mes
                            </span>{' '}
                            <span className="text-xs text-green-600">
                              ({league.discount_percent}% desc.)
                            </span>
                          </>
                        ) : (
                          <span className="font-medium text-gray-900">
                            {formatPrice(league.monthly_price)}/mes
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* No leagues available */}
          {availableLeagues.length === 0 && activeSubscriptions.length === 0 && pendingSubscriptions.length === 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-blue-800">
                Nenhuma liga extra disponível no momento.
              </p>
            </div>
          )}

          {/* Order summary */}
          {selectedLeagues.size > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Resumo do pedido</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>{selectedLeagues.size} liga{selectedLeagues.size > 1 ? 's' : ''} selecionada{selectedLeagues.size > 1 ? 's' : ''}</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}/mes</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Descontos</span>
                    <span>-{formatPrice(Math.round(totalDiscount * 100) / 100)}/mes</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                  <span>Total</span>
                  <span>{formatPrice(total)}/mes</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={checkingOut || selectedLeagues.size === 0}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {checkingOut ? 'Gerando checkout...' : `Ir para Checkout (${formatPrice(total)}/mes)`}
              </button>
            </div>
          )}
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
