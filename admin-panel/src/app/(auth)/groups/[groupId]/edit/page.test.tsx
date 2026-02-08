import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupEditPage from './page';

const mockPush = vi.fn();
const mockGroupId = 'group-uuid-1';

vi.mock('next/navigation', () => ({
  useParams: () => ({ groupId: mockGroupId }),
  useRouter: () => ({ push: mockPush }),
}));

const sampleGroup = {
  id: 'group-uuid-1',
  name: 'Grupo Teste',
  status: 'active',
  telegram_group_id: -1001234567890,
  telegram_admin_group_id: null,
  checkout_url: null,
  created_at: '2026-02-06T12:00:00Z',
};

describe('GroupEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads group data and pre-fills form', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: sampleGroup }),
    });

    render(<GroupEditPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Nome do Grupo/i)).toHaveValue('Grupo Teste');
    });

    expect(screen.getByLabelText(/Status/i)).toHaveValue('active');
  });

  it('submits form with PUT and redirects on success', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: sampleGroup }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { ...sampleGroup, name: 'Grupo Atualizado' } }),
      });

    render(<GroupEditPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Nome do Grupo/i)).toHaveValue('Grupo Teste');
    });

    const nameInput = screen.getByLabelText(/Nome do Grupo/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Grupo Atualizado');
    await user.click(screen.getByRole('button', { name: /Salvar Alteracoes/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/groups/group-uuid-1');
    });

    const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(putCall[0]).toBe('/api/groups/group-uuid-1');
    expect(putCall[1].method).toBe('PUT');
  });

  it('shows error message on API error', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: sampleGroup }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Nome muito curto' } }),
      });

    const user = userEvent.setup();
    render(<GroupEditPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Nome do Grupo/i)).toHaveValue('Grupo Teste');
    });

    await user.click(screen.getByRole('button', { name: /Salvar Alteracoes/i }));

    await waitFor(() => {
      expect(screen.getByText('Nome muito curto')).toBeInTheDocument();
    });
  });

  it('shows 404 message for non-existent group', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } }),
    });

    render(<GroupEditPage />);

    await waitFor(() => {
      expect(screen.getByText(/Grupo nao encontrado/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Voltar para Grupos/i)).toBeInTheDocument();
  });
});
