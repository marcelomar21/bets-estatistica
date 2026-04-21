# NEXT: Evict ghost members do GuruBet em 01/05/2026 15h BRT

Continuação do trabalho de membership cleanup. PR #227 já mergeado em master — base está pronta.

## Contexto

- **Hoje:** 2026-04-21 (quando este memo foi escrito)
- **Alvo:** kickar automaticamente em **01/05/2026 15h BRT** todos os membros fantasma do GuruBet que não deram /start até lá.
- **Countdown ativo:** 10 mensagens agendadas em `scheduled_messages` (id `98f21545-f918-49a1-9499-5043bcdc6fb8`), começando 22/04 12h BRT, terminando 01/05 12h BRT. Bot @TheGuruBet_Bot.
- **Scheduling decidido:** launchd na Mac do usuário (opção "a"). Mac deve estar ligada no dia.
- **Escopo:** **só GuruBet**. Não mexer em Osmar/MIL GRAU/Zebrismos.

## Os 13 membros fantasma alvo (snapshot do dia do memo)

Todos GuruBet, `status=ativo`, `last_payment_at=NULL`, `mp_subscription_id=NULL`, `is_admin=false`, `invite_link=NULL`, zero `member_notifications`, zero `member_events`. São "lixo seed" — entraram no grupo via admin manual antes do Gate Entry flow existir, nunca interagiram com o bot.

| id | tg_id | username |
|---|---|---|
| 1 | 1055207816 | — |
| 182 | 5455299499 | @Colorado960 |
| 183 | 8579957476 | — |
| 184 | 7400828899 | — |
| 186 | 7859990965 | — |
| 187 | 6652491217 | — |
| 188 | 943488569 | @coachcriswotroba |
| 189 | 8535442717 | — |
| 190 | 643198794 | @Jaq_Alves |
| 191 | 530041113 | @CarlosTassi |
| 192 | 7954606811 | — |
| 193 | 7845770775 | — |
| 194 | 89730020 | @Danspreto |

Pode aumentar/diminuir entre hoje e 01/05 — script deve **requeryar no momento do run**, não usar lista hard-coded.

## Problema descoberto no dia do memo (o que trava)

O handler `/start` em `bot/handlers/startCommand.js` **NÃO DEIXA RASTRO NO DB** quando um membro `ativo` existente dá /start. O código cai em `handleActiveOrTrialMember` → `isUserInGroup=true` → manda status message → **zero UPDATE/INSERT**.

Por isso, o filtro ingênuo `invite_link IS NULL AND no notifications` vai kickar até quem /startou no meio do caminho. Injusto.

## 3 tarefas pra executar na nova sessão (em ordem)

### Task 1 — PR: trackear /start em membros existentes

**Objetivo:** ao /start de existing ativo/trial, registrar no DB um sinal que o script possa filtrar.

**Opção A (simples):** adicionar `recordNotification(member.id, 'started_bot', 'telegram', null)` no final de `handleActiveOrTrialMember` antes do `return { success: true, action: 'already_in_group' }`.
- Checar se `'started_bot'` passa no CHECK constraint de `member_notifications.type`. Se não passar (provável — migration `054_notifications_type_constraint.sql` lista tipos específicos mas é de `notifications` table, não `member_notifications`; verificar se `member_notifications` tem constraint separada), criar migration 068 pra estender.
- **Confirmar:** `grep -rn "member_notifications_type_check\|member_notifications" sql/migrations/`

**Opção B:** adicionar coluna `members.last_start_at TIMESTAMPTZ` via migration 068, popular no handler. Mais explícito mas requer migration.

Escolher A se possível. Teste unitário + PR + deploy.

### Task 2 — Script `scripts/evict-ghost-members.js`

Pattern similar a `scripts/reconcile-ghost-members.js` (já em master, usar como template).

**Filtro SQL:**
```sql
SELECT m.id, m.telegram_id, m.telegram_username
FROM members m
LEFT JOIN (
  SELECT DISTINCT member_id FROM member_notifications
  WHERE type = 'started_bot' AND sent_at >= '2026-04-22'
) started ON started.member_id = m.id
WHERE m.group_id = '98f21545-f918-49a1-9499-5043bcdc6fb8'
  AND m.status IN ('ativo', 'trial')
  AND m.last_payment_at IS NULL
  AND m.mp_subscription_id IS NULL
  AND m.is_admin = false
  AND m.invite_link IS NULL
  AND started.member_id IS NULL;  -- nunca deu /start no período
```

**Args:**
- `--dry-run` (default) — só lista, posta no admin group `-1003363567204`
- `--apply` — executa os kicks
- `--notify-admin` — posta no admin group o resultado (dry-run ou apply)

**Lógica por membro:**
1. `getChatMember` via GuruBet bot (`bot_token` em `groups.bot_token`, chat_id `-1003659711655`) — confirma ainda está no grupo
2. Se `status=kicked/left` → skip (já não tá)
3. Se `member/administrator/creator` → `banChatMember(chat_id, user_id, { until_date: +24h })`
4. Update DB: `status='removido'`, `kicked_at=NOW`, `notes=append('Mass eviction 01/05 — não deu /start')`
5. `registerMemberEvent(event_type='kick', payload={reason: 'mass_eviction_20260501', ...})`

**Admin notification format** (dry-run + apply):
```
[EVICT GHOST — DRY-RUN 2026-05-01 14h]
Grupo: GuruBet
Candidatos a kick: N
  - id=X tg=Y @username (em grupo: member)
  - ...
Apply em 1h. Pra cancelar: `launchctl unload ~/Library/LaunchAgents/com.gurubet.evict-ghost-apply.plist`
```

### Task 3 — launchd plists

Path: `~/Library/LaunchAgents/`

**Plist 1 — dry-run (14h BRT = 17h UTC):** `com.gurubet.evict-ghost-dry.plist`
```xml
<?xml version="1.0"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.gurubet.evict-ghost-dry</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/wehandle/Projetos/pessoal/bets-estatistica/scripts/run-evict-ghost.sh</string>
    <string>--dry-run</string>
    <string>--notify-admin</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Month</key><integer>5</integer>
    <key>Day</key><integer>1</integer>
    <key>Hour</key><integer>14</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>/tmp/evict-ghost-dry.log</string>
  <key>StandardErrorPath</key><string>/tmp/evict-ghost-dry.err</string>
</dict>
</plist>
```

**Plist 2 — apply (15h BRT):** `com.gurubet.evict-ghost-apply.plist`  
Igual acima, trocar Label + Hour=15 + `--apply` no args (sem `--dry-run`).

**Wrapper shell `scripts/run-evict-ghost.sh`:**
```bash
#!/bin/bash
cd /Users/wehandle/Projetos/pessoal/bets-estatistica
# Guard: só roda em 2026 (launchd fira todo ano em 01/05)
[[ "$(date +%Y)" == "2026" ]] || exit 0
# Inject env vars
export SUPABASE_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" admin-panel/.env.local | sed 's/^NEXT_PUBLIC_SUPABASE_URL=//;s/^"//;s/"$//;s/\\n$//')
export SUPABASE_SERVICE_KEY=$(grep "^SUPABASE_SERVICE_KEY=" admin-panel/.env.local | sed 's/^SUPABASE_SERVICE_KEY=//;s/^"//;s/"$//;s/\\n$//')
# Dummies pra config validator (não usadas por este script)
export OPENAI_API_KEY=x MP_ACCESS_TOKEN=x MP_WEBHOOK_SECRET=x FOOTYSTATS_API_KEY=x
export TELEGRAM_ADMIN_GROUP_ID=-1003363567204
export TELEGRAM_PUBLIC_GROUP_ID=-1003659711655
# Bot token GuruBet — buscar do banco em runtime (groups.bot_token) ou ler via Render
# Alternativa: usar o cached /tmp/bot_token.txt se ainda válido (ver memo da auditoria)
exec /usr/local/bin/node scripts/evict-ghost-members.js "$@"
```

Comandos pra ativar:
```bash
chmod +x scripts/run-evict-ghost.sh
launchctl load ~/Library/LaunchAgents/com.gurubet.evict-ghost-dry.plist
launchctl load ~/Library/LaunchAgents/com.gurubet.evict-ghost-apply.plist
launchctl list | grep gurubet  # verificar ativos
```

Pra cancelar:
```bash
launchctl unload ~/Library/LaunchAgents/com.gurubet.evict-ghost-apply.plist
# Pode rodar dry-run manualmente depois: bash scripts/run-evict-ghost.sh --dry-run --notify-admin
```

## IDs úteis

| Item | Valor |
|---|---|
| GuruBet group_id | `98f21545-f918-49a1-9499-5043bcdc6fb8` |
| GuruBet telegram chat_id | `-1003659711655` |
| GuruBet telegram_admin_group_id | `-1003363567204` |
| GuruBet bot | @TheGuruBet_Bot (`bot_token` em `groups.bot_token`) |
| Super admin user_id (pra `created_by`) | `07755739-ebbd-4962-8517-8f65030901ca` |
| Migration number disponível | `068` (último é `067_members_evadido_status`) |

## Arquivos-chave pra referência na nova sessão

- `bot/handlers/startCommand.js:285-349` — `handleActiveOrTrialMember` (onde inserir tracking)
- `bot/handlers/memberEvents.js:1077` — `recordNotification` helper pattern
- `scripts/reconcile-ghost-members.js` — usar como template pro evict-ghost
- `sql/migrations/067_members_evadido_status.sql` — pattern pra migration 068 se precisar
- `.claude/skills/odds-collector/` — referência de launchd plist pro Mac (já tem um deployado pra odds)

## Status do sistema quando o memo foi escrito

- Bot (bets-bot-unified) rodando no Render, scheduler ativo
- `sendScheduledMessages` job rodando a cada 30s
- Countdown messages vão começar amanhã 2026-04-22 12h BRT
- Nenhum membro marcado como `evadido` voluntariamente ainda (feature nova, só vai pegar leavers daqui pra frente)
- 9 evadidos + 4 removidos em total via reconciliação de hoje
