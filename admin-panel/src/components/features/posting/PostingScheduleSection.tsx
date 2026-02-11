'use client';

import { useState } from 'react';
import type { PostingSchedule } from '@/types/database';

interface PostingScheduleSectionProps {
  groupId: string;
  initialSchedule: PostingSchedule;
  onSaved?: () => void;
  /** When true, renders inline save button (standalone mode). When false, just exposes state (form mode). */
  standalone?: boolean;
  /** Expose state changes to parent (used in GroupEditForm integration). */
  onScheduleChange?: (schedule: PostingSchedule) => void;
}

const defaultSchedule: PostingSchedule = { enabled: true, times: ['10:00', '15:00', '22:00'] };

export function PostingScheduleSection({
  groupId,
  initialSchedule,
  onSaved,
  standalone = true,
  onScheduleChange,
}: PostingScheduleSectionProps) {
  const schedule = initialSchedule || defaultSchedule;
  const [postingEnabled, setPostingEnabled] = useState(schedule.enabled);
  const [postingTimes, setPostingTimes] = useState<string[]>(schedule.times);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function notifyParent(enabled: boolean, times: string[]) {
    onScheduleChange?.({ enabled, times });
  }

  function handleToggle() {
    const next = !postingEnabled;
    setPostingEnabled(next);
    notifyParent(next, postingTimes);
  }

  function handleTimeChange(index: number, value: string) {
    const updated = [...postingTimes];
    updated[index] = value;
    setPostingTimes(updated);
    notifyParent(postingEnabled, updated);
  }

  function handleRemoveTime(index: number) {
    const updated = postingTimes.filter((_, i) => i !== index);
    setPostingTimes(updated);
    notifyParent(postingEnabled, updated);
  }

  function handleAddTime() {
    const updated = [...postingTimes, '12:00'];
    setPostingTimes(updated);
    notifyParent(postingEnabled, updated);
  }

  async function handleSave() {
    setError(null);
    setSuccess(false);

    if (postingTimes.length === 0) {
      setError('Defina pelo menos 1 horario de postagem');
      return;
    }
    if (postingTimes.length > 12) {
      setError('Maximo de 12 horarios de postagem');
      return;
    }
    const uniqueTimes = new Set(postingTimes);
    if (uniqueTimes.size !== postingTimes.length) {
      setError('Horarios de postagem duplicados');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posting_schedule: { enabled: postingEnabled, times: postingTimes },
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? 'Erro ao salvar configuracao');
        return;
      }

      setSuccess(true);
      onSaved?.();
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Erro de conexao');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="text-lg font-medium text-gray-900 mb-4">Postagem Automatica</h3>

      <div className="mb-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={postingEnabled}
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              postingEnabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                postingEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-sm font-medium text-gray-700">
            {postingEnabled ? 'Postagem habilitada' : 'Postagem desabilitada'}
          </span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Horarios de Postagem
        </label>
        <div className="space-y-2">
          {postingTimes.map((time, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="time"
                value={time}
                onChange={(e) => handleTimeChange(index, e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {postingTimes.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveTime(index)}
                  className="text-red-500 hover:text-red-700 text-sm px-2"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
          {postingTimes.length < 12 && (
            <button
              type="button"
              onClick={handleAddTime}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Adicionar Horario
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Min. 1, max. 12 horarios. Distribuicao automatica ocorre 5 min antes de cada horario.
        </p>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {success && (
        <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700">
          Configuracao salva com sucesso!
        </div>
      )}

      {standalone && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Salvando...' : 'Salvar Configuracao'}
        </button>
      )}
    </div>
  );
}
