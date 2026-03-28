'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LinkConfig, LinkTemplateType } from '@/types/database';

interface LinkConfigFormProps {
  groupId: string;
  showBackLink?: boolean;
}

const TEMPLATE_VARIABLES = [
  { variable: '{home_team}', description: 'Nome do time da casa' },
  { variable: '{away_team}', description: 'Nome do time visitante' },
  { variable: '{league}', description: 'Nome do campeonato' },
  { variable: '{kickoff_date}', description: 'Data do jogo (YYYY-MM-DD)' },
  { variable: '{market}', description: 'Mercado da aposta' },
  { variable: '{affiliate_tag}', description: 'Tag de afiliado' },
];

const DEFAULT_CONFIG: LinkConfig = {
  enabled: false,
  templateUrl: '',
  templateType: 'generic',
  searchUrl: '',
  bookmakerName: '',
  affiliateTag: '',
  overrideManual: false,
};

export function LinkConfigForm({ groupId, showBackLink = true }: LinkConfigFormProps) {
  const [config, setConfig] = useState<LinkConfig>(DEFAULT_CONFIG);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [previewLink, setPreviewLink] = useState<string | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/groups/${groupId}/link-config`);
        const json = await res.json();
        if (json.success) {
          setGroupName(json.data.groupName);
          const saved = json.data.linkConfig;
          if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
            setConfig({ ...DEFAULT_CONFIG, ...saved });
          }
        }
      } catch {
        showToast('error', 'Erro ao carregar configuracao');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [groupId, showToast]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/link-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkConfig: config }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('success', 'Configuracao salva com sucesso');
      } else {
        showToast('error', json.error?.message || 'Erro ao salvar');
      }
    } catch {
      showToast('error', 'Erro ao salvar configuracao');
    } finally {
      setSaving(false);
    }
  }

  function handleTestLink() {
    // Generate preview link client-side using sample data
    let url = config.templateType === 'search' && config.searchUrl
      ? config.searchUrl
      : config.templateUrl;

    if (!url) {
      showToast('error', 'Configure uma URL de template primeiro');
      return;
    }

    const sampleVars: Record<string, string> = {
      '{home_team}': 'Flamengo',
      '{away_team}': 'Vasco',
      '{league}': 'Brasileirao Serie A',
      '{kickoff_date}': new Date().toISOString().split('T')[0],
      '{market}': 'Ambas Marcam',
      '{affiliate_tag}': config.affiliateTag || 'AFFILIATE',
    };

    for (const [key, value] of Object.entries(sampleVars)) {
      url = url.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), encodeURIComponent(value));
    }
    url = url.replace(/\{[a-z_]+\}/g, '');

    setPreviewLink(url);
  }

  if (loading) {
    return <div className="animate-pulse h-64 bg-gray-100 rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      {showBackLink && (
        <div className="flex items-center gap-4">
          <a href={`/groups/${groupId}`} className="text-sm text-blue-600 hover:underline">
            &larr; Voltar para {groupName || 'grupo'}
          </a>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuracao de Links Automaticos</h2>
        <p className="text-sm text-gray-500 mb-6">
          Configure a geracao automatica de deep links para apostas distribuidas a este grupo.
        </p>

        {/* Enable toggle */}
        <div className="flex items-center gap-3 mb-6">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
          </label>
          <span className="text-sm font-medium text-gray-900">Auto-link ativado</span>
        </div>

        {config.enabled && (
          <div className="space-y-4">
            {/* Bookmaker name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Casa de Apostas</label>
              <input
                type="text"
                value={config.bookmakerName || ''}
                onChange={(e) => setConfig({ ...config, bookmakerName: e.target.value })}
                placeholder="Ex: Betano, Bet365, Sportingbet"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Template type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Template</label>
              <select
                value={config.templateType}
                onChange={(e) => setConfig({ ...config, templateType: e.target.value as LinkTemplateType })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="generic">Generico (link fixo)</option>
                <option value="search">Busca (com variaveis do jogo)</option>
              </select>
            </div>

            {/* Template URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL {config.templateType === 'generic' ? 'Generica' : 'Base'}
              </label>
              <input
                type="url"
                value={config.templateUrl || ''}
                onChange={(e) => setConfig({ ...config, templateUrl: e.target.value })}
                placeholder="https://betano.bet.br/sport/futebol?ref=GURU_AFF"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">URL de fallback. Obrigatoria.</p>
            </div>

            {/* Search URL (only for search type) */}
            {config.templateType === 'search' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL de Busca</label>
                <input
                  type="text"
                  value={config.searchUrl || ''}
                  onChange={(e) => setConfig({ ...config, searchUrl: e.target.value })}
                  placeholder="https://betano.bet.br/search?q={home_team}+vs+{away_team}&ref=GURU_AFF"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">Use variaveis como {'{home_team}'}, {'{away_team}'}, etc.</p>
              </div>
            )}

            {/* Affiliate tag */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tag de Afiliado</label>
              <input
                type="text"
                value={config.affiliateTag || ''}
                onChange={(e) => setConfig({ ...config, affiliateTag: e.target.value })}
                placeholder="GURU_AFF"
                className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Override manual */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="overrideManual"
                checked={config.overrideManual || false}
                onChange={(e) => setConfig({ ...config, overrideManual: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="overrideManual" className="text-sm text-gray-700">
                Sobrescrever links inseridos manualmente
              </label>
            </div>

            {/* Template variables reference */}
            <div className="mt-4 rounded-md bg-gray-50 p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Variaveis disponiveis</h3>
              <div className="grid grid-cols-2 gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <div key={v.variable} className="text-xs">
                    <code className="bg-gray-200 px-1 py-0.5 rounded font-mono">{v.variable}</code>
                    <span className="text-gray-500 ml-1">{v.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {config.enabled && (
            <button
              onClick={handleTestLink}
              type="button"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Testar Link
            </button>
          )}
        </div>

        {/* Preview link */}
        {previewLink && (
          <div className="mt-4 rounded-md bg-green-50 border border-green-200 p-3">
            <p className="text-sm font-medium text-green-800 mb-1">Link de exemplo gerado:</p>
            <a
              href={previewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline break-all font-mono"
            >
              {previewLink}
            </a>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`mt-4 rounded-md p-3 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
