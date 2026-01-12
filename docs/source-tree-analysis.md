# Bets Estatística - Análise da Árvore de Código

## Estrutura de Diretórios

```
bets-estatistica/
├── 📄 package.json                # Dependências e scripts NPM
├── 📄 package-lock.json           # Lock de versões
├── 📄 render.yaml                 # Configuração Render (deploy)
├── 📄 README.md                   # Documentação principal
├── 📄 README_agent.md             # Documentação do agente IA
├── 📄 .gitignore                  # Arquivos ignorados pelo Git
│
├── 📁 agent/                      # ⭐ CORE: Módulos do agente IA
│   ├── 📄 pipeline.js             # ⭐ Orquestrador do pipeline completo
│   ├── 📄 db.js                   # Shim → lib/db.js (compatibilidade)
│   ├── 📄 tools.js                # Tools do agente (match_detail_raw, team_lastx_raw)
│   │
│   ├── 📁 analysis/               # ⭐ Análise via LangChain
│   │   ├── 📄 runAnalysis.js      # Loop do agente, geração de análises
│   │   ├── 📄 prompt.js           # Prompts sistema e humano
│   │   └── 📄 schema.js           # Schemas Zod para validação
│   │
│   ├── 📁 persistence/            # Persistência e geração de relatórios
│   │   ├── 📄 main.js             # CLI para persistir análise de um match
│   │   ├── 📄 saveOutputs.js      # Salva Markdown e insere no banco
│   │   ├── 📄 generateMarkdown.js # Converte JSON para Markdown
│   │   ├── 📄 generateReport.js   # CLI para gerar relatório pontual
│   │   ├── 📄 generateMissingReports.js  # Gera relatórios faltantes
│   │   ├── 📄 htmlRenderer.js     # Renderiza HTML do payload
│   │   ├── 📄 reportService.js    # Orquestra geração de relatórios HTML
│   │   ├── 📄 reportUtils.js      # Helpers de paths e leitura
│   │   └── 📄 analysisParser.js   # Parser de análises
│   │
│   └── 📁 shared/                 # Utilitários compartilhados
│       └── 📄 naming.js           # Convenções de nomes de arquivos
│
├── 📁 bot/                        # ⭐ BOT: Telegram Bot + Scheduler
│   ├── 📄 index.js                # Entry point (modo polling/dev)
│   ├── 📄 server.js               # ⭐ Entry point (modo webhook/prod)
│   ├── 📄 telegram.js             # Cliente Telegram singleton
│   │
│   ├── 📁 handlers/               # Handlers de mensagens
│   │   └── 📄 adminGroup.js       # Comandos e respostas do grupo admin
│   │
│   ├── 📁 jobs/                   # Jobs agendados
│   │   ├── 📄 postBets.js         # Posta apostas no grupo público
│   │   ├── 📄 requestLinks.js     # Pede links no grupo admin
│   │   ├── 📄 trackResults.js     # Rastreia resultados de jogos
│   │   ├── 📄 enrichOdds.js       # Enriquece apostas com odds
│   │   ├── 📄 healthCheck.js      # Verifica saúde do sistema
│   │   └── 📄 reminders.js        # Envia lembretes
│   │
│   └── 📁 services/               # Serviços de negócio
│       ├── 📄 betService.js       # CRUD de apostas
│       ├── 📄 oddsService.js      # Integração The Odds API
│       ├── 📄 alertService.js     # Alertas no grupo admin
│       ├── 📄 copyService.js      # Geração de copy com LLM
│       ├── 📄 matchService.js     # Queries de partidas
│       ├── 📄 metricsService.js   # Métricas e estatísticas
│       └── 📄 marketInterpreter.js# Interpretação de mercados
│
├── 📁 lib/                        # ⭐ Bibliotecas compartilhadas
│   ├── 📄 db.js                   # FONTE ÚNICA: PostgreSQL Pool
│   ├── 📄 supabase.js             # Cliente REST Supabase
│   ├── 📄 logger.js               # Logging centralizado
│   └── 📄 config.js               # Configurações centralizadas
│
├── 📁 scripts/                    # ⭐ ETL: Scripts de coleta e carga
│   ├── 📄 pipeline.js             # Pipeline unificado de ETL
│   ├── 📄 daily_update.js         # ⭐ Atualização diária completa
│   ├── 📄 check_analysis_queue.js # Gerenciamento da fila de análise
│   ├── 📄 syncSeasons.js          # Sincroniza temporadas
│   │
│   ├── 📄 fetchLeagues.js         # Busca ligas da API
│   ├── 📄 fetchLeagueMatches.js   # Busca partidas da API
│   ├── 📄 fetchMatchDetails.js    # Busca detalhes de partida
│   ├── 📄 fetchLastX.js           # Busca forma recente
│   ├── 📄 fetchLeagueTeams.js     # Busca times da liga
│   ├── 📄 fetchLeaguePlayers.js   # Busca jogadores
│   │
│   ├── 📄 loadCountries.js        # Carrega países no banco
│   ├── 📄 loadLeagueSeasons.js    # Carrega temporadas
│   ├── 📄 loadLeagueMatches.js    # Carrega partidas no banco
│   ├── 📄 loadMatchDetails.js     # Carrega detalhes no banco
│   ├── 📄 loadLastX.js            # Carrega forma recente no banco
│   ├── 📄 loadLeagueTeamStats.js  # Carrega stats de times
│   ├── 📄 loadLeaguePlayers.js    # Carrega jogadores no banco
│   │
│   ├── 📄 resetAndEnrich.js       # Reset e enriquecimento
│   ├── 📄 resetPosted.js          # Reset de apostas postadas
│   ├── 📄 run-migration.js        # Executa migrations SQL
│   │
│   ├── 📁 lib/                    # Bibliotecas auxiliares
│   │   ├── 📄 db.js               # Shim → lib/db.js
│   │   └── 📄 matchScreening.js   # Lógica de fila e screening
│   │
│   └── 📁 tests/                  # Scripts de teste e debug
│       ├── 📄 test-bet-matching.js
│       ├── 📄 test-bot-flow.js
│       ├── 📄 test-market-interpreter.js
│       ├── 📄 test-odds-api.js
│       ├── 📄 test-production-flow.js
│       ├── 📄 test-supabase.js
│       ├── 📄 test-telegram.js
│       ├── 📄 debug-bets.js
│       └── 📄 analyze_raw.js
│
├── 📁 sql/                        # ⭐ DATABASE: Schemas SQL
│   ├── 📄 league_schema.sql       # Tabelas de dados esportivos
│   ├── 📄 agent_schema.sql        # Tabelas do agente
│   └── 📁 migrations/             # Migrations SQL
│       └── 📄 001_initial_schema.sql
│
├── 📁 docs/                       # 📚 Documentação do projeto
│   ├── 📄 index.md
│   ├── 📄 architecture.md
│   ├── 📄 data-models.md
│   ├── 📄 development-guide.md
│   ├── 📄 project-overview.md
│   └── 📄 source-tree-analysis.md
│
├── 📁 _bmad/                      # Framework BMAD (instalação)
│
└── 📁 _bmad-output/               # Artefatos BMAD do projeto
    ├── 📄 project-context.md      # Regras para AI agents
    └── 📁 planning-artifacts/
        └── 📄 sprint-status.yaml
```

## Módulos Principais

### `/agent` - Módulo de Análise IA
Contém o agente de análise baseado em LangChain/OpenAI.

**Entry Point:** `node agent/pipeline.js`

**Responsabilidades:**
- Execução de agentes LangChain
- Geração de análises estruturadas
- Persistência de resultados
- Geração de relatórios HTML

### `/bot` - Módulo Telegram Bot
Bot do Telegram com scheduler interno para postagens automáticas.

**Entry Point (prod):** `node bot/server.js`
**Entry Point (dev):** `node bot/index.js`

**Responsabilidades:**
- Webhook do Telegram
- Jobs agendados (postagens, lembretes, tracking)
- Comandos admin (/apostas, /status, etc)
- Integração The Odds API

### `/lib` - Bibliotecas Compartilhadas
Código reutilizado entre agent, bot e scripts.

**Arquivos:**
- `db.js` - PostgreSQL Pool (fonte única)
- `supabase.js` - Cliente REST Supabase
- `logger.js` - Logging centralizado
- `config.js` - Configurações

### `/scripts` - Pipeline ETL
Scripts para coleta e sincronização de dados do FootyStats.

**Entry Point:** `node scripts/pipeline.js`

**Responsabilidades:**
- Fetch de dados da API FootyStats
- Load de dados no PostgreSQL/Supabase
- Atualização diária automatizada
- Gerenciamento da fila de análise

## Entry Points

| Comando | Arquivo | Descrição |
|---------|---------|-----------|
| `npm start` | `bot/server.js` | Bot em produção (webhook) |
| `npm run dev` | `bot/index.js` | Bot em desenvolvimento (polling) |
| `npm run pipeline` | `agent/pipeline.js` | Pipeline de análise IA |
| `node scripts/pipeline.js` | `scripts/pipeline.js` | Pipeline ETL unificado |
| `node scripts/daily_update.js` | `scripts/daily_update.js` | Atualização diária |

## Dependências Entre Módulos

```
bot/server.js (PRODUÇÃO)
    ├── lib/config.js
    ├── lib/logger.js
    ├── bot/telegram.js
    ├── bot/handlers/adminGroup.js
    │       └── bot/services/*.js
    └── bot/jobs/*.js
            └── lib/supabase.js

agent/pipeline.js (ANÁLISE)
    ├── scripts/check_analysis_queue.js
    ├── scripts/daily_update.js
    ├── agent/analysis/runAnalysis.js
    │       ├── lib/db.js
    │       └── agent/tools.js
    └── agent/persistence/main.js
            └── lib/db.js
```

## Convenções

### Nomenclatura de Arquivos
- `fetch*.js` - Scripts que buscam dados de APIs
- `load*.js` - Scripts que carregam dados no banco
- `test-*.js` - Scripts de teste (em scripts/tests/)
- `*Service.js` - Serviços de negócio

### Padrões de Código
- CommonJS (`require`/`module.exports`)
- Async/await para operações assíncronas
- Zod para validação de schemas
- Pattern `{ success, data/error }` para retornos de services

---
*Documentação atualizada em 2026-01-12 via Story 11.1*
