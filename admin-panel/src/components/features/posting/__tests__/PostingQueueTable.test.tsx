import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostingQueueTable } from '../PostingQueueTable';
import type { QueueBet } from '../PostingQueueTable';

function makeBet(overrides: Partial<QueueBet> = {}): QueueBet {
  return {
    id: 1,
    bet_market: 'Over 2.5',
    bet_pick: 'Over',
    bet_status: 'ready',
    odds: 1.85,
    has_link: true,
    deep_link: 'https://example.com/bet/1',
    promovida_manual: false,
    elegibilidade: undefined,
    post_at: null,
    posting_status: undefined,
    telegram_posted_at: null,
    hit_rate: { rate: 65, wins: 13, total: 20 },
    match: {
      home_team_name: 'Flamengo',
      away_team_name: 'Palmeiras',
      kickoff_time: new Date(Date.now() + 3600000).toISOString(),
    },
    ...overrides,
  };
}

const bet1 = makeBet({ id: 10 });
const bet2 = makeBet({ id: 20, match: { home_team_name: 'Santos', away_team_name: 'Corinthians', kickoff_time: new Date(Date.now() + 7200000).toISOString() } });
const bet3 = makeBet({ id: 30, match: { home_team_name: 'Gremio', away_team_name: 'Inter', kickoff_time: new Date(Date.now() + 10800000).toISOString() } });

describe('PostingQueueTable - Checkbox Selection', () => {
  it('renders a checkbox in the header row when selectedIds and onSelectionChange are provided', () => {
    const onSelectionChange = vi.fn();
    render(
      <PostingQueueTable
        bets={[bet1, bet2]}
        selectedIds={new Set([10, 20])}
        onSelectionChange={onSelectionChange}
      />
    );

    const headerCheckbox = screen.getByLabelText('Selecionar todas');
    expect(headerCheckbox).toBeInTheDocument();
    expect(headerCheckbox).toBeChecked();
  });

  it('renders a checkbox in each body row when selectedIds and onSelectionChange are provided', () => {
    const onSelectionChange = vi.fn();
    render(
      <PostingQueueTable
        bets={[bet1, bet2, bet3]}
        selectedIds={new Set([10])}
        onSelectionChange={onSelectionChange}
      />
    );

    const row10 = screen.getByLabelText('Selecionar aposta 10');
    const row20 = screen.getByLabelText('Selecionar aposta 20');
    const row30 = screen.getByLabelText('Selecionar aposta 30');
    expect(row10).toBeChecked();
    expect(row20).not.toBeChecked();
    expect(row30).not.toBeChecked();
  });

  it('clicking the header checkbox when not all selected calls onSelectionChange with all bet IDs', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <PostingQueueTable
        bets={[bet1, bet2, bet3]}
        selectedIds={new Set([10])}
        onSelectionChange={onSelectionChange}
      />
    );

    const headerCheckbox = screen.getByLabelText('Selecionar todas');
    await user.click(headerCheckbox);

    expect(onSelectionChange).toHaveBeenCalledWith(new Set([10, 20, 30]));
  });

  it('clicking the header checkbox when all selected calls onSelectionChange with empty Set', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <PostingQueueTable
        bets={[bet1, bet2]}
        selectedIds={new Set([10, 20])}
        onSelectionChange={onSelectionChange}
      />
    );

    const headerCheckbox = screen.getByLabelText('Selecionar todas');
    await user.click(headerCheckbox);

    expect(onSelectionChange).toHaveBeenCalledWith(new Set());
  });

  it('clicking a row checkbox toggles that bet ID in the Set passed to onSelectionChange', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <PostingQueueTable
        bets={[bet1, bet2]}
        selectedIds={new Set([10])}
        onSelectionChange={onSelectionChange}
      />
    );

    // Deselect bet 10
    const row10 = screen.getByLabelText('Selecionar aposta 10');
    await user.click(row10);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set());

    onSelectionChange.mockClear();

    // Select bet 20
    const row20 = screen.getByLabelText('Selecionar aposta 20');
    await user.click(row20);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set([10, 20]));
  });

  it('renders no checkboxes when selectedIds and onSelectionChange are NOT provided (pendentes table)', () => {
    render(
      <PostingQueueTable
        bets={[bet1, bet2]}
      />
    );

    expect(screen.queryByLabelText('Selecionar todas')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Selecionar aposta 10')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Selecionar aposta 20')).not.toBeInTheDocument();
  });

  it('selected rows have bg-blue-50 highlight class', () => {
    render(
      <PostingQueueTable
        bets={[bet1, bet2]}
        selectedIds={new Set([10])}
        onSelectionChange={vi.fn()}
      />
    );

    // bet1 (id=10) should have bg-blue-50
    const row10 = screen.getByLabelText('Selecionar aposta 10');
    const tr10 = row10.closest('tr');
    expect(tr10?.className).toContain('bg-blue-50');

    // bet2 (id=20) should NOT have bg-blue-50
    const row20 = screen.getByLabelText('Selecionar aposta 20');
    const tr20 = row20.closest('tr');
    expect(tr20?.className).not.toContain('bg-blue-50');
  });
});
