# Bets Estatística - Arquitetura do Sistema

## Visão Geral

O sistema segue uma arquitetura de **Pipeline ETL com Agente IA**, onde dados externos são coletados, processados e analisados por um agente inteligente para gerar insights e recomendações.

## Padrão Arquitetural

**Pipeline-based Architecture** com os seguintes componentes:

1. **Data Ingestion Layer** - Scripts ETL para coleta de dados
2. **Data Storage Layer** - PostgreSQL para persistência
3. **AI Processing Layer** - Agente LangChain para análise
4. **Output Generation Layer** - Geração de relatórios multi-formato

## Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BETS ESTATÍSTICA                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    DATA INGESTION LAYER                           │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │   │
│  │  │fetchLeague  │ │fetchMatch   │ │fetchLastX   │ │fetchPlayers │ │   │
│  │  │Matches.js   │ │Details.js   │ │.js          │ │.js          │ │   │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ │   │
│  │         │               │               │               │         │   │
│  │  ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐ │   │
│  │  │loadLeague   │ │loadMatch    │ │loadLastX    │ │loadLeague   │ │   │
│  │  │Matches.js   │ │Details.js   │ │.js          │ │Players.js   │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    DATA STORAGE LAYER                             │   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │                     PostgreSQL                               │ │   │
│  │  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐  │ │   │
│  │  │  │league_seasons │ │league_matches │ │stats_match_details│  │ │   │
│  │  │  └───────────────┘ └───────────────┘ └───────────────────┘  │ │   │
│  │  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐  │ │   │
│  │  │  │league_players │ │team_lastx_    │ │match_analysis_    │  │ │   │
│  │  │  │               │ │stats          │ │queue              │  │ │   │
│  │  │  └───────────────┘ └───────────────┘ └───────────────────┘  │ │   │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    AI PROCESSING LAYER                            │   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │                   LangChain Agent                            │ │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │ │   │
│  │  │  │ prompt.js   │  │ schema.js   │  │ runAnalysis.js      │  │ │   │
│  │  │  │ (System +   │  │ (Zod        │  │ (Agent Loop)        │  │ │   │
│  │  │  │  Human)     │  │  Schemas)   │  │                     │  │ │   │
│  │  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │ │   │
│  │  │  ┌─────────────────────────────────────────────────────┐    │ │   │
│  │  │  │                    Tools                             │    │ │   │
│  │  │  │  ┌──────────────────┐  ┌──────────────────────────┐ │    │ │   │
│  │  │  │  │match_detail_raw  │  │team_lastx_raw            │ │    │ │   │
│  │  │  │  │(Query match data)│  │(Query team recent form)  │ │    │ │   │
│  │  │  │  └──────────────────┘  └──────────────────────────┘ │    │ │   │
│  │  │  └─────────────────────────────────────────────────────┘    │ │   │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    OUTPUT GENERATION LAYER                        │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │   │
│  │  │ JSON        │ │ Markdown    │ │ HTML        │ │ PDF         │ │   │
│  │  │ (análises_  │ │ (análises_  │ │ (relatorios/│ │ (relatorios/│ │   │
│  │  │ intermediá- │ │ finais/)    │ │ html/)      │ │ pdf/)       │ │   │
│  │  │ rias/)      │ │             │ │             │ │             │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Componentes Detalhados

### 1. Data Ingestion Layer

**Responsabilidade:** Coletar dados da API FootyStats e persistir no PostgreSQL.

| Script | Função |
|--------|--------|
| `fetchLeagueMatches.js` | Busca partidas de temporadas |
| `loadLeagueMatches.js` | Persiste partidas em league_matches |
| `fetchMatchDetails.js` | Busca estatísticas detalhadas |
| `loadMatchDetails.js` | Persiste em stats_match_details |
| `fetchLastX.js` | Busca forma recente dos times |
| `loadLastX.js` | Persiste em team_lastx_stats |
| `daily_update.js` | Orquestra atualização diária |
| `check_analysis_queue.js` | Gerencia fila de análise |

### 2. Data Storage Layer

**Responsabilidade:** Armazenar e organizar todos os dados do sistema.

**Schemas:**
- `league_schema.sql` - Tabelas de dados esportivos
- `agent_schema.sql` - Tabelas do agente de análise

**Tabelas principais:**
- `league_seasons` - Temporadas das ligas
- `league_matches` - Partidas
- `league_players` - Jogadores
- `league_team_stats` - Estatísticas de times
- `stats_match_details` - Detalhes de partidas
- `team_lastx_stats` - Forma recente (últimos X jogos)
- `match_analysis_queue` - Fila de análise
- `game_analysis` - Análises geradas
- `suggested_bets` - Apostas sugeridas

### 3. AI Processing Layer

**Responsabilidade:** Gerar análises inteligentes usando LangChain.

**Componentes:**

| Arquivo | Função |
|---------|--------|
| `runAnalysis.js` | Loop principal do agente |
| `prompt.js` | Prompts sistema e humano |
| `schema.js` | Schemas Zod para validação |
| `tools.js` | Ferramentas SQL para o agente |

**Fluxo do Agente:**
1. Recebe contexto do jogo (times, estatísticas, forma recente)
2. Usa ferramentas para consultar dados adicionais
3. Gera análise estruturada (overview, safe_bets, value_bets)
4. Valida coerência entre apostas seguras e de valor
5. Salva JSON intermediário

### 4. Output Generation Layer

**Responsabilidade:** Gerar relatórios em múltiplos formatos.

| Módulo | Função |
|--------|--------|
| `generateMarkdown.js` | Converte JSON para Markdown |
| `htmlRenderer.js` | Renderiza HTML a partir do payload |
| `pdfGenerator.js` | Gera PDF via Puppeteer |
| `saveOutputs.js` | Persiste no banco de dados |
| `reportService.js` | Orquestra geração completa |

## Orquestração (main.js)

O arquivo `main.js` é o orquestrador principal que executa o pipeline completo:

```javascript
// Fluxo simplificado
1. check_analysis_queue  → Recalcula fila de jogos pendentes
2. daily_update          → Atualiza dados (match details, lastx)
3. runAnalysis           → Executa agente IA para jogos elegíveis
4. persistence/main      → Salva Markdown e insere no banco
5. generateReport        → Gera HTML/PDF
```

## Estados da Fila (match_analysis_queue)

| Status | Descrição |
|--------|-----------|
| `pending` | Jogo precisa de atualização/análise |
| `dados_importados` | daily_update trouxe stats frescos |
| `analise_completa` | runAnalysis finalizou, JSON intermediário existe |
| `relatorio_concluido` | Markdown/DB salvos, PDF pode ser gerado |

## Integrações Externas

### API FootyStats
- **Base URL:** `https://api.football-data-api.com`
- **Endpoints usados:**
  - `/league-list` - Lista de ligas
  - `/league-season` - Estatísticas de temporada
  - `/match` - Detalhes de partida
  - `/lastx` - Forma recente do time

### OpenAI
- **Modelo:** gpt-5.1-2025-11-13 (configurável via AGENT_MODEL)
- **Timeout:** 180s (configurável via AGENT_TIMEOUT_MS)
- **Max Steps:** 6 (configurável via AGENT_MAX_STEPS)

## Decisões Arquiteturais

### Por que LangChain?
- Abstração para diferentes LLMs
- Suporte nativo a tools/function calling
- Facilidade para implementar agent loops
- Parsing estruturado com Zod

### Por que PostgreSQL?
- Suporte a JSONB para payloads flexíveis
- Robustez para dados transacionais
- Triggers para sincronização automática
- Views para consultas complexas (ex: timezone Brasil)

### Por que Puppeteer para PDFs?
- Renderização fiel do HTML
- Suporte a CSS moderno
- Controle total sobre layout
- Headless browser confiável

---
*Documentação gerada em 2026-01-10 via BMM document-project workflow*
