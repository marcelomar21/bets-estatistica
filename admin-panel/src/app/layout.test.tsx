import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RootLayout, { metadata } from './layout';

// Mock next/font/google to avoid font loading in tests
vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));

describe('Root Layout', () => {
  describe('metadata', () => {
    it('has correct title', () => {
      expect(metadata.title).toBe('Admin Panel - Bets Estatística');
    });

    it('has correct description', () => {
      expect(metadata.description).toBe(
        'Painel administrativo para gestão de grupos e apostas'
      );
    });
  });

  describe('rendering', () => {
    it('renders children', () => {
      // RootLayout renders <html> and <body>, which Testing Library warns about.
      // We suppress the console.error for this specific test.
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <RootLayout>
          <div data-testid="child-element">Test Child</div>
        </RootLayout>,
        { container: document.documentElement }
      );

      expect(screen.getByTestId('child-element')).toBeInTheDocument();
      expect(screen.getByText('Test Child')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });
});
