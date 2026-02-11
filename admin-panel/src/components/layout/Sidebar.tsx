'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  roles?: ('super_admin' | 'group_admin')[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Membros', href: '/members', icon: '👤' },
  { name: 'Apostas', href: '/bets', icon: '🎯' },
  { name: 'Postagem', href: '/postagem', icon: '📤' },
  { name: 'Grupos', href: '/groups', icon: '👥', roles: ['super_admin'] },
  { name: 'Bots', href: '/bots', icon: '🤖', roles: ['super_admin'] },
  { name: 'Telegram', href: '/settings/telegram', icon: '📱', roles: ['super_admin'] },
];

export interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
  role?: 'super_admin' | 'group_admin';
}

export function Sidebar({ mobileOpen = false, onClose, role }: SidebarProps) {
  const pathname = usePathname();

  const filteredNavigation = navigation.filter(
    (item) => !item.roles || (role && item.roles.includes(role)),
  );

  const navItems = filteredNavigation.map((item) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={onClose}
        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-gray-800 text-white'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
        }`}
      >
        <span>{item.icon}</span>
        {item.name}
      </Link>
    );
  });

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col bg-gray-900">
        <div className="flex items-center h-16 px-6">
          <h2 className="text-lg font-bold text-white">Admin Panel</h2>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1">{navItems}</nav>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="relative z-50 flex w-64 flex-col bg-gray-900">
            <div className="flex items-center justify-between h-16 px-6">
              <h2 className="text-lg font-bold text-white">Admin Panel</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white"
                aria-label="Fechar menu"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 px-4 py-4 space-y-1">{navItems}</nav>
          </aside>
        </div>
      )}
    </>
  );
}
