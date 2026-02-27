import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BetResultBadge } from '../BetResultBadge';

describe('BetResultBadge', () => {
  it('renders Acerto for success', () => {
    render(<BetResultBadge result="success" />);
    const badge = screen.getByText('Acerto');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-green-100');
  });

  it('renders Erro for failure', () => {
    render(<BetResultBadge result="failure" />);
    const badge = screen.getByText('Erro');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-red-100');
  });

  it('renders Indefinido for unknown', () => {
    render(<BetResultBadge result="unknown" />);
    const badge = screen.getByText('Indefinido');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-yellow-100');
  });

  it('renders Cancelada for cancelled', () => {
    render(<BetResultBadge result="cancelled" />);
    const badge = screen.getByText('Cancelada');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-gray-100');
  });

  it('renders Pendente for null', () => {
    render(<BetResultBadge result={null} />);
    const badge = screen.getByText('Pendente');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-gray-100');
  });
});
