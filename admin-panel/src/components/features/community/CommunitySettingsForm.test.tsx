import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommunitySettingsForm from './CommunitySettingsForm';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const baseProps = {
  groupId: 'group-1',
  initialTrialDays: 7,
  initialPrice: 49.9 as number | null,
};

describe('CommunitySettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders fields with initial values', () => {
    render(<CommunitySettingsForm {...baseProps} />);

    const trialInput = screen.getByLabelText('Dias de trial') as HTMLInputElement;
    const priceInput = screen.getByLabelText('Preço da assinatura (R$)') as HTMLInputElement;

    expect(trialInput.value).toBe('7');
    expect(priceInput.value).toBe('49.9');
  });

  it('shows formatted BRL preview when price is set', () => {
    render(<CommunitySettingsForm {...baseProps} />);

    // Intl.NumberFormat uses non-breaking space (\u00a0) between R$ and value
    expect(screen.getByText(/R\$\s49,90/)).toBeInTheDocument();
  });

  it('disables save button when no changes', () => {
    render(<CommunitySettingsForm {...baseProps} />);

    const saveBtn = screen.getByRole('button', { name: 'Salvar' });
    expect(saveBtn).toBeDisabled();
  });

  it('enables save button when values change', () => {
    render(<CommunitySettingsForm {...baseProps} />);

    const trialInput = screen.getByLabelText('Dias de trial');
    fireEvent.change(trialInput, { target: { value: '5' } });

    const saveBtn = screen.getByRole('button', { name: 'Salvar' });
    expect(saveBtn).not.toBeDisabled();
  });

  it('clamps trial_days to 1-30 range', () => {
    render(<CommunitySettingsForm {...baseProps} />);

    const trialInput = screen.getByLabelText('Dias de trial') as HTMLInputElement;

    fireEvent.change(trialInput, { target: { value: '0' } });
    expect(trialInput.value).toBe('1');

    fireEvent.change(trialInput, { target: { value: '50' } });
    expect(trialInput.value).toBe('30');
  });

  it('calls PUT with numeric price when save is clicked', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} }),
    });

    render(<CommunitySettingsForm {...baseProps} />);

    const priceInput = screen.getByLabelText('Preço da assinatura (R$)');
    fireEvent.change(priceInput, { target: { value: '39.90' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/groups/group-1/community-settings',
        expect.objectContaining({
          method: 'PUT',
        }),
      );
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.subscription_price).toBe(39.9);
    expect(typeof body.subscription_price).toBe('number');
    // F18: Only changed fields are sent
    expect(body.trial_days).toBeUndefined();
  });

  it('shows success toast after save', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} }),
    });

    render(<CommunitySettingsForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText('Dias de trial'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(screen.getByText('Configurações salvas com sucesso')).toBeInTheDocument();
    });
  });

  it('shows error toast on API failure', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, error: { message: 'DB error' } }),
    });

    render(<CommunitySettingsForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText('Dias de trial'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(screen.getByText('DB error')).toBeInTheDocument();
    });
  });

  it('renders with null initial price', () => {
    render(<CommunitySettingsForm {...baseProps} initialPrice={null} />);

    const priceInput = screen.getByLabelText('Preço da assinatura (R$)') as HTMLInputElement;
    expect(priceInput.value).toBe('');
  });

  it('shows warning toast when MP sync fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {}, warning: 'MP sync failed' }),
    });

    render(<CommunitySettingsForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText('Preço da assinatura (R$)'), { target: { value: '39.90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(screen.getByText('MP sync failed')).toBeInTheDocument();
    });
  });
});
