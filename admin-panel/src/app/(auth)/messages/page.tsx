'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ScheduledMessageListItem, MessageStatus, MediaType } from '@/types/database';
import { FileUpload } from '@/components/features/messages/FileUpload';

const STATUS_STYLES: Record<MessageStatus, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800' },
  sent: { label: 'Enviada', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Falhou', className: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelada', className: 'bg-gray-100 text-gray-600' },
};

export default function MessagesPage() {
  const [messages, setMessages] = useState<ScheduledMessageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<'super_admin' | 'group_admin'>('group_admin');
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [messageText, setMessageText] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Media state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/messages');
      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao carregar mensagens');
        return;
      }

      setMessages(json.data);
    } catch {
      setError('Erro de conexao ao carregar mensagens');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function fetchGroups() {
      try {
        const res = await fetch('/api/groups');
        const json = await res.json();

        if (res.ok && json.success && json.data) {
          const groupList = Array.isArray(json.data) ? json.data : json.data.items ?? [];
          setGroups(groupList.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })));
          setRole('super_admin');
          return;
        }

        setGroups([]);
        setRole('group_admin');
      } catch {
        setGroups([]);
        setRole('group_admin');
      }
    }
    fetchGroups();
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setUploadError('');

    const hasText = messageText.trim().length > 0;
    const hasFile = selectedFile !== null;

    if (!hasText && !hasFile) {
      setFormError('Mensagem deve conter texto ou arquivo');
      return;
    }

    if (!scheduledDate || !scheduledTime) {
      setFormError('Data e hora sao obrigatorios');
      return;
    }

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
    if (scheduledAt <= new Date()) {
      setFormError('Data de agendamento deve ser no futuro');
      return;
    }

    const groupId = role === 'super_admin' ? selectedGroupId : groups[0]?.id;
    if (!groupId) {
      setFormError('Selecione um grupo destino');
      return;
    }

    setSubmitting(true);
    try {
      let mediaStoragePath: string | undefined;
      let mediaType: MediaType | undefined;

      // Upload file first if selected
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('group_id', groupId);

        const uploadRes = await fetch('/api/messages/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadJson = await uploadRes.json();
        if (!uploadJson.success) {
          setUploadError(uploadJson.error?.message ?? 'Erro ao fazer upload');
          return;
        }

        mediaStoragePath = uploadJson.data.media_storage_path;
        mediaType = uploadJson.data.media_type;
      }

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_text: messageText || undefined,
          scheduled_at: scheduledAt.toISOString(),
          group_id: groupId,
          media_storage_path: mediaStoragePath,
          media_type: mediaType,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        // Clean up orphaned file if upload succeeded but message creation failed
        if (mediaStoragePath) {
          fetch('/api/messages/upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ media_storage_path: mediaStoragePath }),
          }).catch(() => { /* best effort cleanup */ });
        }
        setFormError(json.error?.message ?? 'Erro ao agendar mensagem');
        return;
      }

      showToast('Mensagem agendada com sucesso', 'success');
      setMessageText('');
      setScheduledDate('');
      setScheduledTime('');
      setSelectedGroupId('');
      setSelectedFile(null);
      setShowForm(false);
      fetchMessages();
    } catch {
      setFormError('Erro de conexao');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    try {
      const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
      const json = await res.json();

      if (!json.success) {
        showToast(json.error?.message ?? 'Erro ao cancelar', 'error');
        return;
      }

      showToast('Mensagem cancelada', 'success');
      fetchMessages();
    } catch {
      showToast('Erro de conexao', 'error');
    }
  }

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mensagens</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Fechar' : 'Nova Mensagem'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Agendar Mensagem</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="message-text" className="block text-sm font-medium text-gray-700">
                Texto da mensagem {selectedFile ? '(opcional)' : ''}
              </label>
              <textarea
                id="message-text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="Suporta Markdown do Telegram (*negrito*, _italico_, etc.)"
                disabled={submitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="scheduled-date" className="block text-sm font-medium text-gray-700">
                  Data
                </label>
                <input
                  id="scheduled-date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  disabled={submitting}
                />
              </div>
              <div>
                <label htmlFor="scheduled-time" className="block text-sm font-medium text-gray-700">
                  Hora
                </label>
                <input
                  id="scheduled-time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  disabled={submitting}
                />
              </div>
            </div>

            {role === 'super_admin' ? (
              <div>
                <label htmlFor="group-select" className="block text-sm font-medium text-gray-700">
                  Grupo destino
                </label>
                <select
                  id="group-select"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  disabled={submitting}
                >
                  <option value="">Selecione um grupo...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            ) : groups.length > 0 ? (
              <p className="text-sm text-gray-600">
                Grupo: <span className="font-medium">{groups[0].name}</span>
              </p>
            ) : null}

            <FileUpload
              onFileSelected={setSelectedFile}
              disabled={submitting}
              error={uploadError}
            />

            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? 'Agendando...' : 'Agendar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          Nenhuma mensagem agendada
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Mensagem</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Midia</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Grupo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Agendada para</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {messages.map((msg) => {
                const statusStyle = STATUS_STYLES[msg.status as MessageStatus] ?? STATUS_STYLES.pending;
                return (
                  <tr key={msg.id} className="hover:bg-gray-50">
                    <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-900" title={msg.message_text ?? ''}>
                      {msg.message_text
                        ? msg.message_text.length > 80 ? msg.message_text.slice(0, 80) + '...' : msg.message_text
                        : <span className="text-gray-400 italic">Apenas midia</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {msg.media_type === 'pdf' ? 'PDF' : msg.media_type === 'image' ? 'Imagem' : '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {msg.groups?.name ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatDateTime(msg.scheduled_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.className}`}>
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {msg.status === 'pending' && (
                        <button
                          onClick={() => handleCancel(msg.id)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
