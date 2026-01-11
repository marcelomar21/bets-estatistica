# 🎯 Bets Estatística - Bot de Apostas Automatizado

Sistema automatizado de geração, análise e publicação de apostas esportivas.

## 🚀 Quick Start

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas chaves

# 3. Testar conexões
node scripts/test-bot-flow.js

# 4. Rodar pipeline completo
node scripts/pipeline.js
```

## 📋 Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        PIPELINE DIÁRIO                           │
├─────────────────────────────────────────────────────────────────┤
│  1. syncSeasons     → Busca temporadas/jogos (FootyStats API)   │
│  2. check-queue     → Identifica jogos para análise             │
│  3. daily-update    → Busca detalhes dos jogos                  │
│  4. run-analysis    → Análise IA (OpenAI/LangChain)             │
│  5. save-outputs    → Salva apostas no Supabase                 │
│  6. enrich-odds     → Busca odds (The Odds API)                 │
│  7. request-links   → Pede links aos admins (Telegram)          │
│  8. post-bets       → Publica no grupo público                  │
└─────────────────────────────────────────────────────────────────┘
```

## ⚙️ Variáveis de Ambiente

```bash
# Supabase (PostgreSQL)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# FootyStats API (dados de futebol)
FOOTYSTATS_API_KEY=sua-chave-footystats

# OpenAI (análise IA)
OPENAI_API_KEY=sk-...

# The Odds API (odds ao vivo)
THE_ODDS_API_KEY=sua-chave-odds

# Telegram Bot
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_ADMIN_GROUP_ID=-100123456789
TELEGRAM_PUBLIC_GROUP_ID=-100987654321
```

## 🤖 Executando o Bot

### ⚠️ IMPORTANTE: O bot precisa estar rodando para receber links!

O bot do Telegram precisa estar ativo para:
- Receber links dos admins quando eles respondem
- Processar comandos `/status` e `/help`
- Validar e salvar os deep links

```bash
# Terminal 1: Rodar o bot (OBRIGATÓRIO para receber links)
node bot/index.js

# Terminal 2: Rodar jobs manualmente (quando necessário)
node bot/jobs/requestLinks.js    # Pede links aos admins
node bot/jobs/postBets.js        # Publica no grupo público
node bot/jobs/enrichOdds.js      # Atualiza odds
```

### Em produção (Render)

O scheduler roda automaticamente:

```bash
# Inicia bot + scheduler (jobs automáticos)
node bot/scheduler.js
```

## 📅 Horários dos Jobs (São Paulo)

| Horário | Job | Descrição |
|---------|-----|-----------|
| 08:00 | `requestLinks` | Enriquece odds + pede links |
| 10:00 | `postBets` | Publica apostas da manhã |
| 13:00 | `requestLinks` | Enriquece odds + pede links |
| 15:00 | `postBets` | Publica apostas da tarde |
| 20:00 | `requestLinks` | Enriquece odds + pede links |
| 22:00 | `postBets` | Publica apostas da noite |
| */5min | `trackResults` | Verifica resultados |

## 🔧 Pipeline Manual

```bash
# Pipeline completo (steps 1-5, sem Telegram)
node scripts/pipeline.js

# Step específico
node scripts/pipeline.js --step=4    # Só análise IA

# A partir de um step
node scripts/pipeline.js --from=6    # Steps 6, 7, 8

# Ver ajuda
node scripts/pipeline.js --help

# Dry run (ver o que seria executado)
node scripts/pipeline.js --dry-run
```

### Steps disponíveis

1. `sync-seasons` - Sincroniza temporadas e jogos
2. `check-queue` - Verifica fila de análise
3. `daily-update` - Busca dados FootyStats
4. `run-analysis` - Análise IA
5. `save-outputs` - Salva no banco
6. `enrich-odds` - Busca odds (opcional)
7. `request-links` - Pede links (opcional)
8. `post-bets` - Publica (opcional)

## 📱 Fluxo do Telegram

### Grupo de Admins

O bot envia pedidos de links:
```
🔗 LINKS NECESSÁRIOS

1️⃣ Team A vs Team B
   📊 Mais de 2.5 gols
   💰 Odds: 1.85
   → Responda: 40: https://betano.bet.br/...
```

**Como responder:**
```
40: https://www.betano.bet.br/bookingcode/F5JA8CST
```

Ou para definir odds manualmente:
```
/odds 40 1.85
```

### Casas de Apostas Válidas

- bet365.com
- betano.com / betano.com.br / betano.bet.br
- betway.com
- sportingbet.com

### Grupo Público

O bot publica automaticamente:
```
🎯 APOSTA DO DIA

⚽ Team A x Team B
🗓 20/01, 15:00

📊 Mais de 2.5 gols
💰 Odd: 1.85

📝 Histórico mostra média de 3.2 gols...

📈 Taxa de acerto: 72%

🔗 Apostar Agora

🍀 Boa sorte!
```

## 🚀 Deploy no Render

### Opção 1: Worker (recomendado - $7/mês)

```yaml
# render.yaml já configurado
services:
  - type: worker
    name: bets-bot
    startCommand: node bot/scheduler.js
```

### Opção 2: Cron Jobs (grátis, mas limitado)

Veja `render.yaml` para configuração de cron jobs individuais.

### Configurar no Render

1. Conecte o repositório
2. Crie o Environment Group `bets-secrets` com as variáveis
3. Deploy!

## 🧪 Testes

```bash
# Testar conexões (DB, Telegram, APIs)
node scripts/test-bot-flow.js

# Testar matching de odds
node scripts/test-bet-matching.js

# Testar interpretação de mercados
node scripts/test-market-interpreter.js

# Testar The Odds API
node scripts/test-odds-api.js
```

## 📊 Mercados Suportados

### Via The Odds API (automático)
- ✅ Gols (over/under)
- ✅ Ambas marcam (BTTS)
- ✅ Resultado (1x2)
- ✅ Handicap

### Via Admin (manual)
- ⚠️ Escanteios (corners)
- ⚠️ Cartões (bookings)
- ⚠️ Chutes

Mercados não suportados pela API são enviados ao grupo de admins para inserção manual de odds.

## 📁 Estrutura do Projeto

```
├── agent/               # Análise IA (LangChain)
│   ├── analysis/        # Geração de análises
│   └── persistence/     # Salvamento no DB
├── bot/                 # Bot Telegram
│   ├── handlers/        # Handlers de mensagens
│   ├── jobs/            # Jobs agendados
│   ├── services/        # Serviços (odds, bets, etc)
│   ├── index.js         # Entry point do bot
│   └── scheduler.js     # Scheduler de jobs
├── lib/                 # Bibliotecas compartilhadas
├── scripts/             # Scripts de ETL e utilitários
│   ├── pipeline.js      # Pipeline unificado
│   ├── syncSeasons.js   # Sync de temporadas
│   └── lib/db.js        # Conexão DB compartilhada
├── sql/                 # Schemas SQL
├── render.yaml          # Config Render
└── README.md
```

## 🔍 Troubleshooting

### Bot não recebe links
- Verifique se `node bot/index.js` está rodando
- Verifique TELEGRAM_ADMIN_GROUP_ID no .env
- Use `/status` no grupo para testar

### Link inválido
- Use links de casas válidas (bet365, betano, etc)
- Formato: `ID: https://...`

### Odds não enriquecidas
- Verifique THE_ODDS_API_KEY
- Algumas ligas podem não ter odds disponíveis
- Mercados de escanteios/cartões precisam de admin

### Pipeline falha
- Verifique FOOTYSTATS_API_KEY
- Verifique DATABASE_URL
- Rode `node scripts/pipeline.js --dry-run`

## 📈 Regras de Negócio

- **Mínimo 3 apostas ativas** sempre
- **Odds mínima**: 1.60 (abaixo é inelegível)
- **Jogos elegíveis**: próximos 2 dias (preferência) até 14 dias
- **Categoria**: Apenas SAFE bets são publicadas
- **Tracking**: Resultados verificados a cada 5 minutos

---

**Desenvolvido com 🤖 IA + ❤️**
