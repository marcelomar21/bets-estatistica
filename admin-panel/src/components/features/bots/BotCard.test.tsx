import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BotCard } from './BotCard';
import type { BotPoolListItem } from '@/types/database';

const availableBot: BotPoolListItem = {
  id: 'bot-1',
  bot_username: '@test_bot',
  status: 'available',
  group_id: null,
  created_at: '2026-02-08T12:00:00Z',
  groups: null,
};

const inUseBot: BotPoolListItem = {
  id: 'bot-2',
  bot_username: '@used_bot',
  status: 'in_use',
  group_id: 'group-1',
  created_at: '2026-02-07T10:30:00Z',
  groups: { name: 'Grupo Influencer' },
};

describe('BotCard', () => {
  it('renders available bot with green badge', () => {
    render(<BotCard bot={availableBot} />);

    expect(screen.getByText('@test_bot')).toBeInTheDocument();
    expect(screen.getByText('Disponível')).toBeInTheDocument();

    const badge = screen.getByText('Disponível');
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('renders in_use bot with blue badge and group name', () => {
    render(<BotCard bot={inUseBot} />);

    expect(screen.getByText('@used_bot')).toBeInTheDocument();
    expect(screen.getByText('Em Uso')).toBeInTheDocument();
    expect(screen.getByText('Grupo: Grupo Influencer')).toBeInTheDocument();

    const badge = screen.getByText('Em Uso');
    expect(badge.className).toContain('bg-blue-100');
    expect(badge.className).toContain('text-blue-800');
  });

  it('renders formatted creation date', () => {
    render(<BotCard bot={availableBot} />);

    const dateElement = screen.getByText(/Criado em/);
    expect(dateElement).toBeInTheDocument();
    // Verify date contains year regardless of locale format
    expect(dateElement.textContent).toContain('2026');
  });

  it('does not show group name for available bot', () => {
    render(<BotCard bot={availableBot} />);

    expect(screen.queryByText(/Grupo:/)).not.toBeInTheDocument();
  });
});
