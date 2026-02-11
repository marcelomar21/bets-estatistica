import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostNowButton } from '../PostNowButton';
import { PostingQueueCard } from '../PostingQueueCard';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('PostNowButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders disabled when readyCount is 0', () => {
    render(<PostNowButton readyCount={0} onPostComplete={vi.fn()} />);
    const button = screen.getByRole('button', { name: /postar agora/i });
    expect(button).toBeDisabled();
  });

  it('renders enabled when readyCount > 0', () => {
    render(<PostNowButton readyCount={3} onPostComplete={vi.fn()} />);
    const button = screen.getByRole('button', { name: /postar agora/i });
    expect(button).not.toBeDisabled();
  });

  it('shows confirmation dialog on click', async () => {
    const user = userEvent.setup();
    render(<PostNowButton readyCount={3} onPostComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /postar agora/i }));

    expect(screen.getByText(/confirmar postagem/i)).toBeInTheDocument();
    expect(screen.getByText(/3 apostas prontas/i)).toBeInTheDocument();
  });

  it('calls API and starts polling on confirm', async () => {
    const user = userEvent.setup();
    const onPostComplete = vi.fn();

    // POST /api/bets/post-now → success with betIds
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { message: '1 aposta(s)', betIds: [1], validCount: 1 } }),
    });
    // GET /api/bets/post-now/status → all posted
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { posted: [1], pending: [], allPosted: true } }),
    });

    render(<PostNowButton readyCount={2} onPostComplete={onPostComplete} />);

    await user.click(screen.getByRole('button', { name: /postar agora/i }));
    await user.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/bets/post-now', expect.objectContaining({
        method: 'POST',
      }));
    });

    // Polling resolves immediately → done phase
    await waitFor(() => {
      expect(onPostComplete).toHaveBeenCalled();
      expect(screen.getByText(/concluido/i)).toBeInTheDocument();
    });
  });

  it('shows validation errors from pre-validation', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: false,
        error: { code: 'NO_VALID_BETS', message: 'Nenhuma aposta valida', details: ['Aposta #5: sem link'] },
      }),
    });

    render(<PostNowButton readyCount={1} onPostComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /postar agora/i }));
    await user.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(screen.getByText(/nenhuma aposta valida/i)).toBeInTheDocument();
      expect(screen.getByText(/sem link/i)).toBeInTheDocument();
    });
  });

  it('closes dialog on cancel', async () => {
    const user = userEvent.setup();
    render(<PostNowButton readyCount={2} onPostComplete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /postar agora/i }));
    expect(screen.getByText(/confirmar postagem/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(screen.queryByText(/confirmar postagem/i)).not.toBeInTheDocument();
  });
});

describe('PostingQueueCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<PostingQueueCard groupId="g1" />);
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('displays queue data after fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        data: {
          readyCount: 3,
          pendingLinkCount: 2,
          pendingOddsCount: 1,
          totalQueue: 6,
          nextPostTime: { time: '15:00', diff: '2h' },
          postingSchedule: { enabled: true, times: ['10:00', '15:00', '22:00'] },
          bets: [
            {
              id: 1,
              bet_market: 'ML',
              bet_pick: 'Casa',
              bet_status: 'ready',
              odds: 1.8,
              has_link: true,
              match: { home_team_name: 'A', away_team_name: 'B', kickoff_time: '2026-02-12T10:00:00Z' },
            },
            {
              id: 2,
              bet_market: 'OU',
              bet_pick: 'Over',
              bet_status: 'pending_link',
              odds: 1.9,
              has_link: false,
              match: { home_team_name: 'C', away_team_name: 'D', kickoff_time: '2026-02-12T15:00:00Z' },
            },
            {
              id: 3,
              bet_market: 'BTTS',
              bet_pick: 'Sim',
              bet_status: 'pending_odds',
              odds: null,
              has_link: true,
              match: { home_team_name: 'E', away_team_name: 'F', kickoff_time: '2026-02-12T20:00:00Z' },
            },
          ],
        },
      }),
    });

    render(<PostingQueueCard groupId="g1" />);

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText(/15:00/)).toBeInTheDocument();
      expect(screen.getByText(/habilitada/i)).toBeInTheDocument();
      expect(screen.getByText(/^pronta$/i)).toBeInTheDocument();
      expect(screen.getByText(/^faltando link$/i)).toBeInTheDocument();
      expect(screen.getByText(/^faltando odds$/i)).toBeInTheDocument();
    });
  });

  it('shows disabled badge when posting is disabled', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        data: {
          readyCount: 0,
          pendingLinkCount: 0,
          pendingOddsCount: 0,
          totalQueue: 0,
          nextPostTime: { time: '10:00', diff: '5h' },
          postingSchedule: { enabled: false, times: ['10:00'] },
          bets: [],
        },
      }),
    });

    render(<PostingQueueCard groupId="g1" />);

    await waitFor(() => {
      expect(screen.getByText(/desabilitada/i)).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: { message: 'DB Error' } }),
    });

    render(<PostingQueueCard groupId="g1" />);

    await waitFor(() => {
      expect(screen.getByText(/DB Error/i)).toBeInTheDocument();
    });
  });

  it('asks super_admin to select group before loading queue', () => {
    render(<PostingQueueCard requireGroupSelection />);
    expect(screen.getByText(/Selecione um grupo no filtro/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
