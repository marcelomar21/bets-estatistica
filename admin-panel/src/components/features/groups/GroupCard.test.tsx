import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupCard } from './GroupCard';
import type { GroupListItem } from '@/types/database';

// Mock next/navigation
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const baseGroup: GroupListItem = {
  id: 'uuid-1',
  name: 'Grupo Teste',
  telegram_group_id: null,
  telegram_admin_group_id: null,
  telegram_invite_link: null,
  checkout_url: null,
  posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] },
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

  it('navigates to group detail page on click', () => {
    pushMock.mockClear();
    render(<GroupCard group={baseGroup} />);
    const card = screen.getByRole('link');
    fireEvent.click(card);
    expect(pushMock).toHaveBeenCalledWith('/groups/uuid-1');
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
