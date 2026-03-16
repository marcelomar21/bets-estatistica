import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommunitySettingsForm from './CommunitySettingsForm';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const baseProps = {
  groupId: 'group-1',
  initialTrialDays: 7,
  initialPrice: 'R$ 49,90/mês',
};

describe('CommunitySettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders fields with initial values', () => {
    render(<CommunitySettingsForm {...baseProps} />);

    const trialInput = screen.getByLabelText('Dias de trial') as HTMLInputElement;
    const priceInput = screen.getByLabelText('Preço da assinatura') as HTMLInputElement;

    expect(trialInput.value).toBe('7');
    expect(priceInput.value).toBe('R$ 49,90/mês');
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

  it('calls PUT with updated data when save is clicked', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} }),
    });

    render(<CommunitySettingsForm {...baseProps} />);

    const trialInput = screen.getByLabelText('Dias de trial');
    fireEvent.change(trialInput, { target: { value: '5' } });

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
    expect(body.trial_days).toBe(5);
    // F18: Only changed fields are sent — subscription_price was not changed
    expect(body.subscription_price).toBeUndefined();
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

    const priceInput = screen.getByLabelText('Preço da assinatura') as HTMLInputElement;
    expect(priceInput.value).toBe('');
  });
});
