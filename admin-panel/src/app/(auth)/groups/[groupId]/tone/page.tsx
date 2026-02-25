'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface GroupOption {
  id: string;
  name: string;
}

interface ToneConfig {
  rawDescription?: string;
  persona?: string;
  tone?: string;
  forbiddenWords?: string[];
  ctaText?: string;
  customRules?: string[];
}

interface PreviewBet {
  betId: number;
  preview: string;
  betInfo: {
    homeTeam: string;
    awayTeam: string;
    market: string;
    pick: string;
    odds: number;
    kickoffTime: string;
    deepLink: string;
  };
}

export default function TonePage() {
  const params = useParams();
  const paramGroupId = params.groupId as string;

  // Role & group selector
  const [role, setRole] = useState<'super_admin' | 'group_admin'>('group_admin');
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(paramGroupId || '');
  const [groupsLoaded, setGroupsLoaded] = useState(false);

  // Tone config state
  const [rawDescription, setRawDescription] = useState('');
  const [persona, setPersona] = useState('');
  const [tone, setTone] = useState('');
  const [forbiddenWords, setForbiddenWords] = useState<string[]>([]);
  const [forbiddenWordInput, setForbiddenWordInput] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [customRulesText, setCustomRulesText] = useState('');

  // UI state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [previewBets, setPreviewBets] = useState<PreviewBet[] | null>(null);
  const [groupName, setGroupName] = useState('');

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  // Fetch groups for super_admin selector
  useEffect(() => {
    async function fetchGroups() {
      try {
        const res = await fetch('/api/groups');
        const json = await res.json();

        if (res.ok && json.success && json.data) {
          const groupList = Array.isArray(json.data) ? json.data : json.data.items ?? [];
          setGroups(groupList.map((g: GroupOption) => ({
            id: g.id,
            name: g.name,
          })));
          setRole('super_admin');

          // If we have a param groupId, use it; otherwise pick the first
          if (paramGroupId) {
            setSelectedGroupId(paramGroupId);
          } else if (groupList.length > 0) {
            setSelectedGroupId(groupList[0].id);
          }
        } else {
          setGroups([]);
          setRole('group_admin');
          // group_admin uses the param or empty
          if (paramGroupId) {
            setSelectedGroupId(paramGroupId);
          }
        }
      } catch {
        setGroups([]);
        setRole('group_admin');
      } finally {
        setGroupsLoaded(true);
      }
    }
    fetchGroups();
  }, [paramGroupId]);

  // Load tone config for the selected group
  const loadToneConfig = useCallback(async () => {
    if (!selectedGroupId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${selectedGroupId}/tone`);
      const json = await res.json();

      if (json.success) {
        const config: ToneConfig = json.data.toneConfig || {};
        setRawDescription(config.rawDescription || '');
        setPersona(config.persona || '');
        setTone(config.tone || '');
        setForbiddenWords(config.forbiddenWords || []);
        setCtaText(config.ctaText || '');
        setCustomRulesText((config.customRules || []).join('\n'));
        setGroupName(json.data.groupName || '');

        // Open advanced section if any structured fields have content
        if (config.persona || config.tone || (config.forbiddenWords && config.forbiddenWords.length > 0) || config.ctaText || (config.customRules && config.customRules.length > 0)) {
          setAdvancedOpen(true);
        }
      } else {
        showToast(json.error?.message || 'Erro ao carregar configuracao', 'error');
      }
    } catch {
      showToast('Erro de conexao', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    if (groupsLoaded) {
      loadToneConfig();
    }
  }, [groupsLoaded, loadToneConfig]);

  // Build config object from state
  function buildToneConfig(): ToneConfig {
    const config: ToneConfig = {};

    if (rawDescription.trim()) {
      config.rawDescription = rawDescription.trim();
    }
    if (persona.trim()) {
      config.persona = persona.trim();
    }
    if (tone.trim()) {
      config.tone = tone.trim();
    }
    if (forbiddenWords.length > 0) {
      config.forbiddenWords = forbiddenWords;
    }
    if (ctaText.trim()) {
      config.ctaText = ctaText.trim();
    }

    const rules = customRulesText
      .split('\n')
      .map(r => r.trim())
      .filter(r => r.length > 0);
    if (rules.length > 0) {
      config.customRules = rules;
    }

    return config;
  }

  // Save tone config
  async function handleSave() {
    if (!selectedGroupId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${selectedGroupId}/tone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toneConfig: buildToneConfig() }),
      });
      const json = await res.json();

      if (json.success) {
        showToast('Configuracao de tom salva com sucesso!', 'success');
      } else {
        showToast(json.error?.message || 'Erro ao salvar', 'error');
      }
    } catch {
      showToast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Test / preview
  async function handleTest() {
    if (!selectedGroupId) return;

    setTesting(true);
    setPreviewBets(null);
    try {
      const res = await fetch('/api/bets/post-now/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: selectedGroupId }),
      });
      const json = await res.json();

      if (json.success) {
        setPreviewBets(json.data.bets || []);
      } else {
        showToast(json.error?.message || 'Erro ao gerar preview', 'error');
      }
    } catch {
      showToast('Erro de conexao', 'error');
    } finally {
      setTesting(false);
    }
  }

  // Tag input handlers
  function handleForbiddenWordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const word = forbiddenWordInput.trim().toLowerCase();
      if (word && !forbiddenWords.includes(word)) {
        if (forbiddenWords.length >= 50) {
          showToast('Maximo de 50 palavras proibidas', 'error');
          return;
        }
        setForbiddenWords([...forbiddenWords, word]);
      }
      setForbiddenWordInput('');
    }
  }

  function removeForbiddenWord(word: string) {
    setForbiddenWords(forbiddenWords.filter(w => w !== word));
  }

  const effectiveGroupId = selectedGroupId;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={effectiveGroupId ? `/groups/${effectiveGroupId}` : '/groups'}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            &larr; {effectiveGroupId ? 'Voltar para Grupo' : 'Voltar para Grupos'}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            Tom de Voz
            {groupName && <span className="ml-2 text-lg font-normal text-gray-500">- {groupName}</span>}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure como o bot se comunica com o publico do grupo.
          </p>
        </div>

        {role === 'super_admin' && groups.length > 0 && (
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      )}

      {/* No group selected */}
      {!loading && !effectiveGroupId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            Selecione um grupo para configurar o tom de voz.
          </p>
        </div>
      )}

      {/* Main form */}
      {!loading && effectiveGroupId && (
        <div className="space-y-6">
          {/* Level 1: Raw description */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <label htmlFor="rawDescription" className="block text-sm font-semibold text-gray-900 mb-2">
              Descreva como seu bot deve se comunicar
            </label>
            <textarea
              id="rawDescription"
              value={rawDescription}
              onChange={(e) => setRawDescription(e.target.value)}
              placeholder="Informal, sem usar a palavra 'aposta', chamar o publico de 'galera'. Tom confiante mas nao arrogante."
              rows={5}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
            <p className="mt-1 text-xs text-gray-400">
              Descricao em texto livre. O bot usara isso como guia principal de comunicacao.
            </p>
          </div>

          {/* Level 2: Advanced / structured config */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex w-full items-center justify-between p-6 text-left"
            >
              <span className="text-sm font-semibold text-gray-900">Configuracao Avancada</span>
              <svg
                className={`h-5 w-5 text-gray-500 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {advancedOpen && (
              <div className="border-t border-gray-200 p-6 space-y-5">
                {/* Persona */}
                <div>
                  <label htmlFor="persona" className="block text-sm font-medium text-gray-700 mb-1">
                    Persona
                  </label>
                  <input
                    id="persona"
                    type="text"
                    value={persona}
                    onChange={(e) => setPersona(e.target.value)}
                    placeholder='Ex: "Guru da Bet"'
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">Nome ou personagem que o bot assume.</p>
                </div>

                {/* Tom */}
                <div>
                  <label htmlFor="tone" className="block text-sm font-medium text-gray-700 mb-1">
                    Tom
                  </label>
                  <input
                    id="tone"
                    type="text"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder='Ex: "profissional"'
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">Estilo de comunicacao (profissional, informal, humoristico, etc).</p>
                </div>

                {/* Palavras Proibidas (tag input) */}
                <div>
                  <label htmlFor="forbiddenWords" className="block text-sm font-medium text-gray-700 mb-1">
                    Palavras Proibidas
                  </label>
                  <div className="rounded-md border border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 p-2">
                      {forbiddenWords.map((word) => (
                        <span
                          key={word}
                          className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800"
                        >
                          {word}
                          <button
                            type="button"
                            onClick={() => removeForbiddenWord(word)}
                            className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-red-600 hover:bg-red-200 hover:text-red-800"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                      <input
                        id="forbiddenWords"
                        type="text"
                        value={forbiddenWordInput}
                        onChange={(e) => setForbiddenWordInput(e.target.value)}
                        onKeyDown={handleForbiddenWordKeyDown}
                        placeholder={forbiddenWords.length === 0 ? 'Digite e pressione Enter para adicionar' : ''}
                        className="flex-1 min-w-[120px] border-0 px-1 py-0.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-0"
                      />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Palavras que o bot nunca deve usar. Ex: &ldquo;certeza&rdquo;, &ldquo;garantido&rdquo;. Max 50.
                  </p>
                </div>

                {/* CTA */}
                <div>
                  <label htmlFor="ctaText" className="block text-sm font-medium text-gray-700 mb-1">
                    CTA (Call to Action)
                  </label>
                  <input
                    id="ctaText"
                    type="text"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    placeholder='Ex: "Confira agora!"'
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">Texto de chamada para acao usado nas postagens.</p>
                </div>

                {/* Custom Rules */}
                <div>
                  <label htmlFor="customRules" className="block text-sm font-medium text-gray-700 mb-1">
                    Regras Customizadas
                  </label>
                  <textarea
                    id="customRules"
                    value={customRulesText}
                    onChange={(e) => setCustomRulesText(e.target.value)}
                    placeholder={"Sempre mencionar o horario do jogo\nUsar emojis com moderacao\nNunca prometer resultado"}
                    rows={4}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                  />
                  <p className="mt-1 text-xs text-gray-400">Uma regra por linha. Max 20 regras.</p>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? 'Gerando preview...' : 'Testar'}
            </button>
          </div>

          {/* Preview results */}
          {previewBets !== null && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                Preview da Postagem
                <span className="ml-2 text-xs font-normal text-gray-500">
                  ({previewBets.length} aposta{previewBets.length !== 1 ? 's' : ''})
                </span>
              </h2>

              {previewBets.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma aposta disponivel para preview.</p>
              ) : (
                <div className="space-y-4">
                  {previewBets.map((bet) => (
                    <div key={bet.betId} className="rounded-md border border-gray-100 bg-gray-50 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500">
                          {bet.betInfo.homeTeam} x {bet.betInfo.awayTeam}
                        </span>
                        <span className="text-xs text-gray-400">|</span>
                        <span className="text-xs text-gray-400">
                          {bet.betInfo.market}: {bet.betInfo.pick}
                        </span>
                        <span className="text-xs text-gray-400">|</span>
                        <span className="text-xs text-gray-400">
                          Odd: {bet.betInfo.odds}
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">
                        {bet.preview}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setPreviewBets(null)}
                className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Fechar preview
              </button>
            </div>
          )}
        </div>
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
