import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupForm } from './GroupForm';

describe('GroupForm', () => {
  it('renders all form fields', () => {
    render(<GroupForm onSubmit={vi.fn()} loading={false} error={null} />);

    expect(screen.getByLabelText(/Nome do Grupo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Telegram Group ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Telegram Admin Group ID/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Criar Grupo/i })).toBeInTheDocument();
  });

  it('shows validation error for short name', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GroupForm onSubmit={onSubmit} loading={false} error={null} />);

    await user.type(screen.getByLabelText(/Nome do Grupo/i), 'A');
    await user.click(screen.getByRole('button', { name: /Criar Grupo/i }));

    expect(screen.getByText(/pelo menos 2 caracteres/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with valid data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GroupForm onSubmit={onSubmit} loading={false} error={null} />);

    await user.type(screen.getByLabelText(/Nome do Grupo/i), 'Grupo Novo');
    await user.click(screen.getByRole('button', { name: /Criar Grupo/i }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Grupo Novo' });
  });

  it('displays server error', () => {
    render(
      <GroupForm onSubmit={vi.fn()} loading={false} error="Nome ja existe" />,
    );
    expect(screen.getByText('Nome ja existe')).toBeInTheDocument();
  });

  it('shows loading state on button', () => {
    render(<GroupForm onSubmit={vi.fn()} loading={true} error={null} />);
    const button = screen.getByRole('button', { name: /Criando/i });
    expect(button).toBeDisabled();
  });

  it('validates telegram ID is a number', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GroupForm onSubmit={onSubmit} loading={false} error={null} />);

    await user.type(screen.getByLabelText(/Nome do Grupo/i), 'Grupo Teste');
    await user.type(screen.getByLabelText(/^Telegram Group ID/i), 'not-a-number');
    await user.click(screen.getByRole('button', { name: /Criar Grupo/i }));

    expect(screen.getByText(/deve ser um numero/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
