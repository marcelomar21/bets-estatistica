'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DynamicInputList from './DynamicInputList';

interface GroupOption {
  id: string;
  name: string;
}

interface ToneConfig {
  rawDescription?: string;
  persona?: string;
  tone?: string;
  forbiddenWords?: string[];
  suggestedWords?: string[];
  oddLabel?: string;
  headers?: string[];
  footers?: string[];
  ctaTexts?: string[];
  ctaText?: string;
  customRules?: string[];
  examplePosts?: string[];
  examplePost?: string;
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

interface ToneConfigFormProps {
  groupId?: string;
  showGroupSelector?: boolean;
  showBackLink?: boolean;
}

export default function ToneConfigForm({
  groupId: fixedGroupId,
  showGroupSelector = false,
  showBackLink = false,
}: ToneConfigFormProps) {
  // Role & group selector
  const [role, setRole] = useState<'super_admin' | 'group_admin'>('group_admin');
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(fixedGroupId || '');
  const [groupsLoaded, setGroupsLoaded] = useState(false);

  // Tone config state
  const [rawDescription, setRawDescription] = useState('');
  const [persona, setPersona] = useState('');
  const [tone, setTone] = useState('');
  const [forbiddenWords, setForbiddenWords] = useState<string[]>([]);
  const [forbiddenWordInput, setForbiddenWordInput] = useState('');
  const [suggestedWords, setSuggestedWords] = useState<string[]>([]);
  const [suggestedWordInput, setSuggestedWordInput] = useState('');
  const [oddLabel, setOddLabel] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [footers, setFooters] = useState<string[]>([]);
  const [ctaTexts, setCtaTexts] = useState<string[]>([]);
  const [customRulesText, setCustomRulesText] = useState('');
  const [examplePosts, setExamplePosts] = useState<string[]>([]);

  // UI state
  const [sectionMessageOpen, setSectionMessageOpen] = useState(false);
  const [sectionVocabOpen, setSectionVocabOpen] = useState(false);
  const [sectionExamplesOpen, setSectionExamplesOpen] = useState(false);
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

  // Fetch groups for selector
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

          if (fixedGroupId) {
            setSelectedGroupId(fixedGroupId);
          } else if (groupList.length > 0) {
            setSelectedGroupId(groupList[0].id);
          }
        } else {
          setGroups([]);
          setRole('group_admin');
          if (fixedGroupId) {
            setSelectedGroupId(fixedGroupId);
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
  }, [fixedGroupId]);

  // Load tone config for the selected group
  const loadToneConfig = useCallback(async () => {
    if (!selectedGroupId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setPreviewBets(null);
    try {
      const res = await fetch(`/api/groups/${selectedGroupId}/tone`);
      const json = await res.json();

      if (json.success) {
        const config: ToneConfig = json.data.toneConfig || {};
        setRawDescription(config.rawDescription || '');
        setPersona(config.persona || '');
        setTone(config.tone || '');
        setForbiddenWords(config.forbiddenWords || []);
        setSuggestedWords(config.suggestedWords || []);
        setOddLabel(config.oddLabel || '');
        setHeaders(config.headers || []);
        setFooters(config.footers || []);
        setCustomRulesText((config.customRules || []).join('\n'));
        setGroupName(json.data.groupName || '');

        // Backward compat: ctaText -> ctaTexts
        if (config.ctaTexts && config.ctaTexts.length > 0) {
          setCtaTexts(config.ctaTexts);
        } else if (config.ctaText) {
          setCtaTexts([config.ctaText]);
        } else {
          setCtaTexts([]);
        }

        // Backward compat: examplePost -> examplePosts
        if (config.examplePosts && config.examplePosts.length > 0) {
          setExamplePosts(config.examplePosts);
        } else if (config.examplePost) {
          setExamplePosts([config.examplePost]);
        } else {
          setExamplePosts([]);
        }

        // Auto-open sections that have content
        const hasMessageContent = (config.headers && config.headers.length > 0) ||
          (config.footers && config.footers.length > 0) ||
          !!config.oddLabel ||
          (config.ctaTexts && config.ctaTexts.length > 0) ||
          !!config.ctaText;
        setSectionMessageOpen(!!hasMessageContent);

        const hasVocabContent = !!config.persona || !!config.tone ||
          (config.forbiddenWords && config.forbiddenWords.length > 0) ||
          (config.suggestedWords && config.suggestedWords.length > 0) ||
          (config.customRules && config.customRules.length > 0);
        setSectionVocabOpen(!!hasVocabContent);

        const hasExamplesContent = (config.examplePosts && config.examplePosts.length > 0) ||
          !!config.examplePost;
        setSectionExamplesOpen(!!hasExamplesContent);
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
    if (suggestedWords.length > 0) {
      config.suggestedWords = suggestedWords;
    }
    if (oddLabel.trim()) {
      config.oddLabel = oddLabel.trim();
    }

    const filteredHeaders = headers.filter(h => h.trim().length > 0);
    if (filteredHeaders.length > 0) {
      config.headers = filteredHeaders;
    }

    const filteredFooters = footers.filter(f => f.trim().length > 0);
    if (filteredFooters.length > 0) {
      config.footers = filteredFooters;
    }

    const filteredCtaTexts = ctaTexts.filter(c => c.trim().length > 0);
    if (filteredCtaTexts.length > 0) {
      config.ctaTexts = filteredCtaTexts;
      // Legacy compat
      config.ctaText = filteredCtaTexts[0];
    }

    const filteredExamplePosts = examplePosts.filter(e => e.trim().length > 0);
    if (filteredExamplePosts.length > 0) {
      config.examplePosts = filteredExamplePosts;
      // Legacy compat
      config.examplePost = filteredExamplePosts[0];
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
        // Sync state with what was actually saved
        const saved: ToneConfig = json.data.toneConfig || {};
        setForbiddenWords(saved.forbiddenWords || []);
        setSuggestedWords(saved.suggestedWords || []);
        if (saved.examplePosts && saved.examplePosts.length > 0) {
          setExamplePosts(saved.examplePosts);
        } else if (saved.examplePost) {
          setExamplePosts([saved.examplePost]);
        }
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

    // Auto-save before preview to ensure latest config is used
    try {
      await fetch(`/api/groups/${selectedGroupId}/tone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toneConfig: buildToneConfig() }),
      });
    } catch {
      // Continue with preview even if save fails
    }

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

  // Tag input handlers — Forbidden Words
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

  // Tag input handlers — Suggested Words
  function handleSuggestedWordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const word = suggestedWordInput.trim().toLowerCase();
      if (word && !suggestedWords.includes(word)) {
        if (suggestedWords.length >= 30) {
          showToast('Maximo de 30 palavras sugeridas', 'error');
          return;
        }
        setSuggestedWords([...suggestedWords, word]);
      }
      setSuggestedWordInput('');
    }
  }

  function removeSuggestedWord(word: string) {
    setSuggestedWords(suggestedWords.filter(w => w !== word));
  }

  function renderTelegramPreview(text: string) {
    const html = text
      .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
    return <div className="text-sm text-gray-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // Collapsible section helper
  function renderCollapsibleSection(
    label: string,
    isOpen: boolean,
    onToggle: () => void,
    children: React.ReactNode,
  ) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between p-6 text-left"
        >
          <span className="text-sm font-semibold text-gray-900">{label}</span>
          <svg
            className={`h-5 w-5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="border-t border-gray-200 p-6 space-y-5">
            {children}
          </div>
        )}
      </div>
    );
  }

  const effectiveGroupId = selectedGroupId;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {showBackLink && (
            <Link
              href={effectiveGroupId ? `/groups/${effectiveGroupId}` : '/groups'}
              className="text-sm text-orange-700 hover:text-orange-800"
            >
              &larr; {effectiveGroupId ? 'Voltar para Grupo' : 'Voltar para Grupos'}
            </Link>
          )}
          <h1 className={`text-2xl font-bold text-gray-900 ${showBackLink ? 'mt-1' : ''}`}>
            Tom de Voz
            {groupName && <span className="ml-2 text-lg font-normal text-gray-500">- {groupName}</span>}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure como o bot se comunica com o publico do grupo.
          </p>
        </div>

        {showGroupSelector && role === 'super_admin' && groups.length > 0 && (
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-orange-600" />
        </div>
      )}

      {/* No group selected */}
      {!loading && !effectiveGroupId && groupsLoaded && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm text-orange-800">
            Selecione um grupo para configurar o tom de voz.
          </p>
        </div>
      )}

      {/* Main form */}
      {!loading && effectiveGroupId && (
        <div className="space-y-6">
          {/* Section 1: Descricao Geral (always visible) */}
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
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y"
            />
            <p className="mt-1 text-xs text-gray-400">
              Descricao em texto livre. O bot usara isso como guia principal de comunicacao.
            </p>
          </div>

          {/* Section 2: Modelo de Mensagem */}
          {renderCollapsibleSection(
            'Modelo de Mensagem',
            sectionMessageOpen,
            () => setSectionMessageOpen(!sectionMessageOpen),
            <>
              {/* Headers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Headers
                </label>
                <DynamicInputList
                  items={headers}
                  onChange={setHeaders}
                  maxItems={10}
                  maxLength={50}
                  placeholder="Ex: APOSTA DO DIA"
                  addLabel="+ Adicionar header"
                />
              </div>

              {/* Footers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Footers
                </label>
                <DynamicInputList
                  items={footers}
                  onChange={setFooters}
                  maxItems={10}
                  maxLength={100}
                  placeholder="Ex: Boa sorte!"
                  addLabel="+ Adicionar footer"
                />
              </div>

              {/* Label da Odd */}
              <div>
                <label htmlFor="oddLabel" className="block text-sm font-medium text-gray-700 mb-1">
                  Label da Odd
                </label>
                <input
                  id="oddLabel"
                  type="text"
                  value={oddLabel}
                  onChange={(e) => setOddLabel(e.target.value.slice(0, 30))}
                  placeholder="Odd"
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Substitui o label &ldquo;Odd&rdquo; nas mensagens. Ex: &ldquo;Cotacao&rdquo;, &ldquo;Cota&rdquo;.
                </p>
              </div>

              {/* CTAs */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Call to Action
                </label>
                <DynamicInputList
                  items={ctaTexts}
                  onChange={setCtaTexts}
                  maxItems={3}
                  maxLength={50}
                  placeholder="Ex: Apostar Agora"
                  addLabel="+ Adicionar CTA"
                  labels={['CTA Primario', 'CTA Secundario', 'CTA Terciario']}
                />
              </div>
            </>,
          )}

          {/* Section 3: Vocabulario e Tom */}
          {renderCollapsibleSection(
            'Vocabulario e Tom',
            sectionVocabOpen,
            () => setSectionVocabOpen(!sectionVocabOpen),
            <>
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
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <p className="mt-1 text-xs text-gray-400">Estilo de comunicacao (profissional, informal, humoristico, etc).</p>
              </div>

              {/* Palavras Proibidas (tag input) */}
              <div>
                <label htmlFor="forbiddenWords" className="block text-sm font-medium text-gray-700 mb-1">
                  Palavras Proibidas
                </label>
                <div className="rounded-md border border-gray-300 focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500">
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

              {/* Palavras Sugeridas (tag input) */}
              <div>
                <label htmlFor="suggestedWords" className="block text-sm font-medium text-gray-700 mb-1">
                  Palavras Sugeridas
                </label>
                <div className="rounded-md border border-gray-300 focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500">
                  <div className="flex flex-wrap gap-1.5 p-2">
                    {suggestedWords.map((word) => (
                      <span
                        key={word}
                        className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800"
                      >
                        {word}
                        <button
                          type="button"
                          onClick={() => removeSuggestedWord(word)}
                          className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-teal-600 hover:bg-teal-200 hover:text-teal-800"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                    <input
                      id="suggestedWords"
                      type="text"
                      value={suggestedWordInput}
                      onChange={(e) => setSuggestedWordInput(e.target.value)}
                      onKeyDown={handleSuggestedWordKeyDown}
                      placeholder={suggestedWords.length === 0 ? 'Digite e pressione Enter para adicionar' : ''}
                      className="flex-1 min-w-[120px] border-0 px-1 py-0.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Palavras que o bot deve tentar usar. Max 30.
                </p>
              </div>

              {/* Regras Customizadas */}
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
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y"
                />
                <p className="mt-1 text-xs text-gray-400">Uma regra por linha. Max 20 regras.</p>
              </div>
            </>,
          )}

          {/* Section 4: Exemplos de Postagem */}
          {renderCollapsibleSection(
            'Exemplos de Postagem',
            sectionExamplesOpen,
            () => setSectionExamplesOpen(!sectionExamplesOpen),
            <DynamicInputList
              items={examplePosts}
              onChange={setExamplePosts}
              inputType="textarea"
              textareaRows={6}
              maxItems={5}
              maxLength={2000}
              placeholder="Cole um exemplo de postagem..."
              addLabel="+ Adicionar exemplo"
            />,
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
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
                      {renderTelegramPreview(bet.preview)}
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
