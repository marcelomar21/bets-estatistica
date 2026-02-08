import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotForm } from './BotForm';

function renderForm(overrides?: {
  onSubmit?: (data: { bot_token: string; bot_username: string }) => Promise<void>;
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
    const usernameInput = screen.getByLabelText(/Username/);

    // Type spaces only — passes HTML required but fails JS trim check
    await userEvent.type(tokenInput, '   ');
    await userEvent.type(usernameInput, '@mybot');

    const form = tokenInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Token é obrigatório')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates username min 3 chars', async () => {
    const { onSubmit } = renderForm();

    const tokenInput = screen.getByLabelText(/Token/);
    const usernameInput = screen.getByLabelText(/Username/);

    await userEvent.type(tokenInput, '123:ABC');
    await userEvent.type(usernameInput, 'ab');

    const submitBtn = screen.getByRole('button', { name: /Adicionar Bot/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Username deve ter pelo menos 3 caracteres')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits correct data on valid form', async () => {
    const { onSubmit } = renderForm();

    const tokenInput = screen.getByLabelText(/Token/);
    const usernameInput = screen.getByLabelText(/Username/);

    await userEvent.type(tokenInput, '123456:ABC-DEF');
    await userEvent.type(usernameInput, '@my_bot');

    const submitBtn = screen.getByRole('button', { name: /Adicionar Bot/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        bot_token: '123456:ABC-DEF',
        bot_username: '@my_bot',
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
    const usernameInput = screen.getByLabelText(/Username/) as HTMLInputElement;

    await userEvent.type(tokenInput, 'some-token');
    await userEvent.type(usernameInput, '@somebot');

    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(cancelBtn);

    expect(tokenInput.value).toBe('');
    expect(usernameInput.value).toBe('');
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows loading state on submit button', () => {
    renderForm({ loading: true });

    expect(screen.getByRole('button', { name: /Adicionando/i })).toBeDisabled();
  });
});
