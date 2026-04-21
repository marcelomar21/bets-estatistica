'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { MemberListItem } from '@/types/database';
import { MemberList } from '@/components/features/members/MemberList';
import { CancelMemberModal } from '@/components/features/members/CancelMemberModal';

type StatusFilter = 'todos' | 'trial' | 'ativo' | 'vencendo' | 'expirado' | 'inadimplente' | 'removido' | 'cancelado' | 'evadido';
type ChannelFilter = '' | 'telegram' | 'whatsapp';

interface MembersApiPayload {
  items: MemberListItem[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  counters: {
    total: number;
    trial: number;
    ativo: number;
    vencendo: number;
    admins: number;
    evadido: number;
  };
}

const INITIAL_PAGINATION = {
  page: 1,
  per_page: 50,
  total: 0,
  total_pages: 0,
};

const INITIAL_COUNTERS = {
  total: 0,
  trial: 0,
  ativo: 0,
  vencendo: 0,
  admins: 0,
  evadido: 0,
};

export default function MembersPage() {
  const [role, setRole] = useState<'super_admin' | 'group_admin'>('group_admin');
  const [roleResolved, setRoleResolved] = useState(false);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [counters, setCounters] = useState(INITIAL_COUNTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [searchInput, setSearchInput] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [groups, setGroups] = useState<Array<{ id: string; name: string; bot_pool?: { bot_username: string }[] | null }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('');
  const [cancelTarget, setCancelTarget] = useState<MemberListItem | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchMembers = useCallback(async (page: number, status: StatusFilter, search: string, groupId: string, channel: ChannelFilter = '') => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('per_page', '50');
      params.set('status', status);
      if (search) params.set('search', search);
      if (groupId) params.set('group_id', groupId);
      if (channel) params.set('channel', channel);

      const response = await fetch(`/api/members?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? `Erro HTTP ${response.status}`);
        return;
      }

      const payload = await response.json();
      if (!payload.success) {
        setError(payload.error?.message ?? 'Erro ao carregar membros');
        return;
      }

      const data = payload.data as MembersApiPayload;
      setMembers(data.items ?? []);
      setPagination(data.pagination ?? INITIAL_PAGINATION);
      setCounters(data.counters ?? INITIAL_COUNTERS);
    } catch {
      setError('Erro de conexao. Verifique sua internet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveRole() {
      try {
        const response = await fetch('/api/me');
        if (cancelled) return;
        if (response.ok) {
          const payload = await response.json();
          if (cancelled) return;
          const roleValue = payload?.success ? payload?.data?.role : null;
          if (roleValue === 'super_admin' || roleValue === 'group_admin') {
            setRole(roleValue);
          }
        }
      } catch {
        // fallback: mantém role default group_admin
      } finally {
        if (!cancelled) setRoleResolved(true);
      }
    }

    resolveRole();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!roleResolved) return;
    let cancelled = false;

    async function fetchGroups() {
      try {
        const res = await fetch('/api/groups');
        if (cancelled) return;
        if (res.ok) {
          const payload = await res.json();
          if (!cancelled && payload.success) setGroups(payload.data);
        }
      } catch {
        // ignore - groups dropdown simply won't populate
      }
    }

    fetchGroups();
    return () => { cancelled = true; };
  }, [roleResolved, role]);

  useEffect(() => {
    if (!roleResolved) return;
    fetchMembers(pagination.page, statusFilter, searchFilter, selectedGroupId, channelFilter);
  }, [roleResolved, fetchMembers, pagination.page, statusFilter, searchFilter, selectedGroupId, channelFilter]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    setSearchFilter(searchInput.trim());
  }

  function handleStatusChange(nextStatus: StatusFilter) {
    setPagination((prev) => ({ ...prev, page: 1 }));
    setStatusFilter(nextStatus);
  }

  function goToPreviousPage() {
    setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
  }

  function goToNextPage() {
    setPagination((prev) => ({
      ...prev,
      page: prev.total_pages > 0 ? Math.min(prev.total_pages, prev.page + 1) : prev.page + 1,
    }));
  }

  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [toggleAdminLoading, setToggleAdminLoading] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState(false);

  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

  // Derive bot invite link from groups data
  // group_admin always has exactly 1 group (enforced by API groupFilter)
  // bot_pool[0] picks the primary bot — groups currently have at most 1 bot
  const botInviteLink = (() => {
    if (role === 'group_admin' && groups.length > 0) {
      const username = groups[0]?.bot_pool?.[0]?.bot_username;
      return username ? `https://t.me/${username}?start=subscribe` : null;
    }
    if (role === 'super_admin' && selectedGroupId) {
      const group = groups.find((g) => g.id === selectedGroupId);
      const username = group?.bot_pool?.[0]?.bot_username;
      return username ? `https://t.me/${username}?start=subscribe` : null;
    }
    return null;
  })();

  async function copyBotLink() {
    if (!botInviteLink) return;
    try {
      await navigator.clipboard.writeText(botInviteLink);
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available (e.g. insecure context)
    }
  }

  async function handleToggleAdmin(member: MemberListItem) {
    if (toggleAdminLoading) return;
    const memberLabel = member.channel === 'whatsapp'
      ? (member.channel_user_id || member.id)
      : (member.telegram_username || member.telegram_id);
    const action = member.is_admin ? 'remover admin de' : 'marcar como admin';
    if (!confirm(`${action} ${memberLabel}?`)) return;
    setToggleAdminLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/members/${member.id}/toggle-admin`, {
        method: 'PATCH',
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setError(payload?.error?.message ?? 'Erro ao alterar flag admin');
        return;
      }
      fetchMembers(pagination.page, statusFilter, searchFilter, selectedGroupId, channelFilter);
    } catch {
      setError('Erro de conexao ao alterar flag admin');
    } finally {
      setToggleAdminLoading(false);
    }
  }

  async function handleReactivate(member: MemberListItem) {
    if (reactivateLoading) return;
    const memberLabel = member.channel === 'whatsapp'
      ? (member.channel_user_id || member.id)
      : (member.telegram_username || member.telegram_id);
    if (!confirm(`Reativar membro ${memberLabel}?`)) return;
    setReactivateLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/members/${member.id}/reactivate`, {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setError(payload?.error?.message ?? 'Erro ao reativar membro');
        return;
      }
      fetchMembers(pagination.page, statusFilter, searchFilter, selectedGroupId, channelFilter);
    } catch {
      setError('Erro de conexao ao reativar membro');
    } finally {
      setReactivateLoading(false);
    }
  }

  async function handleCancelConfirm(reason: string) {
    if (!cancelTarget) return;
    setCancelLoading(true);
    try {
      const response = await fetch(`/api/members/${cancelTarget.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setError(payload?.error?.message ?? 'Erro ao cancelar membro');
        return;
      }
      setCancelTarget(null);
      fetchMembers(pagination.page, statusFilter, searchFilter, selectedGroupId, channelFilter);
    } catch {
      setError('Erro de conexao ao cancelar membro');
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Membros</h1>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <div className="rounded-lg bg-white p-3 shadow">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-xl font-bold text-gray-900">{counters.total}</p>
          </div>
          <div className="rounded-lg bg-white p-3 shadow">
            <p className="text-xs text-gray-500">Em Trial</p>
            <p className="text-xl font-bold text-gray-900">{counters.trial}</p>
          </div>
          <div className="rounded-lg bg-white p-3 shadow">
            <p className="text-xs text-gray-500">Ativos</p>
            <p className="text-xl font-bold text-gray-900">{counters.ativo}</p>
          </div>
          <div className="rounded-lg bg-white p-3 shadow">
            <p className="text-xs text-gray-500">Vencendo em 7d</p>
            <p className="text-xl font-bold text-gray-900">{counters.vencendo}</p>
          </div>
          <div className="rounded-lg bg-orange-50 p-3 shadow">
            <p className="text-xs text-orange-600">Evadidos</p>
            <p className="text-xl font-bold text-orange-700">{counters.evadido}</p>
          </div>
          <div className="rounded-lg bg-purple-50 p-3 shadow">
            <p className="text-xs text-purple-600">Admins</p>
            <p className="text-xl font-bold text-purple-700">{counters.admins}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSearchSubmit} className="rounded-lg bg-white p-4 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="w-full md:w-56">
            <label htmlFor="status-filter" className="mb-1 block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => handleStatusChange(event.target.value as StatusFilter)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="trial">Trial</option>
              <option value="ativo">Ativos</option>
              <option value="vencendo">Vencendo em 7 dias</option>
              <option value="expirado">Expirados</option>
              <option value="inadimplente">Inadimplentes</option>
              <option value="removido">Removidos</option>
              <option value="cancelado">Cancelados</option>
              <option value="evadido">Evadidos</option>
            </select>
          </div>

          <div className="w-full md:w-40">
            <label htmlFor="channel-filter" className="mb-1 block text-sm font-medium text-gray-700">
              Canal
            </label>
            <select
              id="channel-filter"
              value={channelFilter}
              onChange={(event) => {
                setChannelFilter(event.target.value as ChannelFilter);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="telegram">Telegram</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>

          {role === 'super_admin' && (
            <div className="w-full md:w-56">
              <label htmlFor="group-filter" className="mb-1 block text-sm font-medium text-gray-700">
                Grupo
              </label>
              <select
                id="group-filter"
                value={selectedGroupId}
                onChange={(event) => {
                  setSelectedGroupId(event.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Todos os grupos</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="w-full md:flex-1">
            <label htmlFor="search-username" className="mb-1 block text-sm font-medium text-gray-700">
              Buscar por username
            </label>
            <input
              id="search-username"
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Ex.: joao_silva"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Buscar
          </button>
        </div>
      </form>

      {botInviteLink && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <svg className="h-5 w-5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span className="flex-1 truncate text-sm text-blue-700" data-testid="bot-invite-link">{botInviteLink}</span>
          <button
            type="button"
            onClick={copyBotLink}
            className="shrink-0 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-500">Carregando membros...</p>
        </div>
      ) : (
        <MemberList
          members={members}
          role={role}
          onCancelClick={setCancelTarget}
          onReactivateClick={handleReactivate}
          onToggleAdmin={handleToggleAdmin}
          showCancellationDetails={statusFilter === 'cancelado'}
        />
      )}

      {cancelTarget && (
        <CancelMemberModal
          member={cancelTarget}
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelTarget(null)}
          isLoading={cancelLoading}
        />
      )}

      <div className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          Página {pagination.page} de {Math.max(1, pagination.total_pages)}
          {' · '}
          Total de {pagination.total} membros
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={goToPreviousPage}
            disabled={pagination.page <= 1 || loading}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={goToNextPage}
            disabled={loading || (pagination.total_pages > 0 && pagination.page >= pagination.total_pages)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
