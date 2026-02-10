import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MembersPage from './page';

type MembersApiResponse = {
  success: boolean;
  data: {
    items: Array<{
      id: number;
      telegram_id: number;
      telegram_username: string | null;
      status: 'trial' | 'ativo' | 'inadimplente' | 'removido';
      subscription_ends_at: string | null;
      created_at: string;
      group_id: string | null;
      groups?: { name: string } | null;
    }>;
    pagination: {
      page: number;
      per_page: number;
      total: number;
      total_pages: number;
    };
    counters: {
      total: number;
      trial: number;
      ativo: number;
      vencendo: number;
    };
  };
};

function createJsonResponse(payload: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(payload),
  } as Response;
}

function mockFetchByUrl({
  role = 'group_admin',
  membersByPage,
}: {
  role?: 'super_admin' | 'group_admin';
  membersByPage?: Record<number, MembersApiResponse>;
} = {}) {
  const defaultMembersPage: MembersApiResponse = {
    success: true,
    data: {
      items: [
        {
          id: 1,
          telegram_id: 1001,
          telegram_username: 'alice',
          status: 'ativo',
          subscription_ends_at: '2026-02-12T00:00:00Z',
          created_at: '2026-02-01T00:00:00Z',
          group_id: 'group-1',
          groups: { name: 'Grupo Alpha' },
        },
        {
          id: 2,
          telegram_id: 1002,
          telegram_username: 'bob',
          status: 'trial',
          subscription_ends_at: null,
          created_at: '2026-02-02T00:00:00Z',
          group_id: 'group-1',
          groups: { name: 'Grupo Alpha' },
        },
      ],
      pagination: {
        page: 1,
        per_page: 50,
        total: 2,
        total_pages: 1,
      },
      counters: {
        total: 2,
        trial: 1,
        ativo: 0,
        vencendo: 1,
      },
    },
  };

  return vi.spyOn(global, 'fetch').mockImplementation((input: string | URL | Request) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const parsedUrl = new URL(url, 'http://localhost');

    if (parsedUrl.pathname === '/api/me') {
      return Promise.resolve(createJsonResponse({
        success: true,
        data: { role },
      }));
    }

    if (parsedUrl.pathname === '/api/groups') {
      return Promise.resolve(createJsonResponse({
        success: true,
        data: [
          { id: 'group-1', name: 'Grupo Alpha', status: 'active' },
          { id: 'group-2', name: 'Grupo Beta', status: 'active' },
        ],
      }));
    }

    if (parsedUrl.pathname === '/api/members') {
      const currentPage = Number(parsedUrl.searchParams.get('page') ?? '1');
      const payload = membersByPage?.[currentPage] ?? defaultMembersPage;
      return Promise.resolve(createJsonResponse(payload));
    }

    return Promise.resolve(createJsonResponse({ success: false }, false));
  });
}

describe('/members page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('carrega e renderiza lista de membros com contadores no header', async () => {
    mockFetchByUrl();

    render(<MembersPage />);

    expect(screen.getByRole('heading', { name: 'Membros' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Em Trial')).toBeInTheDocument();
    expect(screen.getAllByText('Ativos').length).toBeGreaterThan(0);
    expect(screen.getByText('Vencendo em 7d')).toBeInTheDocument();
  });

  it('aplica filtro de status', async () => {
    const fetchSpy = mockFetchByUrl();
    render(<MembersPage />);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'trial');

    await waitFor(() => {
      const calledUrls = fetchSpy.mock.calls.map((call) => {
        const input = call[0];
        return typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      });
      expect(calledUrls.some((url) => url.includes('/api/members') && url.includes('status=trial'))).toBe(true);
    });
  });

  it('aplica busca por username', async () => {
    const fetchSpy = mockFetchByUrl();
    render(<MembersPage />);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText('Buscar por username'), 'alice');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      const calledUrls = fetchSpy.mock.calls.map((call) => {
        const input = call[0];
        return typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      });
      expect(calledUrls.some((url) => url.includes('/api/members') && url.includes('search=alice'))).toBe(true);
    });
  });

  it('navega entre páginas na paginação', async () => {
    const fetchSpy = mockFetchByUrl({
      membersByPage: {
        1: {
          success: true,
          data: {
            items: [
              {
                id: 1,
                telegram_id: 1001,
                telegram_username: 'alice',
                status: 'ativo',
                subscription_ends_at: '2026-02-12T00:00:00Z',
                created_at: '2026-02-01T00:00:00Z',
                group_id: 'group-1',
              },
            ],
            pagination: {
              page: 1,
              per_page: 50,
              total: 51,
              total_pages: 2,
            },
            counters: {
              total: 51,
              trial: 20,
              ativo: 25,
              vencendo: 6,
            },
          },
        },
        2: {
          success: true,
          data: {
            items: [
              {
                id: 51,
                telegram_id: 1051,
                telegram_username: 'charlie',
                status: 'trial',
                subscription_ends_at: null,
                created_at: '2026-02-02T00:00:00Z',
                group_id: 'group-1',
              },
            ],
            pagination: {
              page: 2,
              per_page: 50,
              total: 51,
              total_pages: 2,
            },
            counters: {
              total: 51,
              trial: 20,
              ativo: 25,
              vencendo: 6,
            },
          },
        },
      },
    });

    render(<MembersPage />);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() => {
      expect(screen.getByText('charlie')).toBeInTheDocument();
    });

    const calledUrls = fetchSpy.mock.calls.map((call) => {
      const input = call[0];
      return typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    });
    expect(calledUrls.some((url) => url.includes('/api/members') && url.includes('page=2'))).toBe(true);
  });

  it('exibe coluna de grupo para super_admin', async () => {
    mockFetchByUrl({ role: 'super_admin' });

    render(<MembersPage />);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    expect(screen.getByRole('columnheader', { name: /grupo/i })).toBeInTheDocument();
  });

  // Story 3.4: dropdown de grupos tests
  it('dropdown de grupos aparece apenas para super_admin', async () => {
    mockFetchByUrl({ role: 'super_admin' });

    render(<MembersPage />);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Grupo')).toBeInTheDocument();
    });

    const groupDropdown = screen.getByLabelText('Grupo') as HTMLSelectElement;
    expect(groupDropdown).toBeInTheDocument();
    const options = Array.from(groupDropdown.options).map((o) => o.text);
    expect(options).toContain('Todos os grupos');
    expect(options).toContain('Grupo Alpha');
    expect(options).toContain('Grupo Beta');
  });

  it('dropdown NAO aparece para group_admin', async () => {
    mockFetchByUrl({ role: 'group_admin' });

    render(<MembersPage />);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Grupo')).not.toBeInTheDocument();
  });

  it('selecionar grupo atualiza lista de membros com group_id param e reseta paginacao', async () => {
    const fetchSpy = mockFetchByUrl({
      role: 'super_admin',
      membersByPage: {
        1: {
          success: true,
          data: {
            items: [
              {
                id: 1,
                telegram_id: 1001,
                telegram_username: 'alice',
                status: 'ativo',
                subscription_ends_at: '2026-02-12T00:00:00Z',
                created_at: '2026-02-01T00:00:00Z',
                group_id: 'group-1',
                groups: { name: 'Grupo Alpha' },
              },
            ],
            pagination: {
              page: 1,
              per_page: 50,
              total: 51,
              total_pages: 2,
            },
            counters: {
              total: 51,
              trial: 20,
              ativo: 25,
              vencendo: 6,
            },
          },
        },
        2: {
          success: true,
          data: {
            items: [
              {
                id: 51,
                telegram_id: 1051,
                telegram_username: 'charlie',
                status: 'trial',
                subscription_ends_at: null,
                created_at: '2026-02-02T00:00:00Z',
                group_id: 'group-1',
                groups: { name: 'Grupo Alpha' },
              },
            ],
            pagination: {
              page: 2,
              per_page: 50,
              total: 51,
              total_pages: 2,
            },
            counters: {
              total: 51,
              trial: 20,
              ativo: 25,
              vencendo: 6,
            },
          },
        },
      },
    });

    render(<MembersPage />);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Grupo')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() => {
      expect(screen.getByText('charlie')).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByLabelText('Grupo'), 'group-1');

    await waitFor(() => {
      const calledUrls = fetchSpy.mock.calls.map((call) => {
        const input = call[0];
        return typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      });
      expect(calledUrls.some((url) => url.includes('/api/members') && url.includes('page=2'))).toBe(true);
      expect(calledUrls.some((url) => (
        url.includes('/api/members') && url.includes('group_id=group-1') && url.includes('page=1')
      ))).toBe(true);
    });
  });
});
