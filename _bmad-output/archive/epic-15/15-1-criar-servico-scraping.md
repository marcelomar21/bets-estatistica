# Story 15.1: Criar Serviço de Scraping (scrapingOddsService.js)

Status: ready-for-dev

## Story

As a sistema,
I want ter um serviço de scraping de odds via LLM,
so that possa buscar odds diretamente da Betano.

## Acceptance Criteria

1. **Given** módulo `bot/services/scrapingOddsService.js` criado
   **When** chamado com dados de uma aposta
   **Then** usa agente LLM para extrair odds da Betano

2. **Given** função `scrapeBetOdds(homeTeam, awayTeam, betMarket, betPick)`
   **When** executada
   **Then** acessa site da Betano
   **And** encontra o jogo pelos times
   **And** extrai APENAS a odd do mercado específico
   **And** retorna valor numérico

3. **Given** retorno da função
   **When** odds encontradas
   **Then** formato é: `{ bookmaker: 'betano', odds: 1.85, market: 'totals', type: 'over', line: 2.5 }`

4. **Given** economia de tokens
   **When** fazendo scraping
   **Then** busca APENAS o mercado específico da aposta
   **And** NÃO busca todos os mercados do jogo

5. **Given** erro no scraping
   **When** função falha
   **Then** retorna `{ success: false, error: { code: 'SCRAPE_ERROR', message: '...' } }`

## Tasks / Subtasks

- [ ] Task 1: Criar estrutura do serviço (AC: #1)
  - [ ] 1.1: Criar arquivo bot/services/scrapingOddsService.js
  - [ ] 1.2: Importar dependências (config, logger, LangChain/OpenAI)
  - [ ] 1.3: Definir constantes e configurações

- [ ] Task 2: Implementar função scrapeBetOdds (AC: #2, #3)
  - [ ] 2.1: Definir assinatura da função
  - [ ] 2.2: Construir URL da Betano para o jogo
  - [ ] 2.3: Criar prompt focado para extrair odd específica
  - [ ] 2.4: Chamar agente LLM com tool de web browsing
  - [ ] 2.5: Parsear resposta e extrair valor numérico

- [ ] Task 3: Implementar prompt otimizado (AC: #4)
  - [ ] 3.1: Prompt focado: "Qual a odd de [mercado] no jogo [time1] vs [time2] na Betano?"
  - [ ] 3.2: Instruir agente a retornar APENAS o valor numérico
  - [ ] 3.3: Limitar escopo de busca

- [ ] Task 4: Implementar tratamento de erros (AC: #5)
  - [ ] 4.1: Capturar erros de conexão/timeout
  - [ ] 4.2: Capturar erros de parsing
  - [ ] 4.3: Retornar formato padronizado de erro

- [ ] Task 5: Exportar funções do módulo (AC: #1)
  - [ ] 5.1: Exportar scrapeBetOdds
  - [ ] 5.2: Exportar helpers se necessário

## Dev Notes

### Arquitetura do Agente LLM

O projeto já usa LangChain para análises (ver `agent/`). O serviço de scraping pode reutilizar a infraestrutura existente ou criar uma instância específica.

**Opção 1: Claude Computer Use / Playwright**
```javascript
// Usa Claude com tool de computer use para navegar
const { ChatAnthropic } = require('@langchain/anthropic');
```

**Opção 2: OpenAI + Browser Plugin**
```javascript
// Usa GPT com plugin de navegação
const { ChatOpenAI } = require('@langchain/openai');
```

**Opção 3: Firecrawl / Browserless**
```javascript
// Usa serviço de scraping headless + LLM para extrair
const firecrawl = require('firecrawl');
```

### Interface da Função

```javascript
/**
 * Scrape odds for a specific bet from Betano
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} betMarket - Market description (e.g., "Over 2.5 gols")
 * @param {string} betPick - Pick type (e.g., "over", "under", "yes", "no")
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function scrapeBetOdds(homeTeam, awayTeam, betMarket, betPick) {
  // Input: "Liverpool", "Arsenal", "Over 2.5 gols", "over"
  // Output: { success: true, data: { bookmaker: 'betano', odds: 1.85, market: 'totals', type: 'over', line: 2.5 } }
}
```

### Prompt Otimizado para Economia

```javascript
const prompt = `
Acesse a Betano e encontre a odd para:
- Jogo: ${homeTeam} vs ${awayTeam}
- Mercado: ${betMarket}
- Seleção: ${betPick}

Retorne APENAS o valor numérico da odd (ex: 1.85).
Se não encontrar, retorne "NOT_FOUND".
`;
```

### URL Pattern Betano

```javascript
// Betano URL pattern para jogos de futebol
// https://www.betano.com.br/sport/futebol/[liga]/[jogo]
// A URL exata pode precisar de busca dinâmica
const BETANO_SEARCH_URL = 'https://www.betano.com.br/sport/futebol/';
```

### Formato de Retorno (Alinhado com oddsService)

```javascript
// Sucesso
return {
  success: true,
  data: {
    bookmaker: 'betano',
    odds: 1.85,
    market: 'totals',
    type: 'over',
    line: 2.5,
    source: 'scraping',
    scrapedAt: new Date().toISOString()
  }
};

// Erro
return {
  success: false,
  error: {
    code: 'SCRAPE_ERROR',
    message: 'Jogo não encontrado na Betano'
  }
};
```

### Arquivos a Criar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/services/scrapingOddsService.js` | CRIAR | Serviço de scraping via LLM |

### Dependências

- LangChain ou SDK de LLM
- Serviço de web browsing (a definir)
- `lib/config.js` - configurações
- `lib/logger.js` - logging

### Project Structure Notes

- Seguir padrão de services existentes
- Retornar `{ success, data/error }` pattern
- Usar logger para debug e erros

### Considerações de Custo

- Cada chamada LLM consome tokens
- Estimar ~500-1000 tokens por scrape
- Cache é CRÍTICO para economia (Story 15.2)

### References

- [Source: bot/services/oddsService.js:482-550] - getOddsForBet como modelo
- [Source: agent/] - Infraestrutura LangChain existente
- [Source: _bmad-output/planning-artifacts/epics.md#story-15.1] - Definição original

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/services/scrapingOddsService.js (criar)
