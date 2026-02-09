'use client';

import { useState } from 'react';

interface BotFormProps {
  onSubmit: (data: BotFormData) => Promise<void>;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
}

export interface BotFormData {
  bot_token: string;
}

export function BotForm({ onSubmit, loading, error, onCancel }: BotFormProps) {
  const [botToken, setBotToken] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (!botToken.trim()) {
      setValidationError('Token é obrigatório');
      return;
    }

    await onSubmit({
      bot_token: botToken.trim(),
    });
  }

  function handleCancel() {
    setBotToken('');
    setValidationError(null);
    onCancel();
  }

  const displayError = validationError || error;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">Adicionar Bot</h3>

      {displayError && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{displayError}</p>
        </div>
      )}

      <div>
        <label htmlFor="bot_token" className="block text-sm font-medium text-gray-700">
          Token *
        </label>
        <input
          id="bot_token"
          type="password"
          required
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Token do bot Telegram"
        />
        <p className="mt-1 text-xs text-gray-500">O username será detectado automaticamente via Telegram API</p>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Validando...' : 'Adicionar Bot'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
