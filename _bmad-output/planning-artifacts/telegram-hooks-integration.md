# Telegram Hooks Integration - Claude Code Remote Control

> Controlar o Claude Code remotamente via grupo do Telegram, aprovando permissoes e recebendo alertas sem precisar estar no terminal.

## Contexto

O projeto ja possui integracao completa com Telegram via clawdbot. A ideia e reaproveitar essa infra para permitir que o operador interaja com o Claude Code CLI remotamente pelo celular.

## Infra Telegram existente (clawdbot)

### Onde estao as configs

| Arquivo | O que tem |
|---|---|
| `lib/config.js:14-18` | Config centralizada: `config.telegram.botToken`, `config.telegram.adminGroupId`, `config.telegram.publicGroupId` |
| `.env` | Variaveis reais: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_GROUP_ID`, `TELEGRAM_PUBLIC_GROUP_ID` |
| `.env.example` | Template com todas as variaveis documentadas |
| `bot/telegram.js` | Modulo singleton do bot com `sendToAdmin()`, `sendToPublic()`, `alertAdmin()`, `getBot()`, `testConnection()` |
| `node_modules/node-telegram-bot-api` | Lib usada para comunicacao com a API do Telegram |

### Funcoes disponiveis em `bot/telegram.js`

- `initBot(mode)` - Inicializa bot em modo `none`, `polling` ou `webhook`
- `getBot()` - Retorna instancia singleton
- `sendToAdmin(text, options)` - Envia mensagem pro grupo admin (Markdown)
- `sendToPublic(text, options)` - Envia mensagem pro grupo publico
- `alertAdmin(type, technicalMessage, simpleExplanation)` - Alerta formatado com emoji e timestamp
- `testConnection()` - Testa conectividade do bot

---

## Fase 1 - Permission Control via Telegram

### Objetivo

Quando o Claude Code pedir permissao para executar uma ferramenta (Edit, Bash, Write, etc.), enviar a solicitacao pro grupo admin do Telegram. O operador responde "sim" ou "nao" diretamente no celular, e o Claude Code continua sem precisar ir ao terminal.

### Hooks envolvidos

```
~/.claude/settings.json
```

| Hook Event | Funcao | Resposta? |
|---|---|---|
| `PermissionRequest` | Envia pedido de permissao pro Telegram e espera reply | Sim - retorna `allow` ou `deny` |
| `Notification` (matcher: `permission_prompt`) | Alerta sonoro local (Navi) | Nao |
| `Notification` (matcher: `idle_prompt`) | Alerta quando Claude espera input livre | Nao |
| `Stop` | Alerta quando turno termina | Nao |

### Fluxo da Fase 1

```
Claude Code quer executar "Edit admin/page.tsx"
        |
        v
PermissionRequest hook dispara
        |
        v
Script le stdin (JSON com tool_name + tool_input)
        |
        v
POST /sendMessage → Telegram grupo admin
"🔔 Claude Code pede permissao:
 📝 Tool: Edit
 📁 Arquivo: admin/page.tsx
 ✏️ Alteracao: trocar fetchBots() por fetchBotsWithRetry()
 Responda: ✅ sim | ❌ nao (timeout: 60s)"
        |
        v
Script faz polling: GET /getUpdates (long polling, timeout 60s)
        |
        v
Operador responde no Telegram (reply na mensagem)
        |
        v
Script retorna JSON via stdout:
  allow → {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}
  deny  → {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny"}}}
  timeout → exit 0 sem output (cai no prompt normal do terminal)
        |
        v
Claude Code continua ou cancela a operacao
```

### Arquitetura do script

**Opcao recomendada: Node.js** (reaproveita `bot/telegram.js` e `lib/config.js`)

```
.claude/hooks/telegram-permission.js
```

Responsabilidades:
1. Ler JSON do hook via stdin
2. Parsear `tool_name` e `tool_input` para montar mensagem legivel
3. Enviar mensagem formatada pro grupo admin via API do Telegram
4. Fazer long polling no `getUpdates` filtrando por `reply_to_message_id`
5. Validar que quem respondeu e o operador autorizado (`from.id`)
6. Retornar decisao via stdout JSON
7. Tratar timeout (60s) saindo sem output

### Config do hook em `~/.claude/settings.json`

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /Users/marcelomendes/Projetos/bets-estatistica/.claude/hooks/telegram-permission.js"
          }
        ]
      }
    ]
  }
}
```

### Detalhes de implementacao

#### Mensagem enviada pro Telegram

```markdown
🔔 *Claude Code - Permissao*

📝 *Tool:* `Edit`
📁 *Arquivo:* `admin-panel/src/app/(auth)/bots/page.tsx`
✏️ *Resumo:* Trocar `fetchBots()` por `fetchBotsWithRetry()`

🆔 Request: `abc123`
⏱ Timeout: 60s

Responda com reply: ✅ *sim* | ❌ *nao*
```

#### Polling com getUpdates

```
GET https://api.telegram.org/bot<TOKEN>/getUpdates
  ?offset=<last_update_id + 1>
  &timeout=60
  &allowed_updates=["message"]
```

Filtrar respostas por:
- `message.reply_to_message.message_id` == ID da mensagem que enviamos
- `message.from.id` == ID do operador autorizado
- `message.text` contendo "sim" ou "nao" (case insensitive)

#### Variaveis de ambiente necessarias

As mesmas que o clawdbot ja usa (`.env`):
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_GROUP_ID`

Adicional (novo):
- `TELEGRAM_OPERATOR_USER_ID` - ID numerico do usuario autorizado a responder permissoes

### Seguranca

- Somente o operador autorizado pode aprovar/negar (validacao por `from.id`)
- Timeout de 60s impede que o Claude Code fique travado
- Se o script falhar, o prompt normal aparece no terminal (fallback seguro)
- Bot token nunca fica hardcoded, vem do `.env`

---

## Fase 2 - Respostas de texto livre via Telegram (conceito)

### Problema

Alem de permissoes (sim/nao), o Claude Code as vezes pede:
- **Escolha de opcoes** (`AskUserQuestion` com opcoes pre-definidas)
- **Texto livre** (prompt normal quando o Claude para e espera proximo input)

Para esses casos, o hook `PermissionRequest` nao se aplica. Nao existe hook que injete texto no stdin do Claude Code.

### Abordagem: Processo sidecar

Um daemon rodando em background que:
1. Recebe alertas dos hooks `Stop` e `Notification` (idle_prompt)
2. Envia pro Telegram o que o Claude esta pedindo
3. Espera resposta do operador no Telegram
4. Injeta a resposta no terminal do Claude Code

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────┐
│   Claude Code    │      │  Sidecar daemon   │      │   Telegram   │
│   (terminal)     │      │  (background)     │      │   grupo      │
│                  │      │                   │      │              │
│  Stop hook ──────┼──→   │  Detecta idle     │      │              │
│                  │      │  Le tela terminal  │      │              │
│                  │      │  Envia pergunta ───┼──→   │  📩 mensagem │
│                  │      │                   │      │              │
│                  │      │  Espera reply   ←──┼──    │  ✍️ resposta │
│                  │      │                   │      │              │
│  ← keystroke ────┼──←   │  Injeta no tty    │      │              │
│                  │      │  (tmux send-keys   │      │              │
│  Continua...     │      │   ou osascript)   │      │              │
└──────────────────┘      └──────────────────┘      └──────────────┘
```

### Opcoes de injecao de input

| Metodo | Pros | Contras |
|---|---|---|
| `tmux send-keys` | Confiavel se rodar dentro de tmux | Requer rodar Claude Code dentro de tmux |
| `osascript` (AppleScript) | Funciona com Terminal.app | Fragil, depende de foco da janela |
| Named pipe / PTY proxy | Mais robusto | Complexo de implementar |
| Kitty/iTerm2 remote control | APIs nativas do terminal | Limita a um terminal especifico |

### Recomendacao para Fase 2

Rodar o Claude Code sempre dentro de `tmux`, e usar o sidecar para:

```bash
# Enviar keystroke pro painel do tmux onde roda o Claude Code
tmux send-keys -t claude-session "texto da resposta" Enter
```

### Desafios da Fase 2

1. **Saber O QUE o Claude esta pedindo** - O hook `Stop` nao recebe o conteudo da pergunta. Seria necessario parsear a saida do terminal ou interceptar o output.
2. **Sincronizacao** - Garantir que o input chega no momento certo (depois da pergunta, antes de timeout).
3. **Estado do terminal** - Detectar se o Claude esta no prompt de input vs mostrando output.
4. **Perguntas multipla escolha** - Mapear opcoes numeradas para botoes inline do Telegram (InlineKeyboardMarkup).

### Alternativa mais simples para Fase 2

Em vez do sidecar complexo, uma abordagem mais pragmatica:
- O hook `Stop` envia pro Telegram: "Claude parou e espera input. Va ao terminal."
- O operador sabe que precisa ir ao terminal para perguntas de texto livre
- Funciona como um **sistema de notificacao inteligente** em vez de controle remoto completo

---

## Fase 3 - Alerta de reset de sessao (rate limit)

### Objetivo

Receber um alerta no Telegram quando a sessao do Claude Code resetar o rate limit, para saber que pode voltar a usar sem precisar ficar verificando manualmente.

### Pesquisa: o que o Claude Code expoe

| Fonte de dados | Disponivel? | Detalhes |
|---|---|---|
| Hook `SessionEnd` com motivo do fim | Parcial | Recebe campo `reason` mas rate limit cai em `"other"` (nao distingue de quit manual) |
| CLI command pra ver uso/limites | Nao | `/cost` mostra tokens gastos, `/context` mostra contexto, mas nenhum mostra quota da sessao ou timer de reset |
| Arquivo local com dados de rate limit | Nao | `~/.claude/` tem transcripts e config mas nao armazena info de quota |
| API headers de rate limit | Sim | Toda resposta da API retorna headers `anthropic-ratelimit-*-reset` com timestamp exato |
| Hooks recebem info de rate limit | Nao | Nenhum hook (Stop, SessionEnd, etc.) recebe dados de quota ou reset |
| Timer de reset na UI | Sim (UI only) | A tela mostra "Reinicia em Xh Ymin" mas essa info nao e acessivel programaticamente |

### O problema central

O Claude Code **nao expoe o timestamp de reset** via hooks, CLI ou arquivos locais. A unica forma confiavel de saber e pelos headers HTTP da API (`anthropic-ratelimit-*-reset`) — mas o CLI nao repassa isso pros hooks.

### Abordagem: OpenTelemetry (dados reais da API)

Usar OpenTelemetry (suportado nativamente pelo Claude Code) para capturar os headers de rate limit das respostas HTTP:

```
Claude Code + OpenTelemetry exporter
        │
        v
Collector processa spans/metrics
        │
        v
Extrai anthropic-ratelimit-*-reset headers
        │
        v
Quando remaining = 0:
  → Telegram: "Rate limit atingido, reseta as HH:MM"
  → Agenda alerta pro horario exato do reset
```

**Headers da API disponiveis:**
```
anthropic-ratelimit-requests-remaining: 0
anthropic-ratelimit-requests-reset: 2026-02-08T18:00:00Z
anthropic-ratelimit-input-tokens-remaining: 0
anthropic-ratelimit-input-tokens-reset: 2026-02-08T18:00:00Z
anthropic-ratelimit-output-tokens-remaining: 0
anthropic-ratelimit-output-tokens-reset: 2026-02-08T18:00:00Z
retry-after: 3600
```

**Mensagens no Telegram:**

Quando o rate limit e atingido:
```
🔴 *Rate limit atingido*
⏱ Reseta as *18:00* (em 1h)
Voce sera avisado quando resetar.
```

Quando reseta:
```
🟢 *Sessao Claude Code resetou!*
Pode voltar a usar o Opus.
```

**Pros:** Timestamp exato de reset, dados reais da API, confiavel
**Contras:** Requer setup de OpenTelemetry collector

### Pontos a investigar na implementacao

- Como configurar o OpenTelemetry exporter no Claude Code
- Como extrair os headers HTTP dos spans exportados
- Se o collector pode rodar local (lightweight) ou precisa de infra externa
- Se da pra usar um collector minimo que so monitora os headers de rate limit

---

## Resumo do roadmap

| Fase | Escopo | Complexidade | Valor |
|---|---|---|---|
| **Fase 1** | PermissionRequest via Telegram (sim/nao) | Media | Alto - cobre ~80% das interrupcoes |
| **Fase 2a** | Notificacao "va ao terminal" para texto livre | Baixa | Medio - alerta inteligente |
| **Fase 2b** | Alerta de reset de sessao via OpenTelemetry + Telegram | Alta | Alto - timestamp exato de reset |
| **Fase 3** | Injecao de texto via tmux sidecar (controle remoto completo) | Alta | Alto - controle remoto total |

## Dependencias

- Node.js (ja instalado)
- `node-telegram-bot-api` (ja no projeto)
- Variaveis de ambiente do Telegram (ja configuradas no `.env`)
- `TELEGRAM_OPERATOR_USER_ID` (novo, precisa adicionar)
- Para Fase 2b: OpenTelemetry collector (setup adicional)
