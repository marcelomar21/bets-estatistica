'use client';

import { logout } from '@/app/(auth)/actions';

interface HeaderProps {
  userEmail: string;
  onMenuToggle?: () => void;
}

export function Header({ userEmail, onMenuToggle }: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-3 md:hidden">
        <button
          onClick={onMenuToggle}
          className="text-gray-600 hover:text-gray-900"
          aria-label="Abrir menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-gray-900">Admin Panel</h2>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{userEmail}</span>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
