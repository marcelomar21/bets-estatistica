import { render, screen } from '@testing-library/react';
import DashboardPage from './page';

describe('DashboardPage', () => {
  it('renders "Dashboard" heading', () => {
    render(<DashboardPage />);
    const heading = screen.getByRole('heading', { name: 'Dashboard' });
    expect(heading).toBeInTheDocument();
  });

  it('renders "Bem-vindo ao painel admin." text', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Bem-vindo ao painel admin.')).toBeInTheDocument();
  });

  it('Dashboard heading has correct styling classes', () => {
    render(<DashboardPage />);
    const heading = screen.getByRole('heading', { name: 'Dashboard' });
    expect(heading).toHaveClass('text-2xl', 'font-bold', 'text-gray-900', 'mb-4');
  });
});
