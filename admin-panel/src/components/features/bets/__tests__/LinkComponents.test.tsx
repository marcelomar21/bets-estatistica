import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkEditModal } from '../LinkEditModal';
import { BulkLinksModal } from '../BulkLinksModal';
import { BetTable } from '../BetTable';
import type { SuggestedBetListItem, BetPagination } from '@/types/database';

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

const sampleBetNoLink: SuggestedBetListItem = {
  ...sampleBet,
  id: 2,
  deep_link: null,
  bet_status: 'pending_link',
};

const samplePagination: BetPagination = {
  page: 1,
  per_page: 50,
  total: 2,
  total_pages: 1,
};

// ============================================================
// LinkEditModal
// ============================================================
describe('LinkEditModal', () => {
  it('renders with current link value', () => {
    render(
      <LinkEditModal
        bet={sampleBet}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Editar Link')).toBeInTheDocument();
    const input = screen.getByLabelText('URL do link de aposta') as HTMLInputElement;
    expect(input.value).toBe('https://bet365.com/link');
  });

  it('validates URL and shows error for invalid protocol', async () => {
    const user = userEvent.setup();
    render(
      <LinkEditModal
        bet={{ ...sampleBet, deep_link: null }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('URL do link de aposta');
    await user.type(input, 'bet365.com/invalid');
    await user.click(screen.getByText('Salvar'));

    expect(screen.getByText(/http:\/\//)).toBeInTheDocument();
  });

  it('submits with valid link', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <LinkEditModal
        bet={{ ...sampleBet, deep_link: null }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const input = screen.getByLabelText('URL do link de aposta');
    await user.type(input, 'https://bet365.com/new-link');
    await user.click(screen.getByText('Salvar'));

    expect(onSave).toHaveBeenCalledWith(sampleBet.id, 'https://bet365.com/new-link');
  });

  it('shows backend error message when save fails', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('URL bloqueada por politica interna'));
    render(
      <LinkEditModal
        bet={{ ...sampleBet, deep_link: null }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const input = screen.getByLabelText('URL do link de aposta');
    await user.type(input, 'https://bet365.com/new-link');
    await user.click(screen.getByText('Salvar'));

    expect(screen.getByText('URL bloqueada por politica interna')).toBeInTheDocument();
  });

  it('clears link when clicking Limpar Link', async () => {
    const user = userEvent.setup();
    render(
      <LinkEditModal
        bet={sampleBet}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Limpar Link'));

    const input = screen.getByLabelText('URL do link de aposta') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});

// ============================================================
// BulkLinksModal
// ============================================================
describe('BulkLinksModal', () => {
  it('renders with selected count', () => {
    render(
      <BulkLinksModal
        selectedCount={5}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Adicionar Links em Lote')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('validates URL before submitting', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <BulkLinksModal
        selectedCount={3}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const input = screen.getByLabelText('URL do link de aposta');
    await user.type(input, 'invalid-url');
    await user.click(screen.getByText('Atualizar 3 Apostas'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/http:\/\//)).toBeInTheDocument();
  });

  it('submits with valid URL', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <BulkLinksModal
        selectedCount={3}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const input = screen.getByLabelText('URL do link de aposta');
    await user.type(input, 'https://bet365.com/bulk-link');
    await user.click(screen.getByText('Atualizar 3 Apostas'));

    expect(onSave).toHaveBeenCalledWith('https://bet365.com/bulk-link');
  });

  it('shows backend error message when bulk save fails', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('Falha parcial: 2 itens invalidos'));
    render(
      <BulkLinksModal
        selectedCount={3}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const input = screen.getByLabelText('URL do link de aposta');
    await user.type(input, 'https://bet365.com/bulk-link');
    await user.click(screen.getByText('Atualizar 3 Apostas'));

    expect(screen.getByText('Falha parcial: 2 itens invalidos')).toBeInTheDocument();
  });
});

// ============================================================
// BetTable - Link Column & Edit Button
// ============================================================
describe('BetTable - Link features', () => {
  it('renders clickable link icon when deep_link is present', () => {
    render(
      <BetTable
        bets={[sampleBet]}
        pagination={samplePagination}
        role="super_admin"
        selectedIds={new Set()}
        onSelectionChange={vi.fn()}
        onPageChange={vi.fn()}
        onEditOdds={vi.fn()}
        onEditLink={vi.fn()}
        onSort={vi.fn()}
        sortBy="kickoff_time"
        sortDir="desc"
      />,
    );

    const linkAnchor = screen.getByTitle('https://bet365.com/link');
    expect(linkAnchor).toBeInTheDocument();
    expect(linkAnchor).toHaveAttribute('target', '_blank');
    expect(linkAnchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders dash when deep_link is null', () => {
    render(
      <BetTable
        bets={[sampleBetNoLink]}
        pagination={samplePagination}
        role="super_admin"
        selectedIds={new Set()}
        onSelectionChange={vi.fn()}
        onPageChange={vi.fn()}
        onEditOdds={vi.fn()}
        onEditLink={vi.fn()}
        onSort={vi.fn()}
        sortBy="kickoff_time"
        sortDir="desc"
      />,
    );

    // The mdash character
    const cells = screen.getAllByText('—');
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });

  it('shows edit link button for super_admin', () => {
    render(
      <BetTable
        bets={[sampleBet]}
        pagination={samplePagination}
        role="super_admin"
        selectedIds={new Set()}
        onSelectionChange={vi.fn()}
        onPageChange={vi.fn()}
        onEditOdds={vi.fn()}
        onEditLink={vi.fn()}
        onSort={vi.fn()}
        sortBy="kickoff_time"
        sortDir="desc"
      />,
    );

    expect(screen.getByText('Editar Link')).toBeInTheDocument();
  });

  it('hides edit link button for group_admin', () => {
    render(
      <BetTable
        bets={[sampleBet]}
        pagination={samplePagination}
        role="group_admin"
        selectedIds={new Set()}
        onSelectionChange={vi.fn()}
        onPageChange={vi.fn()}
        onEditOdds={vi.fn()}
        onEditLink={vi.fn()}
        onSort={vi.fn()}
        sortBy="kickoff_time"
        sortDir="desc"
      />,
    );

    expect(screen.queryByText('Editar Link')).not.toBeInTheDocument();
  });
});
