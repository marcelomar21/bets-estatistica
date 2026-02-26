'use client';

import { useState } from 'react';
import type { MemberListItem } from '@/types/database';
import { getDisplayStatus, memberStatusConfig } from './member-utils';

interface CancelMemberModalProps {
  member: MemberListItem;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

export function CancelMemberModal({ member, onConfirm, onClose, isLoading }: CancelMemberModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const displayStatus = getDisplayStatus({
    status: member.status,
    subscription_ends_at: member.subscription_ends_at,
  });
  const statusBadge = memberStatusConfig[displayStatus];

  function handleSubmit() {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError('Motivo deve ter pelo menos 3 caracteres');
      return;
    }
    setError('');
    onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">Cancelar Membro</h2>

        <div className="mb-4 rounded-md bg-gray-50 p-3">
          <p className="text-sm text-gray-600">
            <span className="font-medium">Membro:</span>{' '}
            {member.telegram_username || `ID ${member.telegram_id}`}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            <span className="font-medium">Status atual:</span>{' '}
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
          </p>
        </div>

        <div className="mb-4">
          <label htmlFor="cancel-reason" className="mb-1 block text-sm font-medium text-gray-700">
            Motivo do cancelamento *
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Informe o motivo do cancelamento..."
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={isLoading}
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>

        <div className="mb-2 rounded-md bg-red-50 p-3">
          <p className="text-xs text-red-700">
            O membro sera removido do grupo Telegram e recebera uma mensagem de despedida.
            Esta acao pode ser revertida pela funcao de reativacao.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || reason.trim().length < 3}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading ? 'Cancelando...' : 'Cancelar Membro'}
          </button>
        </div>
      </div>
    </div>
  );
}
