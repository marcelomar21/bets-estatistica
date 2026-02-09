import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from './Sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
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

describe('Sidebar', () => {
  it('renders desktop sidebar with "Admin Panel" title', () => {
    render(<Sidebar />);
    const titles = screen.getAllByText('Admin Panel');
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Dashboard navigation link', () => {
    render(<Sidebar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders Membros link for super_admin', () => {
    render(<Sidebar role="super_admin" />);
    expect(screen.getByText('Membros')).toBeInTheDocument();
  });

  it('renders Membros link for group_admin', () => {
    render(<Sidebar role="group_admin" />);
    expect(screen.getByText('Membros')).toBeInTheDocument();
  });

  it('oculta links restritos (Grupos, Bots) para group_admin', () => {
    render(<Sidebar role="group_admin" />);
    expect(screen.queryByText('Grupos')).not.toBeInTheDocument();
    expect(screen.queryByText('Bots')).not.toBeInTheDocument();
  });

  it('desktop sidebar has hidden md:flex classes', () => {
    const { container } = render(<Sidebar />);
    const desktopAside = container.querySelector('aside.hidden.md\\:flex');
    expect(desktopAside).toBeInTheDocument();
  });

  it('renders mobile overlay when mobileOpen is true', () => {
    render(<Sidebar mobileOpen={true} onClose={vi.fn()} />);
    const backdrop = document.querySelector('.bg-black\\/50');
    expect(backdrop).toBeInTheDocument();
  });

  it('does not render mobile overlay when mobileOpen is false', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    const backdrop = document.querySelector('.bg-black\\/50');
    expect(backdrop).not.toBeInTheDocument();
  });

  it('calls onClose when clicking backdrop', () => {
    const onClose = vi.fn();
    render(<Sidebar mobileOpen={true} onClose={onClose} />);
    const backdrop = document.querySelector('.bg-black\\/50');
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking close button', () => {
    const onClose = vi.fn();
    render(<Sidebar mobileOpen={true} onClose={onClose} />);
    const closeButton = screen.getByLabelText('Fechar menu');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking a nav link', () => {
    const onClose = vi.fn();
    render(<Sidebar mobileOpen={true} onClose={onClose} />);
    const links = screen.getAllByText('Dashboard');
    fireEvent.click(links[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
