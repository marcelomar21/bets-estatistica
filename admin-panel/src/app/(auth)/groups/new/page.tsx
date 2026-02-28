'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OnboardingWizard } from '@/components/features/groups/OnboardingWizard';

type Mode = 'select' | 'simple' | 'full';

export default function NewGroupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('select');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSimpleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      setError('Nome deve ter pelo menos 2 caracteres');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await res.json();
      if (!body.success) {
        setError(body.error?.message || 'Erro ao criar grupo');
        return;
      }
      router.push(`/groups/${body.data.id}`);
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <Link
          href="/groups"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Voltar para Grupos
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          {mode === 'full' ? 'Onboarding de Influencer' : 'Novo Grupo'}
        </h1>
      </div>

      {mode === 'select' && (
        <div className="grid gap-4">
          <button
            onClick={() => setMode('simple')}
            className="rounded-lg border-2 border-gray-200 bg-white p-5 text-left shadow-sm hover:border-blue-400 hover:shadow-md transition-all"
          >
            <h3 className="text-base font-semibold text-gray-900">Criar Grupo</h3>
            <p className="mt-1 text-sm text-gray-500">
              Cria o grupo rapidamente. Depois voce adiciona WhatsApp ou Telegram pela pagina do grupo.
            </p>
          </button>
          <button
            onClick={() => setMode('full')}
            className="rounded-lg border-2 border-gray-200 bg-white p-5 text-left shadow-sm hover:border-blue-400 hover:shadow-md transition-all"
          >
            <h3 className="text-base font-semibold text-gray-900">Onboarding Completo (Telegram)</h3>
            <p className="mt-1 text-sm text-gray-500">
              Wizard automatizado: cria grupo, configura bot Telegram, Mercado Pago, admin e deploy.
            </p>
          </button>
        </div>
      )}

      {mode === 'simple' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <button
            onClick={() => setMode('select')}
            className="text-xs text-gray-500 hover:text-gray-700 mb-4"
          >
            &larr; Voltar
          </button>
          <form onSubmit={handleSimpleCreate} className="space-y-4">
            <div>
              <label htmlFor="group-name" className="block text-sm font-medium text-gray-700 mb-1">
                Nome do Grupo
              </label>
              <input
                id="group-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Ex: Canal do Joao"
                autoFocus
                disabled={loading}
              />
              {error && (
                <p className="mt-1 text-sm text-red-600">{error}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Criando...' : 'Criar Grupo'}
            </button>
          </form>
        </div>
      )}

      {mode === 'full' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <button
            onClick={() => setMode('select')}
            className="text-xs text-gray-500 hover:text-gray-700 mb-4"
          >
            &larr; Voltar
          </button>
          <OnboardingWizard />
        </div>
      )}
    </div>
  );
}
