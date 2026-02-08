import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AlertsSection from './AlertsSection';
import type { DashboardAlert } from '@/types/database';

const sampleAlerts: DashboardAlert[] = [
  {
    type: 'bot_offline',
    message: 'Bot do grupo "Alpha" esta offline',
    timestamp: '2026-02-08T10:00:00Z',
    group_name: 'Alpha',
  },
  {
    type: 'group_failed',
    message: 'Onboarding do grupo "Beta" falhou',
    timestamp: '2026-02-08T09:00:00Z',
    group_name: 'Beta',
  },
  {
    type: 'onboarding_completed',
    message: 'Grupo "Gamma" onboarding concluido',
    timestamp: '2026-02-08T08:00:00Z',
    group_name: 'Gamma',
  },
];

describe('AlertsSection', () => {
  it('renders alerts list', () => {
    render(<AlertsSection alerts={sampleAlerts} />);

    expect(screen.getByText('Alertas')).toBeInTheDocument();
    expect(screen.getByText('Bot do grupo "Alpha" esta offline')).toBeInTheDocument();
    expect(screen.getByText('Onboarding do grupo "Beta" falhou')).toBeInTheDocument();
    expect(screen.getByText('Grupo "Gamma" onboarding concluido')).toBeInTheDocument();
  });

  it('shows empty state when no alerts', () => {
    render(<AlertsSection alerts={[]} />);

    expect(screen.getByText('Alertas')).toBeInTheDocument();
    expect(screen.getByText('Nenhum alerta no momento')).toBeInTheDocument();
  });

  it('renders alert icons by type', () => {
    render(<AlertsSection alerts={sampleAlerts} />);

    expect(screen.getByText('🔴')).toBeInTheDocument();
    expect(screen.getByText('🟠')).toBeInTheDocument();
    expect(screen.getByText('🟢')).toBeInTheDocument();
  });

  it('renders formatted datetime for alerts', () => {
    const alerts: DashboardAlert[] = [
      { type: 'bot_offline', message: 'Bot offline', timestamp: '2026-02-08T10:00:00Z', group_name: 'Alpha' },
    ];
    render(<AlertsSection alerts={alerts} />);

    // formatDateTime returns pt-BR format with time
    const dateElements = document.querySelectorAll('.text-xs.text-gray-500');
    expect(dateElements.length).toBeGreaterThan(0);
    expect(dateElements[0].textContent).toBeTruthy();
    expect(dateElements[0].textContent!.length).toBeGreaterThan(5);
  });
});
