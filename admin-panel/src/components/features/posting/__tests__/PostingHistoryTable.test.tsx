import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostingHistoryTable } from '../PostingHistoryTable';
import type { HistoryBet } from '../PostingHistoryTable';

function makeBet(overrides: Partial<HistoryBet> = {}): HistoryBet {
  return {
    id: 1,
    bet_market: 'Over 2.5',
    bet_pick: 'Over',
    odds: 1.85,
    odds_at_post: 1.80,
    bet_status: 'posted',
    telegram_posted_at: '2026-02-25T14:30:00Z',
    telegram_message_id: 12345,
    group_id: 'group-1',
    historico_postagens: [],
    created_at: '2026-02-25T10:00:00Z',
    bet_result: null,
    result_reason: null,
    result_source: null,
    result_confidence: null,
    result_updated_at: null,
    league_matches: {
      home_team_name: 'Flamengo',
      away_team_name: 'Palmeiras',
      kickoff_time: new Date(Date.now() + 3600000).toISOString(),
      league_seasons: {
        league_name: 'Serie A Brasil',
        country: 'Brazil',
      },
    },
    groups: { name: 'Grupo Principal' },
    ...overrides,
  };
}

describe('PostingHistoryTable', () => {
  it('renders empty message when no bets', () => {
    render(
      <PostingHistoryTable
        bets={[]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Nenhuma postagem encontrada')).toBeInTheDocument();
  });

  it('renders custom empty message', () => {
    render(
      <PostingHistoryTable
        bets={[]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
        emptyMessage="Sem dados"
      />
    );

    expect(screen.getByText('Sem dados')).toBeInTheDocument();
  });

  it('renders bet rows with correct data', () => {
    const bet = makeBet();

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Flamengo vs Palmeiras')).toBeInTheDocument();
    expect(screen.getByText('Over 2.5 - Over')).toBeInTheDocument();
    expect(screen.getByText('1.80')).toBeInTheDocument();
    expect(screen.getByText('Grupo Principal')).toBeInTheDocument();
  });

  it('shows "Postada" badge for posted bets', () => {
    const bet = makeBet({ bet_status: 'posted', telegram_posted_at: '2026-02-25T14:30:00Z' });

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Postada')).toBeInTheDocument();
  });

  it('shows "Pendente" badge for ready bets with future kickoff', () => {
    const bet = makeBet({
      bet_status: 'ready',
      telegram_posted_at: null,
      telegram_message_id: null,
      league_matches: {
        home_team_name: 'Flamengo',
        away_team_name: 'Palmeiras',
        kickoff_time: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    // "Pendente" appears in both posting status and result badge when bet_result is null
    const badges = screen.getAllByText('Pendente');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Não postada" badge for ready bets with past kickoff', () => {
    const bet = makeBet({
      bet_status: 'ready',
      telegram_posted_at: null,
      telegram_message_id: null,
      league_matches: {
        home_team_name: 'Flamengo',
        away_team_name: 'Palmeiras',
        kickoff_time: new Date(Date.now() - 86400000).toISOString(),
      },
    });

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Não postada')).toBeInTheDocument();
  });

  it('shows dash for missing odds_at_post, falls back to odds', () => {
    const bet = makeBet({ odds_at_post: null, odds: 2.10 });

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('2.10')).toBeInTheDocument();
  });

  it('calls onSort when clicking sortable column header', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const bet = makeBet();

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={onSort}
      />
    );

    await user.click(screen.getByText(/Postado em/));

    expect(onSort).toHaveBeenCalledWith('telegram_posted_at');
  });

  it('renders championship column with league_name (Story 7-1)', () => {
    const bet = makeBet();

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Campeonato')).toBeInTheDocument();
    expect(screen.getByText('Serie A Brasil')).toBeInTheDocument();
  });

  it('renders dash when league_seasons is missing (Story 7-1)', () => {
    const bet = makeBet({
      league_matches: {
        home_team_name: 'Flamengo',
        away_team_name: 'Palmeiras',
        kickoff_time: new Date(Date.now() + 3600000).toISOString(),
        league_seasons: null,
      },
    });

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders multiple bets correctly', () => {
    const bets = [
      makeBet({ id: 1, league_matches: { home_team_name: 'Flamengo', away_team_name: 'Palmeiras', kickoff_time: new Date().toISOString() } }),
      makeBet({ id: 2, league_matches: { home_team_name: 'Corinthians', away_team_name: 'Santos', kickoff_time: new Date().toISOString() } }),
    ];

    render(
      <PostingHistoryTable
        bets={bets}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Flamengo vs Palmeiras')).toBeInTheDocument();
    expect(screen.getByText('Corinthians vs Santos')).toBeInTheDocument();
  });

  // === New tests for result columns ===

  it('renders Resultado column header', () => {
    const bet = makeBet();

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Resultado')).toBeInTheDocument();
    expect(screen.getByText('Explicação')).toBeInTheDocument();
  });

  it('shows Pendente badge when bet_result is null', () => {
    const bet = makeBet({ bet_result: null });

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('shows Acerto badge for success result', () => {
    const bet = makeBet({ bet_result: 'success' });

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Acerto')).toBeInTheDocument();
  });

  it('shows Erro badge for failure result', () => {
    const bet = makeBet({ bet_result: 'failure' });

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Erro')).toBeInTheDocument();
  });

  it('renders result_reason and result_source', () => {
    const bet = makeBet({
      bet_result: 'success',
      result_reason: 'Score-based: 3-1 final',
      result_source: 'deterministic',
    });

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.getByText('Score-based: 3-1 final')).toBeInTheDocument();
    expect(screen.getByText('Det.')).toBeInTheDocument();
  });

  it('shows edit button when onEditResult is provided', async () => {
    const user = userEvent.setup();
    const onEditResult = vi.fn();
    const bet = makeBet({ bet_result: 'failure' });

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
        onEditResult={onEditResult}
      />
    );

    const editButton = screen.getByTitle('Editar resultado');
    expect(editButton).toBeInTheDocument();

    await user.click(editButton);
    expect(onEditResult).toHaveBeenCalledWith(bet);
  });

  it('does not show edit button when onEditResult is not provided', () => {
    const bet = makeBet();

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    expect(screen.queryByTitle('Editar resultado')).not.toBeInTheDocument();
  });

  it('applies green row class for success bets', () => {
    const bet = makeBet({ bet_result: 'success' });

    const { container } = render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    const row = container.querySelector('tbody tr');
    expect(row?.className).toContain('bg-green-50');
  });

  it('applies red row class for failure bets', () => {
    const bet = makeBet({ bet_result: 'failure' });

    const { container } = render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={vi.fn()}
      />
    );

    const row = container.querySelector('tbody tr');
    expect(row?.className).toContain('bg-red-50');
  });

  it('calls onSort with bet_result when clicking Resultado header', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const bet = makeBet();

    render(
      <PostingHistoryTable
        bets={[bet]}
        sortBy="telegram_posted_at"
        sortDir="desc"
        onSort={onSort}
      />
    );

    await user.click(screen.getByText(/Resultado/));
    expect(onSort).toHaveBeenCalledWith('bet_result');
  });
});
