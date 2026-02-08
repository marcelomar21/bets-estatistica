import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from './Header';

vi.mock('@/app/(auth)/actions', () => ({
  logout: vi.fn(),
}));

describe('Header', () => {
  const defaultProps = {
    userEmail: 'user@example.com',
    onMenuToggle: vi.fn(),
  };

  it('renders user email', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('renders "Sair" logout button', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('Sair')).toBeInTheDocument();
  });

  it('renders hamburger menu button on mobile with md:hidden class', () => {
    const { container } = render(<Header {...defaultProps} />);
    const mobileDiv = container.querySelector('.md\\:hidden');
    expect(mobileDiv).toBeInTheDocument();
    const hamburgerButton = screen.getByLabelText('Abrir menu');
    expect(mobileDiv!.contains(hamburgerButton)).toBe(true);
  });

  it('calls onMenuToggle when clicking hamburger button', () => {
    const onMenuToggle = vi.fn();
    render(<Header userEmail="user@example.com" onMenuToggle={onMenuToggle} />);
    const hamburgerButton = screen.getByLabelText('Abrir menu');
    fireEvent.click(hamburgerButton);
    expect(onMenuToggle).toHaveBeenCalledTimes(1);
  });

  it('"Sair" button is inside a form with logout action', () => {
    render(<Header {...defaultProps} />);
    const sairButton = screen.getByText('Sair');
    expect(sairButton.getAttribute('type')).toBe('submit');
    const form = sairButton.closest('form');
    expect(form).toBeInTheDocument();
  });
});
