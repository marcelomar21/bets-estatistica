import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingWizard } from './OnboardingWizard';

const mockFetch = vi.fn();
global.fetch = mockFetch;

let mockWriteText: ReturnType<typeof vi.fn>;

const BOTS_RESPONSE = {
  success: true,
  data: [
    { id: 'bot-1', bot_username: 'testbot', status: 'available' },
    { id: 'bot-2', bot_username: 'usedbot', status: 'in_use' },
  ],
};

const EMPTY_BOTS_RESPONSE = { success: true, data: [] };

const NO_INCOMPLETE_GROUPS = { success: true, data: [] };

/** Mocks the two initial fetches: checkIncomplete (groups) + loadBots */
function mockInitialFetches(botsResponse = BOTS_RESPONSE) {
  // Call 1: GET /api/groups (checkIncomplete)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(NO_INCOMPLETE_GROUPS),
  });
  // Call 2: GET /api/bots (loadBots)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(botsResponse),
  });
}

function mockStepResponses() {
  // Step 1: creating
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { group_id: 'group-1', bot_username: 'testbot' } }),
  });
  // Step 2: validating_bot
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { bot_username: 'testbot' } }),
  });
  // Step 3: configuring_mp
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { checkout_url: 'http://mp.com/checkout' } }),
  });
  // Step 4: deploying_bot
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { service_id: 'srv-1' } }),
  });
  // Step 5: creating_admin
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { admin_email: 'test@test.com', temp_password: 'TempPass123!' } }),
  });
  // Step 6: creating_telegram_group
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { telegram_invite_link: 'https://t.me/+abc123' } }),
  });
  // Step 7: finalizing
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      success: true,
      data: {
        group: { id: 'group-1', name: 'Canal do João', status: 'active', checkout_url: 'http://mp.com/checkout' },
      },
    }),
  });
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText = vi.fn().mockResolvedValue(undefined);
    // jsdom doesn't implement navigator.clipboard, so we define it
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        configurable: true,
      });
    } else {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        value: mockWriteText,
        configurable: true,
      });
    }
  });

  it('renders form with all fields', async () => {
    mockInitialFetches();

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando bots...')).not.toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Nome do Influencer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email do Influencer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Bot do Telegram/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Preço da Assinatura/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar Onboarding/i })).toBeInTheDocument();
  });

  it('shows message when no bots are available', async () => {
    mockInitialFetches(EMPTY_BOTS_RESPONSE);

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(screen.getByText(/Nenhum bot disponível/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Iniciar Onboarding/i })).toBeDisabled();
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    mockInitialFetches();

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando bots...')).not.toBeInTheDocument();
    });

    // Submit empty form
    await user.click(screen.getByRole('button', { name: /Iniciar Onboarding/i }));

    expect(screen.getByText(/Nome deve ter pelo menos 2 caracteres/i)).toBeInTheDocument();
    expect(screen.getByText(/Email inválido/i)).toBeInTheDocument();
    expect(screen.getByText(/Selecione um bot/i, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/Preço deve ser pelo menos/i)).toBeInTheDocument();

    // Only 2 fetch calls (checkIncomplete + loadBots), no onboarding calls
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('progresses through steps during sequential execution', async () => {
    const user = userEvent.setup();

    mockInitialFetches();

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando bots...')).not.toBeInTheDocument();
    });

    // Fill form
    await user.type(screen.getByLabelText(/Nome do Influencer/i), 'Canal do João');
    await user.type(screen.getByLabelText(/Email do Influencer/i), 'test@test.com');
    await user.selectOptions(screen.getByLabelText(/Bot do Telegram/i), 'bot-1');
    await user.type(screen.getByLabelText(/Preço da Assinatura/i), '29.90');

    // Mock all 7 step responses
    mockStepResponses();

    await user.click(screen.getByRole('button', { name: /Iniciar Onboarding/i }));

    // Wait for success state
    await waitFor(() => {
      expect(screen.getByText('Onboarding Concluído!')).toBeInTheDocument();
    });

    // Stepper should show all steps as done
    expect(screen.getByText('Criando Grupo')).toBeInTheDocument();
    expect(screen.getByText('Validando Bot')).toBeInTheDocument();
    expect(screen.getByText('Config. Mercado Pago')).toBeInTheDocument();
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument();
    expect(screen.getByText('Criando Admin')).toBeInTheDocument();
    expect(screen.getByText('Criando Grupo Telegram')).toBeInTheDocument();
    expect(screen.getByText('Concluído')).toBeInTheDocument();
  });

  it('shows success screen with credentials', async () => {
    const user = userEvent.setup();

    mockInitialFetches();

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando bots...')).not.toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Nome do Influencer/i), 'Canal do João');
    await user.type(screen.getByLabelText(/Email do Influencer/i), 'test@test.com');
    await user.selectOptions(screen.getByLabelText(/Bot do Telegram/i), 'bot-1');
    await user.type(screen.getByLabelText(/Preço da Assinatura/i), '29.90');

    mockStepResponses();

    await user.click(screen.getByRole('button', { name: /Iniciar Onboarding/i }));

    await waitFor(() => {
      expect(screen.getByText('Onboarding Concluído!')).toBeInTheDocument();
    });

    expect(screen.getByText('Canal do João')).toBeInTheDocument();
    expect(screen.getByText('@testbot')).toBeInTheDocument();
    expect(screen.getByText('test@test.com')).toBeInTheDocument();
    expect(screen.getByText('TempPass123!')).toBeInTheDocument();
    expect(screen.getByText('http://mp.com/checkout')).toBeInTheDocument();
  });

  it('shows error with retry and start-over buttons when a step fails', async () => {
    const user = userEvent.setup();

    mockInitialFetches();

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando bots...')).not.toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Nome do Influencer/i), 'Canal do João');
    await user.type(screen.getByLabelText(/Email do Influencer/i), 'test@test.com');
    await user.selectOptions(screen.getByLabelText(/Bot do Telegram/i), 'bot-1');
    await user.type(screen.getByLabelText(/Preço da Assinatura/i), '29.90');

    // Step 1 succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { group_id: 'group-1', bot_username: 'testbot' } }),
    });
    // Step 2 succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { bot_username: 'testbot' } }),
    });
    // Step 3 fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({
        success: false,
        error: { code: 'ONBOARDING_FAILED', message: 'Falha ao configurar Mercado Pago: MP error', step: 'configuring_mp', group_id: 'group-1' },
      }),
    });

    await user.click(screen.getByRole('button', { name: /Iniciar Onboarding/i }));

    await waitFor(() => {
      expect(screen.getByText(/Falha ao configurar Mercado Pago/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Tentar Novamente/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recomeçar do Zero/i })).toBeInTheDocument();

    // Now retry - remaining steps succeed
    // Step 3 (configuring_mp retry)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { checkout_url: 'http://mp.com/checkout' } }),
    });
    // Step 4: deploying_bot
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { service_id: 'srv-1' } }),
    });
    // Step 5: creating_admin
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { admin_email: 'test@test.com', temp_password: 'TempPass123!' } }),
    });
    // Step 6: creating_telegram_group
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { telegram_invite_link: 'https://t.me/+abc123' } }),
    });
    // Step 7: finalizing
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          group: { id: 'group-1', name: 'Canal do João', status: 'active', checkout_url: 'http://mp.com/checkout' },
        },
      }),
    });

    await user.click(screen.getByRole('button', { name: /Tentar Novamente/i }));

    await waitFor(() => {
      expect(screen.getByText('Onboarding Concluído!')).toBeInTheDocument();
    });
  });

  it('shows incomplete onboarding banner when a failed group exists', async () => {
    // URL-based mock routing (concurrent useEffects make ordering unpredictable)
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/groups') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ id: 'group-failed', name: 'Grupo Falho', status: 'failed' }],
          }),
        });
      }
      if (url === '/api/groups/group-failed') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { id: 'group-failed', name: 'Grupo Falho', status: 'failed', mp_plan_id: null, render_service_id: null, telegram_group_id: null },
          }),
        });
      }
      if (url === '/api/bots') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{ id: 'bot-1', bot_username: 'testbot', status: 'available', group_id: 'group-failed' }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) });
    });

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(screen.getByText(/Onboarding incompleto encontrado/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Grupo Falho/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retomar Onboarding/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Descartar e Começar do Zero/i })).toBeInTheDocument();
  });

  it('copies credentials to clipboard', async () => {
    const user = userEvent.setup();

    mockInitialFetches();

    render(<OnboardingWizard />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando bots...')).not.toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Nome do Influencer/i), 'Canal do João');
    await user.type(screen.getByLabelText(/Email do Influencer/i), 'test@test.com');
    await user.selectOptions(screen.getByLabelText(/Bot do Telegram/i), 'bot-1');
    await user.type(screen.getByLabelText(/Preço da Assinatura/i), '29.90');

    mockStepResponses();

    await user.click(screen.getByRole('button', { name: /Iniciar Onboarding/i }));

    await waitFor(() => {
      expect(screen.getByText('Onboarding Concluído!')).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /Copiar Credenciais/i });
    await user.click(copyBtn);

    await waitFor(() => {
      expect(screen.getByText('Copiado!')).toBeInTheDocument();
    });

    expect(mockWriteText).toHaveBeenCalledTimes(1);
    const clipboardText = mockWriteText.mock.calls[0][0] as string;
    expect(clipboardText).toContain('Email: test@test.com');
    expect(clipboardText).toContain('Senha: TempPass123!');
    expect(clipboardText).toContain('Bot: @testbot');
    expect(clipboardText).toContain('Checkout: http://mp.com/checkout');
  });
});
