import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotForm } from './BotForm';

function renderForm(overrides?: {
  onSubmit?: (data: { bot_token: string }) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  onCancel?: () => void;
}) {
  const defaults = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    loading: false,
    error: null,
    onCancel: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  render(<BotForm {...props} />);
  return props;
}

describe('BotForm', () => {
  it('validates required token field', async () => {
    const { onSubmit } = renderForm();

    const tokenInput = screen.getByLabelText(/Token/);

    // Type spaces only — passes HTML required but fails JS trim check
    await userEvent.type(tokenInput, '   ');

    const form = tokenInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Token é obrigatório')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits correct data on valid form', async () => {
    const { onSubmit } = renderForm();

    const tokenInput = screen.getByLabelText(/Token/);

    await userEvent.type(tokenInput, '123456:ABC-DEF');

    const submitBtn = screen.getByRole('button', { name: /Adicionar Bot/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        bot_token: '123456:ABC-DEF',
      });
    });
  });

  it('displays API error inline', () => {
    renderForm({ error: 'Token ou username já existe no pool' });

    expect(screen.getByText('Token ou username já existe no pool')).toBeInTheDocument();
  });

  it('cancel button clears form and calls onCancel', async () => {
    const { onCancel } = renderForm();

    const tokenInput = screen.getByLabelText(/Token/) as HTMLInputElement;

    await userEvent.type(tokenInput, 'some-token');

    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(cancelBtn);

    expect(tokenInput.value).toBe('');
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows loading state on submit button', () => {
    renderForm({ loading: true });

    expect(screen.getByRole('button', { name: /Validando/i })).toBeDisabled();
  });
});
