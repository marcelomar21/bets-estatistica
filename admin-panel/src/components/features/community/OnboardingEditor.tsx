'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { formatBRL } from '@/lib/format';

const DEFAULT_WELCOME_TEMPLATE = [
  '🎉 Bem-vindo ao *{grupo}*, {nome}!',
  '',
  'Seu trial de *{dias_trial} dias* começa agora!',
  '📅 *Válido até:* {data_expiracao}',
  '',
  '📊 *O que você recebe:*',
  '• 3 sugestões de apostas diárias',
  '• Análise estatística completa',
  '• Taxa de acerto histórica: *{taxa_acerto}%*',
  '',
  '💰 {linha_preco}',
  '',
  '👇 *Clique no botão abaixo para entrar no grupo:*',
].join('\n');

const PLACEHOLDERS = [
  { tag: '{nome}', description: 'Nome do membro', example: 'João' },
  { tag: '{grupo}', description: 'Nome do grupo', example: '' },
  { tag: '{dias_trial}', description: 'Dias de trial', example: '' },
  { tag: '{data_expiracao}', description: 'Data fim trial', example: '' },
  { tag: '{taxa_acerto}', description: 'Taxa de acerto (%)', example: '66.6' },
  { tag: '{preco}', description: 'Preço assinatura', example: '' },
  { tag: '{linha_preco}', description: 'Linha de preço completa', example: '' },
];

// F1: Allowlist-based HTML sanitizer — only permit tags produced by markdown conversion
const ALLOWED_TAGS = /^<\/?(strong|em|code|br)\s*\/?>$/i;

function sanitizeHtml(html: string): string {
  return html.replace(/<\/?[^>]+>/g, (tag) => {
    if (ALLOWED_TAGS.test(tag)) return tag;
    return tag.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
}

// F16: Non-greedy matching for proper nested markdown handling
function telegramMarkdownToHtml(text: string): string {
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br />');
  return sanitizeHtml(result);
}

interface OnboardingEditorProps {
  groupId: string;
  initialTemplate: string | null;
  groupName: string;
  trialDays: number;
  subscriptionPrice: number | null;
}

export default function OnboardingEditor({
  groupId,
  initialTemplate,
  groupName,
  trialDays,
  subscriptionPrice,
}: OnboardingEditorProps) {
  const [template, setTemplate] = useState(initialTemplate || DEFAULT_WELCOME_TEMPLATE);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const insertPlaceholder = useCallback((tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = template.slice(0, start);
    const after = template.slice(end);
    const newValue = before + tag + after;
    setTemplate(newValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + tag.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [template]);

  const formattedPrice = formatBRL(subscriptionPrice);

  const getPreviewHtml = useCallback(() => {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + trialDays);
    const formattedDate = expirationDate.toLocaleDateString('pt-BR');

    const priceDisplay = formattedPrice || 'R$ XX,XX';
    const priceLine = formattedPrice
      ? `Para continuar após o trial, assine por apenas *${formattedPrice}*.`
      : 'Para continuar após o trial, consulte o operador.';

    const rendered = template
      .replace(/\{nome\}/g, 'João')
      .replace(/\{grupo\}/g, groupName)
      .replace(/\{dias_trial\}/g, String(trialDays))
      .replace(/\{data_expiracao\}/g, formattedDate)
      .replace(/\{taxa_acerto\}/g, '66.6')
      .replace(/\{preco\}/g, priceDisplay)
      .replace(/\{linha_preco\}/g, priceLine);

    return telegramMarkdownToHtml(rendered);
  }, [template, groupName, trialDays, formattedPrice]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/community-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ welcome_message_template: template }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Template salvo com sucesso', 'success');
      } else {
        showToast(json.error?.message || 'Erro ao salvar', 'error');
      }
    } catch {
      showToast('Erro de conexão', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleResetDefault() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setTemplate(DEFAULT_WELCOME_TEMPLATE);
    setConfirmReset(false);
  }

  useEffect(() => {
    if (confirmReset) {
      const timer = setTimeout(() => setConfirmReset(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmReset]);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-md text-white text-sm ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Editor */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Template da mensagem de boas-vindas
        </label>
        <textarea
          ref={textareaRef}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={14}
          maxLength={2000}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y"
        />
        <p className="mt-1 text-xs text-gray-400">
          {template.length}/2000 caracteres. Use *texto* para negrito, _texto_ para itálico.
        </p>
      </div>

      {/* Placeholder chips */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm font-semibold text-gray-900 mb-3">
          Placeholders (clique para inserir)
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.tag}
              type="button"
              onClick={() => insertPlaceholder(p.tag)}
              className="px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-mono border border-orange-200 hover:bg-orange-100 transition-colors"
              title={p.description}
            >
              {p.tag}
            </button>
          ))}
        </div>

        {/* Placeholder legend */}
        <div className="overflow-x-auto">
          <table className="text-xs text-gray-600 w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1.5 pr-4 font-medium text-gray-700">Placeholder</th>
                <th className="text-left py-1.5 pr-4 font-medium text-gray-700">Descrição</th>
                <th className="text-left py-1.5 font-medium text-gray-700">Exemplo</th>
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDERS.map((p) => (
                <tr key={p.tag} className="border-b border-gray-100">
                  <td className="py-1.5 pr-4 font-mono text-orange-700">{p.tag}</td>
                  <td className="py-1.5 pr-4">{p.description}</td>
                  <td className="py-1.5">
                    {p.tag === '{grupo}' ? (groupName || '(nome do grupo)') :
                     p.tag === '{dias_trial}' ? String(trialDays) :
                     p.tag === '{data_expiracao}' ? new Date(Date.now() + trialDays * 86400000).toLocaleDateString('pt-BR') :
                     p.tag === '{preco}' ? (formattedPrice || 'R$ XX,XX') :
                     p.tag === '{linha_preco}' ? (formattedPrice ? `Para continuar... *${formattedPrice}*` : 'Consulte o operador') :
                     p.example}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setPreviewing(!previewing)}
          className="px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-700 text-sm hover:bg-gray-50 transition-colors"
        >
          {previewing ? 'Fechar Preview' : 'Preview'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-md bg-orange-600 text-white text-sm hover:bg-orange-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={handleResetDefault}
          className={`px-4 py-2 rounded-md text-sm transition-colors ${
            confirmReset
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {confirmReset ? 'Confirmar reset?' : 'Restaurar padrão'}
        </button>
      </div>

      {/* Preview — keeps dark theme to simulate Telegram */}
      {previewing && (
        <div className="rounded-lg border border-gray-200 bg-gray-900 p-4 space-y-3">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Preview — Telegram</p>
          <div
            className="bg-[#1e2b3a] rounded-lg p-4 text-sm text-white leading-relaxed"
            dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
          />
          {/* Mock inline keyboard */}
          <div className="flex flex-col gap-2 max-w-xs">
            <button
              type="button"
              disabled
              className="w-full py-2 rounded-md bg-blue-700/60 text-blue-200 text-sm font-medium cursor-not-allowed"
            >
              🚀 ENTRAR NO GRUPO
            </button>
            <button
              type="button"
              disabled
              className="w-full py-2 rounded-md bg-blue-700/60 text-blue-200 text-sm font-medium cursor-not-allowed"
            >
              💳 ASSINAR AGORA
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { DEFAULT_WELCOME_TEMPLATE };
