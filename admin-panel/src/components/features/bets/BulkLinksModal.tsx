'use client';

import { useState } from 'react';

interface BulkLinksModalProps {
  selectedCount: number;
  onClose: () => void;
  onSave: (link: string) => Promise<void>;
}

export function BulkLinksModal({ selectedCount, onClose, onSave }: BulkLinksModalProps) {
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function validateUrl(url: string): string | null {
    const trimmed = url.trim();
    if (trimmed.length === 0) return 'Informe uma URL';
    if (trimmed.length > 2048) return 'URL muito longa (maximo 2048 caracteres)';
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return 'O link deve comecar com http:// ou https://';
    }
    try {
      new URL(trimmed);
      return null;
    } catch {
      return 'URL invalida';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const validationError = validateUrl(linkInput);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      await onSave(linkInput.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar links em lote');
    } finally {
      setSaving(false);
    }
  }

  const trimmed = linkInput.trim();
  const hasLink = trimmed.length > 0;
  const isValid = hasLink && !validateUrl(trimmed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Adicionar Links em Lote</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          Aplicar o mesmo link para <strong>{selectedCount}</strong> aposta{selectedCount > 1 ? 's' : ''} selecionada{selectedCount > 1 ? 's' : ''}.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="bulk-link-input" className="block text-sm font-medium text-gray-700">
              URL do link de aposta
            </label>
            <input
              id="bulk-link-input"
              type="text"
              placeholder="https://..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              disabled={saving}
            />
          </div>

          {hasLink && isValid && (
            <div className="rounded-md bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium text-gray-500">Preview</p>
              <a
                href={trimmed}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline break-all"
              >
                {trimmed}
              </a>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Atualizando...' : `Atualizar ${selectedCount} Aposta${selectedCount > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
