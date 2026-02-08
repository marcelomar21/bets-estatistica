import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  mockSignInWithPassword,
  mockResetPasswordForEmail,
  mockSupabaseClient,
  resetMocks,
} from '@/test/mocks/supabase';
import {
  mockPush,
  mockRefresh,
  resetNavigationMocks,
} from '@/test/mocks/navigation';

vi.mock('@/lib/supabase', () => ({
  createClient: () => mockSupabaseClient,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

import LoginPage from './page';

describe('LoginPage', () => {
  beforeEach(() => {
    resetMocks();
    resetNavigationMocks();
  });

  it('renders login form with email and password fields', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });

  it('renders "Entrar" submit button', () => {
    render(<LoginPage />);

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('shows "Esqueci minha senha" link', () => {
    render(<LoginPage />);

    expect(
      screen.getByRole('button', { name: 'Esqueci minha senha' })
    ).toBeInTheDocument();
  });

  it('on submit with valid credentials, calls signInWithPassword and redirects to /dashboard', async () => {
    const user = userEvent.setup();
    mockSignInWithPassword.mockResolvedValue({ error: null });

    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Senha'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'admin@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('on submit with invalid credentials, shows "Email ou senha inválidos." error', async () => {
    const user = userEvent.setup();
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials', status: 400 },
    });

    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'wrong@example.com');
    await user.type(screen.getByLabelText('Senha'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByText('Email ou senha inválidos.')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('on generic auth error, shows the actual error message from Supabase', async () => {
    const user = userEvent.setup();
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'User account is disabled', status: 403 },
    });

    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'disabled@example.com');
    await user.type(screen.getByLabelText('Senha'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(
        screen.getByText('Erro de autenticação: User account is disabled')
      ).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows loading state ("Entrando...") while submitting', async () => {
    const user = userEvent.setup();

    let resolveSignIn: (value: { error: null }) => void;
    mockSignInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      })
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Senha'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByRole('button', { name: 'Entrando...' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrando...' })).toBeDisabled();

    resolveSignIn!({ error: null });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('switching to reset mode hides password field and shows "Enviar email de recuperação" button', async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));

    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Enviar email de recuperação' })
    ).toBeInTheDocument();
  });

  it('reset password calls resetPasswordForEmail and shows success message', async () => {
    const user = userEvent.setup();
    mockResetPasswordForEmail.mockResolvedValue({ error: null });

    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.click(
      screen.getByRole('button', { name: 'Enviar email de recuperação' })
    );

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'admin@example.com',
        { redirectTo: `${window.location.origin}/login` }
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          'Email de recuperação enviado! Verifique sua caixa de entrada.'
        )
      ).toBeInTheDocument();
    });
  });

  it('"Voltar ao login" link returns to login mode', async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    // Switch to reset mode
    await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));

    // Verify we are in reset mode
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Voltar ao login' })
    ).toBeInTheDocument();

    // Click "Voltar ao login"
    await user.click(screen.getByRole('button', { name: 'Voltar ao login' }));

    // Verify we returned to login mode
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Esqueci minha senha' })
    ).toBeInTheDocument();
  });
});
