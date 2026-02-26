# Story 2.2: Novo Fluxo /start com Trial Interno

Status: ready-for-dev

## Story

As a **membro potencial**,
I want entrar no grupo enviando `/start` sem precisar cadastrar cartão,
So that eu possa experimentar o conteúdo antes de decidir pagar.

## Acceptance Criteria

1. **Given** `TRIAL_MODE = 'internal'` e um usuário envia `/start` ao bot
   **When** o bot processa o comando
   **Then** adiciona o membro ao grupo Telegram automaticamente (FR1)
   **And** registra o membro com `status = 'trial'` e `trial_started_at = NOW()` no banco (FR7, FR14)
   **And** envia mensagem de boas-vindas via DM com duração do trial e link de checkout MP (FR5)
   **And** o fluxo completo (`/start` → no grupo) leva menos de 5 segundos (NFR-P1)

2. **Given** `TRIAL_MODE = 'mercadopago'`
   **When** um usuário envia `/start` ao bot
   **Then** executa o fluxo atual (redireciona pro checkout MP) sem nenhuma mudança (P3)

3. **Given** `TRIAL_MODE = 'internal'` e o membro já está no grupo
   **When** envia `/start` novamente
   **Then** bot responde com status atual (trial ativo, dias restantes ou assinante ativo)
   **And** não duplica registro nem reinicia trial

4. **Given** `TRIAL_MODE = 'internal'` e a duração do trial é configurável
   **When** o bot inicia o trial
   **Then** usa a duração definida em `system_config` (default: 7 dias)

## Tasks / Subtasks

- [ ] Task 1: Implementar branching por TRIAL_MODE no handleStartCommand (AC: #1, #2)
  - [ ] 1.1 No `handleStartCommand()`, ler `TRIAL_MODE` via `getConfig('TRIAL_MODE', 'mercadopago')`
  - [ ] 1.2 Se `'mercadopago'`: seguir fluxo atual (sem mudanças)
  - [ ] 1.3 Se `'internal'`: chamar novo handler `handleInternalTrialStart()`

- [ ] Task 2: Criar handler para Trial Interno (novo usuário) (AC: #1, #4)
  - [ ] 2.1 Implementar `handleInternalTrialStart(bot, msg, botCtx)` em startCommand.js
  - [ ] 2.2 Buscar membro por `telegram_id` no banco (via `getMemberByTelegramId`)
  - [ ] 2.3 Se membro não existe: criar via `createTrialMember()` com `getTrialDays()`
  - [ ] 2.4 Se membro existe e já está ativo/trial: delegar para `handleExistingMember()`
  - [ ] 2.5 Se membro existe e está removido: verificar rejoin eligibility, reativar como trial
  - [ ] 2.6 Gerar invite link via `generateAndSendInvite()` (reusa lógica existente)

- [ ] Task 3: Adaptar handleNewMember para trial interno (AC: #1)
  - [ ] 3.1 Quando `TRIAL_MODE = 'internal'`, NÃO pedir email — pular direto para criação de trial
  - [ ] 3.2 Criar membro com `telegram_id`, `telegram_username`, sem email (email será null)
  - [ ] 3.3 Usar `group_id` do bot config para associar ao grupo correto

- [ ] Task 4: Adaptar mensagem de boas-vindas para trial (AC: #1)
  - [ ] 4.1 Na `generateAndSendInvite()`, personalizar mensagem quando `TRIAL_MODE = 'internal'`
  - [ ] 4.2 Incluir: duração do trial, data de expiração, link de checkout MP
  - [ ] 4.3 Manter formato com botão inline "ENTRAR NO GRUPO"

- [ ] Task 5: Garantir idempotência para `/start` repetido (AC: #3)
  - [ ] 5.1 Verificar: se membro já existe com status trial/ativo e está no grupo, apenas responder com status
  - [ ] 5.2 Se membro existe mas NÃO está no grupo (saiu), regenerar invite
  - [ ] 5.3 Nunca duplicar membro ou reiniciar trial_started_at

- [ ] Task 6: Escrever testes unitários (AC: #1, #2, #3, #4)
  - [ ] 6.1 Testar: TRIAL_MODE=internal, novo usuário → cria trial + envia invite
  - [ ] 6.2 Testar: TRIAL_MODE=mercadopago → fluxo antigo inalterado
  - [ ] 6.3 Testar: TRIAL_MODE=internal, membro já existe → não duplica
  - [ ] 6.4 Testar: TRIAL_MODE=internal, membro removido → reativa como trial

- [ ] Task 7: Validação completa
  - [ ] 7.1 `npm test` no admin-panel — todos os testes passam
  - [ ] 7.2 `npm run build` no admin-panel — TypeScript strict OK
  - [ ] 7.3 Testes do bot passam (jest bot/)
  - [ ] 7.4 Testar fluxo completo: setar TRIAL_MODE='internal' no DB, enviar /start, verificar que membro é criado e recebe invite

## Dev Notes

### Fluxo Atual (TRIAL_MODE = 'mercadopago')

```
/start (new user)
  → handleNewMember() → Pede email
  → handleEmailInput() → Busca no MP
    → Se existe com pagamento: link telegram_id → generateAndSendInvite()
    → Se não existe: envia link de checkout MP
```

### Fluxo Novo (TRIAL_MODE = 'internal')

```
/start (new user)
  → handleInternalTrialStart()
    → getMemberByTelegramId()
    → Se não existe: createTrialMember() → generateAndSendInvite()
    → Se existe (trial/ativo): responde com status
    → Se existe (removido): reativaMember() → generateAndSendInvite()
```

### Pattern P3: Branching por TRIAL_MODE

```javascript
const { getConfig } = require('../lib/configHelper');

async function handleStartCommand(msg) {
  const trialMode = await getConfig('TRIAL_MODE', 'mercadopago');

  if (trialMode === 'internal') {
    return handleInternalTrialStart(bot, msg, botCtx);
  }
  // Fluxo atual (MP)
  return handleMPStart(bot, msg, botCtx);
}
```

### Funções Existentes que Serão Reutilizadas

| Função | Arquivo | Propósito |
|--------|---------|-----------|
| `createTrialMember()` | memberService.js:308 | Cria membro com status='trial' |
| `getTrialDays()` | memberService.js:1520 | Lê duração do trial |
| `generateAndSendInvite()` | startCommand.js:529 | Gera invite + envia DM |
| `isUserInGroup()` | startCommand.js:79 | Verifica presença no grupo |
| `handleExistingMember()` | startCommand.js:169 | Rota membros existentes |
| `getMemberByTelegramId()` | memberService.js | Busca membro por telegram_id |
| `reactivateMember()` | memberService.js | Reativa membro removido |

### Telegram Bot API

- `bot.createChatInviteLink(groupId, { member_limit: 1, expire_date: ... })` — Gera link de convite
- `bot.getChatMember(groupId, telegramId)` — Verifica presença
- `bot.unbanChatMember(groupId, telegramId, { only_if_banned: true })` — Desbanir antes de reinvite

### Dados do Membro Trial

```javascript
{
  telegram_id: msg.from.id,
  telegram_username: msg.from.username,
  email: null,  // Não requer email no trial interno
  status: 'trial',
  trial_started_at: new Date().toISOString(),
  trial_ends_at: new Date(Date.now() + trialDays * 86400000).toISOString(),
  group_id: config.membership.groupId,
}
```

### Mensagem de Boas-Vindas Trial

```
🎉 Bem-vindo ao [GroupName]!

Seu trial de X dias começa agora!
📅 Válido até: DD/MM/YYYY

Para continuar após o trial, assine aqui:
[link checkout MP]
```

### Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `bot/handlers/startCommand.js` | MODIFICAR (branching P3 + novo handler) |

### Cuidados

- NUNCA pedir email quando TRIAL_MODE = 'internal' (elimina fricção)
- `createTrialMember()` aceita email=null — verificar se há constraint no DB
- Manter 100% retrocompatibilidade quando TRIAL_MODE = 'mercadopago'
- Testar com ambos os modos

### Learnings das Stories Anteriores

- Story 2-1 criou `getConfig()` e `reloadConfig()` — usar `getConfig('TRIAL_MODE', 'mercadopago')`
- `getTrialDays()` agora usa `getConfig` internamente

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2] — AC
- [Source: _bmad-output/planning-artifacts/architecture.md#P3] — Branching pattern
- [Source: bot/handlers/startCommand.js] — Main modification target
- [Source: bot/services/memberService.js#createTrialMember] — Trial member creation
- [Source: bot/lib/configHelper.js] — getConfig from Story 2-1

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
