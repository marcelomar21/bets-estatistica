'use client';

import { useState } from 'react';

interface CommunitySettingsFormProps {
  groupId: string;
  initialTrialDays: number;
  initialPrice: string | null;
}

export default function CommunitySettingsForm({
  groupId,
  initialTrialDays,
  initialPrice,
}: CommunitySettingsFormProps) {
  const [trialDays, setTrialDays] = useState(initialTrialDays);
  const [price, setPrice] = useState(initialPrice || '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const hasChanges = trialDays !== initialTrialDays || price !== (initialPrice || '');

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave() {
    if (trialDays < 1 || trialDays > 30) {
      showToast('Trial deve ser entre 1 e 30 dias', 'error');
      return;
    }

    setSaving(true);
    try {
      // F18: Only send changed fields to avoid overwriting concurrent edits
      const payload: Record<string, unknown> = {};
      if (trialDays !== initialTrialDays) payload.trial_days = trialDays;
      if (price !== (initialPrice || '')) payload.subscription_price = price || null;

      const res = await fetch(`/api/groups/${groupId}/community-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        showToast('Configurações salvas com sucesso', 'success');
      } else {
        showToast(json.error?.message || 'Erro ao salvar', 'error');
      }
    } catch {
      showToast('Erro de conexão', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
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

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
        {/* Trial days */}
        <div>
          <label htmlFor="trial-days" className="block text-sm font-semibold text-gray-900 mb-1">
            Dias de trial
          </label>
          <input
            id="trial-days"
            type="number"
            min={1}
            max={30}
            step={1}
            value={trialDays}
            onChange={(e) => setTrialDays(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
            className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Duração do período de teste para novos membros (1-30 dias)
          </p>
        </div>

        {/* Subscription price */}
        <div>
          <label htmlFor="subscription-price" className="block text-sm font-semibold text-gray-900 mb-1">
            Preço da assinatura
          </label>
          <input
            id="subscription-price"
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Ex: R$ 49,90/mês"
            maxLength={50}
            className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Exibido na mensagem de boas-vindas
          </p>
        </div>
      </div>

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !hasChanges}
        className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}
