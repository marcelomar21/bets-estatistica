import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnboardingEditor, { DEFAULT_WELCOME_TEMPLATE } from './OnboardingEditor';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const baseProps = {
  groupId: 'group-1',
  initialTemplate: null,
  groupName: 'Guru da Bet',
  trialDays: 7,
  subscriptionPrice: 49.9 as number | null,
};

describe('OnboardingEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default template when initialTemplate is null', () => {
    render(<OnboardingEditor {...baseProps} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue(DEFAULT_WELCOME_TEMPLATE);
  });

  it('renders with custom template when provided', () => {
    const custom = 'Olá {nome}! Bem-vindo ao {grupo}!';
    render(<OnboardingEditor {...baseProps} initialTemplate={custom} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue(custom);
  });

  it('inserts placeholder when chip is clicked', () => {
    render(<OnboardingEditor {...baseProps} initialTemplate="" />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    // Focus textarea and set cursor position
    fireEvent.focus(textarea);

    const nomeChip = screen.getByRole('button', { name: '{nome}' });
    fireEvent.click(nomeChip);

    expect(textarea.value).toContain('{nome}');
  });

  it('shows preview with replaced placeholders and formatted price', () => {
    render(<OnboardingEditor {...baseProps} />);

    const previewBtn = screen.getByRole('button', { name: 'Preview' });
    fireEvent.click(previewBtn);

    // Preview should show rendered content
    expect(screen.getAllByText(/João/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Guru da Bet/).length).toBeGreaterThanOrEqual(1);
    // Verify the preview container has formatted BRL price
    const previewContainer = document.querySelector('.bg-\\[\\#1e2b3a\\]');
    expect(previewContainer?.textContent).toContain('João');
    expect(previewContainer?.textContent).toContain('7 dias');
    // Price should be formatted as BRL (R$ 49,90)
    expect(previewContainer?.textContent).toContain('R$');
    expect(previewContainer?.textContent).toContain('49,90');
  });

  it('renders bold markdown in preview as strong tags', () => {
    render(
      <OnboardingEditor {...baseProps} initialTemplate="*teste bold*" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    const previewContainer = document.querySelector('.bg-\\[\\#1e2b3a\\]');
    expect(previewContainer?.innerHTML).toContain('<strong>teste bold</strong>');
  });

  it('calls PUT with template when save is clicked', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} }),
    });

    render(<OnboardingEditor {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/groups/group-1/community-settings',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('welcome_message_template'),
        }),
      );
    });
  });

  it('resets to default template on confirm', () => {
    const custom = 'Template customizado';
    render(<OnboardingEditor {...baseProps} initialTemplate={custom} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue(custom);

    // First click: shows confirm
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
    // Second click: confirms
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reset?' }));

    expect(textarea).toHaveValue(DEFAULT_WELCOME_TEMPLATE);
  });

  it('shows mock inline keyboard buttons in preview', () => {
    render(<OnboardingEditor {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByRole('button', { name: '🚀 ENTRAR NO GRUPO' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '💳 ASSINAR AGORA' })).toBeDisabled();
  });

  it('displays placeholder legend with formatted BRL price', () => {
    render(<OnboardingEditor {...baseProps} />);

    expect(screen.getByText('Guru da Bet')).toBeInTheDocument();
    // Price appears in both {preco} and {linha_preco} rows, so use getAllByText
    expect(screen.getAllByText(/R\$\s49,90/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows fallback when subscriptionPrice is null', () => {
    render(<OnboardingEditor {...baseProps} subscriptionPrice={null} />);

    // Legend should show 'R$ XX,XX' as fallback
    expect(screen.getByText('R$ XX,XX')).toBeInTheDocument();
  });
});
