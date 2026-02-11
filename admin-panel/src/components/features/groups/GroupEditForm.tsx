'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupListItem, PostingSchedule } from '@/types/database';
import { PostingScheduleSection } from '@/components/features/posting/PostingScheduleSection';
import { statusConfig } from './group-utils';

interface GroupEditFormProps {
  initialData: GroupListItem & { additional_invitee_ids?: InviteeEntry[] };
  onSubmit: (data: GroupEditFormData) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export interface InviteeEntry {
  type: 'telegram' | 'email';
  value: string;
}

export interface GroupEditFormData {
  name: string;
  telegram_group_id: number | null;
  telegram_admin_group_id: number | null;
  status: 'active' | 'paused' | 'inactive';
  additional_invitee_ids: InviteeEntry[];
  posting_schedule: PostingSchedule;
}

const editableStatuses = ['active', 'paused', 'inactive'] as const;

export function GroupEditForm({ initialData, onSubmit, loading, error }: GroupEditFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initialData.name);
  const [telegramGroupId, setTelegramGroupId] = useState(
    initialData.telegram_group_id !== null ? String(initialData.telegram_group_id) : '',
  );
  const [telegramAdminGroupId, setTelegramAdminGroupId] = useState(
    initialData.telegram_admin_group_id !== null ? String(initialData.telegram_admin_group_id) : '',
  );
  const [status, setStatus] = useState<'active' | 'paused' | 'inactive'>(
    editableStatuses.includes(initialData.status as typeof editableStatuses[number])
      ? (initialData.status as 'active' | 'paused' | 'inactive')
      : 'active',
  );
  const [invitees, setInvitees] = useState<InviteeEntry[]>(initialData.additional_invitee_ids || []);

  // Story 5.5: Posting schedule state
  const defaultSchedule: PostingSchedule = { enabled: true, times: ['10:00', '15:00', '22:00'] };
  const initialSchedule = initialData.posting_schedule || defaultSchedule;
  const [postingEnabled, setPostingEnabled] = useState(initialSchedule.enabled);
  const [postingTimes, setPostingTimes] = useState<string[]>(initialSchedule.times);

  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (name.trim().length < 2) {
      setValidationError('Nome deve ter pelo menos 2 caracteres');
      return;
    }

    // Story 5.5: Validate posting times
    if (postingTimes.length === 0) {
      setValidationError('Defina pelo menos 1 horario de postagem');
      return;
    }
    if (postingTimes.length > 12) {
      setValidationError('Maximo de 12 horarios de postagem');
      return;
    }
    const uniqueTimes = new Set(postingTimes);
    if (uniqueTimes.size !== postingTimes.length) {
      setValidationError('Horarios de postagem duplicados');
      return;
    }

    const data: GroupEditFormData = {
      name: name.trim(),
      telegram_group_id: null,
      telegram_admin_group_id: null,
      status,
      additional_invitee_ids: invitees.filter(i => i.value.trim() !== ''),
      posting_schedule: { enabled: postingEnabled, times: postingTimes },
    };

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

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as 'active' | 'paused' | 'inactive')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {editableStatuses.map((s) => (
            <option key={s} value={s}>
              {statusConfig[s].label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Convidados Adicionais (Telegram/Email)
        </label>
        <div className="space-y-2">
          {invitees.map((invitee, index) => (
            <div key={index} className="flex gap-2 items-center">
              <select
                value={invitee.type}
                onChange={(e) => {
                  const updated = [...invitees];
                  updated[index] = { ...updated[index], type: e.target.value as 'telegram' | 'email' };
                  setInvitees(updated);
                }}
                className="rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="telegram">Telegram</option>
                <option value="email">Email</option>
              </select>
              <input
                type="text"
                value={invitee.value}
                onChange={(e) => {
                  const updated = [...invitees];
                  updated[index] = { ...updated[index], value: e.target.value };
                  setInvitees(updated);
                }}
                placeholder={invitee.type === 'telegram' ? 'Chat ID (ex: 123456789)' : 'email@exemplo.com'}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setInvitees(invitees.filter((_, i) => i !== index))}
                className="text-red-500 hover:text-red-700 text-sm px-2"
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setInvitees([...invitees, { type: 'telegram', value: '' }])}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            + Adicionar Convidado
          </button>
        </div>
      </div>

      {/* Story 5.5: Posting Schedule Section */}
      <div className="border-t pt-6">
        <PostingScheduleSection
          groupId={initialData.id}
          initialSchedule={initialSchedule}
          standalone={false}
          onScheduleChange={(schedule) => {
            setPostingEnabled(schedule.enabled);
            setPostingTimes(schedule.times);
          }}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Salvando...' : 'Salvar Alteracoes'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/groups/${initialData.id}`)}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
