'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { MemberListItem } from '@/types/database';
import { MemberList } from '@/components/features/members/MemberList';

type StatusFilter = 'todos' | 'trial' | 'ativo' | 'vencendo' | 'expirado' | 'inadimplente' | 'removido';

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
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  const fetchMembers = useCallback(async (page: number, status: StatusFilter, search: string, groupId: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('per_page', '50');
      params.set('status', status);
      if (search) params.set('search', search);
      if (groupId) params.set('group_id', groupId);

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
    if (!roleResolved || role !== 'super_admin') return;
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
    fetchMembers(pagination.page, statusFilter, searchFilter, selectedGroupId);
  }, [roleResolved, fetchMembers, pagination.page, statusFilter, searchFilter, selectedGroupId]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Membros</h1>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
        <MemberList members={members} role={role} />
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
