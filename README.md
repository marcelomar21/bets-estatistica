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

## 🚀 Deploy no Render (100% Gratuito)

### Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│              RENDER WEB SERVICE (FREE)                   │
├─────────────────────────────────────────────────────────┤
│  bets-bot                                                │
│  ├─ Recebe webhooks do Telegram (links dos admins)      │
│  ├─ Scheduler interno (node-cron)                       │
│  │   ├─ 08:00/13:00/20:00 - Prep (odds + pede links)   │
│  │   └─ 10:00/15:00/22:00 - Post (publica apostas)     │
│  └─ Spin down após 15min (wake on webhook)              │
└─────────────────────────────────────────────────────────┘
```

### ⚠️ Limitação do Free Tier

O Render free faz **spin down após 15min sem tráfego**. Isso significa:
- Jobs agendados só rodam se o server estiver acordado
- Webhooks do Telegram acordam o server
- Para garantir execução, configure um **ping externo** (UptimeRobot, cron-job.org)

### Horários dos Jobs Internos

| Horário (SP) | Job | Descrição |
|--------------|-----|-----------|
| 08:00 | morning-prep | Enriquece odds + pede links |
| 10:00 | morning-post | Publica apostas + **PRÉVIA** |
| 13:00 | afternoon-prep | Enriquece odds + pede links |
| 15:00 | afternoon-post | Publica apostas + **PRÉVIA** |
| 20:00 | night-prep | Enriquece odds + pede links |
| 22:00 | night-post | Publica apostas + **PRÉVIA** |

### Como Funciona

1. **Pipeline local** - Rode manualmente ou via GitHub Actions
2. **08:00** - Bot enriquece odds e pede links no grupo admin
3. **Admin responde** com os links (webhook acorda o server)
4. **10:00** - Bot mostra PRÉVIA no grupo admin, depois publica

### Configurar no Render

1. Push o código para GitHub
2. Vá em [render.com](https://render.com) → **New → Blueprint**
3. Conecte seu repositório
4. Render detecta o `render.yaml` automaticamente
5. Crie o Environment Group `bets-secrets` com:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
DATABASE_URL=postgresql://...
FOOTYSTATS_API_KEY=xxx
OPENAI_API_KEY=sk-...
THE_ODDS_API_KEY=xxx
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_ADMIN_GROUP_ID=-100123456789
TELEGRAM_PUBLIC_GROUP_ID=-100987654321
```

6. Deploy!

### Após Deploy

O Render fornece automaticamente a variável `RENDER_EXTERNAL_URL`, então o webhook é configurado automaticamente no primeiro start.

Verifique com `/status` no grupo admin - deve mostrar "Bot online (webhook mode)".

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

## 🔄 CI/CD com GitHub Actions

O projeto usa GitHub Actions para automação de CI/CD:

### Pipeline

```
Push/PR → Lint → Test → Deploy (main only)
                          ↓
                    Render Webhook
```

### Jobs

| Job | Trigger | Descrição |
|-----|---------|-----------|
| Lint | push, PR | ESLint verifica qualidade do código |
| Test | push, PR | Roda testes (após lint) |
| Deploy | push main | Trigger deploy no Render via webhook |

### Configuração do Deploy Hook

Para habilitar deploy automático:

1. **Render Dashboard:** Settings → Deploy Hook → Copiar URL
2. **GitHub Repository:** Settings → Secrets and variables → Actions
3. Criar secret `RENDER_DEPLOY_HOOK` com a URL copiada

### Scripts Locais

```bash
# Rodar lint
npm run lint

# Rodar testes
npm test
```

---

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
