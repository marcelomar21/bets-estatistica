import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatCard from './StatCard';

describe('StatCard', () => {
  it('renders title and value', () => {
    render(<StatCard title="Grupos Ativos" value={5} />);

    expect(screen.getByText('Grupos Ativos')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<StatCard title="Bots" value={3} subtitle="10 total" />);

    expect(screen.getByText('10 total')).toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    render(<StatCard title="Membros" value={42} />);

    expect(screen.queryByText('total')).not.toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<StatCard title="Test" value={1} icon="🤖" />);

    expect(screen.getByText('🤖')).toBeInTheDocument();
  });
});
