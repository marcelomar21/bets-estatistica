---
title: Tech Stack
created: 2026-02-25
tags: [project, tech-stack]
---

## Runtime

- **Node.js 20+** (bots - CommonJS)
- **Next.js 16.x** (admin panel - App Router + TypeScript)

## Database

- **PostgreSQL** via Supabase
- Row Level Security (RLS) em todas as tabelas
- Multi-tenant via `group_id`

## LLMs

- **LangChain 1.1.x** como framework de orquestracao
- **OpenAI** -- heavy model: `gpt-5.2`, light model: `gpt-5-mini`
- **Anthropic** -- Claude Sonnet 4.6 (para consenso multi-LLM)
- **Moonshot** -- Kimi 2.5 (para consenso multi-LLM)
- **Zod 4.x** -- validation + `withStructuredOutput` para LLM calls

### Configuracao Atual (lib/config.js)

```js
llm: {
  heavyModel: 'gpt-5.2',       // analise de jogos, avaliacao de resultados
  lightModel: 'gpt-5-mini',     // copy, interpretacao de mercado
  resultEvaluatorModel: this.heavyModel,  // alias
}
```

## APIs Externas

- **The Odds API** -- odds enrichment
- **FootyStats API** -- match data + results

## Deploy

- **Render** -- bots (1 servico por bot atualmente, migrar para servidor unico)
- **Vercel** -- admin panel (Next.js)

## Bibliotecas Principais

- **node-cron** -- scheduling de jobs
- **node-telegram-bot-api** -- Telegram SDK
- **Zod 4.x** -- validation de schemas e structured LLM output
- **LangChain 1.1.x** -- orquestracao de LLM calls
- **dotenv** -- env vars

## Testing

- **Vitest** -- testes unitarios (admin-panel/)
- **Playwright MCP** -- testes E2E via navegador

## Code Patterns

- Multi-tenant via `group_id` + RLS em todas as queries
- Service pattern: `{ success: true, data }` | `{ success: false, error }`
- Structured logger com `[module:job]` prefix
- Zod validation + `withStructuredOutput` para LLM calls
- Singleton pattern em `telegram.js` e `server.scheduler.js` (precisa virar factory)
- Config flat via env vars em `lib/config.js` (precisa virar DB-loaded per-group)
- Webhook URL = `/webhook/<BOT_TOKEN>` (1 rota por bot)
- `pendingConfirmations` Map global em `postBets.js` (precisa scope per-group)
- `copyService` usa raw string prompt sem system message (precisa `ChatPromptTemplate`)

## Test Patterns

- Vitest para unitarios (`admin-panel/`)
- Playwright MCP para E2E
- Mocks de config com `maxActiveBets: 3` (precisam atualizar)
