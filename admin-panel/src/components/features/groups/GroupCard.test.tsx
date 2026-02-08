import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GroupCard } from './GroupCard';
import type { GroupListItem } from '@/types/database';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const baseGroup: GroupListItem = {
  id: 'uuid-1',
  name: 'Grupo Teste',
  telegram_group_id: null,
  telegram_admin_group_id: null,
  checkout_url: null,
  status: 'active',
  created_at: '2026-01-15T10:00:00Z',
};

describe('GroupCard', () => {
  it('renders group name', () => {
    render(<GroupCard group={baseGroup} />);
    expect(screen.getByText('Grupo Teste')).toBeInTheDocument();
  });

  it('renders status badge with correct label', () => {
    render(<GroupCard group={baseGroup} />);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('renders formatted date in PT-BR', () => {
    render(<GroupCard group={baseGroup} />);
    // 15/01/2026 format
    expect(screen.getByText(/15\/01\/2026/)).toBeInTheDocument();
  });

  it('links to group detail page', () => {
    render(<GroupCard group={baseGroup} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/groups/uuid-1');
  });

  it.each([
    ['active', 'Ativo'],
    ['paused', 'Pausado'],
    ['inactive', 'Inativo'],
    ['creating', 'Criando'],
    ['failed', 'Falhou'],
  ] as const)('renders %s status as "%s"', (status, label) => {
    render(<GroupCard group={{ ...baseGroup, status }} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
