import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultEditModal } from '../ResultEditModal';

function makeBet() {
  return {
    id: 42,
    bet_market: 'Over 2.5',
    bet_pick: 'Over',
    bet_result: 'failure' as const,
    result_reason: 'LLM: Gol aos 90 invalidou',
    result_source: 'llm',
    league_matches: {
      home_team_name: 'Flamengo',
      away_team_name: 'Palmeiras',
      kickoff_time: '2026-02-25T20:00:00Z',
    },
  };
}

describe('ResultEditModal', () => {
  it('renders match info and current result', () => {
    render(
      <ResultEditModal
        bet={makeBet()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Editar Resultado')).toBeInTheDocument();
    expect(screen.getByText('Flamengo vs Palmeiras')).toBeInTheDocument();
    expect(screen.getByText('Over 2.5 - Over')).toBeInTheDocument();
    expect(screen.getByText('Erro')).toBeInTheDocument(); // current result badge
    expect(screen.getByText('via LLM')).toBeInTheDocument();
  });

  it('shows validation error when submitting without result', async () => {
    const user = userEvent.setup();

    render(
      <ResultEditModal
        bet={{ ...makeBet(), bet_result: null }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // Type a reason but don't select a result
    await user.type(screen.getByPlaceholderText(/Resultado corrigido/), 'Correcao manual');
    await user.click(screen.getByText('Salvar'));

    expect(screen.getByText('Selecione um resultado')).toBeInTheDocument();
  });

  it('shows validation error when submitting without reason', async () => {
    const user = userEvent.setup();

    render(
      <ResultEditModal
        bet={makeBet()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // Select a result but don't type a reason
    await user.selectOptions(screen.getByRole('combobox'), 'success');
    await user.click(screen.getByText('Salvar'));

    expect(screen.getByText('Informe o motivo da alteração')).toBeInTheDocument();
  });

  it('calls onSave with correct params on valid submission', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ResultEditModal
        bet={makeBet()}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await user.selectOptions(screen.getByRole('combobox'), 'success');
    await user.type(screen.getByPlaceholderText(/Resultado corrigido/), 'Revisao do placar');
    await user.click(screen.getByText('Salvar'));

    expect(onSave).toHaveBeenCalledWith(42, 'success', 'Revisao do placar');
  });

  it('calls onClose when clicking Cancelar', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ResultEditModal
        bet={makeBet()}
        onClose={onClose}
        onSave={vi.fn()}
      />
    );

    await user.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when clicking backdrop', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const { container } = render(
      <ResultEditModal
        bet={makeBet()}
        onClose={onClose}
        onSave={vi.fn()}
      />
    );

    // Click the backdrop (outermost div)
    const backdrop = container.querySelector('.fixed.inset-0');
    if (backdrop) {
      await user.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('shows error when onSave throws', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('Network error'));

    render(
      <ResultEditModal
        bet={makeBet()}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    await user.selectOptions(screen.getByRole('combobox'), 'success');
    await user.type(screen.getByPlaceholderText(/Resultado corrigido/), 'Teste');
    await user.click(screen.getByText('Salvar'));

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });
});
