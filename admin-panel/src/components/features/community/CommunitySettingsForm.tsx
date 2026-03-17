'use client';

import { useState } from 'react';
import { formatBRL } from '@/lib/format';

interface CommunitySettingsFormProps {
  groupId: string;
  initialTrialDays: number;
  initialPrice: number | null;
}

export default function CommunitySettingsForm({
  groupId,
  initialTrialDays,
  initialPrice,
}: CommunitySettingsFormProps) {
  const [trialDays, setTrialDays] = useState(initialTrialDays);
  const [price, setPrice] = useState<number | null>(initialPrice);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [mpSyncFailed, setMpSyncFailed] = useState(false);

  const hasChanges = trialDays !== initialTrialDays || price !== initialPrice;

  function showToast(message: string, type: 'success' | 'error' | 'warning') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  async function handleSave() {
    if (trialDays < 1 || trialDays > 30) {
      showToast('Trial deve ser entre 1 e 30 dias', 'error');
      return;
    }

    if (price !== null && (price < 1 || price > 99999.99)) {
      showToast('Preço deve ser entre R$ 1,00 e R$ 99.999,99', 'error');
      return;
    }

    if (price === null && initialPrice !== null) {
      // Warn: clearing price doesn't deactivate MP plan
      if (!confirm('Ao limpar o preço, o plano do Mercado Pago continuará cobrando o valor anterior. Deseja continuar?')) {
        return;
      }
    }

    setSaving(true);
    try {
      // F18: Only send changed fields to avoid overwriting concurrent edits
      const payload: Record<string, unknown> = {};
      if (trialDays !== initialTrialDays) payload.trial_days = trialDays;
      if (price !== initialPrice || mpSyncFailed) payload.subscription_price = price;

      const queryParam = mpSyncFailed ? '?force_mp_sync=1' : '';
      const res = await fetch(`/api/groups/${groupId}/community-settings${queryParam}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        if (json.warning) {
          setMpSyncFailed(true);
          showToast(json.warning, 'warning');
        } else {
          setMpSyncFailed(false);
          showToast('Configurações salvas com sucesso', 'success');
        }
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
            toast.type === 'success' ? 'bg-green-600' : toast.type === 'warning' ? 'bg-yellow-600' : 'bg-red-600'
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
            Preço da assinatura (R$)
          </label>
          <input
            id="subscription-price"
            type="number"
            value={price ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setPrice(val === '' ? null : parseFloat(val));
            }}
            placeholder="Ex: 49.90"
            min={1}
            max={99999.99}
            step={0.01}
            className="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {price != null && !isNaN(price) && price > 0 && (
            <p className="mt-1 text-sm text-green-700 font-medium">
              {formatBRL(price)}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">
            Valor numérico em reais. Exibido na mensagem de boas-vindas e sincronizado com Mercado Pago.
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="flex gap-3 items-center">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || (!hasChanges && !mpSyncFailed)}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Salvando...' : mpSyncFailed && !hasChanges ? 'Retentar sync MP' : 'Salvar'}
        </button>
        {mpSyncFailed && (
          <span className="text-xs text-yellow-600">Sincronização com Mercado Pago pendente</span>
        )}
      </div>
    </div>
  );
}
