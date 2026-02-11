import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BetStatusBadge } from '../BetStatusBadge';
import { BetStatsBar } from '../BetStatsBar';
import { BetFilters, type BetFilterValues } from '../BetFilters';
import { BetTable } from '../BetTable';
import { OddsEditModal } from '../OddsEditModal';
import { BulkOddsModal } from '../BulkOddsModal';
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
  };

  it('renders search input and button', () => {
    render(<BetFilters filters={defaultFilters} onFilterChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Buscar por time ou mercado/i)).toBeInTheDocument();
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
    expect(screen.getByText('Over 2.5 Gols')).toBeInTheDocument();
    expect(screen.getByText('Over')).toBeInTheDocument();
    expect(screen.getByText('1.85')).toBeInTheDocument();
    expect(screen.getByText('Grupo Alpha')).toBeInTheDocument();
    expect(screen.getByText('Distribuida')).toBeInTheDocument();
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
