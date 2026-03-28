import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BetStatusBadge } from '../BetStatusBadge';
import { BetStatsBar } from '../BetStatsBar';
import { BetFilters, type BetFilterValues } from '../BetFilters';
import { BetTable } from '../BetTable';
import { OddsEditModal } from '../OddsEditModal';
import { BulkOddsModal } from '../BulkOddsModal';
import { DistributeModal } from '../DistributeModal';
import type { SuggestedBetListItem, BetPagination, BetCounters } from '@/types/database';

const sampleBet: SuggestedBetListItem = {
  id: 1,
  bet_market: 'Over 2.5 Gols',
  bet_pick: 'Over',
  odds: 1.85,
  deep_link: 'https://bet365.com/link',
  bet_status: 'ready',
  elegibilidade: 'elegivel',
  promovida_manual: false,
  group_id: 'group-uuid-1',
  distributed_at: '2026-02-10T10:00:00Z',
  created_at: '2026-02-10T08:00:00Z',
  odds_at_post: null,
  notes: null,
  league_matches: {
    home_team_name: 'Flamengo',
    away_team_name: 'Palmeiras',
    kickoff_time: '2026-02-10T20:00:00Z',
    status: 'scheduled',
    league_seasons: {
      league_name: 'Serie A Brasil',
      country: 'Brazil',
    },
  },
  groups: { name: 'Grupo Alpha' },
};

const sampleCounters: BetCounters = {
  total: 100,
  ready: 30,
  posted: 20,
  pending_link: 15,
  pending_odds: 10,
  sem_odds: 15,
  sem_link: 10,
  pool: 25,
  distributed: 75,
};

const samplePagination: BetPagination = {
  page: 1,
  per_page: 50,
  total: 100,
  total_pages: 2,
};

// ============================================================
// BetStatusBadge
// ============================================================
describe('BetStatusBadge', () => {
  it('renders correct label for ready status', () => {
    render(<BetStatusBadge status="ready" />);
    expect(screen.getByText('Pronta')).toBeInTheDocument();
  });

  it('renders correct label for posted status', () => {
    render(<BetStatusBadge status="posted" />);
    expect(screen.getByText('Postada')).toBeInTheDocument();
  });

  it('renders correct label for pending_link status', () => {
    render(<BetStatusBadge status="pending_link" />);
    expect(screen.getByText('Sem Link')).toBeInTheDocument();
  });

  it('renders correct label for pending_odds status', () => {
    render(<BetStatusBadge status="pending_odds" />);
    expect(screen.getByText('Sem Odds')).toBeInTheDocument();
  });

  it('renders correct label for generated status', () => {
    render(<BetStatusBadge status="generated" />);
    expect(screen.getByText('Gerada')).toBeInTheDocument();
  });

  it('applies correct CSS class for ready status', () => {
    render(<BetStatusBadge status="ready" />);
    const badge = screen.getByText('Pronta');
    expect(badge.className).toContain('bg-green-100');
  });

  it('applies correct CSS class for posted status', () => {
    render(<BetStatusBadge status="posted" />);
    const badge = screen.getByText('Postada');
    expect(badge.className).toContain('bg-blue-100');
  });
});

// ============================================================
// BetStatsBar
// ============================================================
describe('BetStatsBar', () => {
  it('renders all counter labels', () => {
    render(<BetStatsBar counters={sampleCounters} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Pool')).toBeInTheDocument();
    expect(screen.getByText('Distribuidas')).toBeInTheDocument();
    expect(screen.getByText('Prontas')).toBeInTheDocument();
    expect(screen.getByText('Postadas')).toBeInTheDocument();
    expect(screen.getByText('Sem Link')).toBeInTheDocument();
  });

  it('renders counter values', () => {
    render(<BetStatsBar counters={sampleCounters} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });
});

// ============================================================
// BetFilters
// ============================================================
describe('BetFilters', () => {
  const defaultFilters: BetFilterValues = {
    status: '',
    elegibilidade: '',
    group_id: '',
    has_odds: '',
    has_link: '',
    search: '',
    future_only: 'true',
    date_from: '',
    date_to: '',
    championship: '',
  };

  it('renders search input and button', () => {
    render(<BetFilters filters={defaultFilters} onFilterChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Buscar por time/i)).toBeInTheDocument();
    expect(screen.getByText('Buscar')).toBeInTheDocument();
  });

  it('calls onFilterChange when status filter changes', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(<BetFilters filters={defaultFilters} onFilterChange={onFilterChange} />);

    const selects = screen.getAllByRole('combobox');
    // First select is status
    await user.selectOptions(selects[0], 'ready');

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ready' }),
    );
  });

  it('emits search event on form submit', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(<BetFilters filters={defaultFilters} onFilterChange={onFilterChange} />);

    await user.type(screen.getByPlaceholderText(/Buscar/i), 'Flamengo');
    await user.click(screen.getByText('Buscar'));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Flamengo' }),
    );
  });

  it('shows group filter when showGroupFilter is true', () => {
    const groups = [{ id: 'g1', name: 'Grupo A' }, { id: 'g2', name: 'Grupo B' }];
    render(<BetFilters filters={defaultFilters} onFilterChange={vi.fn()} groups={groups} showGroupFilter />);
    expect(screen.getByText('Grupo A')).toBeInTheDocument();
    expect(screen.getByText('Grupo B')).toBeInTheDocument();
  });

  it('renders championship dropdown when championships provided (Story 7-1)', () => {
    const championships = ['Premier League', 'Serie A Brasil'];
    render(<BetFilters filters={defaultFilters} onFilterChange={vi.fn()} championships={championships} />);
    expect(screen.getByText('Todos os Campeonatos')).toBeInTheDocument();
    expect(screen.getByText('Premier League')).toBeInTheDocument();
    expect(screen.getByText('Serie A Brasil')).toBeInTheDocument();
  });

  it('calls onFilterChange with championship when selected (Story 7-1)', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const championships = ['Premier League', 'Serie A Brasil'];
    render(<BetFilters filters={defaultFilters} onFilterChange={onFilterChange} championships={championships} />);

    const selects = screen.getAllByRole('combobox');
    // Find the championship select (contains "Todos os Campeonatos")
    const champSelect = selects.find(s => s.querySelector('option[value=""]')?.textContent === 'Todos os Campeonatos');
    expect(champSelect).toBeDefined();
    await user.selectOptions(champSelect!, 'Premier League');

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ championship: 'Premier League' }),
    );
  });
});

// ============================================================
// BetTable
// ============================================================
describe('BetTable', () => {
  const defaultProps = {
    bets: [sampleBet],
    pagination: samplePagination,
    selectedIds: new Set<number>(),
    onSelectionChange: vi.fn(),
    onPageChange: vi.fn(),
    onEditOdds: vi.fn(),
    onSort: vi.fn(),
    sortBy: 'kickoff_time',
    sortDir: 'desc',
  };

  it('renders bet data in table', () => {
    render(<BetTable {...defaultProps} role="super_admin" />);
    expect(screen.getByText(/Flamengo vs Palmeiras/i)).toBeInTheDocument();
    // Mercado column now shows category badge
    expect(screen.getByText('Gols')).toBeInTheDocument();
    // Pick column shows formatted pick display (market - pick when different)
    expect(screen.getByText('Over 2.5 Gols - Over')).toBeInTheDocument();
    expect(screen.getByText('1.85')).toBeInTheDocument();
    // Story 4-1: Distribution badge now shows group name instead of generic "Distribuida"
    expect(screen.getByText('Grupo Alpha')).toBeInTheDocument();
  });

  it('renders championship column with league_name (Story 7-1)', () => {
    render(<BetTable {...defaultProps} role="super_admin" />);
    // Header
    expect(screen.getByText('Campeonato')).toBeInTheDocument();
    // Data cell
    expect(screen.getByText('Serie A Brasil')).toBeInTheDocument();
  });

  it('renders dash when league_seasons is null (Story 7-1)', () => {
    const betNoLeague: SuggestedBetListItem = {
      ...sampleBet,
      league_matches: { ...sampleBet.league_matches!, league_seasons: null },
    };
    render(<BetTable {...defaultProps} bets={[betNoLeague]} role="super_admin" />);
    // Should show em dash for missing championship
    const cells = screen.getAllByText('—');
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty state when no bets', () => {
    render(<BetTable {...defaultProps} bets={[]} role="super_admin" />);
    expect(screen.getByText('Nenhuma aposta encontrada')).toBeInTheDocument();
  });

  it('shows checkboxes for super_admin', () => {
    render(<BetTable {...defaultProps} role="super_admin" />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2); // header + row
  });

  it('hides checkboxes and edit button for group_admin', () => {
    render(<BetTable {...defaultProps} role="group_admin" />);
    const checkboxes = screen.queryAllByRole('checkbox');
    expect(checkboxes).toHaveLength(0);
    expect(screen.queryByText('Editar Odds')).not.toBeInTheDocument();
  });

  it('shows edit button for super_admin', () => {
    render(<BetTable {...defaultProps} role="super_admin" />);
    expect(screen.getByText('Editar Odds')).toBeInTheDocument();
  });

  it('calls onEditOdds when edit button clicked', async () => {
    const user = userEvent.setup();
    const onEditOdds = vi.fn();
    render(<BetTable {...defaultProps} role="super_admin" onEditOdds={onEditOdds} />);

    await user.click(screen.getByText('Editar Odds'));
    expect(onEditOdds).toHaveBeenCalledWith(sampleBet);
  });

  it('renders pagination controls', () => {
    render(<BetTable {...defaultProps} role="super_admin" />);
    expect(screen.getByText(/Pagina 1 de 2/)).toBeInTheDocument();
    expect(screen.getByText('Anterior')).toBeInTheDocument();
    expect(screen.getByText('Proximo')).toBeInTheDocument();
  });

  it('calls onSort when column header clicked', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(<BetTable {...defaultProps} role="super_admin" onSort={onSort} />);

    await user.click(screen.getByText('Odds'));
    expect(onSort).toHaveBeenCalledWith('odds');
  });

  it('shows Distribuir button when onDistribute is provided', () => {
    render(<BetTable {...defaultProps} role="super_admin" onDistribute={vi.fn()} />);
    // sampleBet has group_id so button text should be "Redistribuir"
    expect(screen.getByText('Redistribuir')).toBeInTheDocument();
  });

  it('shows Distribuir for pool bets', () => {
    const poolBet: SuggestedBetListItem = { ...sampleBet, group_id: null, groups: null };
    render(<BetTable {...defaultProps} bets={[poolBet]} role="super_admin" onDistribute={vi.fn()} />);
    expect(screen.getByText('Distribuir')).toBeInTheDocument();
  });

  it('calls onDistribute when distribute button clicked', async () => {
    const user = userEvent.setup();
    const onDistribute = vi.fn();
    render(<BetTable {...defaultProps} role="super_admin" onDistribute={onDistribute} />);

    await user.click(screen.getByText('Redistribuir'));
    expect(onDistribute).toHaveBeenCalledWith(sampleBet);
  });
});

// ============================================================
// OddsEditModal
// ============================================================
describe('OddsEditModal', () => {
  const defaultProps = {
    bet: sampleBet,
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    oddsHistory: [],
  };

  it('renders match info and odds input', () => {
    render(<OddsEditModal {...defaultProps} />);
    expect(screen.getByText(/Flamengo vs Palmeiras/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Novo valor de odds/i)).toBeInTheDocument();
  });

  it('calls onSave with new odds value', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<OddsEditModal {...defaultProps} onSave={onSave} />);

    const input = screen.getByLabelText(/Novo valor de odds/i);
    await user.clear(input);
    await user.type(input, '2.50');
    await user.click(screen.getByText('Salvar'));

    expect(onSave).toHaveBeenCalledWith(1, 2.50);
  });

  it('shows warning for low odds', async () => {
    const user = userEvent.setup();
    render(<OddsEditModal {...defaultProps} />);

    const input = screen.getByLabelText(/Novo valor de odds/i);
    await user.clear(input);
    await user.type(input, '1.30');

    expect(screen.getByText(/abaixo de 1.6/i)).toBeInTheDocument();
  });

  it('shows validation error for empty odds', async () => {
    const user = userEvent.setup();
    render(<OddsEditModal {...defaultProps} />);

    const input = screen.getByLabelText(/Novo valor de odds/i);
    await user.clear(input);
    await user.click(screen.getByText('Salvar'));

    expect(screen.getByText(/numero positivo/i)).toBeInTheDocument();
  });

  it('renders odds history when provided', () => {
    const history = [
      { id: 1, bet_id: 1, update_type: 'odds_change', old_value: 1.70, new_value: 1.85, job_name: 'enrichOdds_08h', created_at: '2026-02-10T08:30:00Z' },
    ];
    render(<OddsEditModal {...defaultProps} oddsHistory={history} />);
    expect(screen.getByText('Historico de Odds')).toBeInTheDocument();
    expect(screen.getByText('enrichOdds_08h')).toBeInTheDocument();
  });
});

// ============================================================
// DistributeModal (Story 2.7 — Multi-select)
// ============================================================
describe('DistributeModal', () => {
  const groups = [
    { id: 'group-uuid-1', name: 'Guru da Bet' },
    { id: 'group-uuid-2', name: 'Osmar Palpites' },
    { id: 'group-uuid-3', name: 'CAP 1000 Tips' },
  ];

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    selectedBetIds: [1, 2],
    existingAssignments: new Map<number, string[]>(),
    groups,
    role: 'super_admin' as const,
    userGroupId: null,
    onDistributed: vi.fn(),
  };

  it('renders multi-select checkbox list of groups', () => {
    render(<DistributeModal {...defaultProps} />);
    expect(screen.getByText('Selecione os grupos')).toBeInTheDocument();
    expect(screen.getByLabelText('Guru da Bet')).toBeInTheDocument();
    expect(screen.getByLabelText('Osmar Palpites')).toBeInTheDocument();
    expect(screen.getByLabelText('CAP 1000 Tips')).toBeInTheDocument();
  });

  it('shows bet count in title', () => {
    render(<DistributeModal {...defaultProps} />);
    expect(screen.getByText('Distribuir 2 apostas')).toBeInTheDocument();
  });

  it('shows single bet title variant', () => {
    render(<DistributeModal {...defaultProps} selectedBetIds={[1]} />);
    expect(screen.getByText('Distribuir 1 aposta')).toBeInTheDocument();
  });

  it('marks already-assigned groups as disabled with "ja distribuido" label', () => {
    const existing = new Map<number, string[]>();
    existing.set(1, ['group-uuid-1']);
    existing.set(2, ['group-uuid-1']);

    render(<DistributeModal {...defaultProps} existingAssignments={existing} />);
    expect(screen.getByText('ja distribuido')).toBeInTheDocument();
    const checkbox = screen.getByLabelText('Guru da Bet');
    expect(checkbox).toBeDisabled();
  });

  it('shows partial assignment count when some bets assigned', () => {
    const existing = new Map<number, string[]>();
    existing.set(1, ['group-uuid-2']);

    render(<DistributeModal {...defaultProps} existingAssignments={existing} />);
    expect(screen.getByText('1/2 ja distribuido')).toBeInTheDocument();
  });

  it('calculates preview counter correctly', async () => {
    const user = userEvent.setup();
    render(<DistributeModal {...defaultProps} />);

    await user.click(screen.getByLabelText('Guru da Bet'));
    await user.click(screen.getByLabelText('Osmar Palpites'));

    // 2 bets × 2 groups = 4 new assignments
    expect(screen.getByText(/4/)).toBeInTheDocument();
    expect(screen.getByText(/novo/i)).toBeInTheDocument();
  });

  it('subtracts already-existing from preview counter', async () => {
    const user = userEvent.setup();
    const existing = new Map<number, string[]>();
    existing.set(1, ['group-uuid-2']);

    render(<DistributeModal {...defaultProps} existingAssignments={existing} />);

    await user.click(screen.getByLabelText('Osmar Palpites'));

    // 2 bets × 1 group = 2, minus 1 already existing = 1 new
    expect(screen.getByText(/1.*novo/)).toBeInTheDocument();
    expect(screen.getByText(/1 ja existente/)).toBeInTheDocument();
  });

  it('disables Confirmar button when no groups selected', () => {
    render(<DistributeModal {...defaultProps} />);
    expect(screen.getByText('Confirmar')).toBeDisabled();
  });

  it('calls API with correct payload on confirm', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { created: 4, alreadyExisted: 0 } }),
    });
    globalThis.fetch = mockFetch;

    render(<DistributeModal {...defaultProps} />);

    await user.click(screen.getByLabelText('Guru da Bet'));
    await user.click(screen.getByLabelText('Osmar Palpites'));
    await user.click(screen.getByText('Confirmar'));

    expect(mockFetch).toHaveBeenCalledWith('/api/bets/distribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betIds: [1, 2], groupIds: ['group-uuid-1', 'group-uuid-2'] }),
    });
  });

  it('shows success result with created/alreadyExisted counts', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { created: 3, alreadyExisted: 1 } }),
    });

    render(<DistributeModal {...defaultProps} />);

    await user.click(screen.getByLabelText('Guru da Bet'));
    await user.click(screen.getByText('Confirmar'));

    expect(await screen.findByText(/3 criados/)).toBeInTheDocument();
    expect(screen.getByText(/1 ja existia/)).toBeInTheDocument();
  });

  it('calls onDistributed when clicking Fechar after success', async () => {
    const user = userEvent.setup();
    const onDistributed = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { created: 2, alreadyExisted: 0 } }),
    });

    render(<DistributeModal {...defaultProps} onDistributed={onDistributed} />);

    await user.click(screen.getByLabelText('Guru da Bet'));
    await user.click(screen.getByText('Confirmar'));

    const closeBtn = await screen.findByText('Fechar');
    await user.click(closeBtn);

    expect(onDistributed).toHaveBeenCalled();
  });

  it('does not render when isOpen is false', () => {
    render(<DistributeModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Selecione os grupos')).not.toBeInTheDocument();
  });

  it('shows error when API fails', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false, error: { message: 'Grupo invalido' } }),
    });

    render(<DistributeModal {...defaultProps} />);

    await user.click(screen.getByLabelText('Guru da Bet'));
    await user.click(screen.getByText('Confirmar'));

    expect(await screen.findByText('Grupo invalido')).toBeInTheDocument();
  });

  it('does not trigger API when cancel is clicked', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    const onClose = vi.fn();

    render(<DistributeModal {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('group admin: only their group shown, auto-selected, non-deselectable', () => {
    render(
      <DistributeModal
        {...defaultProps}
        role="group_admin"
        userGroupId="group-uuid-1"
      />,
    );

    const checkbox = screen.getByLabelText('Guru da Bet');
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
  });
});

// ============================================================
// BulkOddsModal
// ============================================================
describe('BulkOddsModal', () => {
  it('renders selected count and input', () => {
    render(<BulkOddsModal selectedCount={5} onClose={vi.fn()} onSave={vi.fn()} />);
    // Text is split across elements: <strong>5</strong> apostas selecionadas
    const paragraph = screen.getByText((_content, element) =>
      element?.tagName === 'P' && /5.*apostas selecionadas/i.test(element.textContent ?? ''),
    );
    expect(paragraph).toBeInTheDocument();
    expect(screen.getByLabelText(/Novo valor de odds/i)).toBeInTheDocument();
  });

  it('calls onSave with odds value', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BulkOddsModal selectedCount={3} onClose={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText(/Novo valor de odds/i), '2.10');
    await user.click(screen.getByText(/Atualizar 3 Apostas/i));

    expect(onSave).toHaveBeenCalledWith(2.10);
  });

  it('shows warning for low odds', async () => {
    const user = userEvent.setup();
    render(<BulkOddsModal selectedCount={2} onClose={vi.fn()} onSave={vi.fn()} />);

    await user.type(screen.getByLabelText(/Novo valor de odds/i), '1.20');

    expect(screen.getByText(/abaixo de 1.6/i)).toBeInTheDocument();
  });
});
