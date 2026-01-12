# Story 11.3: Criar Testes Unitários Críticos

Status: done

## Story

As a desenvolvedor,
I want testes para funções críticas,
So that bugs não passem despercebidos.

## Acceptance Criteria

1. **Given** funções críticas do sistema
   **When** criar testes
   **Then** cobre: matching de odds, formatação de mensagens, cálculo de métricas

2. **Given** testes criados
   **When** executar `npm test`
   **Then** testes rodam em < 30s

3. **Given** funções críticas testadas
   **When** verificar coverage
   **Then** coverage > 50% nas funções críticas

## Tasks / Subtasks

- [x] **Task 1: Setup Jest e Configuração** (AC: #2)
  - [x] 1.1 Instalar dependências: `jest`, `@types/jest` (dev)
  - [x] 1.2 Criar `jest.config.js` na raiz
  - [x] 1.3 Atualizar `package.json` script `test` para usar Jest
  - [x] 1.4 Criar pasta `__tests__/` na raiz

- [x] **Task 2: Testes do metricsService** (AC: #1, #3)
  - [x] 2.1 Criar `__tests__/services/metricsService.test.js`
  - [x] 2.2 Testar `formatStatsMessage()` com dados válidos
  - [x] 2.3 Testar `formatStatsMessage()` com dados vazios
  - [x] 2.4 Testar `formatStatsMessage()` com null
  - [x] 2.5 Testar cálculo de taxa de acerto (mock Supabase)

- [x] **Task 3: Testes do marketInterpreter** (AC: #1, #3)
  - [x] 3.1 Criar `__tests__/services/marketInterpreter.test.js`
  - [x] 3.2 Testar `isUnsupportedMarket()` com mercados válidos
  - [x] 3.3 Testar `isUnsupportedMarket()` com mercados inválidos (corners, cards)
  - [x] 3.4 Testar `fallbackParsing()` para mercado "totals" (Over/Under)
  - [x] 3.5 Testar `fallbackParsing()` para mercado "btts"
  - [x] 3.6 Testar `fallbackParsing()` para mercado "h2h"
  - [x] 3.7 Testar extração de linha (ex: 2.5, 1.5)

- [x] **Task 4: Testes do copyService** (AC: #1, #3)
  - [x] 4.1 Criar `__tests__/services/copyService.test.js`
  - [x] 4.2 Testar `generateBetCopy()` com todos os campos
  - [x] 4.3 Testar `generateBetCopy()` com campos opcionais ausentes
  - [x] 4.4 Testar cache de copies (clearCache, getCacheStats)

- [x] **Task 5: Testes do betService (funções puras)** (AC: #1, #3)
  - [x] 5.1 Criar `__tests__/services/betService.test.js`
  - [x] 5.2 Testar `tryAutoPromote()` lógica (mock Supabase)
  - [x] 5.3 Testar validações de status de apostas

- [x] **Task 6: Configurar CI para rodar testes** (AC: #2)
  - [x] 6.1 CI já configurado com `npm test` em `.github/workflows/ci.yml`
  - [x] 6.2 Verificar que testes passam (90 testes, < 1s)

## Dev Notes

### Funções Críticas Identificadas

| Arquivo | Função | Criticidade | Motivo |
|---------|--------|-------------|--------|
| `metricsService.js` | `formatStatsMessage()` | Alta | Exibido para usuários |
| `metricsService.js` | `getSuccessRate()` | Alta | Cálculo de métricas |
| `marketInterpreter.js` | `isUnsupportedMarket()` | Alta | Filtra mercados inválidos |
| `marketInterpreter.js` | `fallbackParsing()` | Alta | Parsing de mercados |
| `copyService.js` | `generateBetCopy()` | Alta | Copy LLM para Telegram |
| `betService.js` | `tryAutoPromote()` | Alta | Lógica de promoção automática |

### Setup Jest

**jest.config.js:**
```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'bot/services/**/*.js',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
    },
  },
  verbose: true,
  testTimeout: 10000,
};
```

**package.json scripts:**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

### Estratégia de Mocking

Para funções que dependem de Supabase, usar `jest.mock()`:

```javascript
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn(() => ({
          data: mockData,
          error: null,
        })),
      })),
    })),
  },
}));
```

### Exemplos de Testes

**metricsService.test.js:**
```javascript
const { formatStatsMessage } = require('../../bot/services/metricsService');

describe('formatStatsMessage', () => {
  test('formata corretamente com dados válidos', () => {
    const stats = {
      last30Days: { success: 7, total: 10, rate: 70 },
      allTime: { success: 15, total: 20, rate: 75 },
    };
    const result = formatStatsMessage(stats);
    expect(result).toContain('7/10');
    expect(result).toContain('70.0%');
  });

  test('retorna mensagem padrão para null', () => {
    expect(formatStatsMessage(null)).toBe('Estatísticas não disponíveis');
  });
});
```

**marketInterpreter.test.js:**
```javascript
const { isUnsupportedMarket, fallbackParsing } = require('../../bot/services/marketInterpreter');

describe('isUnsupportedMarket', () => {
  test('detecta escanteios como não suportado', () => {
    expect(isUnsupportedMarket('Mais de 8.5 escanteios')).toBe(true);
  });

  test('permite mercado de gols', () => {
    expect(isUnsupportedMarket('Mais de 2.5 gols')).toBe(false);
  });
});

describe('fallbackParsing', () => {
  test('interpreta "Mais de 2.5 gols" como totals over', () => {
    const result = fallbackParsing('Mais de 2.5 gols');
    expect(result.market).toBe('totals');
    expect(result.type).toBe('over');
    expect(result.line).toBe(2.5);
    expect(result.supported).toBe(true);
  });
});
```

### Estrutura de Pastas Esperada

```
bets-estatistica/
├── __tests__/
│   └── services/
│       ├── metricsService.test.js
│       ├── marketInterpreter.test.js
│       ├── copyService.test.js
│       └── betService.test.js
├── jest.config.js
└── package.json (scripts atualizados)
```

### References

- [Source: bot/services/metricsService.js] - getSuccessRate, formatStatsMessage
- [Source: bot/services/marketInterpreter.js] - isUnsupportedMarket, fallbackParsing
- [Source: bot/services/copyService.js] - formatação de mensagens
- [Source: bot/services/betService.js] - tryAutoPromote (adicionado hoje)
- [Source: package.json] - scripts de test

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementação limpa sem erros

### Completion Notes List

- **Task 1:** Instalado Jest + @types/jest, criado jest.config.js com coverage thresholds por arquivo, atualizado package.json com scripts test/test:watch/test:coverage, criada estrutura __tests__/services/
- **Task 2:** Criados 12 testes para metricsService cobrindo formatStatsMessage (null, undefined, dados válidos, vazios, parciais) e getSuccessRate/getDetailedStats com mocks de Supabase. Coverage: 90.47% statements, 100% functions
- **Task 3:** Criados 38 testes para marketInterpreter cobrindo isUnsupportedMarket (escanteios, cartões, chutes, etc.) e fallbackParsing (totals over/under, btts yes/no, h2h). Coverage: 46.73% statements (funções de AI não testadas)
- **Task 4:** Criados 16 testes para copyService cobrindo generateBetCopy (sucesso, erro, cache), clearCache, clearBetCache, getCacheStats. Coverage: 88.23% statements
- **Task 5:** Criados 24 testes para betService cobrindo tryAutoPromote (todas condições), updateBetStatus, updateBetOdds, updateBetLink. Coverage: 18.36% statements (muitas funções DB não testadas unitariamente)
- **Task 6:** CI já configurado em .github/workflows/ci.yml para rodar npm test. ESLint atualizado com env jest:true. Todos os 90 testes passam em < 1 segundo

### File List

| Arquivo | Modificação |
|---------|-------------|
| `jest.config.js` | Novo - configuração Jest com thresholds por arquivo |
| `package.json` | Adicionados scripts test, test:watch, test:coverage |
| `.eslintrc.js` | Adicionado env jest: true |
| `__tests__/services/metricsService.test.js` | Novo - 12 testes |
| `__tests__/services/marketInterpreter.test.js` | Novo - 38 testes |
| `__tests__/services/copyService.test.js` | Novo - 16 testes |
| `__tests__/services/betService.test.js` | Novo - 24 testes |

## Change Log

| Data | Alteração |
|------|-----------|
| 2026-01-12 | Implementação completa: 90 testes unitários para funções críticas, Jest configurado, CI funcional |
