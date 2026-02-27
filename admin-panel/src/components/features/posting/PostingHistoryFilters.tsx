'use client';

interface GroupOption {
  id: string;
  name: string;
}

export interface PostingHistoryFilterState {
  group_id: string;
  bet_result: string;
  championship: string;
  market: string;
  date_from: string;
  date_to: string;
}

interface PostingHistoryFiltersProps {
  filters: PostingHistoryFilterState;
  onChange: (filters: PostingHistoryFilterState) => void;
  groups: GroupOption[];
  showGroupFilter: boolean;
}

const RESULT_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'success', label: 'Acertos' },
  { value: 'failure', label: 'Erros' },
  { value: 'unknown', label: 'Indefinidos' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'pending', label: 'Pendentes' },
];

function getDateShortcut(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export function PostingHistoryFilters({ filters, onChange, groups, showGroupFilter }: PostingHistoryFiltersProps) {
  function update(patch: Partial<PostingHistoryFilterState>) {
    onChange({ ...filters, ...patch });
  }

  function handleClear() {
    onChange({
      group_id: '',
      bet_result: '',
      championship: '',
      market: '',
      date_from: '',
      date_to: '',
    });
  }

  const hasFilters = filters.bet_result || filters.championship || filters.market || filters.date_from || filters.date_to;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {/* Group filter */}
        {showGroupFilter && groups.length > 0 && (
          <div>
            <label htmlFor="filter-group" className="block text-xs font-medium text-gray-600 mb-1">Grupo</label>
            <select
              id="filter-group"
              value={filters.group_id}
              onChange={(e) => update({ group_id: e.target.value })}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white"
            >
              <option value="">Todos</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Result filter */}
        <div>
          <label htmlFor="filter-result" className="block text-xs font-medium text-gray-600 mb-1">Resultado</label>
          <select
            id="filter-result"
            value={filters.bet_result}
            onChange={(e) => update({ bet_result: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white"
          >
            {RESULT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Championship filter */}
        <div>
          <label htmlFor="filter-championship" className="block text-xs font-medium text-gray-600 mb-1">Campeonato</label>
          <input
            id="filter-championship"
            type="text"
            value={filters.championship}
            onChange={(e) => update({ championship: e.target.value })}
            placeholder="Ex: Serie A"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white w-36"
          />
        </div>

        {/* Market filter */}
        <div>
          <label htmlFor="filter-market" className="block text-xs font-medium text-gray-600 mb-1">Mercado</label>
          <input
            id="filter-market"
            type="text"
            value={filters.market}
            onChange={(e) => update({ market: e.target.value })}
            placeholder="Ex: Over 2.5"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white w-36"
          />
        </div>

        {/* Date range */}
        <div>
          <label htmlFor="filter-date-from" className="block text-xs font-medium text-gray-600 mb-1">De</label>
          <input
            id="filter-date-from"
            type="date"
            value={filters.date_from}
            onChange={(e) => update({ date_from: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white"
          />
        </div>
        <div>
          <label htmlFor="filter-date-to" className="block text-xs font-medium text-gray-600 mb-1">Até</label>
          <input
            id="filter-date-to"
            type="date"
            value={filters.date_to}
            onChange={(e) => update({ date_to: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white"
          />
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-gray-500 hover:text-gray-700 pb-0.5"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Date shortcuts */}
      <div className="flex gap-2">
        {[
          { label: '7 dias', days: 7 },
          { label: '15 dias', days: 15 },
          { label: '30 dias', days: 30 },
        ].map(({ label, days }) => (
          <button
            key={days}
            type="button"
            onClick={() => {
              const { from, to } = getDateShortcut(days);
              update({ date_from: from, date_to: to });
            }}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
