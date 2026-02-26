'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface MessagePreviewProps {
  messageText: string;
  mediaFile: File | null;
  mediaType: 'pdf' | 'image' | null;
  groupName: string;
  scheduledAt: string;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

/** Simple Telegram Markdown rendering (bold, italic, code). HTML is escaped first. */
function renderTelegramMarkdown(text: string): string {
  // 1. Escape ALL HTML entities first (prevents XSS)
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // 2. Apply Telegram markdown on escaped text
  safe = safe
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-200 px-1 rounded text-sm">$1</code>')
    .replace(/\n/g, '<br/>');

  return safe;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessagePreview({
  messageText,
  mediaFile,
  mediaType,
  groupName,
  scheduledAt,
  onClose,
  onConfirm,
  submitting,
}: MessagePreviewProps) {
  const parsedDate = useMemo(() => new Date(scheduledAt), [scheduledAt]);
  const isValidDate = !isNaN(parsedDate.getTime());

  const formattedDate = isValidDate
    ? parsedDate.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  // Create object URL for image preview with proper cleanup
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (mediaFile && mediaType === 'image') {
      const url = URL.createObjectURL(mediaFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [mediaFile, mediaType]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Preview da Mensagem</h3>
          <div className="mt-1 flex gap-4 text-sm text-gray-500">
            <span>Grupo: <span className="font-medium text-gray-700">{groupName}</span></span>
            <span>Agendada: <span className="font-medium text-gray-700">{formattedDate}</span></span>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto px-6 py-4 space-y-4">
          {/* Text */}
          {messageText.trim() && (
            <div
              className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: renderTelegramMarkdown(messageText) }}
            />
          )}

          {/* Media preview */}
          {mediaFile && mediaType === 'image' && previewUrl && (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={mediaFile.name}
                className="max-h-72 w-full object-contain bg-gray-50"
              />
            </div>
          )}

          {mediaFile && mediaType === 'pdf' && (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <span className="text-2xl">📄</span>
              <div>
                <p className="text-sm font-medium text-gray-900">{mediaFile.name}</p>
                <p className="text-xs text-gray-500">PDF — {formatFileSize(mediaFile.size)}</p>
              </div>
            </div>
          )}

          {!messageText.trim() && !mediaFile && (
            <p className="text-sm text-gray-400 italic">Nenhum conteudo para preview</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            disabled={submitting}
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? 'Agendando...' : 'Confirmar e Agendar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MediaPreviewModal: for viewing media of existing messages
// ============================================================

interface MediaPreviewModalProps {
  mediaUrl: string;
  mediaType: 'pdf' | 'image';
  onClose: () => void;
}

export function MediaPreviewModal({ mediaUrl, mediaType, onClose }: MediaPreviewModalProps) {
  const openedRef = useRef(false);

  useEffect(() => {
    if (mediaType === 'pdf' && !openedRef.current) {
      openedRef.current = true;
      window.open(mediaUrl, '_blank');
      // Delay onClose slightly to avoid React state update during render cycle
      const timer = setTimeout(onClose, 50);
      return () => clearTimeout(timer);
    }
  }, [mediaUrl, mediaType, onClose]);

  if (mediaType === 'pdf') return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[80vh] max-w-2xl overflow-hidden rounded-lg bg-white p-2 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt="Preview"
          className="max-h-[75vh] w-full object-contain"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
