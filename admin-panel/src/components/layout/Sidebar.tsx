'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useCallback, useMemo } from 'react';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  roles?: ('super_admin' | 'group_admin')[];
}

interface NavModule {
  name: string;
  icon: string;
  roles?: ('super_admin' | 'group_admin')[];
  children: NavItem[];
}

const modules: NavModule[] = [
  {
    name: 'Comunidade',
    icon: '👥',
    children: [
      { name: 'Dashboard', href: '/dashboard', icon: '📊' },
      { name: 'Membros', href: '/members', icon: '👤' },
      { name: 'Mensagens', href: '/messages', icon: '✉️' },
    ],
  },
  {
    name: 'Tipster',
    icon: '🎯',
    children: [
      { name: 'Apostas', href: '/bets', icon: '🎯' },
      { name: 'Postagem', href: '/postagem', icon: '📤' },
      { name: 'Analises', href: '/analyses', icon: '📄' },
      { name: 'Historico', href: '/posting-history', icon: '📋' },
      { name: 'Analytics', href: '/analytics', icon: '📈' },
      { name: 'Tom de Voz', href: '/tone', icon: '🎙️' },
    ],
  },
  {
    name: 'SuperAdmin',
    icon: '🔑',
    roles: ['super_admin'],
    children: [
      { name: 'Jobs', href: '/job-executions', icon: '⚙️', roles: ['super_admin'] },
      { name: 'Grupos', href: '/groups', icon: '👥', roles: ['super_admin'] },
      { name: 'Bots', href: '/bots', icon: '🤖', roles: ['super_admin'] },
      { name: 'WhatsApp', href: '/whatsapp-pool', icon: '📲', roles: ['super_admin'] },
      { name: 'Telegram', href: '/settings/telegram', icon: '📱', roles: ['super_admin'] },
      { name: 'Admin Users', href: '/admin-users', icon: '🔑', roles: ['super_admin'] },
    ],
  },
];

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="2"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
  role?: 'super_admin' | 'group_admin';
}

export function Sidebar({ mobileOpen = false, onClose, role }: SidebarProps) {
  const pathname = usePathname();

  const activeModuleIndex = useMemo(() => {
    return modules.findIndex((mod) =>
      mod.children.some(
        (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
      ),
    );
  }, [pathname]);

  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    if (activeModuleIndex >= 0) {
      initial[activeModuleIndex] = true;
    }
    return initial;
  });

  const toggleModule = useCallback((index: number) => {
    setExpanded((prev) => ({ ...prev, [index]: !prev[index] }));
  }, []);

  const filteredModules = modules.filter(
    (mod) => !mod.roles || (role && mod.roles.includes(role)),
  );

  const renderNav = () =>
    filteredModules.map((mod) => {
      const originalIndex = modules.indexOf(mod);
      const isExpanded = expanded[originalIndex] ?? false;
      const hasActiveChild = mod.children.some(
        (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
      );

      return (
        <div key={mod.name}>
          <button
            onClick={() => toggleModule(originalIndex)}
            className={`flex items-center justify-between w-full px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors ${
              hasActiveChild
                ? 'text-white bg-gray-800/50'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <span>{mod.icon}</span>
              {mod.name}
            </span>
            <ChevronIcon expanded={isExpanded} />
          </button>

          {isExpanded && (
            <div className="ml-3 mt-1 space-y-1 border-l border-gray-700 pl-3">
              {mod.children
                .filter((item) => !item.roles || (role && item.roles.includes(role)))
                .map((item) => {
                  const isActive =
                    pathname === item.href || pathname.startsWith(item.href + '/');
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
                })}
            </div>
          )}
        </div>
      );
    });

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col bg-gray-900">
        <div className="flex items-center h-16 px-6">
          <h2 className="text-lg font-bold text-white">Admin Panel</h2>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-2">{renderNav()}</nav>
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
            <nav className="flex-1 px-4 py-4 space-y-2">{renderNav()}</nav>
          </aside>
        </div>
      )}
    </>
  );
}
