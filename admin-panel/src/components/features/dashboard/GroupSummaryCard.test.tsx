import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GroupSummaryCard from './GroupSummaryCard';
import type { DashboardGroupCard } from '@/types/database';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const activeGroup: DashboardGroupCard = {
  id: 'g1',
  name: 'Grupo Alpha',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  active_members: 15,
};

const pausedGroup: DashboardGroupCard = {
  id: 'g2',
  name: 'Grupo Beta',
  status: 'paused',
  created_at: '2026-01-02T00:00:00Z',
  active_members: 0,
};

const failedGroup: DashboardGroupCard = {
  id: 'g3',
  name: 'Grupo Gamma',
  status: 'failed',
  created_at: '2026-01-03T00:00:00Z',
  active_members: 1,
};

describe('GroupSummaryCard', () => {
  it('renders group name and active status badge', () => {
    render(<GroupSummaryCard group={activeGroup} />);

    expect(screen.getByText('Grupo Alpha')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    const badge = screen.getByText('Ativo');
    expect(badge.className).toContain('bg-green-100');
  });

  it('renders paused status badge', () => {
    render(<GroupSummaryCard group={pausedGroup} />);

    expect(screen.getByText('Pausado')).toBeInTheDocument();
    const badge = screen.getByText('Pausado');
    expect(badge.className).toContain('bg-yellow-100');
  });

  it('renders failed status badge', () => {
    render(<GroupSummaryCard group={failedGroup} />);

    expect(screen.getByText('Falhou')).toBeInTheDocument();
    const badge = screen.getByText('Falhou');
    expect(badge.className).toContain('bg-red-100');
  });

  it('renders active members count (plural)', () => {
    render(<GroupSummaryCard group={activeGroup} />);

    expect(screen.getByText('15 membros ativos')).toBeInTheDocument();
  });

  it('renders active members count (singular)', () => {
    render(<GroupSummaryCard group={failedGroup} />);

    expect(screen.getByText('1 membro ativo')).toBeInTheDocument();
  });

  it('links to group detail page', () => {
    render(<GroupSummaryCard group={activeGroup} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/groups/g1');
  });
});
