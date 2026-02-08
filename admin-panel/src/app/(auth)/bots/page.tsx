'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BotPoolListItem } from '@/types/database';
import { BotCard } from '@/components/features/bots/BotCard';
import { BotForm, type BotFormData } from '@/components/features/bots/BotForm';

interface BotsSummary {
  available: number;
  in_use: number;
  total: number;
}

export default function BotsPage() {
  const [bots, setBots] = useState<BotPoolListItem[]>([]);
  const [summary, setSummary] = useState<BotsSummary>({ available: 0, in_use: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchBots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/bots');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await res.json();
      if (!body.success) {
        setError(body.error?.message || 'Erro ao carregar bots');
        return;
      }
      setBots(body.data);
      setSummary(body.summary);
    } catch {
      setError('Erro de conexão ao carregar bots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  async function handleAddBot(data: BotFormData) {
    setFormLoading(true);
    setFormError(null);
    try {
      const res = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await res.json();
      if (!body.success) {
        setFormError(body.error?.message || 'Erro ao adicionar bot');
        return;
      }
      setShowForm(false);
      setFormError(null);
      await fetchBots();
    } catch {
      setFormError('Erro de conexão ao adicionar bot');
    } finally {
      setFormLoading(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Bots</h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Bots</h1>
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
        <h1 className="text-2xl font-bold text-gray-900">Bots</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Adicionar Bot
          </button>
        )}
      </div>

      {/* Summary counters */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{summary.available}</p>
          <p className="text-sm text-gray-500">Disponíveis</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-blue-600">{summary.in_use}</p>
          <p className="text-sm text-gray-500">Em Uso</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
          <p className="text-sm text-gray-500">Total</p>
        </div>
      </div>

      {/* Add bot form */}
      {showForm && (
        <div className="mb-6">
          <BotForm
            onSubmit={handleAddBot}
            loading={formLoading}
            error={formError}
            onCancel={() => {
              setShowForm(false);
              setFormError(null);
            }}
          />
        </div>
      )}

      {/* Bot list */}
      {bots.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">Nenhum bot cadastrado no pool</p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Adicionar primeiro bot
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bots.map((bot) => (
            <BotCard key={bot.id} bot={bot} />
          ))}
        </div>
      )}
    </div>
  );
}
