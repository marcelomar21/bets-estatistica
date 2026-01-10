# Bets Estatística - Guia de Desenvolvimento

## Pré-requisitos

| Requisito | Versão | Descrição |
|-----------|--------|-----------|
| Node.js | 20+ | Runtime JavaScript |
| PostgreSQL | 14+ | Banco de dados (ou Supabase) |
| npm | 10+ | Gerenciador de pacotes |
| Chrome/Chromium | - | Para geração de PDFs (Puppeteer) |

## Instalação

### 1. Clonar o repositório

```bash
git clone <repo-url>
cd bets-estatistica
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# API FootyStats
api_key=sua_chave_aqui

# PostgreSQL
PGHOST=localhost
PGPORT=5432
PGDATABASE=bets_stats
PGUSER=bets
PGPASSWORD=bets_pass_123
PGSSL=false
PGSSL_REJECT_UNAUTHORIZED=false

# OpenAI
OPENAI_API_KEY=sk-...

# Agente (opcional)
AGENT_MODEL=gpt-5.1-2025-11-13
AGENT_TEMPERATURE=0.3
AGENT_MAX_TOKENS=4096
AGENT_TIMEOUT_MS=180000
AGENT_MAX_STEPS=6
AGENT_DEBUG=false

# Pipeline (opcional)
MAX_PENDING_MATCHES=50
MAIN_AGENT_WINDOW_HOURS=168

# Puppeteer (opcional)
PUPPETEER_EXECUTABLE_PATH=/path/to/chrome
PUPPETEER_DISABLE_SANDBOX=false
```

### 4. Criar tabelas no banco

```bash
# Schema de dados esportivos
psql -f sql/league_schema.sql

# Schema do agente
psql -f sql/agent_schema.sql
```

## Comandos de Desenvolvimento

### Pipeline Completo

```bash
# Executa todo o pipeline (fila → update → análise → persist → report)
node main.js
```

### Comandos Individuais

```bash
# 1. Verificar/atualizar fila de análise
node scripts/check_analysis_queue.js [--dry-run] [--window-hours=72]

# 2. Atualizar dados (match details, lastx)
node scripts/daily_update.js

# 3. Executar análise IA
node agent/analysis/runAnalysis.js today           # Todos da fila
node agent/analysis/runAnalysis.js 7834664         # Match específico
node agent/analysis/runAnalysis.js 123,456,789     # Múltiplos

# 4. Persistir análise (Markdown + banco)
node agent/persistence/main.js 7834664

# 5. Gerar relatórios HTML/PDF
node agent/persistence/generateReport.js 7834664
node agent/persistence/generateMissingReports.js   # Todos faltantes
```

### Scripts de Carga de Dados

```bash
# Temporadas e ligas
node scripts/loadLeagueSeasons.js

# Países
node scripts/loadCountries.js

# Partidas de uma temporada
node scripts/fetchLeagueMatches.js --season-ids=1234
node scripts/loadLeagueMatches.js --season-ids=1234

# Times de uma temporada
node scripts/fetchLeagueTeams.js --season-ids=1234
node scripts/loadLeagueTeamStats.js --season-ids=1234

# Jogadores
node scripts/fetchLeaguePlayers.js --season-id=1234
node scripts/loadLeaguePlayers.js --season-id=1234

# Detalhes de partidas
node scripts/fetchMatchDetails.js <match_id>
node scripts/loadMatchDetails.js <match_id>

# Forma recente (lastX)
node scripts/fetchLastX.js <team_id>
node scripts/loadLastX.js <team_id>
```

## Estrutura de Saídas

Após execução do pipeline:

```
data/
├── json/
│   ├── match-details/match-7834664.json
│   ├── lastx/team-123.json
│   └── jogos-analisados/2026-01-10_to_2026-01-12.json
├── analises_intermediarias/
│   └── 20260110_Palmeiras_x_Corinthians.json
├── analises_finais/
│   └── Brasileirao_PalmeirasvsCorinthians_2026-01-10.md
└── relatorios/
    ├── html/20260110_Brasileirao_Palmeiras_x_Corinthians.html
    └── pdf/20260110_Brasileirao_Palmeiras_x_Corinthians.pdf
```

## Fluxo de Debug

### 1. Verificar fila

```bash
node scripts/check_analysis_queue.js --dry-run
```

### 2. Habilitar logs de debug do agente

```bash
AGENT_DEBUG=true node agent/analysis/runAnalysis.js 7834664
```

### 3. Verificar dumps SQL

Os dumps de SQL executados ficam em:
```
data/sql_debug/<match_id>_<teams>/<timestamp>/
```

### 4. Consultar status no banco

```sql
-- Fila de análise
SELECT * FROM match_analysis_queue ORDER BY updated_at DESC LIMIT 10;

-- Análises geradas
SELECT match_id, created_at FROM game_analysis ORDER BY created_at DESC LIMIT 10;

-- Apostas sugeridas
SELECT * FROM suggested_bets WHERE match_id = 7834664;
```

## Testes

Atualmente o projeto não possui suíte de testes automatizados.

```bash
npm test  # Retorna erro (não implementado)
```

## Variáveis de Ambiente

### Obrigatórias

| Variável | Descrição |
|----------|-----------|
| `api_key` | Chave da API FootyStats |
| `OPENAI_API_KEY` | Chave da API OpenAI |
| `PGHOST` | Host do PostgreSQL |
| `PGDATABASE` | Nome do banco |
| `PGUSER` | Usuário do banco |
| `PGPASSWORD` | Senha do banco |

### Opcionais

| Variável | Default | Descrição |
|----------|---------|-----------|
| `PGPORT` | 5432 | Porta do PostgreSQL |
| `PGSSL` | false | Habilitar SSL |
| `AGENT_MODEL` | gpt-5.1-2025-11-13 | Modelo OpenAI |
| `AGENT_TEMPERATURE` | - | Temperatura do modelo |
| `AGENT_MAX_TOKENS` | - | Max tokens por resposta |
| `AGENT_TIMEOUT_MS` | 180000 | Timeout em ms |
| `AGENT_MAX_STEPS` | 6 | Máximo de passos do agente |
| `AGENT_DEBUG` | false | Logs de debug |
| `MAX_PENDING_MATCHES` | 50 | Limite da fila |
| `MAIN_AGENT_WINDOW_HOURS` | 168 | Janela de análise (horas) |

## Troubleshooting

### Erro: "OPENAI_API_KEY não configurada"
Verifique se a variável está no `.env` ou como `openai_api_key`.

### Erro: "match_id não encontrado em league_matches"
Execute a sincronização de partidas primeiro:
```bash
node scripts/fetchLeagueMatches.js --season-ids=<id>
node scripts/loadLeagueMatches.js --season-ids=<id>
```

### Erro: "Agente não produziu resposta final"
- Aumente `AGENT_MAX_STEPS`
- Verifique se há dados em `stats_match_details` e `team_lastx_stats`
- Verifique timeout com `AGENT_TIMEOUT_MS`

### PDF não gera / Puppeteer falha
- Configure `PUPPETEER_EXECUTABLE_PATH` para o Chrome instalado
- Em containers, use `PUPPETEER_DISABLE_SANDBOX=true`

### Fila não processa jogos
Verifique se os jogos são o "próximo compromisso" de ambos os times:
```bash
node scripts/check_analysis_queue.js --dry-run --window-hours=168
```

## Convenções de Código

- **Linguagem:** JavaScript (ES2022+)
- **Módulos:** CommonJS (`require`/`module.exports`)
- **Async:** async/await
- **Validação:** Zod schemas
- **Banco:** Pool de conexões pg
- **Logs:** Console (sem framework)

---
*Documentação gerada em 2026-01-10 via BMM document-project workflow*
