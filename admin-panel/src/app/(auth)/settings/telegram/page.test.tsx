import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TelegramSettingsPage from './page';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TelegramSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: sessions and bot config load
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) }) // GET sessions
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: null }) }); // GET bot config
  });

  it('renders page title and all sections', async () => {
    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Configurações Telegram' })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Sessão MTProto' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bot Super Admin' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Convidados Adicionais' })).toBeInTheDocument();
  });

  it('shows empty sessions message when no sessions exist', async () => {
    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Nenhuma sessão configurada')).toBeInTheDocument();
    });
  });

  it('shows sessions list when sessions exist', async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: [
            { id: 's1', phone_number: '+5511999', label: 'founder_test', is_active: true, requires_reauth: false },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: null }) });

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('founder_test')).toBeInTheDocument();
    });

    expect(screen.getByText('+5511999')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeInTheDocument();
  });

  it('shows session requiring re-auth with status badge', async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: [
            { id: 's1', phone_number: '+5511999', label: 'founder_reauth', is_active: true, requires_reauth: true },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: null }) });

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Requer Re-auth')).toBeInTheDocument();
    });
  });

  it('sends code on phone number submit', async () => {
    const user = userEvent.setup();

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Número do Telefone/)).toBeInTheDocument();
    });

    // Mock the POST /api/mtproto/setup call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { setup_token: 'tok-1', phone_hash: 'hash' },
      }),
    });

    await user.type(screen.getByLabelText(/Número do Telefone/), '+5511999999999');
    await user.click(screen.getByRole('button', { name: 'Enviar Código' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Código de Verificação')).toBeInTheDocument();
    });
  });

  it('shows error when send code fails', async () => {
    const user = userEvent.setup();

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Número do Telefone/)).toBeInTheDocument();
    });

    // Mock the POST /api/mtproto/setup to fail
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        error: { message: 'Formato inválido' },
      }),
    });

    await user.type(screen.getByLabelText(/Número do Telefone/), '+55abc');
    await user.click(screen.getByRole('button', { name: 'Enviar Código' }));

    await waitFor(() => {
      expect(screen.getByText('Formato inválido')).toBeInTheDocument();
    });
  });

  it('verifies code and refreshes sessions', async () => {
    const user = userEvent.setup();

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Número do Telefone/)).toBeInTheDocument();
    });

    // Mock POST /api/mtproto/setup (send code)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { setup_token: 'tok-1', phone_hash: 'hash' },
      }),
    });

    await user.type(screen.getByLabelText(/Número do Telefone/), '+5511999999999');
    await user.click(screen.getByRole('button', { name: 'Enviar Código' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Código de Verificação')).toBeInTheDocument();
    });

    // Mock POST /api/mtproto/verify (verify code) — success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { session_id: 's-new' } }),
    });
    // Mock GET /api/mtproto/sessions (refresh after verify)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    });

    await user.type(screen.getByLabelText('Código de Verificação'), '12345');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));

    // After success, form resets to idle — phone input becomes visible again
    await waitFor(() => {
      expect(screen.getByLabelText(/Número do Telefone/)).toBeInTheDocument();
    });
  });

  it('shows 2FA field when required', async () => {
    const user = userEvent.setup();

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Número do Telefone/)).toBeInTheDocument();
    });

    // Mock POST /api/mtproto/setup (send code)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { setup_token: 'tok-1', phone_hash: 'hash' },
      }),
    });

    await user.type(screen.getByLabelText(/Número do Telefone/), '+5511999999999');
    await user.click(screen.getByRole('button', { name: 'Enviar Código' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Código de Verificação')).toBeInTheDocument();
    });

    // Mock POST /api/mtproto/verify — 2FA required
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        error: { code: 'MTPROTO_2FA_REQUIRED', message: 'Senha 2FA necessária' },
      }),
    });

    await user.type(screen.getByLabelText('Código de Verificação'), '12345');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Senha 2FA')).toBeInTheDocument();
    });
  });

  it('deactivates session on click', async () => {
    const user = userEvent.setup();

    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: [
            { id: 's1', phone_number: '+5511999', label: 'founder_test', is_active: true, requires_reauth: false },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: null }) });

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('founder_test')).toBeInTheDocument();
    });

    // Mock DELETE /api/mtproto/sessions/s1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    // Mock GET /api/mtproto/sessions (refresh after delete)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    });

    await user.click(screen.getByRole('button', { name: 'Desativar' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/mtproto/sessions/s1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('saves bot configuration', async () => {
    const user = userEvent.setup();

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Bot Token/)).toBeInTheDocument();
    });

    // Mock POST /api/super-admin-bot (save config)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { id: 'b1' } }),
    });
    // Mock GET /api/super-admin-bot (refresh after save)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { bot_username: 'mybot', founder_chat_ids: [123] },
      }),
    });

    await user.type(screen.getByLabelText(/Bot Token/), '123456789:ABCdef');
    await user.type(screen.getByLabelText(/Founder Chat IDs/), '123, 456');
    await user.click(screen.getByRole('button', { name: 'Salvar Configuração' }));

    await waitFor(() => {
      expect(screen.getByText('Configuração salva com sucesso!')).toBeInTheDocument();
    });
  });

  it('shows error for invalid founder chat IDs', async () => {
    const user = userEvent.setup();

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Bot Token/)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Bot Token/), '123456789:ABCdef');
    await user.type(screen.getByLabelText(/Founder Chat IDs/), 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar Configuração' }));

    await waitFor(() => {
      expect(screen.getByText('Pelo menos um Founder Chat ID é necessário')).toBeInTheDocument();
    });
  });

  it('shows bot config when loaded', async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { bot_username: 'superbot', founder_chat_ids: [111, 222] },
        }),
      });

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/@superbot/)).toBeInTheDocument();
    });

    expect(screen.getByText(/2 founder\(s\)/)).toBeInTheDocument();
  });

  it('tests notification reachability', async () => {
    const user = userEvent.setup();

    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { bot_username: 'superbot', founder_chat_ids: [111, 222] },
        }),
      });

    render(<TelegramSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Testar Notificação' })).toBeInTheDocument();
    });

    // Mock POST /api/super-admin-bot/test
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          results: [
            { chatId: 111, reachable: true },
            { chatId: 222, reachable: false, error: 'Chat not found' },
          ],
        },
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Testar Notificação' }));

    await waitFor(() => {
      expect(screen.getByText('Resultado do Teste')).toBeInTheDocument();
    });

    expect(screen.getByText(/Chat 111: OK/)).toBeInTheDocument();
    expect(screen.getByText(/Chat 222: Falha/)).toBeInTheDocument();
  });
});
