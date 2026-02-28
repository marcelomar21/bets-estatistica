'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WhatsAppNumberListItem, WhatsAppPoolSummary } from '@/types/database';
import { whatsappStatusConfig, formatPhoneNumber } from '@/components/features/whatsapp-pool/whatsapp-pool-utils';
import { formatDateTime } from '@/lib/format-utils';

export default function WhatsAppPoolPage() {
  const [numbers, setNumbers] = useState<WhatsAppNumberListItem[]>([]);
  const [summary, setSummary] = useState<WhatsAppPoolSummary>({
    total: 0, available: 0, active: 0, backup: 0, banned: 0, cooldown: 0, connecting: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formPhone, setFormPhone] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchNumbers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp-pool');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await res.json();
      if (!body.success) {
        setError(body.error?.message || 'Erro ao carregar numeros');
        return;
      }
      setNumbers(body.data);
      setSummary(body.summary);
    } catch {
      setError('Erro de conexao ao carregar numeros');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNumbers();
  }, [fetchNumbers]);

  async function handleAddNumber(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    try {
      const res = await fetch('/api/whatsapp-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: formPhone.trim() }),
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await res.json();
      if (!body.success) {
        setFormError(body.error?.message || 'Erro ao adicionar numero');
        return;
      }
      setShowForm(false);
      setFormPhone('');
      setFormError(null);
      await fetchNumbers();
    } catch {
      setFormError('Erro de conexao ao adicionar numero');
    } finally {
      setFormLoading(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Pool</h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Pool</h1>
        </div>
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp Pool</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Adicionar Numero
          </button>
        )}
      </div>

      {/* Summary counters */}
      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
          <p className="text-sm text-gray-500">Total</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{summary.available}</p>
          <p className="text-sm text-gray-500">Disponiveis</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-blue-600">{summary.active + summary.backup}</p>
          <p className="text-sm text-gray-500">Em Uso</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-red-600">{summary.banned}</p>
          <p className="text-sm text-gray-500">Banidos</p>
        </div>
      </div>

      {/* Add number form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Adicionar Numero WhatsApp</h3>
          <form onSubmit={handleAddNumber} className="flex gap-3 items-end">
            <div className="flex-1">
              <label htmlFor="phone" className="block text-xs font-medium text-gray-600 mb-1">
                Telefone (E.164)
              </label>
              <input
                id="phone"
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+5511999887766"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={formLoading}
              />
            </div>
            <button
              type="submit"
              disabled={formLoading || !formPhone.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {formLoading ? 'Adicionando...' : 'Adicionar'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null); }}
              disabled={formLoading}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </form>
          {formError && (
            <p className="mt-2 text-sm text-red-600">{formError}</p>
          )}
        </div>
      )}

      {/* Group health summary */}
      {(() => {
        const grouped = new Map<string, { name: string; total: number; online: number }>();
        for (const num of numbers) {
          if (!num.group_id) continue;
          const groupName = num.groups?.name || num.group_id;
          if (!grouped.has(num.group_id)) {
            grouped.set(num.group_id, { name: groupName, total: 0, online: 0 });
          }
          const g = grouped.get(num.group_id)!;
          g.total++;
          if (num.health_status === 'online') g.online++;
        }
        if (grouped.size === 0) return null;
        return (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Health por Grupo</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from(grouped.entries()).map(([gid, g]) => (
                <div key={gid} className={`rounded-lg border p-3 shadow-sm ${g.online === g.total ? 'border-green-200 bg-green-50' : g.online === 0 ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}`}>
                  <p className="text-sm font-medium text-gray-900">{g.name}</p>
                  <p className={`text-xs ${g.online === g.total ? 'text-green-700' : g.online === 0 ? 'text-red-700' : 'text-yellow-700'}`}>
                    {g.online}/{g.total} numeros online
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Numbers table */}
      {numbers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">Nenhum numero no pool</p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Adicionar primeiro numero
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Telefone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Health</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Grupo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Heartbeat</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Criado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {numbers.map((num) => {
                const statusBadge = whatsappStatusConfig[num.status] || { label: num.status, className: 'bg-gray-100 text-gray-800' };
                return (
                  <tr key={num.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      {formatPhoneNumber(num.phone_number)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.className}`}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {num.health_status === 'online' ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          Online
                        </span>
                      ) : num.health_status === 'offline' ? (
                        <span className="inline-flex items-center gap-1 text-red-600" title={num.health_error || undefined}>
                          <span className="h-2 w-2 rounded-full bg-red-500" />
                          Offline
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {num.groups?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {num.role || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {num.last_heartbeat ? formatDateTime(num.last_heartbeat) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDateTime(num.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
