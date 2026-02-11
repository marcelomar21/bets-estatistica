'use client';

import { useState } from 'react';

export interface BetFilterValues {
  status: string;
  elegibilidade: string;
  group_id: string;
  has_odds: string;
  has_link: string;
  search: string;
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

export function BetFilters({ filters, onFilterChange, groups, showGroupFilter }: BetFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search);

  function handleChange(key: keyof BetFilterValues, value: string) {
    onFilterChange({ ...filters, [key]: value });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleChange('search', searchInput);
  }

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
    </div>
  );
}
