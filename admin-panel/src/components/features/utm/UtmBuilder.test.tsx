import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UtmBuilder } from './UtmBuilder';

// Mock clipboard API
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('UtmBuilder', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('renders all form fields', () => {
    render(<UtmBuilder />);

    expect(screen.getByText('URL Base')).toBeInTheDocument();
    expect(screen.getByText('utm_source')).toBeInTheDocument();
    expect(screen.getByText('utm_medium')).toBeInTheDocument();
    expect(screen.getByText('utm_campaign')).toBeInTheDocument();
    expect(screen.getByText('utm_term')).toBeInTheDocument();
    expect(screen.getByText('utm_content')).toBeInTheDocument();
  });

  it('renders preset selector with options', () => {
    render(<UtmBuilder />);

    expect(screen.getByText('Preset')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Custom' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Telegram Post' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'WhatsApp Message' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Instagram Story' })).toBeInTheDocument();
  });

  it('shows empty state when no URL is generated', () => {
    render(<UtmBuilder />);

    expect(
      screen.getByText('Preencha os campos obrigatórios para gerar a URL'),
    ).toBeInTheDocument();
  });

  it('generates URL preview in real time', () => {
    render(<UtmBuilder />);

    fireEvent.change(screen.getByPlaceholderText('https://bet365.com/...'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('telegram, whatsapp'), {
      target: { value: 'telegram' },
    });
    fireEvent.change(screen.getByPlaceholderText('social, cpc, organic'), {
      target: { value: 'social' },
    });
    fireEvent.change(screen.getByPlaceholderText('promo-marco-2026'), {
      target: { value: 'test-campaign' },
    });

    expect(
      screen.getByText(
        'https://example.com/?utm_source=telegram&utm_medium=social&utm_campaign=test-campaign',
      ),
    ).toBeInTheDocument();
  });

  it('disables copy button when required fields are empty', () => {
    render(<UtmBuilder />);

    const copyButton = screen.getByRole('button', { name: /Copiar URL/i });
    expect(copyButton).toBeDisabled();
  });

  it('enables copy button when all required fields are filled', () => {
    render(<UtmBuilder />);

    fireEvent.change(screen.getByPlaceholderText('https://bet365.com/...'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('telegram, whatsapp'), {
      target: { value: 'telegram' },
    });
    fireEvent.change(screen.getByPlaceholderText('social, cpc, organic'), {
      target: { value: 'social' },
    });
    fireEvent.change(screen.getByPlaceholderText('promo-marco-2026'), {
      target: { value: 'campaign' },
    });

    const copyButton = screen.getByRole('button', { name: /Copiar URL/i });
    expect(copyButton).not.toBeDisabled();
  });

  it('shows validation error for invalid URL', () => {
    render(<UtmBuilder />);

    fireEvent.change(screen.getByPlaceholderText('https://bet365.com/...'), {
      target: { value: 'not-a-url' },
    });

    expect(
      screen.getByText('URL deve iniciar com http:// ou https://'),
    ).toBeInTheDocument();
  });

  it('fills source and medium when selecting a preset', () => {
    render(<UtmBuilder />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } }); // Telegram Post

    expect(screen.getByPlaceholderText('telegram, whatsapp')).toHaveValue('telegram');
    expect(screen.getByPlaceholderText('social, cpc, organic')).toHaveValue('social');
  });

  it('copies URL to clipboard on click', async () => {
    render(<UtmBuilder />);

    fireEvent.change(screen.getByPlaceholderText('https://bet365.com/...'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('telegram, whatsapp'), {
      target: { value: 'telegram' },
    });
    fireEvent.change(screen.getByPlaceholderText('social, cpc, organic'), {
      target: { value: 'social' },
    });
    fireEvent.change(screen.getByPlaceholderText('promo-marco-2026'), {
      target: { value: 'camp' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Copiar URL/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://example.com/?utm_source=telegram&utm_medium=social&utm_campaign=camp',
    );
  });

  it('includes optional params when provided', () => {
    render(<UtmBuilder />);

    fireEvent.change(screen.getByPlaceholderText('https://bet365.com/...'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('telegram, whatsapp'), {
      target: { value: 'src' },
    });
    fireEvent.change(screen.getByPlaceholderText('social, cpc, organic'), {
      target: { value: 'med' },
    });
    fireEvent.change(screen.getByPlaceholderText('promo-marco-2026'), {
      target: { value: 'camp' },
    });
    fireEvent.change(screen.getByPlaceholderText('keyword (opcional)'), {
      target: { value: 'my-term' },
    });
    fireEvent.change(screen.getByPlaceholderText('banner-topo, link-texto'), {
      target: { value: 'my-content' },
    });

    expect(
      screen.getByText(
        'https://example.com/?utm_source=src&utm_medium=med&utm_campaign=camp&utm_term=my-term&utm_content=my-content',
      ),
    ).toBeInTheDocument();
  });
});
