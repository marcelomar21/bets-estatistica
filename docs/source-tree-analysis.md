# Bets Estatística - Análise da Árvore de Código

## Estrutura de Diretórios

```
bets-estatistica/
├── 📄 index.js                    # Script inicial de teste da API
├── 📄 main.js                     # ⭐ ENTRY POINT: Orquestrador do pipeline completo
├── 📄 package.json                # Dependências e scripts NPM
├── 📄 package-lock.json           # Lock de versões
├── 📄 README_agent.md             # Documentação do agente
├── 📄 TODO.md                     # Lista de tarefas
├── 📄 .gitignore                  # Arquivos ignorados pelo Git
│
├── 📁 agent/                      # ⭐ CORE: Módulos do agente IA
│   ├── 📄 db.js                   # Conexão PostgreSQL (pool, runQuery)
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
│   │   ├── 📄 pdfGenerator.js     # Gera PDF via Puppeteer
│   │   ├── 📄 reportService.js    # Orquestra HTML/PDF
│   │   ├── 📄 reportUtils.js      # Helpers de paths e leitura
│   │   └── 📄 analysisParser.js   # Parser de análises
│   │
│   └── 📁 shared/                 # Utilitários compartilhados
│       └── 📄 naming.js           # Convenções de nomes de arquivos
│
├── 📁 scripts/                    # ⭐ ETL: Scripts de coleta e carga
│   ├── 📄 daily_update.js         # ⭐ Atualização diária completa
│   ├── 📄 check_analysis_queue.js # Gerenciamento da fila de análise
│   ├── 📄 analyze_raw.js          # Análise de dados brutos
│   │
│   ├── 📄 fetchLeagueMatches.js   # Busca partidas da API
│   ├── 📄 loadLeagueMatches.js    # Carrega partidas no banco
│   ├── 📄 fetchMatchDetails.js    # Busca detalhes de partida
│   ├── 📄 loadMatchDetails.js     # Carrega detalhes no banco
│   ├── 📄 fetchLastX.js           # Busca forma recente
│   ├── 📄 loadLastX.js            # Carrega forma recente no banco
│   ├── 📄 fetchLeagueTeams.js     # Busca times da liga
│   ├── 📄 loadLeagueTeamStats.js  # Carrega stats de times
│   ├── 📄 fetchLeaguePlayers.js   # Busca jogadores
│   ├── 📄 loadLeaguePlayers.js    # Carrega jogadores no banco
│   ├── 📄 loadLeagueSeasons.js    # Carrega temporadas
│   └── 📄 loadCountries.js        # Carrega países
│   │
│   └── 📁 lib/                    # Bibliotecas auxiliares
│       └── 📄 matchScreening.js   # Lógica de fila e screening de jogos
│
├── 📁 sql/                        # ⭐ DATABASE: Schemas SQL
│   ├── 📄 league_schema.sql       # Tabelas de dados esportivos
│   └── 📄 agent_schema.sql        # Tabelas do agente
│
├── 📁 data/                       # 📦 OUTPUT: Dados gerados (gitignored)
│   ├── 📁 json/                   # JSONs da API
│   │   ├── 📁 match-details/      # Detalhes de partidas
│   │   ├── 📁 lastx/              # Forma recente
│   │   ├── 📁 upcoming-matches/   # Próximas partidas
│   │   └── 📁 jogos-analisados/   # Resumo de jogos processados
│   ├── 📁 analises_intermediarias/# JSONs de análise (input do persistence)
│   ├── 📁 analises_finais/        # Markdowns finais
│   ├── 📁 relatorios/             # Relatórios
│   │   ├── 📁 html/               # HTMLs gerados
│   │   └── 📁 pdf/                # PDFs gerados
│   └── 📁 sql_debug/              # Dumps de debug SQL
│
├── 📁 docs/                       # 📚 Documentação do projeto
│   └── (arquivos .md gerados)
│
├── 📁 _bmad/                      # Framework BMAD (instalação)
│   └── ...
│
└── 📁 _bmad-output/               # Artefatos BMAD do projeto
    └── 📁 planning-artifacts/
        └── 📄 bmm-workflow-status.yaml
```

## Diretórios Críticos

### `/agent` - Núcleo do Sistema
O coração do projeto. Contém toda a lógica de IA e persistência.

**Responsabilidades:**
- Conexão com banco de dados
- Execução de agentes LangChain
- Geração de análises estruturadas
- Conversão para múltiplos formatos

### `/scripts` - Pipeline ETL
Scripts para coleta e sincronização de dados.

**Responsabilidades:**
- Fetch de dados da API FootyStats
- Load de dados no PostgreSQL
- Atualização diária automatizada
- Gerenciamento da fila de análise

### `/sql` - Definições de Banco
Schemas SQL para criação das tabelas.

**Responsabilidades:**
- Definição de tabelas
- Constraints e índices
- Triggers e views
- Migrações (manual)

### `/data` - Saídas Geradas
Diretório de output (não versionado).

**Conteúdo:**
- JSONs brutos da API
- Análises intermediárias (JSON)
- Análises finais (Markdown)
- Relatórios (HTML/PDF)

## Entry Points

| Comando | Arquivo | Descrição |
|---------|---------|-----------|
| `node main.js` | `main.js` | Pipeline completo |
| `node scripts/daily_update.js` | `scripts/daily_update.js` | Atualização diária |
| `node scripts/check_analysis_queue.js` | `scripts/check_analysis_queue.js` | Gerenciar fila |
| `node agent/analysis/runAnalysis.js <id>` | `agent/analysis/runAnalysis.js` | Análise única |
| `node agent/persistence/main.js <id>` | `agent/persistence/main.js` | Persistir análise |
| `node agent/persistence/generateReport.js <id>` | `agent/persistence/generateReport.js` | Gerar HTML/PDF |

## Convenções de Código

### Nomenclatura de Arquivos
- `fetch*.js` - Scripts que buscam dados de APIs
- `load*.js` - Scripts que carregam dados no banco
- `generate*.js` - Scripts que geram saídas
- `*Schema.js` / `schema.js` - Definições de schemas

### Nomenclatura de Saídas
- Análises intermediárias: `YYYYMMDD_TimeA_x_TimeB.json`
- Análises finais: `CAMPEONATO_TimeAxTimeB_DATA.md`
- Relatórios: `YYYYMMDD_CAMPEONATO_TimeA_x_TimeB.{html,pdf}`

### Padrões de Código
- CommonJS (`require`/`module.exports`)
- Async/await para operações assíncronas
- Zod para validação de schemas
- Pool de conexões PostgreSQL

## Dependências Entre Módulos

```
main.js
    ├── scripts/check_analysis_queue.js
    │       └── scripts/lib/matchScreening.js
    ├── scripts/daily_update.js
    │       ├── scripts/lib/matchScreening.js
    │       ├── scripts/fetchLeagueMatches.js
    │       ├── scripts/loadLeagueMatches.js
    │       ├── scripts/fetchLeagueTeams.js
    │       └── scripts/loadLeagueTeamStats.js
    ├── agent/analysis/runAnalysis.js
    │       ├── agent/db.js
    │       ├── agent/tools.js
    │       ├── agent/analysis/prompt.js
    │       ├── agent/analysis/schema.js
    │       ├── agent/shared/naming.js
    │       └── scripts/lib/matchScreening.js
    ├── agent/persistence/main.js
    │       ├── agent/persistence/saveOutputs.js
    │       └── agent/db.js
    └── agent/persistence/generateReport.js
            ├── agent/persistence/reportService.js
            ├── agent/persistence/htmlRenderer.js
            └── agent/persistence/pdfGenerator.js
```

---
*Documentação gerada em 2026-01-10 via BMM document-project workflow*
