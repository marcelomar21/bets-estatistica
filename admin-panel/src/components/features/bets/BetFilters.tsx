'use client';

import { useState } from 'react';

export interface BetFilterValues {
  status: string;
  elegibilidade: string;
  group_id: string;
  has_odds: string;
  has_link: string;
  search: string;
  future_only: string;
  date_from: string;
  date_to: string;
}

interface BetFiltersProps {
  filters: BetFilterValues;
  onFilterChange: (filters: BetFilterValues) => void;
  groups?: Array<{ id: string; name: string }>;
  showGroupFilter?: boolean;
}

const BET_STATUS_OPTIONS = [
  { value: '', label: 'Todos os Status' },
  { value: 'generated', label: 'Gerada' },
  { value: 'pending_link', label: 'Sem Link' },
  { value: 'pending_odds', label: 'Sem Odds' },
  { value: 'ready', label: 'Pronta' },
  { value: 'posted', label: 'Postada' },
];

const ELEGIBILIDADE_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'elegivel', label: 'Elegivel' },
  { value: 'removida', label: 'Removida' },
  { value: 'expirada', label: 'Expirada' },
];

const ODDS_LINK_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'true', label: 'Com' },
  { value: 'false', label: 'Sem' },
];

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function BetFilters({ filters, onFilterChange, groups, showGroupFilter }: BetFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search);

  function handleChange(key: keyof BetFilterValues, value: string) {
    onFilterChange({ ...filters, [key]: value });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleChange('search', searchInput);
  }

  function handleToggleFutureOnly() {
    const newValue = filters.future_only === 'true' ? 'false' : 'true';
    // Clear date filters when toggling future_only back on
    if (newValue === 'true') {
      onFilterChange({ ...filters, future_only: newValue, date_from: '', date_to: '' });
    } else {
      onFilterChange({ ...filters, future_only: newValue });
    }
  }

  function setDateShortcut(daysFrom: number, daysTo: number) {
    const from = new Date();
    from.setDate(from.getDate() + daysFrom);
    const to = new Date();
    to.setDate(to.getDate() + daysTo);
    onFilterChange({
      ...filters,
      date_from: toISODate(from),
      date_to: toISODate(to),
      future_only: 'false',
    });
  }

  function clearDateFilters() {
    onFilterChange({ ...filters, date_from: '', date_to: '', future_only: 'true' });
  }

  const hasDateFilter = filters.date_from || filters.date_to;

  return (
    <div className="space-y-3 rounded-lg bg-white p-4 shadow">
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por time ou mercado..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Buscar
        </button>
      </form>

      <div className="flex flex-wrap gap-3">
        <select
          value={filters.status}
          onChange={(e) => handleChange('status', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          {BET_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={filters.elegibilidade}
          onChange={(e) => handleChange('elegibilidade', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          {ELEGIBILIDADE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {showGroupFilter && groups && (
          <select
            value={filters.group_id}
            onChange={(e) => handleChange('group_id', e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">Todos os Grupos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}

        <select
          value={filters.has_odds}
          onChange={(e) => handleChange('has_odds', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="" disabled>Odds</option>
          {ODDS_LINK_OPTIONS.map((opt) => (
            <option key={`odds-${opt.value}`} value={opt.value}>{opt.value === '' ? 'Odds: Todos' : `Odds: ${opt.label}`}</option>
          ))}
        </select>

        <select
          value={filters.has_link}
          onChange={(e) => handleChange('has_link', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="" disabled>Link</option>
          {ODDS_LINK_OPTIONS.map((opt) => (
            <option key={`link-${opt.value}`} value={opt.value}>{opt.value === '' ? 'Link: Todos' : `Link: ${opt.label}`}</option>
          ))}
        </select>
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={filters.future_only === 'true' && !hasDateFilter}
            onChange={handleToggleFutureOnly}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          Apenas jogos futuros
        </label>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">De:</label>
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => onFilterChange({ ...filters, date_from: e.target.value, future_only: 'false' })}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <label className="text-xs text-gray-500">Ate:</label>
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => onFilterChange({ ...filters, date_to: e.target.value, future_only: 'false' })}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setDateShortcut(0, 0)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setDateShortcut(1, 1)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            Amanha
          </button>
          <button
            type="button"
            onClick={() => setDateShortcut(0, 7)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            Prox. 7 dias
          </button>
          {hasDateFilter && (
            <button
              type="button"
              onClick={clearDateFilters}
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Limpar datas
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
