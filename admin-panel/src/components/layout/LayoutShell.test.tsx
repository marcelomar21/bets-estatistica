import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LayoutShell } from './LayoutShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('@/app/(auth)/actions', () => ({
  logout: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

describe('LayoutShell', () => {
  const defaultProps = {
    userEmail: 'admin@example.com',
  };

  it('renders children content', () => {
    render(
      <LayoutShell {...defaultProps}>
        <div data-testid="child-content">Hello World</div>
      </LayoutShell>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders Sidebar and Header', () => {
    render(
      <LayoutShell {...defaultProps}>
        <p>Content</p>
      </LayoutShell>
    );
    // Sidebar and Header both render "Admin Panel" title
    expect(screen.getAllByText('Admin Panel').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    // Header renders user email
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
  });

  it('initially sidebar is closed (no mobile overlay)', () => {
    render(
      <LayoutShell {...defaultProps}>
        <p>Content</p>
      </LayoutShell>
    );
    // When sidebar is closed, there should be no backdrop overlay
    const backdrop = document.querySelector('.bg-black\\/50');
    expect(backdrop).not.toBeInTheDocument();
    // The close menu button should not be present either
    expect(screen.queryByLabelText('Fechar menu')).not.toBeInTheDocument();
  });
});
