/**
 * Tests: copyService.js — CTA label sanitization and odds reading
 *
 * POST-03: CTA label must never appear in client-facing messages
 * POST-04: Victory recap reads odds from bet_group_assignments.odds_at_post
 */

// Mock logger
jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock config
jest.mock('../../../lib/config', () => ({
  config: {
    llm: { lightModel: 'gpt-4o-mini', heavyModel: 'gpt-4o' },
    supabase: {},
  },
}));

// Mock utils
jest.mock('../../../lib/utils', () => ({
  formatDateTimeBR: jest.fn(() => '07/04/2026 15:00'),
}));

// Track the messages passed to the LLM
let capturedMessages = [];
const mockInvoke = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockImplementation((messages) => {
      capturedMessages = messages;
      return {
        pipe: jest.fn().mockReturnValue({
          invoke: mockInvoke,
        }),
      };
    }),
  },
}));

const { generateBetCopy, generateWinsRecapCopy } = require('../copyService');

describe('POST-03: CTA label sanitization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedMessages = [];
  });

  it('generateWinsRecapCopy strips CTA label from LLM output', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Parabens pelos acertos! CTA: Aposte agora no nosso grupo!',
    });

    const winsData = {
      winCount: 2,
      totalCount: 3,
      rate: 66.7,
      wins: [
        {
          bet_market: 'Over 2.5',
          bet_pick: 'Over',
          odds_at_post: null,
          odds: 1.90,
          bet_group_assignments: [{ odds_at_post: 1.90 }],
          league_matches: { home_team_name: 'Flamengo', away_team_name: 'Vasco' },
        },
      ],
    };

    const result = await generateWinsRecapCopy(winsData, null);

    expect(result.success).toBe(true);
    expect(result.data.copy).toContain('Aposte agora no nosso grupo!');
    expect(result.data.copy).not.toContain('CTA:');
    expect(result.data.copy).not.toContain('CTA');
  });

  it('generateWinsRecapCopy prompt does not contain literal CTA', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Recap de acertos do dia!',
    });

    const winsData = {
      winCount: 1,
      totalCount: 2,
      rate: 50,
      wins: [
        {
          bet_market: 'Moneyline',
          bet_pick: 'Home',
          odds_at_post: null,
          odds: 2.10,
          bet_group_assignments: [{ odds_at_post: 2.10 }],
          league_matches: { home_team_name: 'Santos', away_team_name: 'Palmeiras' },
        },
      ],
    };

    await generateWinsRecapCopy(winsData, null);

    // Check the human message does not contain literal "CTA"
    const humanMessage = capturedMessages.find(m => m[0] === 'human');
    expect(humanMessage).toBeDefined();
    expect(humanMessage[1]).not.toMatch(/\bCTA\b/);
  });

  it('generateBetCopy uses "Chamados para acao" in system prompt', async () => {
    mockInvoke.mockResolvedValue({
      content: '• Santos: 60% posse\n• Palmeiras: 45% finalizacoes',
    });

    const bet = {
      id: 'bet-1',
      homeTeamName: 'Santos',
      awayTeamName: 'Palmeiras',
      betMarket: 'Over 2.5',
      betPick: 'Over',
      odds: 1.85,
      reasoning: 'Analise estatistica mostra tendencia a Over',
    };

    const toneConfig = {
      ctaTexts: ['Aposte!', 'Jogue agora!'],
    };

    await generateBetCopy(bet, toneConfig);

    // Check the system message uses "Chamados para acao" not "CTAs"
    const systemMessage = capturedMessages.find(m => m[0] === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage[1]).toContain('Chamados para acao');
    expect(systemMessage[1]).not.toContain('CTAs disponiveis');
    expect(systemMessage[1]).not.toContain('CTA padrao');
  });

  it('strips "CTA:" prefix from LLM output but keeps the content', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Acertamos tudo ontem!\n\nCTA: Venha apostar com a gente!',
    });

    const winsData = {
      winCount: 3,
      totalCount: 4,
      rate: 75,
      wins: [
        {
          bet_market: 'Both Teams Score',
          bet_pick: 'Yes',
          odds_at_post: null,
          odds: 1.75,
          bet_group_assignments: [{ odds_at_post: 1.75 }],
          league_matches: { home_team_name: 'Corinthians', away_team_name: 'Sao Paulo' },
        },
      ],
    };

    const result = await generateWinsRecapCopy(winsData, null);

    expect(result.success).toBe(true);
    expect(result.data.copy).toContain('Venha apostar com a gente!');
    expect(result.data.copy).not.toMatch(/\bCTA\b/);
  });

  it('strips standalone "CTA" at line start without colon or dash', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Acertamos tudo ontem!\n\nCTA Aposte agora no grupo!',
    });

    const winsData = {
      winCount: 1,
      totalCount: 1,
      rate: 100,
      wins: [
        {
          bet_market: 'Over 2.5',
          bet_pick: 'Over',
          odds_at_post: null,
          odds: 1.80,
          bet_group_assignments: [{ odds_at_post: 1.80 }],
          league_matches: { home_team_name: 'Flamengo', away_team_name: 'Vasco' },
        },
      ],
    };

    const result = await generateWinsRecapCopy(winsData, null);

    expect(result.success).toBe(true);
    expect(result.data.copy).toContain('Aposte agora no grupo!');
    expect(result.data.copy).not.toMatch(/^CTA\b/m);
  });
});

describe('POST-04: Odds reading from bet_group_assignments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedMessages = [];
  });

  it('reads odds from bet_group_assignments.odds_at_post (primary source)', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Recap dos acertos!',
    });

    const winsData = {
      winCount: 1,
      totalCount: 1,
      rate: 100,
      wins: [
        {
          bet_market: 'Over 2.5',
          bet_pick: 'Over',
          odds_at_post: null,
          odds: 1.50,
          bet_group_assignments: [{ odds_at_post: 2.10 }],
          league_matches: { home_team_name: 'Flamengo', away_team_name: 'Vasco' },
        },
      ],
    };

    await generateWinsRecapCopy(winsData, null);

    const humanMessage = capturedMessages.find(m => m[0] === 'human');
    expect(humanMessage[1]).toContain('2.10');
    expect(humanMessage[1]).not.toContain('1.50');
  });

  it('falls back to suggested_bets.odds when assignment odds is null', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Recap dos acertos!',
    });

    const winsData = {
      winCount: 1,
      totalCount: 1,
      rate: 100,
      wins: [
        {
          bet_market: 'Moneyline',
          bet_pick: 'Home',
          odds_at_post: null,
          odds: 1.85,
          bet_group_assignments: [{ odds_at_post: null }],
          league_matches: { home_team_name: 'Santos', away_team_name: 'Palmeiras' },
        },
      ],
    };

    await generateWinsRecapCopy(winsData, null);

    const humanMessage = capturedMessages.find(m => m[0] === 'human');
    expect(humanMessage[1]).toContain('1.85');
  });

  it('omits odds entirely when both sources are null', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Recap dos acertos!',
    });

    const winsData = {
      winCount: 1,
      totalCount: 1,
      rate: 100,
      wins: [
        {
          bet_market: 'Both Teams Score',
          bet_pick: 'Yes',
          odds_at_post: null,
          odds: null,
          bet_group_assignments: [{ odds_at_post: null }],
          league_matches: { home_team_name: 'Corinthians', away_team_name: 'Sao Paulo' },
        },
      ],
    };

    await generateWinsRecapCopy(winsData, null);

    const humanMessage = capturedMessages.find(m => m[0] === 'human');
    expect(humanMessage[1]).not.toContain('Odd:');
    expect(humanMessage[1]).not.toContain('N/A');
  });

  it('formats odds with 2 decimal places', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Recap dos acertos!',
    });

    const winsData = {
      winCount: 1,
      totalCount: 1,
      rate: 100,
      wins: [
        {
          bet_market: 'Over 1.5',
          bet_pick: 'Over',
          odds_at_post: null,
          odds: null,
          bet_group_assignments: [{ odds_at_post: 3 }],
          league_matches: { home_team_name: 'Botafogo', away_team_name: 'Fluminense' },
        },
      ],
    };

    await generateWinsRecapCopy(winsData, null);

    const humanMessage = capturedMessages.find(m => m[0] === 'human');
    expect(humanMessage[1]).toContain('3.00');
  });

  it('uses oddLabel from toneConfig in odds display', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Recap dos acertos!',
    });

    const winsData = {
      winCount: 1,
      totalCount: 1,
      rate: 100,
      wins: [
        {
          bet_market: 'Over 2.5',
          bet_pick: 'Over',
          odds_at_post: null,
          odds: null,
          bet_group_assignments: [{ odds_at_post: 2.50 }],
          league_matches: { home_team_name: 'Gremio', away_team_name: 'Internacional' },
        },
      ],
    };

    const toneConfig = { oddLabel: 'Cotacao' };

    await generateWinsRecapCopy(winsData, toneConfig);

    const humanMessage = capturedMessages.find(m => m[0] === 'human');
    expect(humanMessage[1]).toContain('Cotacao: 2.50');
    expect(humanMessage[1]).not.toContain('Odd:');
  });
});
