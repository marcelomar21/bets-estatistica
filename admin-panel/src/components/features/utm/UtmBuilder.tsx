'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';

interface UtmParams {
  baseUrl: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
}

interface HistoryEntry {
  url: string;
  label: string;
  createdAt: string;
}

const PRESETS = [
  { label: 'Custom', source: '', medium: '' },
  { label: 'Telegram Post', source: 'telegram', medium: 'social' },
  { label: 'WhatsApp Message', source: 'whatsapp', medium: 'social' },
  { label: 'Instagram Story', source: 'instagram', medium: 'social' },
] as const;

const STORAGE_KEY = 'utm-generator-history';
const MAX_HISTORY = 10;

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // localStorage full or unavailable
  }
}

export function UtmBuilder() {
  const [params, setParams] = useState<UtmParams>({
    baseUrl: '',
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_term: '',
    utm_content: '',
  });
  const [copied, setCopied] = useState(false);
  const [copiedHistoryIdx, setCopiedHistoryIdx] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedPreset, setSelectedPreset] = useState(0);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const generatedUrl = useMemo(() => {
    if (!params.baseUrl || !isValidUrl(params.baseUrl)) return '';

    const url = new URL(params.baseUrl);
    if (params.utm_source) url.searchParams.set('utm_source', params.utm_source);
    if (params.utm_medium) url.searchParams.set('utm_medium', params.utm_medium);
    if (params.utm_campaign) url.searchParams.set('utm_campaign', params.utm_campaign);
    if (params.utm_term) url.searchParams.set('utm_term', params.utm_term);
    if (params.utm_content) url.searchParams.set('utm_content', params.utm_content);

    return url.toString();
  }, [params]);

  const isFormValid = useMemo(() => {
    return (
      isValidUrl(params.baseUrl) &&
      params.utm_source.trim() !== '' &&
      params.utm_medium.trim() !== '' &&
      params.utm_campaign.trim() !== ''
    );
  }, [params]);

  const handleChange = useCallback(
    (field: keyof UtmParams) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setParams((prev) => ({ ...prev, [field]: e.target.value }));
    },
    [],
  );

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const idx = Number(e.target.value);
      setSelectedPreset(idx);
      const preset = PRESETS[idx];
      if (preset.source || preset.medium) {
        setParams((prev) => ({
          ...prev,
          utm_source: preset.source,
          utm_medium: preset.medium,
        }));
      }
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    const entry: HistoryEntry = {
      url: generatedUrl,
      label: params.utm_campaign || params.utm_source,
      createdAt: new Date().toISOString(),
    };
    const updated = [entry, ...history.filter((h) => h.url !== generatedUrl)].slice(
      0,
      MAX_HISTORY,
    );
    setHistory(updated);
    saveHistory(updated);
  }, [generatedUrl, history, params.utm_campaign, params.utm_source]);

  const handleCopyHistory = useCallback(
    async (url: string, idx: number) => {
      await navigator.clipboard.writeText(url);
      setCopiedHistoryIdx(idx);
      setTimeout(() => setCopiedHistoryIdx(null), 2000);
    },
    [],
  );

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  return (
    <div className="space-y-6">
      {/* Preset selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Preset</label>
        <select
          value={selectedPreset}
          onChange={handlePresetChange}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {PRESETS.map((preset, idx) => (
            <option key={preset.label} value={idx}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL Base <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            value={params.baseUrl}
            onChange={handleChange('baseUrl')}
            placeholder="https://bet365.com/..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {params.baseUrl && !isValidUrl(params.baseUrl) && (
            <p className="mt-1 text-xs text-red-500">URL deve iniciar com http:// ou https://</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            utm_source <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={params.utm_source}
            onChange={handleChange('utm_source')}
            placeholder="telegram, whatsapp"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            utm_medium <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={params.utm_medium}
            onChange={handleChange('utm_medium')}
            placeholder="social, cpc, organic"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            utm_campaign <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={params.utm_campaign}
            onChange={handleChange('utm_campaign')}
            placeholder="promo-marco-2026"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">utm_term</label>
          <input
            type="text"
            value={params.utm_term}
            onChange={handleChange('utm_term')}
            placeholder="keyword (opcional)"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">utm_content</label>
          <input
            type="text"
            value={params.utm_content}
            onChange={handleChange('utm_content')}
            placeholder="banner-topo, link-texto"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* URL Preview */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">URL Gerada</h3>
        {generatedUrl ? (
          <div className="break-all rounded-md bg-white border border-gray-200 p-3 text-sm text-gray-800 font-mono">
            {generatedUrl}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">
            Preencha os campos obrigatórios para gerar a URL
          </p>
        )}
        <button
          onClick={handleCopy}
          disabled={!isFormValid}
          className={`mt-3 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            isFormValid
              ? copied
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {copied ? (
            <>
              <span>&#10003;</span> Copiado!
            </>
          ) : (
            <>
              <span>&#128203;</span> Copiar URL
            </>
          )}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">Recentes</h3>
            <button
              onClick={handleClearHistory}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Limpar
            </button>
          </div>
          <div className="space-y-2">
            {history.map((entry, idx) => (
              <div
                key={entry.createdAt}
                className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50 p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-600 truncate">{entry.label}</p>
                  <p className="text-xs text-gray-400 truncate font-mono">{entry.url}</p>
                </div>
                <button
                  onClick={() => handleCopyHistory(entry.url, idx)}
                  className={`shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors ${
                    copiedHistoryIdx === idx
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {copiedHistoryIdx === idx ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
