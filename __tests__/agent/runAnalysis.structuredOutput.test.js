/**
 * Tests for two-phase agent with structured output in agentCore.js
 * Validates: tool calling loop (Phase 1) + withStructuredOutput (Phase 2)
 */

// ── Mocks ─────────────────────────────────────────────────────────────

const mockToolInvoke = jest.fn();
const mockStructuredInvoke = jest.fn();
const mockConsistencyInvoke = jest.fn();
const mockBindTools = jest.fn();
const mockWithStructuredOutput = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    bindTools: mockBindTools,
    withStructuredOutput: mockWithStructuredOutput,
  })),
}));

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockReturnValue({
      formatMessages: jest.fn().mockResolvedValue([
        { _getType: () => 'system', content: 'system prompt' },
        { _getType: () => 'human', content: 'human prompt' },
      ]),
    }),
  },
}));

jest.mock('@langchain/core/messages', () => ({
  ToolMessage: jest.fn().mockImplementation((opts) => ({
    _getType: () => 'tool',
    tool_call_id: opts.tool_call_id,
    content: opts.content,
  })),
  HumanMessage: jest.fn().mockImplementation((content) => ({
    _getType: () => 'human',
    content,
  })),
}));

jest.mock('fs-extra', () => ({
  ensureDir: jest.fn().mockResolvedValue(undefined),
  writeJson: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../lib/config', () => ({
  config: {
    llm: { heavyModel: 'gpt-5.2', lightModel: 'gpt-5-mini' },
  },
}));

const mockMatchDetailTool = {
  name: 'match_detail_raw',
  invoke: jest.fn().mockResolvedValue(JSON.stringify({
    executed_sql: 'SELECT *',
    data: { stadium_name: 'Maracanã' },
  })),
};

const mockLastxTool = {
  name: 'team_lastx_raw',
  invoke: jest.fn().mockResolvedValue(JSON.stringify({
    executed_sql: 'SELECT *',
    data: { name: 'Time A', stats: {} },
  })),
};

const mockCalculatorTool = {
  name: 'calculator',
  invoke: jest.fn().mockResolvedValue(JSON.stringify({
    operation: 'average',
    values_count: 10,
    result: 3.9,
    detail: 'Média de 10 valores',
    label: 'test',
  })),
};

jest.mock('../../agent/tools', () => ({
  createAnalysisTools: jest.fn().mockResolvedValue([mockMatchDetailTool, mockLastxTool, mockCalculatorTool]),
}));

// ── Helpers ───────────────────────────────────────────────────────────

// Consistent analysis: safe_bets say "menos de" (under) and value_bets
// do NOT contradict on goal direction (no "mais de" for goals).
const VALID_STRUCTURED = {
  overview: 'Análise detalhada do confronto com métricas objetivas extraídas dos dados brutos coletados pelo agente durante a execução.',
  safe_bets: [
    { title: 'Aposte em menos de 3,5 gols totais', reasoning: 'Média de gols dos últimos 10 jogos fica abaixo de 2,5 para ambos os times.', category: 'gols' },
    { title: 'Espere menos de 4,5 cartões totais', reasoning: 'A disciplina média dos dois times é de 1,8 cartões por partida nos últimos jogos.', category: 'cartoes' },
    { title: 'Explore linha de 9+ escanteios totais', reasoning: 'Ambas as equipes forçam média de 5,2 escanteios por partida como mandante e visitante.', category: 'escanteios' },
    { title: 'Aposte em ambas as equipes marcam', reasoning: 'BTTS ocorreu em 70% dos últimos 10 jogos de ambas as equipes, mostrando tendência clara.', category: 'extra' },
  ],
  value_bets: [
    { title: 'Combine vitória do mandante neste confronto', reasoning: 'O mandante venceu 7 dos últimos 10 jogos em casa com aproveitamento de 78% nos pontos.', angle: 'vitoria' },
    { title: 'Handicap asiático -0,5 para o mandante é interessante', reasoning: 'O visitante perdeu 6 dos últimos 10 jogos fora de casa com média de 0,9 gols marcados.', angle: 'handicap' },
    { title: 'Aposte em 10+ escanteios no jogo como aposta de valor', reasoning: 'Nos últimos 5 confrontos diretos a média foi de 11,2 escanteios totais por partida.', angle: 'escanteios' },
  ],
};

const makeToolCallResponse = (calls = []) => ({
  _getType: () => 'ai',
  content: '',
  tool_calls: calls,
  response_metadata: { finish_reason: 'tool_calls' },
  additional_kwargs: {},
});

const makeTextResponse = (text = '') => ({
  _getType: () => 'ai',
  content: text,
  tool_calls: [],
  response_metadata: { finish_reason: 'stop' },
  additional_kwargs: {},
});

const makeRawMessage = (content = '') => ({
  _getType: () => 'ai',
  content,
  additional_kwargs: {},
});

// ── Setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OPENAI_API_KEY = 'test-key';
  // Restore mock chaining after clearAllMocks
  mockBindTools.mockReturnValue({ invoke: mockToolInvoke });
  // Phase 2 structured output (includeRaw) vs consistency check (no includeRaw)
  mockWithStructuredOutput.mockImplementation((_schema, opts) => {
    if (opts?.includeRaw) {
      return { invoke: mockStructuredInvoke };
    }
    return { invoke: mockConsistencyInvoke };
  });
  mockConsistencyInvoke.mockResolvedValue({ consistent: true, reason: 'OK' });
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

const { runAgent, ensureAnalysisConsistency, STRUCTURED_FORMAT_INSTRUCTIONS } = require('../../agent/analysis/agentCore');

// ── Tests ─────────────────────────────────────────────────────────────

describe('agentCore - structured output', () => {
  describe('STRUCTURED_FORMAT_INSTRUCTIONS', () => {
    test('contém campos obrigatórios do schema', () => {
      expect(STRUCTURED_FORMAT_INSTRUCTIONS).toContain('overview');
      expect(STRUCTURED_FORMAT_INSTRUCTIONS).toContain('safe_bets');
      expect(STRUCTURED_FORMAT_INSTRUCTIONS).toContain('value_bets');
      expect(STRUCTURED_FORMAT_INSTRUCTIONS).toContain('category');
      expect(STRUCTURED_FORMAT_INSTRUCTIONS).toContain('angle');
    });

    test('não usa StructuredOutputParser format', () => {
      expect(STRUCTURED_FORMAT_INSTRUCTIONS).not.toContain('```json');
      expect(STRUCTURED_FORMAT_INSTRUCTIONS).not.toContain('The output should be formatted as a JSON');
    });
  });

  describe('ensureAnalysisConsistency', () => {
    test('aceita análise quando LLM retorna consistent=true', async () => {
      mockConsistencyInvoke.mockResolvedValueOnce({ consistent: true, reason: 'OK' });
      await expect(ensureAnalysisConsistency(VALID_STRUCTURED)).resolves.toBeUndefined();
    });

    test('rejeita quando LLM detecta inconsistência', async () => {
      mockConsistencyInvoke.mockResolvedValueOnce({
        consistent: false,
        reason: 'Under 2.5 gols conflita com over 2.5 gols no mesmo mercado',
      });
      const conflicting = {
        ...VALID_STRUCTURED,
        safe_bets: [
          { title: 'Aposte em menos de 2,5 gols', reasoning: 'Dados mostram média baixa.', category: 'gols' },
          ...VALID_STRUCTURED.safe_bets.slice(1),
        ],
        value_bets: [
          { title: 'Aposte em mais de 2,5 gols no jogo', reasoning: 'Confronto direto com muitos gols.', angle: 'gols' },
          ...VALID_STRUCTURED.value_bets.slice(1),
        ],
      };
      await expect(ensureAnalysisConsistency(conflicting)).rejects.toThrow(/conflita/);
    });

    test('aceita null/undefined sem erro (sem chamada LLM)', async () => {
      await expect(ensureAnalysisConsistency(null)).resolves.toBeUndefined();
      await expect(ensureAnalysisConsistency(undefined)).resolves.toBeUndefined();
      expect(mockConsistencyInvoke).not.toHaveBeenCalled();
    });

    test('passa sem erro quando LLM de consistência falha (fail-open)', async () => {
      mockConsistencyInvoke.mockRejectedValueOnce(new Error('Network timeout'));
      await expect(ensureAnalysisConsistency(VALID_STRUCTURED)).resolves.toBeUndefined();
    });
  });

  describe('runAgent - happy path', () => {
    test('completa com Phase 1 tools + Phase 2 structured output', async () => {
      // Phase 1: model calls match_detail_raw tool
      mockToolInvoke
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'call_1', name: 'match_detail_raw', args: { match_id: 123 } },
          ]),
        )
        // Phase 1: model calls team_lastx_raw tool (twice for two teams)
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'call_2', name: 'team_lastx_raw', args: { team_id: 10 } },
            { id: 'call_3', name: 'team_lastx_raw', args: { team_id: 20 } },
          ]),
        )
        // Phase 1: model stops calling tools → break to Phase 2
        .mockResolvedValueOnce(makeTextResponse('Análise pronta'));

      // Phase 2: structured output returns valid parsed result
      mockStructuredInvoke.mockResolvedValueOnce({
        raw: makeRawMessage(JSON.stringify(VALID_STRUCTURED)),
        parsed: VALID_STRUCTURED,
      });

      const result = await runAgent({
        matchId: 123,
        contextoJogo: 'Contexto de teste',
        matchRow: { home_team_name: 'Time A', away_team_name: 'Time B' },
      });

      expect(result.structuredAnalysis).toEqual(VALID_STRUCTURED);
      expect(result.analysisText).toContain('Análise Baseada nos Dados Brutos');
      expect(result.toolExecutions).toHaveLength(3);
      // 2 calls: Phase 2 (includeRaw) + consistency check
      expect(mockWithStructuredOutput).toHaveBeenCalledTimes(2);
      expect(mockStructuredInvoke).toHaveBeenCalledTimes(1);
      expect(mockConsistencyInvoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('runAgent - consistency retry', () => {
    test('retenta quando LLM de consistência detecta conflito na primeira tentativa', async () => {
      const conflicting = {
        ...VALID_STRUCTURED,
        safe_bets: [
          { title: 'Aposte em menos de 2,5 gols', reasoning: 'Dados mostram média baixa de gols nos últimos jogos das equipes.', category: 'gols' },
          ...VALID_STRUCTURED.safe_bets.slice(1),
        ],
        value_bets: [
          { title: 'Aposte em mais de 3,5 gols no jogo', reasoning: 'O confronto direto historicamente apresenta jogos com muitos gols marcados.', angle: 'gols' },
          ...VALID_STRUCTURED.value_bets.slice(1),
        ],
      };

      // Phase 1: quick tool calls
      mockToolInvoke
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'call_1', name: 'match_detail_raw', args: { match_id: 123 } },
            { id: 'call_2', name: 'team_lastx_raw', args: { team_id: 10 } },
          ]),
        )
        .mockResolvedValueOnce(makeTextResponse('done'));

      // Phase 2: first attempt has conflicting bets, second is valid
      mockStructuredInvoke
        .mockResolvedValueOnce({
          raw: makeRawMessage(JSON.stringify(conflicting)),
          parsed: conflicting,
        })
        .mockResolvedValueOnce({
          raw: makeRawMessage(JSON.stringify(VALID_STRUCTURED)),
          parsed: VALID_STRUCTURED,
        });

      // Consistency: first call rejects, second accepts
      mockConsistencyInvoke
        .mockResolvedValueOnce({ consistent: false, reason: 'Under 2.5 vs over 3.5 no mesmo mercado' })
        .mockResolvedValueOnce({ consistent: true, reason: 'OK' });

      const result = await runAgent({
        matchId: 123,
        contextoJogo: 'Contexto de teste',
        matchRow: { home_team_name: 'Time A', away_team_name: 'Time B' },
      });

      expect(mockStructuredInvoke).toHaveBeenCalledTimes(2);
      expect(mockConsistencyInvoke).toHaveBeenCalledTimes(2);
      expect(result.structuredAnalysis).toEqual(VALID_STRUCTURED);
    });
  });

  describe('runAgent - tools enforcement', () => {
    test('força uso de ferramentas obrigatórias antes de avançar para Phase 2', async () => {
      // Model tries to respond without tools
      mockToolInvoke
        .mockResolvedValueOnce(makeTextResponse('Tentando responder direto'))
        // After enforcement, model uses match_detail_raw
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'call_1', name: 'match_detail_raw', args: { match_id: 123 } },
          ]),
        )
        // Then model tries text again but lastx is still missing
        .mockResolvedValueOnce(makeTextResponse('Quase pronto'))
        // After enforcement, model uses team_lastx_raw
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'call_2', name: 'team_lastx_raw', args: { team_id: 10 } },
          ]),
        )
        // Now tools are satisfied, model provides text → break
        .mockResolvedValueOnce(makeTextResponse('Tudo pronto'));

      // Phase 2: structured output OK
      mockStructuredInvoke.mockResolvedValueOnce({
        raw: makeRawMessage(JSON.stringify(VALID_STRUCTURED)),
        parsed: VALID_STRUCTURED,
      });

      const result = await runAgent({
        matchId: 123,
        contextoJogo: 'Contexto de teste',
        matchRow: { home_team_name: 'Time A', away_team_name: 'Time B' },
      });

      // 5 calls to tool-calling model
      expect(mockToolInvoke).toHaveBeenCalledTimes(5);
      // 1 call to structured output
      expect(mockStructuredInvoke).toHaveBeenCalledTimes(1);
      expect(result.structuredAnalysis).toEqual(VALID_STRUCTURED);
    });
  });

  describe('runAgent - structured output failure', () => {
    test('throws when all structured retries fail consistency check', async () => {
      // Phase 1: tools OK
      mockToolInvoke
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'call_1', name: 'match_detail_raw', args: { match_id: 123 } },
            { id: 'call_2', name: 'team_lastx_raw', args: { team_id: 10 } },
          ]),
        )
        .mockResolvedValueOnce(makeTextResponse('done'));

      // Phase 2: all 3 retries produce analysis
      for (let i = 0; i < 3; i++) {
        mockStructuredInvoke.mockResolvedValueOnce({
          raw: makeRawMessage(JSON.stringify(VALID_STRUCTURED)),
          parsed: VALID_STRUCTURED,
        });
        mockConsistencyInvoke.mockResolvedValueOnce({ consistent: false, reason: 'Conflito detectado' });
      }

      await expect(
        runAgent({
          matchId: 123,
          contextoJogo: 'Contexto de teste',
          matchRow: { home_team_name: 'Time A', away_team_name: 'Time B' },
        }),
      ).rejects.toThrow('Agente não produziu análise estruturada válida após retries.');

      expect(mockStructuredInvoke).toHaveBeenCalledTimes(3);
      expect(mockConsistencyInvoke).toHaveBeenCalledTimes(3);
    });
  });

  describe('runAgent - Zod validation retry', () => {
    test('retries when llmStructured.invoke throws Zod validation error', async () => {
      // Phase 1: tools OK
      mockToolInvoke
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'call_1', name: 'match_detail_raw', args: { match_id: 123 } },
            { id: 'call_2', name: 'team_lastx_raw', args: { team_id: 10 } },
          ]),
        )
        .mockResolvedValueOnce(makeTextResponse('done'));

      // Phase 2: first attempt throws Zod error (safe_bet with vitória), second succeeds
      const zodError = new Error('Zod validation failed');
      zodError.issues = [
        { message: 'Safe bet não pode tratar de vitória/handicap.', path: ['safe_bets', 0, 'title'] },
      ];
      mockStructuredInvoke
        .mockRejectedValueOnce(zodError)
        .mockResolvedValueOnce({
          raw: makeRawMessage(JSON.stringify(VALID_STRUCTURED)),
          parsed: VALID_STRUCTURED,
        });

      const result = await runAgent({
        matchId: 123,
        contextoJogo: 'Contexto de teste',
        matchRow: { home_team_name: 'Time A', away_team_name: 'Time B' },
      });

      expect(mockStructuredInvoke).toHaveBeenCalledTimes(2);
      expect(result.structuredAnalysis).toEqual(VALID_STRUCTURED);
    });
  });

  describe('runAgent - no successful tool calls', () => {
    test('throws when tools are never executed successfully', async () => {
      // Model keeps responding with text, never calls tools, exhausting MAX_AGENT_STEPS
      const steps = Number(process.env.AGENT_MAX_STEPS || 8);
      for (let i = 0; i < steps; i++) {
        mockToolInvoke.mockResolvedValueOnce(makeTextResponse('Sem ferramentas'));
      }

      await expect(
        runAgent({
          matchId: 999,
          contextoJogo: 'Contexto',
          matchRow: { home_team_name: 'A', away_team_name: 'B' },
        }),
      ).rejects.toThrow('ferramentas obrigatórias');
    });
  });

  describe('runAgent - withStructuredOutput config', () => {
    test('passes includeRaw: true to withStructuredOutput', async () => {
      // Phase 1: quick success
      mockToolInvoke
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'call_1', name: 'match_detail_raw', args: { match_id: 1 } },
            { id: 'call_2', name: 'team_lastx_raw', args: { team_id: 1 } },
          ]),
        )
        .mockResolvedValueOnce(makeTextResponse('ok'));

      mockStructuredInvoke.mockResolvedValueOnce({
        raw: makeRawMessage(JSON.stringify(VALID_STRUCTURED)),
        parsed: VALID_STRUCTURED,
      });

      await runAgent({
        matchId: 1,
        contextoJogo: 'ctx',
        matchRow: { home_team_name: 'A', away_team_name: 'B' },
      });

      expect(mockWithStructuredOutput).toHaveBeenCalledWith(
        expect.any(Object), // zod schema
        { includeRaw: true },
      );
    });
  });
});
