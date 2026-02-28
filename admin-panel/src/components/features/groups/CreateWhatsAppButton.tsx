'use client';

import { useState } from 'react';

interface CreateWhatsAppButtonProps {
  groupId: string;
  hasWhatsApp: boolean;
}

export function CreateWhatsAppButton({ groupId, hasWhatsApp }: CreateWhatsAppButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (hasWhatsApp || success) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-green-50 border border-green-200 px-4 py-2 text-sm font-medium text-green-700">
        WhatsApp ativo
      </span>
    );
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/add-whatsapp`, { method: 'POST' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await res.json();
      if (!body.success) {
        setError(body.error?.message || 'Erro ao criar grupo WhatsApp');
        return;
      }
      setSuccess(true);
      setShowConfirm(false);
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
      >
        Adicionar WhatsApp
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => !loading && setShowConfirm(false)}
            aria-hidden="true"
          />
          <div className="relative z-50 rounded-lg bg-white p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Adicionar WhatsApp</h3>
            <p className="text-sm text-gray-600 mb-4">
              Isso vai alocar numeros do pool, criar um grupo WhatsApp e gerar o invite link automaticamente.
              O grupo sera configurado como somente admins enviam.
            </p>

            {error && (
              <div className="rounded-md bg-red-50 p-3 mb-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Criando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
