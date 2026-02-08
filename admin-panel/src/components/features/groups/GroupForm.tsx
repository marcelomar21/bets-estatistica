'use client';

import { useState } from 'react';

interface GroupFormProps {
  onSubmit: (data: GroupFormData) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export interface GroupFormData {
  name: string;
  telegram_group_id?: number;
  telegram_admin_group_id?: number;
}

export function GroupForm({ onSubmit, loading, error }: GroupFormProps) {
  const [name, setName] = useState('');
  const [telegramGroupId, setTelegramGroupId] = useState('');
  const [telegramAdminGroupId, setTelegramAdminGroupId] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (name.trim().length < 2) {
      setValidationError('Nome deve ter pelo menos 2 caracteres');
      return;
    }

    const data: GroupFormData = { name: name.trim() };

    if (telegramGroupId.trim()) {
      const parsed = Number(telegramGroupId.trim());
      if (isNaN(parsed)) {
        setValidationError('Telegram Group ID deve ser um numero');
        return;
      }
      data.telegram_group_id = parsed;
    }

    if (telegramAdminGroupId.trim()) {
      const parsed = Number(telegramAdminGroupId.trim());
      if (isNaN(parsed)) {
        setValidationError('Telegram Admin Group ID deve ser um numero');
        return;
      }
      data.telegram_admin_group_id = parsed;
    }

    await onSubmit(data);
  }

  const displayError = validationError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {displayError && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{displayError}</p>
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Nome do Grupo *
        </label>
        <input
          id="name"
          type="text"
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Ex: Influencer João"
        />
      </div>

      <div>
        <label htmlFor="telegramGroupId" className="block text-sm font-medium text-gray-700">
          Telegram Group ID (opcional)
        </label>
        <input
          id="telegramGroupId"
          type="text"
          value={telegramGroupId}
          onChange={(e) => setTelegramGroupId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Ex: -1001234567890"
        />
      </div>

      <div>
        <label htmlFor="telegramAdminGroupId" className="block text-sm font-medium text-gray-700">
          Telegram Admin Group ID (opcional)
        </label>
        <input
          id="telegramAdminGroupId"
          type="text"
          value={telegramAdminGroupId}
          onChange={(e) => setTelegramAdminGroupId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Ex: -1009876543210"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Criando...' : 'Criar Grupo'}
      </button>
    </form>
  );
}
