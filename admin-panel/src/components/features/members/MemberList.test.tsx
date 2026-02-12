import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemberList } from './MemberList';
import type { MemberListItem } from '@/types/database';

const baseMembers: MemberListItem[] = [
  {
    id: 1,
    telegram_id: 1001,
    telegram_username: 'alice',
    status: 'ativo',
    subscription_ends_at: '2026-02-12T00:00:00Z',
    created_at: '2026-02-01T00:00:00Z',
    group_id: 'group-1',
    groups: { name: 'Grupo Alpha' },
  },
  {
    id: 2,
    telegram_id: 1002,
    telegram_username: 'bob',
    status: 'trial',
    subscription_ends_at: null,
    created_at: '2026-02-02T00:00:00Z',
    group_id: 'group-1',
    groups: { name: 'Grupo Alpha' },
  },
];

describe('MemberList', () => {
  it('renderiza colunas padrão e membros', () => {
    render(<MemberList members={baseMembers} role="group_admin" />);

    expect(screen.getByText('Nome Telegram')).toBeInTheDocument();
    expect(screen.getByText('Telegram ID')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Data de Entrada')).toBeInTheDocument();
    expect(screen.getByText('Vencimento')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('exibe coluna Grupo para super_admin', () => {
    render(<MemberList members={baseMembers} role="super_admin" />);

    expect(screen.getByText('Grupo')).toBeInTheDocument();
    expect(screen.getAllByText('Grupo Alpha').length).toBeGreaterThan(0);
  });

  it('não exibe coluna Grupo para group_admin', () => {
    render(<MemberList members={baseMembers} role="group_admin" />);

    expect(screen.queryByText('Grupo')).not.toBeInTheDocument();
  });

  it('exibe badge de status visual "Vencendo" quando aplicável', () => {
    render(<MemberList members={baseMembers} role="group_admin" />);

    expect(screen.getByText('Vencendo')).toBeInTheDocument();
    expect(screen.getByText('Trial')).toBeInTheDocument();
  });

  it('renderiza estado vazio quando não há membros', () => {
    render(<MemberList members={[]} role="group_admin" />);

    expect(screen.getByText('Nenhum membro encontrado')).toBeInTheDocument();
  });
});
