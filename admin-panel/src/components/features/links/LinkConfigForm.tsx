'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LinkConfig } from '@/types/database';

interface LinkConfigFormProps {
  groupId: string;
}

const TEMPLATE_VARS = [
  { var: '{home_team}', desc: 'Nome do time da casa' },
  { var: '{away_team}', desc: 'Nome do time visitante' },
  { var: '{league}', desc: 'Nome do campeonato' },
  { var: '{kickoff_date}', desc: 'Data do jogo (YYYY-MM-DD)' },
  { var: '{market}', desc: 'Mercado da aposta' },
  { var: '{affiliate_tag}', desc: 'Tag de afiliado' },
];

export function LinkConfigForm({ groupId }: LinkConfigFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [templateType, setTemplateType] = useState<'generic' | 'search'>('generic');
  const [templateUrl, setTemplateUrl] = useState('');
  const [searchUrl, setSearchUrl] = useState('');
  const [bookmakerName, setBookmakerName] = useState('');
  const [affiliateTag, setAffiliateTag] = useState('');
  const [overrideManual, setOverrideManual] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/groups/${groupId}/link-config`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Erro ao carregar');

      setGroupName(json.data.groupName);
      const config = json.data.linkConfig as LinkConfig;
      setEnabled(config.enabled || false);
      setTemplateType(config.templateType || 'generic');
      setTemplateUrl(config.templateUrl || '');
      setSearchUrl(config.searchUrl || '');
      setBookmakerName(config.bookmakerName || '');
      setAffiliateTag(config.affiliateTag || '');
      setOverrideManual(config.overrideManual || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar configuracao');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const linkConfig: Record<string, unknown> = {
        enabled,
        templateType,
        templateUrl: templateUrl.trim() || undefined,
        searchUrl: searchUrl.trim() || undefined,
        bookmakerName: bookmakerName.trim() || undefined,
        affiliateTag: affiliateTag.trim() || undefined,
        overrideManual,
      };

      const res = await fetch(`/api/groups/${groupId}/link-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkConfig }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Erro ao salvar');

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  function generatePreview(): string {
    const url = templateType === 'search' ? (searchUrl || templateUrl) : templateUrl;
    if (!url) return '';

    const sampleData: Record<string, string> = {
      '{home_team}': 'Flamengo',
      '{away_team}': 'Vasco',
      '{league}': 'Brasileirao Serie A',
      '{kickoff_date}': '2026-03-28',
      '{market}': 'Ambas Marcam',
      '{affiliate_tag}': affiliateTag || 'AFFILIATE',
    };

    let result = url;
    for (const [key, value] of Object.entries(sampleData)) {
      result = result.replaceAll(key, encodeURIComponent(value));
    }
    return result;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const previewUrl = generatePreview();

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Configuracao de Links — {groupName}
        </h2>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300 ${enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white border border-gray-300 transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
        <span className="ml-3 text-sm font-medium text-gray-700">
          {enabled ? 'Ativado' : 'Desativado'}
        </span>
      </div>

      {enabled && (
        <>
          {/* Bookmaker Name */}
          <div>
            <label htmlFor="bookmakerName" className="block text-sm font-medium text-gray-700 mb-1">
              Casa de Apostas
            </label>
            <input
              id="bookmakerName"
              type="text"
              value={bookmakerName}
              onChange={(e) => setBookmakerName(e.target.value)}
              placeholder="Ex: Betano, Bet365, Sportingbet"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              maxLength={50}
            />
          </div>

          {/* Template Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Link
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="templateType"
                  value="generic"
                  checked={templateType === 'generic'}
                  onChange={() => setTemplateType('generic')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Generico</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="templateType"
                  value="search"
                  checked={templateType === 'search'}
                  onChange={() => setTemplateType('search')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Busca por time</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {templateType === 'generic'
                ? 'Link estatico para a pagina de esportes com tag de afiliado'
                : 'Link com busca automatica usando nomes dos times'}
            </p>
          </div>

          {/* Template URL */}
          <div>
            <label htmlFor="templateUrl" className="block text-sm font-medium text-gray-700 mb-1">
              URL Template {templateType === 'generic' ? '(obrigatorio)' : '(fallback)'}
            </label>
            <input
              id="templateUrl"
              type="text"
              value={templateUrl}
              onChange={(e) => setTemplateUrl(e.target.value)}
              placeholder="https://betano.bet.br/sport/futebol?ref={affiliate_tag}"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Search URL (only for search type) */}
          {templateType === 'search' && (
            <div>
              <label htmlFor="searchUrl" className="block text-sm font-medium text-gray-700 mb-1">
                URL de Busca (obrigatorio)
              </label>
              <input
                id="searchUrl"
                type="text"
                value={searchUrl}
                onChange={(e) => setSearchUrl(e.target.value)}
                placeholder="https://betano.bet.br/search?q={home_team}+vs+{away_team}&ref={affiliate_tag}"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Affiliate Tag */}
          <div>
            <label htmlFor="affiliateTag" className="block text-sm font-medium text-gray-700 mb-1">
              Tag de Afiliado
            </label>
            <input
              id="affiliateTag"
              type="text"
              value={affiliateTag}
              onChange={(e) => setAffiliateTag(e.target.value)}
              placeholder="Ex: GURU_AFF"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              maxLength={100}
            />
          </div>

          {/* Override Manual */}
          <div className="flex items-center gap-2">
            <input
              id="overrideManual"
              type="checkbox"
              checked={overrideManual}
              onChange={(e) => setOverrideManual(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="overrideManual" className="text-sm text-gray-700">
              Sobrescrever links manuais existentes ao redistribuir
            </label>
          </div>

          {/* Template Variables Reference */}
          <div className="rounded-md bg-gray-50 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Variaveis disponiveis</h3>
            <div className="grid grid-cols-2 gap-1">
              {TEMPLATE_VARS.map((v) => (
                <div key={v.var} className="flex items-center gap-2 text-xs">
                  <code className="bg-gray-200 px-1.5 py-0.5 rounded font-mono text-gray-800">{v.var}</code>
                  <span className="text-gray-500">{v.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {previewUrl && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
              <h3 className="text-sm font-medium text-blue-800 mb-1">Preview do link (exemplo)</h3>
              <p className="text-xs text-blue-600 break-all font-mono">{previewUrl}</p>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-blue-700 underline hover:text-blue-900"
              >
                Testar link
              </a>
            </div>
          )}
        </>
      )}

      {/* Error / Success */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3">
          <p className="text-sm text-green-700">Configuracao salva com sucesso!</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
