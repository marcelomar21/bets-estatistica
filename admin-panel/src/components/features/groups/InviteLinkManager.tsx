'use client';

import { useState } from 'react';

interface InviteLinkManagerProps {
  groupId: string;
  hasWhatsApp: boolean;
  initialInviteLink: string | null;
}

export function InviteLinkManager({ groupId, hasWhatsApp, initialInviteLink }: InviteLinkManagerProps) {
  const [inviteLink, setInviteLink] = useState<string | null>(initialInviteLink);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!hasWhatsApp) return null;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/whatsapp-invite`, { method: 'POST' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await res.json();
      if (!body.success) {
        setError(body.error?.message || 'Erro ao gerar invite link');
        return;
      }
      setInviteLink(body.data.inviteLink);
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/whatsapp-invite`, { method: 'DELETE' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await res.json();
      if (!body.success) {
        setError(body.error?.message || 'Erro ao revogar invite link');
        return;
      }
      setInviteLink(body.data.inviteLink);
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }

  return (
    <div className="mt-4">
      <dt className="text-sm font-medium text-gray-500">Invite Link WhatsApp</dt>
      <dd className="mt-1">
        {inviteLink ? (
          <div className="flex items-center gap-2">
            <code className="text-sm text-gray-900 bg-gray-50 px-2 py-1 rounded border break-all">
              {inviteLink}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
            <button
              onClick={handleRevoke}
              disabled={loading}
              className="shrink-0 rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {loading ? 'Revogando...' : 'Revogar'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Gerando...' : 'Gerar Invite Link'}
          </button>
        )}

        {error && (
          <div className="mt-2 rounded-md bg-red-50 p-2">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </dd>
    </div>
  );
}
