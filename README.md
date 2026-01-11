# bets-estatistica 🎯

Sistema automatizado de análise estatística de futebol e geração de apostas seguras via IA.

## 🚀 Quick Start

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais

# 3. Testar conexões
node scripts/test-bot-flow.js

# 4. Rodar pipeline completo
node scripts/pipeline.js
```

## 📋 Variáveis de Ambiente

```bash
# Supabase (banco de dados)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
DATABASE_URL=postgresql://postgres.xxx:SENHA@aws-1-us-east-1.pooler.supabase.com:5432/postgres

# FootyStats API (dados de futebol)
FOOTYSTATS_API_KEY=sua-chave-footystats

# OpenAI (análise IA)
OPENAI_API_KEY=sk-...

# The Odds API (odds em tempo real)
THE_ODDS_API_KEY=sua-chave-odds

# Telegram Bot
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_ADMIN_GROUP_ID=-100...
TELEGRAM_PUBLIC_GROUP_ID=-100...
```

## 🔧 Comandos

### Pipeline Completo

```bash
# Roda todo o fluxo: ETL → Análise → Odds
node scripts/pipeline.js

# Ver opções
node scripts/pipeline.js --help

# Rodar apenas um step específico
node scripts/pipeline.js --step=3

# Rodar a partir de um step
node scripts/pipeline.js --from=3
```

### Steps Individuais

```bash
# 1. Sincronizar temporadas e jogos (PRIMEIRO PASSO!)
node scripts/syncSeasons.js

# 2. Verificar fila de análise
node scripts/check_analysis_queue.js

# 3. Buscar detalhes e stats
node scripts/daily_update.js

# 4. Rodar análise IA
node agent/analysis/runAnalysis.js today

# 5. Salvar outputs no banco
node agent/persistence/main.js

# 6. Enriquecer com odds
node bot/jobs/enrichOdds.js

# 7. Pedir links ao admin
node bot/jobs/requestLinks.js morning
```

### Sincronização de Dados

```bash
# Buscar lista de ligas (salva em data/json/league-list.json)
node scripts/fetchLeagues.js

# Sincronizar temporadas ativas + jogos (recomendado)
node scripts/syncSeasons.js
```

### Bot Telegram

```bash
# Iniciar bot (modo polling)
node bot/index.js

# Testar conexões
node scripts/test-telegram.js
node scripts/test-supabase.js
node scripts/test-bot-flow.js
```

### Jobs Agendados

```bash
# Postar apostas no grupo público
node bot/jobs/postBets.js morning|afternoon|night

# Enviar lembretes de links
node bot/jobs/reminders.js

# Rastrear resultados de apostas
node bot/jobs/trackResults.js
```

## 📁 Estrutura do Projeto

```
bets-estatistica/
├── agent/                    # Agente IA de análise
│   ├── analysis/             # Prompt, schema, runAnalysis
│   ├── persistence/          # Salvar outputs
│   └── db.js                 # Conexão DB (Supabase/PG)
│
├── bot/                      # Bot Telegram
│   ├── handlers/             # Handlers de mensagens
│   ├── jobs/                 # Jobs agendados
│   ├── services/             # Serviços (odds, bets, metrics)
│   ├── index.js              # Entry point
│   └── telegram.js           # Cliente Telegram
│
├── lib/                      # Bibliotecas compartilhadas
│   ├── config.js             # Configurações
│   ├── logger.js             # Logging
│   └── supabase.js           # Cliente Supabase
│
├── scripts/                  # Scripts de ETL e utilitários
│   ├── pipeline.js           # Pipeline unificado
│   ├── daily_update.js       # ETL FootyStats
│   ├── check_analysis_queue.js
│   └── test-*.js             # Scripts de teste
│
├── sql/migrations/           # Migrações SQL
│   └── 001_initial_schema.sql
│
├── .env.example              # Template de variáveis
├── render.yaml               # Config deploy Render
└── package.json
```

## 🔄 Fluxo de Dados

```
FootyStats API → daily_update.js → PostgreSQL (Supabase)
                                          ↓
                                  check_analysis_queue.js
                                          ↓
                                   runAnalysis.js (IA)
                                          ↓
                                    saveOutputs.js
                                          ↓
                                   enrichOdds.js (The Odds API)
                                          ↓
                                  requestLinks.js → Grupo Admin
                                          ↓
                                   postBets.js → Grupo Público
                                          ↓
                                  trackResults.js
```

## 🎯 Estado das Apostas

```
generated → pending_link → ready → posted → success/failure
                                 ↘ cancelled
```

| Estado | Descrição |
|--------|-----------|
| `generated` | Aposta criada pela IA |
| `pending_link` | Aguardando link do operador |
| `ready` | Link recebido, pronta para postar |
| `posted` | Enviada ao grupo público |
| `success` | Jogo terminou, aposta ganhou |
| `failure` | Jogo terminou, aposta perdeu |
| `cancelled` | Cancelada (sem link a tempo) |

## 🔗 Links Úteis

- [Supabase Dashboard](https://supabase.com/dashboard)
- [The Odds API](https://the-odds-api.com/)
- [FootyStats API](https://footystats.org/api)
- [Telegram Bot API](https://core.telegram.org/bots/api)

## 📝 Notas

- O bot usa **polling** (não webhook) para simplificar deploy
- Jobs são executados via **cron** externo ou Render Cron (pago)
- Odds mínimas para postagem: **1.60**
- Máximo de apostas ativas: **3**
- Janela de jogos: **≤ 2 dias**
