# Plan: Membership Multi-Tenant Fix

**Feature:** `fix(membership): normalize telegram chat_id, add evadido status, detect voluntary leavers`
**Created:** 2026-04-21
**Author:** marcelinho-do workflow
**Status:** v2 (post Phase 3 review — all 6 blockers addressed)

---

## 1. Context

### Current state

4 grupos pagos no GuruBet (multi-tenant) com bot_token próprio cada. Auditoria executada nesta sessão revelou 11 membros inconsistentes acumulados:

- **2 zombies "kicked"**: @clubedalutabr (tg=8014982330) aparece `status=ativo` em Osmar Palpites (id=209) e GuruBet (id=225) mas está kicked no Telegram.
- **9 "left" silenciosos**: Membros em status=trial que saíram voluntariamente do grupo; banco nunca atualizou.

### Root causes identificadas

1. **`groups.telegram_group_id` armazenado positivo (sem `-100` prefix)** em 2 grupos:
   - MEMBROS MIL GRAU: `3836475731` (correto `-1003836475731`)
   - Zebrismos Tips: `3761566384` (correto `-1003761566384`)

   O bot tenta `banChatMember(3836475731, user_id)` → Telegram retorna "chat not found" → `kickMemberFromGroup` (`bot/services/memberService.js:1047`) cai no `statusCode === 400` sem casar nenhum dos padrões conhecidos (`user not found` / `PARTICIPANT_ID_INVALID` / `already kicked`) → retorna erro genérico `TELEGRAM_ERROR`. O job `kick-expired` marca `failed++` mas completa com `status=success` no `job_executions`. Último `member_events.event_type=kick` é de 30/03/2026, enquanto @thiagocardosoaa (Zebrismos, id=514) tem `trial_ends_at=2026-03-31` — 21 dias vencido sem kick.

2. **Bot não escuta eventos `left_chat_member` nem `my_chat_member`**. `bot/handlers/memberEvents.js` só tem `handleNewChatMembers`. `bot/server.js:212` só invoca `handleNewChatMembers` — não há código para capturar saídas.

3. **`sync-group-members` já detecta leavers mas não atualiza o DB**: `bot/jobs/membership/sync-group-members.js:246-266` loga `leftGroup` mas não muda `status`.

4. **`setWebHook` atual não passa `allowed_updates`** (`bot/telegram.js:483`): `await targetBot.setWebHook(webhookUrl)` — sem options. Default do Telegram exclui `chat_member`.

### Gap a fechar

- Call-sites de `telegram_group_id` precisam normalizar no consumo (usuário pediu explicitamente NÃO mudar dados no banco).
- Novo status `evadido` com branches de reativação reais em `processNewMember` + `reactivateMember` + payment webhook.
- Handlers em tempo real (`left_chat_member` primário, `chat_member` fallback) + `allowed_updates` corrigido.
- Self-kick dedup para evitar alertAdmin falso quando webhook chega antes do `markMemberAsRemoved`.
- `member-utils.ts` + `database.ts` + todos os status unions atualizados — senão UI crasha.
- Reconciliação one-off dos 11 inconsistentes atuais.

### Constraints

- **NÃO alterar `groups.telegram_group_id`** — outros lugares já recebem `-100` correto e alguns grupos têm o valor correto. Normalização tem que ser 100% no consumo (idempotente: se já está `-100`, passa direto).
- **Migrations sequenciais**: próximo número disponível é `067_*`.
- **Sem truncamento** (CLAUDE.md).
- **Convenções de teste**: Bot usa Jest; admin-panel usa Vitest. **Testes de lib compartilhada em `__tests__/lib/` no repo root** (convenção confirmada: `__tests__/lib/utils.test.js` existe).
- **Testes de handlers**: existe drift entre `bot/handlers/__tests__/` e `__tests__/handlers/`. **Decisão: usar `bot/handlers/__tests__/`** (alinha com `renderWelcomeTemplate.test.js` que já está lá).
- **Conventional Commits** obrigatório.

### Out of scope (followups identificados, NÃO nesta PR)

- **`last_payment_at = NULL` em todos os 25 "ativos"**: bug de cobrança recorrente MP. Esta PR não resolve. Adicionar como nota na regression checklist e no handoff.
- **Análise se bots atuais são admins com `can_manage_chat` nos grupos pagos**: pré-requisito para `chat_member` updates. Phase 5 inclui smoke test manual para verificar.

---

## 2. Features

### Feature A — Helper `normalizeTelegramChatId` compartilhado

**Regras finais (decisão pós-review):**
- Input pode ser `number`, `string numérica`, ou `string já normalizada`.
- Null/undefined/vazio → retorna `null`.
- Começa com `-100` seguido **apenas de dígitos** → retorna como string inalterada. Senão (`-100abc`, etc.) → `null` (tightening vs. v1 — resolve I1).
- Positivo não-zero → prepend `-100`.
- Negativo sem `-100` prefix → converte prepend `-100` ao valor absoluto.
- `0` → `null` (resolve S2).
- Sempre retorna `string` (nunca number).

**Helper backend (`lib/telegramChatId.js`):**
```js
/**
 * Normalize Telegram chat_id to supergroup format (-100{id}).
 * Idempotent: running on an already-normalized id returns it unchanged.
 * Invalid inputs return null.
 * @param {number|string|null|undefined} rawId
 * @returns {string|null}
 */
function normalizeTelegramChatId(rawId) {
  if (rawId === null || rawId === undefined) return null;

  const str = String(rawId).trim();
  if (str === '' || str === '0' || str === '-0') return null;

  if (str.startsWith('-100')) {
    const rest = str.slice(4);
    if (!/^\d+$/.test(rest)) return null;
    return str;
  }

  if (str.startsWith('-')) {
    const digits = str.slice(1);
    if (!/^\d+$/.test(digits) || digits === '0') return null;
    return `-100${digits}`;
  }

  if (!/^\d+$/.test(str)) return null;
  return `-100${str}`;
}

module.exports = { normalizeTelegramChatId };
```

**Helper frontend (`admin-panel/src/lib/telegram-chat-id.ts`):** mesma lógica em TypeScript strict.

**Call-sites (mapa completo — resolve B4 parcial + I4):**

| File:line | Current | Fix |
|---|---|---|
| `bot/services/memberService.js:1032-1041` | `await bot.banChatMember(chatId, telegramId, { until_date })` direto | Adicionar no início de `kickMemberFromGroup`: `const normalizedChatId = normalizeTelegramChatId(chatId); if (!normalizedChatId) return { success: false, error: { code: 'INVALID_CHAT_ID', message: 'chat_id inválido ou vazio' } };` Usar `normalizedChatId` na chamada. |
| `bot/services/memberService.js:1049-1057` | Só trata `user not found`, `PARTICIPANT_ID_INVALID`, `already kicked` | Adicionar tratamento de `chat not found`: `if (description.includes('chat not found'))` → retornar erro `INVALID_CHAT_ID`. |
| `bot/jobs/membership/kick-expired.js:197-213` (`resolveKickChatId`) | Retorna `groupData.telegram_group_id` raw | Aplicar helper. Se resultado null, retornar error `INVALID_CHAT_ID`. |
| `bot/services/webhookProcessors.js:1058` | `const groupTelegramId = group?.telegram_group_id \|\| ...` | Envolver com `normalizeTelegramChatId(...)`. |
| `bot/telegram.js:180` (BotContext build) | `publicGroupId: row.public_group_id \|\| row.groups?.telegram_group_id` | Envolver: `publicGroupId: normalizeTelegramChatId(row.public_group_id \|\| row.groups?.telegram_group_id)`. |
| `bot/server.js:641` (cache-fill path) | `cachedGroupChatId = group.telegram_group_id.toString()` | Substituir por `cachedGroupChatId = normalizeTelegramChatId(group.telegram_group_id)`. Atualizar warn em :647 pra usar `normalizedChatId`. |
| `bot/jobs/membership/sync-group-members.js:30-36` (`normalizeChatId` local) | Função privada | **Substituir** pelo import do helper compartilhado. Remove a duplicada. |
| `bot/jobs/membership/kick-expired.js:63` (SELECT) | Sem mudança | N/A (o uso é que importa) |
| `admin-panel/src/app/api/members/[id]/cancel/route.ts:~130` (antes do fetch) | Usa `chat_id` direto do group | Aplicar `normalizeTelegramChatId` antes do fetch. Se null, skip com warn (já é non-blocking). |
| `admin-panel/src/app/api/members/[id]/reactivate/route.ts:~85` | Mesma coisa pra `unbanChatMember` | Mesmo tratamento. |

**Fallback `publicGroupId`:** como normalizamos em `bot/telegram.js:180` (BotContext) + `bot/server.js:641` (cache), todos os consumers downstream (`cancelCommand.js:181`, `startCommand.js:135/372`, `server.js:180`) recebem valor normalizado sem alteração direta. Economia de ~4 call-sites.

**Testes:** `__tests__/lib/telegramChatId.test.js` (Jest, repo root — convenção confirmada) + `admin-panel/src/lib/__tests__/telegram-chat-id.test.ts` (Vitest). Casos: positivo, negativo com -100, negativo sem -100, `0`, `-0`, null, undefined, string vazia, whitespace, `'invalid'`, `'-100abc'`, números fracionários, NaN.

---

### Feature B — Novo status `evadido` + coluna `left_at` + branches de reativação (**resolve B1/B2/B3**)

**Migration `sql/migrations/067_members_evadido_status.sql`:**

```sql
BEGIN;

-- Drop old CHECK (nome exato de migration 039 é `members_status_check`)
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check;

ALTER TABLE members
  ADD CONSTRAINT members_status_check
  CHECK (status IN ('trial', 'ativo', 'inadimplente', 'removido', 'cancelado', 'evadido'));

ALTER TABLE members ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

COMMENT ON COLUMN members.left_at IS 'Data/hora em que o membro saiu do grupo voluntariamente (evasão). Diferente de kicked_at que marca kicks forçados pelo sistema.';
COMMENT ON COLUMN members.status IS 'Estado: trial, ativo, inadimplente, removido (kicked pelo sistema), cancelado (cancelamento manual/webhook), evadido (saiu voluntariamente).';

-- Índice simples (group_id, status) — melhor que partial por cobrir outros filtros
CREATE INDEX IF NOT EXISTS idx_members_group_status
  ON members(group_id, status);

COMMIT;
```

*(Rollback documentado como comentário no arquivo.)*

**State machine (`bot/services/memberService.js:14-32`):**

```js
const MEMBER_STATUSES = ['trial', 'ativo', 'inadimplente', 'removido', 'cancelado', 'evadido'];

const VALID_TRANSITIONS = {
  trial: ['ativo', 'removido', 'cancelado', 'evadido'],
  ativo: ['trial', 'inadimplente', 'removido', 'cancelado', 'evadido'],
  inadimplente: ['ativo', 'removido', 'evadido'],
  removido: [],
  cancelado: ['ativo'],
  evadido: ['trial', 'ativo'],
};
```

**`markMemberAsEvaded(memberId, reason)`:** segue pattern do `markMemberAsRemoved` — optimistic lock, update `status`+`left_at`+`notes`. Notes overwrite (consistente com `markMemberAsRemoved`; I6 resolved).

**🔴 B2 resolvido — extender `reactivateRemovedMember` para aceitar `evadido`:**

Renomear a função para `reactivateMemberForRejoin` (ou deixar nome + aceitar ambos estados — **decisão: manter nome pra não quebrar callers, só estender aceitação**):

```js
// bot/services/memberService.js:653+
async function reactivateRemovedMember(memberId, options = {}) {
  try {
    const memberResult = await getMemberById(memberId);
    if (!memberResult.success) return memberResult;

    const member = memberResult.data;
    const currentStatus = member.status;

    // B2 FIX: aceitar 'removido' OU 'evadido' como entry point
    const REACTIVATABLE_STATUSES = ['removido', 'evadido'];
    if (!REACTIVATABLE_STATUSES.includes(currentStatus)) {
      logger.warn('[memberService] reactivateRemovedMember: member not in reactivatable status', {
        memberId, currentStatus, accepted: REACTIVATABLE_STATUSES,
      });
      return {
        success: false,
        error: {
          code: 'INVALID_MEMBER_STATUS',
          message: `Cannot reactivate member with status '${currentStatus}'. Expected one of: ${REACTIVATABLE_STATUSES.join(', ')}.`,
        },
      };
    }

    // ... (datas, notes idênticas)
    // optimistic lock usa currentStatus capturado (ao invés de hard-coded 'removido')
    const { data, error } = await supabase
      .from('members')
      .update({
        status: 'ativo',
        kicked_at: null,
        left_at: null,  // reset também
        subscription_started_at: subscriptionStartsAt.toISOString(),
        subscription_ends_at: subscriptionEndsAt.toISOString(),
        last_payment_at: now.toISOString(),
        notes: member.notes ? `${member.notes}\n${reactivationNote}` : reactivationNote,
        invite_link: null,
        invite_generated_at: null,
        joined_group_at: null,
        ...(options.subscriptionId && { mp_subscription_id: options.subscriptionId }),
        ...(options.paymentMethod && { payment_method: options.paymentMethod }),
      })
      .eq('id', memberId)
      .eq('status', currentStatus)  // B2 FIX: era hardcoded 'removido'
      .select()
      .single();
    // ... resto idêntico
  }
}
```

**🔴 B3 resolvido — webhook MP já usa `reactivateRemovedMember`** (`bot/services/webhookProcessors.js` chama essa função quando `status === 'removido'`). Mudança: no webhook, trocar condição hardcoded:

```js
// webhookProcessors.js (localizar linha que hoje checa === 'removido')
// Antes:
// if (member.status === 'removido') { await reactivateRemovedMember(...) }
// Depois:
if (member.status === 'removido' || member.status === 'evadido') {
  const result = await reactivateRemovedMember(member.id, { subscriptionId, paymentMethod });
  // ... resto idêntico (gera invite, envia DM confirmação)
}
```

Side-effects preservados: reset de `kicked_at`+`left_at`, invite_link resetado, DM de reativação — ambos os casos precisam disso.

**🔴 B2 resolvido — `processNewMember` branch para `evadido`** (`bot/handlers/memberEvents.js:84+`):

Adicionar branch **antes** do `if (member.status === 'removido')`:

```js
// Novo branch: evadido rejoining
if (member.status === 'evadido') {
  // Se voltou < 24h após sair: reativa como trial (semelhante ao removido rejoin)
  // Se > 24h: requer pagamento (semelhante ao removido sem canRejoin)
  const rejoinResult = await canRejoinGroup(member.id);  // já existe, usa kicked_at OU left_at
  if (rejoinResult.success && rejoinResult.data.canRejoin) {
    const reactivateResult = await reactivateMember(member.id);  // trial de novo
    if (reactivateResult.success) {
      await confirmMemberJoinedGroup(member.id, telegramId, username);
      await registerMemberEvent(member.id, 'join', {
        telegram_id: telegramId, telegram_username: username,
        source: 'telegram_webhook', action: 'rejoin_after_evasion',
      });
      return { processed: true, action: 'rejoin_after_evasion' };
    }
    logger.error('[membership:member-events] Failed to reactivate evaded member', {
      memberId: member.id, error: reactivateResult.error,
    });
    return { processed: false, action: 'reactivation_failed' };
  }
  // Fora da janela — manda pagar
  logger.info('[membership:member-events] Evaded member re-entered without payment', {
    memberId: member.id, hoursSince: rejoinResult.data?.hoursSinceKick?.toFixed(2),
  });
  await sendPaymentRequiredMessage(telegramId, member.id, groupId);
  return { processed: true, action: 'payment_required_after_evasion' };
}
```

**Atualizar `canRejoinGroup`** (`memberService.js` — verificar linhas exatas) para considerar `left_at` além de `kicked_at`:

```js
// Na função atual, o check é tipo `hoursSinceKick = now - kicked_at`.
// Mudar para usar `kicked_at || left_at` como âncora:
const anchorTimestamp = member.kicked_at || member.left_at;
if (!anchorTimestamp) {
  return { success: false, error: { code: 'NO_EXIT_TIMESTAMP', ... } };
}
const hoursSinceExit = (Date.now() - new Date(anchorTimestamp).getTime()) / 3600_000;
return { success: true, data: { canRejoin: hoursSinceExit < 24, hoursSinceKick: hoursSinceExit } };
```

**🔴 B1 resolvido — `admin-panel/src/components/features/members/member-utils.ts`:**

```ts
export type MemberDisplayStatus =
  | 'trial'
  | 'ativo'
  | 'vencendo'
  | 'inadimplente'
  | 'removido'
  | 'expirado'
  | 'cancelado'
  | 'evadido';  // NEW

export const memberStatusConfig: Record<MemberDisplayStatus, { label: string; className: string }> = {
  trial: { label: 'Trial', className: 'bg-blue-100 text-blue-800' },
  ativo: { label: 'Ativo', className: 'bg-green-100 text-green-800' },
  vencendo: { label: 'Vencendo', className: 'bg-yellow-100 text-yellow-800' },
  inadimplente: { label: 'Inadimplente', className: 'bg-red-100 text-red-800' },
  expirado: { label: 'Expirado', className: 'bg-red-100 text-red-800' },
  removido: { label: 'Removido', className: 'bg-gray-100 text-gray-800' },
  cancelado: { label: 'Cancelado', className: 'bg-gray-100 text-gray-800' },
  evadido: { label: 'Evadido', className: 'bg-orange-100 text-orange-800' },  // NEW
};
```

Também atualizar o test `member-utils.test.ts` com caso `evadido`.

**Types (`admin-panel/src/types/database.ts:66`):**

```ts
status: 'trial' | 'ativo' | 'inadimplente' | 'removido' | 'cancelado' | 'evadido';
left_at: string | null;  // NEW field
```

E `MemberListItem`:
```ts
// adicionar `left_at` nas colunas expostas (opcional — ver route.ts)
```

**🔴 B6 resolvido — API route.ts decisão definitiva:** **sempre selecionar** `left_at, kicked_at, cancellation_reason` (uma decisão só):

```ts
// route.ts:57 — trocar baseCols:
const baseCols = 'id, telegram_id, telegram_username, channel, channel_user_id, status, subscription_ends_at, created_at, group_id, is_admin, kicked_at, left_at, cancellation_reason, cancelled_by';
// REMOVER: const cancelCols = statusFilter === 'cancelado' ? ...
// Usar apenas baseCols + groupCols no select.
```

O resolve de UUID→email `cancelled_by` continua sendo feito apenas quando `cancelled_by` está populado (lógica atual `items.filter(m => m.cancelled_by)` funciona sem mudança — mantendo quase todo o código existente).

Adicionar filtro + contador `evadido`:

```ts
const SIMPLE_STATUS_FILTERS = new Set(['trial', 'ativo', 'inadimplente', 'removido', 'cancelado', 'evadido']);

// Em Promise.all, adicionar:
let evadidoQuery = supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'evadido');
if (groupFilter) evadidoQuery = evadidoQuery.eq('group_id', groupFilter);
else if (groupIdParam) evadidoQuery = evadidoQuery.eq('group_id', groupIdParam);
if (channelFilter) evadidoQuery = evadidoQuery.eq('channel', channelFilter);

const [mainResult, trialResult, ativoResult, vencendoResult, adminsResult, evadidoResult] = await Promise.all([
  query.order('created_at', { ascending: false }).range(from, from + perPage - 1),
  trialQuery, ativoQuery, vencendoQuery, adminsQuery, evadidoQuery,
]);

// Response counters:
counters: {
  total, trial: ..., ativo: ..., vencendo: ..., admins: adminsCount,
  evadido: evadidoResult.count ?? 0,  // NEW
}
```

**Page (`admin-panel/src/app/(auth)/members/page.tsx`):**

```ts
type StatusFilter = 'todos' | 'trial' | 'ativo' | 'vencendo' | 'expirado' | 'inadimplente' | 'removido' | 'cancelado' | 'evadido';

// Na interface MembersApiPayload.counters:
counters: {
  total: number; trial: number; ativo: number; vencendo: number; admins: number;
  evadido: number;  // NEW
};

// Na INITIAL_COUNTERS: adicionar evadido: 0
// Adicionar botão/tab evadido no filtro UI
```

---

### Feature C — Handlers de `left_chat_member` e `chat_member` (**resolve B4 + B5**)

**🔴 B4 resolvido — corrigir `setWebHook`:**

```js
// bot/telegram.js:479-490
async function setWebhook(webhookUrl, botCtx) {
  try {
    const targetBot = botCtx ? botCtx.bot : getBot();
    const token = botCtx ? botCtx.botToken : config.telegram.botToken;

    // Assinatura correta: 2 args (url, options) — node-telegram-bot-api
    await targetBot.setWebHook(webhookUrl, {
      allowed_updates: ['message', 'callback_query', 'chat_member'],
    });

    logger.info('Webhook set', { url: webhookUrl.replace(token, '***'), allowedUpdates: ['message', 'callback_query', 'chat_member'] });
    return { success: true };
  } catch (err) {
    logger.error('Failed to set webhook', { error: err.message });
    return { success: false, error: { code: 'WEBHOOK_ERROR', message: err.message } };
  }
}
```

**Também atualizar** `bot/server.js:~736` (multi-bot path — leitura confirmou que há 2 call-sites).

**Nota sobre `can_manage_chat`:** `chat_member` updates só chegam se o bot é admin com essa permissão. Dos 4 bots auditados, todos aparecem como `administrator` nos respectivos grupos públicos (cross-check da sessão mostrou bot como admin em GuruBet, MIL GRAU, Osmar, Zebrismos). **`left_chat_member` é a fonte primária** (sempre funciona mesmo sem admin). `chat_member` é fallback pra external kicks — se não funcionar em algum bot, impacto é apenas não detectar kicks manuais feitos por outros admins. Aceitável.

**Handler `handleLeftChatMember` em `bot/handlers/memberEvents.js`:**

```js
async function handleLeftChatMember(msg, groupId = null) {
  const user = msg.left_chat_member;
  if (!user) return { processed: false, action: 'no_left_member' };
  if (user.is_bot) return { processed: false, action: 'bot_left' };

  const telegramId = user.id;
  const username = user.username || null;

  const existingResult = await getMemberByTelegramId(telegramId, groupId);
  if (!existingResult.success) {
    if (existingResult.error?.code === 'MEMBER_NOT_FOUND') {
      return { processed: false, action: 'not_found' };
    }
    logger.warn('[membership:member-events] left_chat_member fetch error', {
      telegramId, error: existingResult.error,
    });
    return { processed: false, action: 'error' };
  }

  const member = existingResult.data;
  if (['removido', 'evadido', 'cancelado'].includes(member.status)) {
    return { processed: false, action: 'already_terminal' };
  }

  const { markMemberAsEvaded } = require('../services/memberService');
  const evadeResult = await markMemberAsEvaded(member.id, 'telegram_left_event');
  if (!evadeResult.success) {
    if (evadeResult.error?.code === 'RACE_CONDITION') {
      // I7: demote race condition to debug (membro provavelmente já virou terminal no outro handler)
      logger.debug('[membership:member-events] left_chat_member: race condition (ok)', { memberId: member.id });
      return { processed: false, action: 'race_condition' };
    }
    logger.warn('[membership:member-events] left_chat_member: failed to mark as evaded', {
      memberId: member.id, error: evadeResult.error,
    });
    return { processed: false, action: 'evade_failed' };
  }

  await registerMemberEvent(member.id, 'left', {
    telegram_id: telegramId,
    telegram_username: username,
    source: 'telegram_webhook',
    previous_status: member.status,
  });
  return { processed: true, action: 'evaded' };
}
```

**🔴 B5 resolvido — self-kick dedup via `chat_member`:**

Duas estratégias combinadas:

(i) **Identificar nosso bot via `BotContext.botId`.** Em `bot/telegram.js`, ao construir cada BotContext, chamar `bot.getMe()` uma vez e cachear `botId`. Se o `chat_member.from.id === botCtx.botId`, skip (foi nosso próprio kick).

```js
// bot/telegram.js — no setup de BotContext:
const me = await targetBot.getMe();
ctx.botId = me.id;
```

(ii) **Kick-expired job: tratar RACE_CONDITION com final-status=`removido` como sucesso** (evita alertAdmin falso):

```js
// bot/jobs/membership/kick-expired.js:473 área
if (!removeResult.success) {
  // B5: se race condition e o status já é o esperado (removido), kick total foi aplicado
  if (removeResult.error?.code === 'RACE_CONDITION') {
    const recheck = await getMemberById(memberId);
    if (recheck.success && recheck.data.status === 'removido') {
      logger.info('[membership:kick-expired] processMemberKick: race with webhook, final status correct', {
        memberId, telegramId,
      });
      // Registrar audit mesmo assim
      await registerKickAuditEvent(memberId, reason, groupData, {
        raceResolved: true, untilDate: kickResult.data?.until_date || null,
      });
      return { success: true, data: { kicked: true, reason, raceWithWebhook: true } };
    }
  }
  // resto do tratamento de erro original
  ...
}
```

**Handler `handleChatMemberUpdate` em `memberEvents.js`:**

```js
async function handleChatMemberUpdate(update, groupId = null, botCtx = null) {
  const oldStatus = update.old_chat_member?.status;
  const newStatus = update.new_chat_member?.status;
  const user = update.new_chat_member?.user;

  if (!user || user.is_bot) return { processed: false, action: 'bot_or_invalid' };
  if (!['kicked', 'banned'].includes(newStatus)) return { processed: false, action: 'not_kick' };
  if (!['member', 'restricted', 'administrator'].includes(oldStatus)) return { processed: false, action: 'not_from_active' };

  // B5 dedup: se o 'from' (quem fez o kick) é o nosso bot, skip
  const fromUserId = update.from?.id;
  if (fromUserId && botCtx?.botId && fromUserId === botCtx.botId) {
    logger.debug('[membership:member-events] chat_member: our bot kicked (skip)', {
      userId: user.id, botId: botCtx.botId,
    });
    return { processed: false, action: 'self_kick_dedup' };
  }

  const existingResult = await getMemberByTelegramId(user.id, groupId);
  if (!existingResult.success) {
    return { processed: false, action: 'not_found_or_error' };
  }

  const member = existingResult.data;
  if (['removido', 'evadido', 'cancelado'].includes(member.status)) {
    return { processed: false, action: 'already_terminal' };
  }

  const { markMemberAsRemoved } = require('../services/memberService');
  const removeResult = await markMemberAsRemoved(member.id, 'external_kick');
  if (!removeResult.success) {
    if (removeResult.error?.code === 'RACE_CONDITION') {
      return { processed: false, action: 'race_condition' };
    }
    return { processed: false, action: 'remove_failed' };
  }

  await registerMemberEvent(member.id, 'kick', {
    telegram_id: user.id,
    source: 'telegram_chat_member_event',
    reason: 'external_kick',
    previous_status: member.status,
  });
  return { processed: true, action: 'external_kick' };
}
```

**Dispatcher em `bot/server.js:processWebhookUpdate`:**

```js
// dentro do if (update.message):
if (msg.left_chat_member && msg.chat.id.toString() === expectedGroupChatId) {
  await handleLeftChatMember(msg, botCtx?.groupId);
}

// fora do if (update.message), dispatcher paralelo:
if (update.chat_member && String(update.chat_member.chat?.id) === publicGroupId) {
  await handleChatMemberUpdate(update.chat_member, botCtx?.groupId, botCtx);
}
```

Imports no topo de `server.js`:
```js
const {
  handleNewChatMembers,
  handleLeftChatMember,
  handleChatMemberUpdate,
} = require('./handlers/memberEvents');
```

---

### Feature D — Script one-off de reconciliação (essentially unchanged)

Igual ao v1. Resolvendo S3 (payload keys consistentes com registerMemberEvent):

```js
await supabase.from('member_events').insert({
  member_id: member.id,
  event_type: 'kick', // ou 'left' para evadidos
  payload: {
    telegram_id: member.telegram_id,
    source: 'reconciliation_script',
    reason: RECONCILIATION_TAG,
    previous_status: current.status,
    telegram_status: 'kicked', // ou 'left'
  },
});
```

Locais: `scripts/reconcile-ghost-members.js`. Dry-run default; `--apply` pra gravar. IDs hard-coded (lista dos 11 da auditoria).

---

## 3. Files affected

### New files

| File | Purpose |
|---|---|
| `lib/telegramChatId.js` | Helper backend (CommonJS) |
| `admin-panel/src/lib/telegram-chat-id.ts` | Helper frontend (TS) |
| `sql/migrations/067_members_evadido_status.sql` | Migration status + left_at + index |
| `scripts/reconcile-ghost-members.js` | One-off cleanup |
| `__tests__/lib/telegramChatId.test.js` | Unit test helper (Jest, repo root) |
| `admin-panel/src/lib/__tests__/telegram-chat-id.test.ts` | Unit test helper (Vitest) |
| `bot/services/__tests__/memberService.evadido.test.js` | markMemberAsEvaded + state machine + canRejoinGroup |
| `bot/handlers/__tests__/memberEvents.leftChatMember.test.js` | handler test |
| `bot/handlers/__tests__/memberEvents.chatMemberUpdate.test.js` | handler test |
| `bot/handlers/__tests__/memberEvents.evadidoRejoin.test.js` | processNewMember evadido branch |
| `admin-panel/src/components/features/members/__tests__/member-utils.evadido.test.ts` | config entry test (opcional — existente pode ser estendido) |

### Modified files

| File | Changes |
|---|---|
| `bot/services/memberService.js` | MEMBER_STATUSES + VALID_TRANSITIONS + markMemberAsEvaded + reactivateRemovedMember (estender pra aceitar 'evadido') + canRejoinGroup (usar left_at OU kicked_at) + normalizeTelegramChatId em kickMemberFromGroup + tratamento de 'chat not found' |
| `bot/jobs/membership/kick-expired.js` | resolveKickChatId normaliza + RACE_CONDITION recheck (B5) |
| `bot/jobs/membership/sync-group-members.js` | Substituir normalizeChatId local pelo import |
| `bot/services/webhookProcessors.js` | groupTelegramId normalizado + branch evadido na reativação |
| `bot/telegram.js` | publicGroupId normalizado no BotContext + bot.getMe() cache botId + setWebHook options correto |
| `bot/server.js` | Imports + dispatch left_chat_member + dispatch chat_member + setWebHook options + cachedGroupChatId normalizado (linha 641) |
| `bot/handlers/memberEvents.js` | handleLeftChatMember + handleChatMemberUpdate + branch evadido em processNewMember + exports |
| `admin-panel/src/app/api/members/route.ts` | SIMPLE_STATUS_FILTERS + contador evadido + always-select left_at/kicked_at/cancellation_reason |
| `admin-panel/src/app/(auth)/members/page.tsx` | StatusFilter type + INITIAL_COUNTERS + UI filter |
| `admin-panel/src/types/database.ts` | Member.status union + left_at field |
| `admin-panel/src/components/features/members/member-utils.ts` | MemberDisplayStatus + memberStatusConfig adicionar evadido |
| `admin-panel/src/app/api/members/[id]/cancel/route.ts` | normalizar chat_id antes de fetch banChatMember |
| `admin-panel/src/app/api/members/[id]/reactivate/route.ts` | mesma coisa pra unbanChatMember |
| `bot/jobs/__tests__/kickExpired.test.js` | Adicionar cenário: telegram_group_id positivo agora funciona + RACE_CONDITION com final-status-ok |

### NOT affected (explicitly)

| File | Reason |
|---|---|
| `bot/handlers/cancelCommand.js:181` | Usa `publicGroupId` do botCtx — já normalizado pelo fix em `bot/telegram.js:180` |
| `bot/handlers/startCommand.js:135, 372` | Mesma razão |
| `admin-panel/src/components/features/members/MemberList.tsx` | Usa `memberStatusConfig` indiretamente via `getDisplayStatus` — tudo fica certo com fix em `member-utils.ts` |
| `admin-panel/src/components/features/members/CancelMemberModal.tsx` | Não toca em status |
| `groups.telegram_group_id` data | Explicit no-op — usuário pediu |
| RLS policies de members | Sem mudança |
| `_processWhatsAppKick` | Usa JID, não chat_id |
| `last_payment_at=NULL` bug (25 ativos) | **Out of scope** — criar backlog item pós-PR |

---

## 4. Implementation order (dependency-aware)

1. `chore(lib): extract normalizeChatId to shared lib/telegramChatId.js` — cria helper + migra sync-group-members pra usar import.
2. `chore(admin): add normalizeTelegramChatId TS helper` — `admin-panel/src/lib/telegram-chat-id.ts`.
3. `test(lib): unit tests for normalizeTelegramChatId (JS + TS)` — casos edge incluindo `-100abc`, `0`, null.
4. `fix(bot): apply normalizeTelegramChatId at BotContext and cached chat_id` — `bot/telegram.js:180` + `server.js:641` + cache `botId` via getMe.
5. `fix(bot): normalize chat_id in kickMemberFromGroup + handle 'chat not found'` — `memberService.js:1032+`.
6. `fix(bot): normalize chat_id in resolveKickChatId + webhookProcessors` — `kick-expired.js` + `webhookProcessors.js`.
7. `fix(admin-panel): normalize chat_id in cancel/reactivate API routes`.
8. `test(bot): regression test kick-expired with positive telegram_group_id`.
9. `feat(bot): correct setWebHook signature with allowed_updates` — `telegram.js:483` + `server.js:736`.
10. `feat(db): migration 067 add evadido status + left_at column + group_status index`.
11. `feat(bot): add evadido to state machine + markMemberAsEvaded + canRejoinGroup via left_at`.
12. `feat(bot): extend reactivateRemovedMember to accept evadido` — incluindo reset de left_at.
13. `feat(bot): webhook MP route evadido through reactivation flow` — `webhookProcessors.js` branch.
14. `feat(bot): add evadido rejoin branch in processNewMember`.
15. `test(bot): unit tests markMemberAsEvaded + reactivate(evadido) + rejoin`.
16. `feat(admin): expose evadido in types + member-utils config` — `database.ts` + `member-utils.ts`.
17. `feat(admin): evadido filter + counter in members API + page`.
18. `test(admin): unit tests evadido filter, counter, member-utils rendering`.
19. `feat(bot): detect voluntary leaves via left_chat_member handler` — handler + dispatch.
20. `feat(bot): detect external kicks via chat_member update` — handler + dispatch + dedup.
21. `feat(bot): kick-expired race recheck to avoid false alerts` — B5 fix.
22. `test(bot): unit tests left_chat_member + chat_member handlers`.
23. `chore(scripts): add reconcile-ghost-members one-off`.
24. (Post-merge manual) rodar reconciliação.

---

## 5. Regression checklist

1. ✅ `telegram_group_id` já normalizado continua funcionando — helper é idempotente.
2. ✅ Job `kick-expired` não dispara alertAdmin falso quando webhook `chat_member` chega antes (B5 fix).
3. ✅ `handleNewChatMembers` para novos membros e rejoin de `removido` continuam funcionando.
4. ✅ `reactivateRemovedMember` para membros `removido` continua (aceita superset).
5. ✅ Webhook MP reativa corretamente membros `removido` + `evadido`.
6. ✅ State machine: todas as transições existentes continuam válidas — só adicionamos.
7. ✅ Migration 067 é aditiva — INSERT de rows existentes não breakam.
8. ✅ API `/api/members` com filtros existentes retorna resultados idênticos.
9. ✅ Contadores `trial/ativo/vencendo/admins` inalterados; só adicionamos `evadido`.
10. ✅ Membros em `status=removido` continuam terminais.
11. ✅ Script de reconciliação idempotente (rodar 2x não duplica).
12. ✅ RLS policies sem mudança.
13. ✅ Flow WhatsApp (`_processWhatsAppKick`) inalterado.
14. ✅ `banChatMember` mantém `until_date=24h`.
15. ✅ `left_chat_member`/`chat_member` só processados quando `chat.id === expectedGroupChatId`.
16. ✅ `member-utils.ts` render de qualquer status (incluindo novo `evadido`) não crasha.
17. ✅ `getDisplayStatus` retorna `evadido` quando status é `evadido` (coberto por test).
18. ✅ Types TS strict continuam batendo — Member union tem evadido.
19. ✅ Testes Jest + Vitest existentes continuam passando.
20. ⚠️ **Out of scope**: `last_payment_at=NULL` em 25 ativos — documentar no handoff como bug separado.

---

## 6. Testing strategy

### 6.1 Unit tests (Jest — bot)

**`__tests__/lib/telegramChatId.test.js` (novo, repo root):**

| # | Case | Input | Expected |
|---|---|---|---|
| U1 | Already normalized | `-1003836475731` (number) | `'-1003836475731'` |
| U2 | Already normalized string | `'-1003836475731'` | `'-1003836475731'` |
| U3 | Positive number (legacy) | `3836475731` | `'-1003836475731'` |
| U4 | Positive string | `'3836475731'` | `'-1003836475731'` |
| U5 | Negative sem -100 | `-3836475731` | `'-1003836475731'` |
| U6 | Null input | `null` | `null` |
| U7 | Undefined input | `undefined` | `null` |
| U8 | Empty string | `''` | `null` |
| U9 | Whitespace only | `'   '` | `null` |
| U10 | Zero | `0` | `null` |
| U11 | Negative zero | `'-0'` | `null` |
| U12 | Invalid prefix | `'-100abc'` | `null` (tightened per I1) |
| U13 | Non-numeric string | `'invalid'` | `null` |
| U14 | Float | `1.5` | `null` |
| U15 | NaN | `NaN` | `null` |
| U16 | Leading/trailing spaces | `'  3836475731  '` | `'-1003836475731'` |
| U17 | Very large positive | `9007199254740991` | `'-1009007199254740991'` |

**`bot/services/__tests__/memberService.evadido.test.js` (novo):**

| # | Scenario | Expected |
|---|---|---|
| M1 | `canTransition('trial', 'evadido')` | `true` |
| M2 | `canTransition('ativo', 'evadido')` | `true` |
| M3 | `canTransition('inadimplente', 'evadido')` | `true` |
| M4 | `canTransition('removido', 'evadido')` | `false` (terminal) |
| M5 | `canTransition('cancelado', 'evadido')` | `false` |
| M6 | `canTransition('evadido', 'trial')` | `true` |
| M7 | `canTransition('evadido', 'ativo')` | `true` |
| M8 | `canTransition('evadido', 'removido')` | `false` (precisa passar por outro path) |
| M9 | `markMemberAsEvaded` com status=`trial` | sucesso, `status=evadido`, `left_at` preenchido, `notes='Evaded: <reason>'` |
| M10 | `markMemberAsEvaded` com status=`removido` | `INVALID_MEMBER_STATUS` |
| M11 | `markMemberAsEvaded` com race (status mudou entre SELECT e UPDATE) | `RACE_CONDITION` |
| M12 | `markMemberAsEvaded` sem reason → notes=null | passa |
| M13 | `reactivateRemovedMember(id)` com status=`evadido` → sucesso, status=`ativo`, kicked_at=null, left_at=null, invite_link=null |
| M14 | `reactivateRemovedMember` com status=`trial` → `INVALID_MEMBER_STATUS` (só aceita removido/evadido) |
| M15 | `canRejoinGroup` com `left_at` < 24h atrás → `canRejoin=true` |
| M16 | `canRejoinGroup` com `kicked_at` < 24h → `canRejoin=true` (backward compat) |
| M17 | `canRejoinGroup` sem kicked_at nem left_at → error ou `canRejoin=false` (document comportamento) |
| M18 | `kickMemberFromGroup` com chatId positivo → normalizer aplicado → banChatMember recebe `-100XXX` |
| M19 | `kickMemberFromGroup` com chatId null → `INVALID_CHAT_ID` sem chamar Telegram |
| M20 | `kickMemberFromGroup` com chatId `'invalid'` → `INVALID_CHAT_ID` |
| M21 | `kickMemberFromGroup` Telegram retorna "chat not found" → error code `INVALID_CHAT_ID` (novo tratamento) |

**`bot/handlers/__tests__/memberEvents.leftChatMember.test.js` (novo):**

| # | Scenario | Expected |
|---|---|---|
| L1 | msg.left_chat_member é bot (is_bot=true) | skip, action=`bot_left` |
| L2 | left member não está no DB | action=`not_found` |
| L3 | left member com status=`trial` | markMemberAsEvaded chamado, action=`evaded` |
| L4 | left member com status=`ativo` | markMemberAsEvaded chamado, action=`evaded` |
| L5 | left member com status=`removido` | skip, action=`already_terminal` |
| L6 | left member com status=`evadido` | skip, action=`already_terminal` (idempotência) |
| L7 | left member com status=`cancelado` | skip, action=`already_terminal` |
| L8 | RACE_CONDITION do markMemberAsEvaded | debug log, action=`race_condition` (não warn) |
| L9 | getMemberByTelegramId DB error (não NOT_FOUND) | warn log, action=`error` |

**`bot/handlers/__tests__/memberEvents.chatMemberUpdate.test.js` (novo):**

| # | Scenario | Expected |
|---|---|---|
| C1 | new_status=`kicked`, from=nosso bot (id bate com botCtx.botId) | skip, action=`self_kick_dedup` |
| C2 | new_status=`kicked`, from=admin externo | markMemberAsRemoved(external_kick), action=`external_kick` |
| C3 | new_status=`banned`, from=admin externo | mesmo comportamento que `kicked` |
| C4 | new_status=`left` | action=`not_kick` (já tratado por left_chat_member) |
| C5 | new_status=`kicked`, old_status=`kicked` | action=`not_from_active` (nao atualiza) |
| C6 | user.is_bot=true | action=`bot_or_invalid` |
| C7 | member já em status terminal | action=`already_terminal` |

**`bot/handlers/__tests__/memberEvents.evadidoRejoin.test.js` (novo):**

| # | Scenario | Expected |
|---|---|---|
| R1 | processNewMember com member status=`evadido`, left_at < 24h | reactivateMember chamado, action=`rejoin_after_evasion` |
| R2 | processNewMember com status=`evadido`, left_at > 24h | sendPaymentRequiredMessage chamado, action=`payment_required_after_evasion` |
| R3 | processNewMember com status=`evadido` sem left_at | comportamento documentado (fallback seguro) |

**`bot/jobs/__tests__/kickExpired.test.js` (atualizar):**

| # | Scenario | Expected |
|---|---|---|
| K1 | groupData.telegram_group_id=`3836475731` (positivo) | banChatMember chamado com `-1003836475731` |
| K2 | markMemberAsRemoved retorna RACE_CONDITION + recheck retorna status=`removido` | job marca como success, sem alertAdmin (B5 fix) |
| K3 | markMemberAsRemoved retorna RACE_CONDITION + recheck status !=`removido` | fallback comportamento original (alertAdmin) |
| K4 | groupData.telegram_group_id=null | error `INVALID_CHAT_ID`, sem telegram API call |

### 6.2 Unit tests (Vitest — admin-panel)

**`admin-panel/src/lib/__tests__/telegram-chat-id.test.ts`:** mesmos 17 casos do U1-U17.

**`admin-panel/src/components/features/members/__tests__/member-utils.test.ts` (estender existente):**

| # | Scenario | Expected |
|---|---|---|
| UT1 | getDisplayStatus({status:'evadido'}) | retorna `'evadido'` |
| UT2 | memberStatusConfig.evadido tem label='Evadido' e className | entries válidas |
| UT3 | render de badge com status=`evadido` não crasha | coberto indiretamente |

**`admin-panel/src/app/api/members/__tests__/route.evadido.test.ts` (criar):**

| # | Scenario | Expected |
|---|---|---|
| A1 | GET /api/members?status=evadido | retorna só members.status=`evadido` |
| A2 | counters.evadido retornado no payload | valor bate com count da query |
| A3 | status=evadido + group_id=X (super_admin) | filtrado corretamente |
| A4 | status=evadido + group_admin (groupFilter aplicado) | filtrado corretamente |
| A5 | select sempre inclui left_at, kicked_at, cancellation_reason | regression check |
| A6 | status=invalid retorna VALIDATION_ERROR | existing behavior preservado |

**`admin-panel/src/app/api/members/[id]/__tests__/cancel.test.ts` (se existir, estender):**

| # | Scenario | Expected |
|---|---|---|
| CA1 | group.telegram_group_id positivo → fetch banChatMember recebe -100XXX normalizado |
| CA2 | group.telegram_group_id null → fetch não é chamado, operação segue non-blocking |

### 6.3 E2E tests (Playwright MCP — manual no dev)

**Cenário E1: Ciclo trial → evadido via left_chat_member (happy path)**
1. Criar conta teste, entrar no grupo GuruBet.
2. Confirmar que criou row em `members` com status=trial.
3. Sair do grupo voluntariamente pelo app Telegram.
4. Aguardar 3s (webhook propaga).
5. Verificar no admin panel `/members` + filtro `evadido` → membro aparece com status=evadido, `left_at` preenchido.
6. Verificar `member_events` tem entry event_type=`left` com source=`telegram_webhook`.

**Cenário E2: Evadido volta < 24h → trial renovado**
1. Membro evadido do E1 volta ao grupo (convite + join).
2. Verificar status volta para `trial`, `left_at=null`, `trial_ends_at` renovado.
3. `member_events` tem entry `action=rejoin_after_evasion`.

**Cenário E3: Kick-expired processa trial expirado em grupo com telegram_group_id positivo**
1. Identificar ou criar membro trial expirado em MIL GRAU (`telegram_group_id=3836475731`).
2. Trigger manual: `curl /debug/run-job/kick-expired` no service bets-bot-unified.
3. Verificar que membro foi kicked (status=removido, kicked_at preenchido).
4. Verificar `job_executions` status=success sem error_message.

**Cenário E4: Reconciliação dos 11 inconsistentes**
1. Rodar `node scripts/reconcile-ghost-members.js` (dry-run).
2. Verificar output lista 2 kicked + 9 evaded pra transicionar.
3. Rodar com `--apply`.
4. Verificar admin panel: filtro `evadido` agora mostra 9 membros reais; filtro `removido` mostra os 2 zumbis.
5. Rodar `--apply` de novo (idempotência): output mostra todos como `skip_already_*`.

**Cenário E5: Admin kicka manualmente um membro externo**
1. Admin do grupo (não bot) remove usuário via Telegram.
2. Verificar chat_member webhook dispara.
3. Membro marcado como `status=removido`, notes=`Removed: external_kick`.

### 6.4 Manual test guide (para o usuário validar em produção pós-merge)

**Pré-requisito:** rodar `node scripts/reconcile-ghost-members.js` (dry-run) e confirmar output.

**Sequência:**
1. **Dry-run da reconciliação**: `node scripts/reconcile-ghost-members.js` — conferir que os 11 IDs aparecem como `would_mark_*`, sem erros.
2. **Apply da reconciliação**: `node scripts/reconcile-ghost-members.js --apply` — confirmar aplicação.
3. **Abrir admin panel** (`/members`):
   - Filtro `evadido` mostra 9 membros (ids 514, 671, 673, 674, 679, 680, 681, 682, 684).
   - Filtro `removido` contém os 2 zumbis (ids 209, 225).
   - Contadores atualizados.
4. **Validar cobrança de um membro real trial expirado hoje** (`tg=5952086368` MIL GRAU, trial_ends_at=2026-04-21T23:55): aguardar 00:01 BRT do dia seguinte; verificar via job_executions + member_events.
5. **Sanity no Telegram**: entrar em um grupo teste como usuário comum, sair, verificar que o banco marcou como `evadido` em < 10s.
6. **Re-rodar auditoria** (mesmo método desta sessão): `getChatMember` pra cada ativo/trial — confirmar 0 inconsistências.

### 6.5 CI/CD integration

Todos os testes Jest + Vitest rodam no pipeline existente:

```bash
# CI pipeline (existente — verificar .github/workflows/*.yml)
cd admin-panel && npm test           # vitest
cd admin-panel && npm run build      # next build + tsc strict
cd bot && npm test                   # jest
```

**Não há novos jobs CI necessários** — os testes novos são adições aos diretórios de teste existentes.

**Pre-merge gate manual**: dev precisa rodar Playwright MCP pra testar fluxo (per CLAUDE.md).

---

## 7. Manual test guide

Ver Cenários E1-E5 da seção 6.3 + o "Manual test guide para usuário" da 6.4.

Rollback plan se algo quebrar pós-merge:
- Migration 067 tem rollback SQL comentado no arquivo.
- Código PR: `git revert <merge-commit>` e redeployar bot.
- Script reconciliação é one-off e tem tag `reconciliation_2026-04-21` em notes — se precisar, reverter via UPDATE conforme o tag.

---

## Revision history

- **v1 (2026-04-21)** — Draft inicial pós-Phase 2.
- **v2 (2026-04-21)** — Pós Phase 3 review. Resolvidos B1-B6 (member-utils, processNewMember evadido branch, reactivateRemovedMember estendido, setWebHook assinatura, self-kick dedup + race recheck, select always-left_at) + I1 (-100abc → null) + I3 (test paths padronizados) + I4 (cachedGroupChatId normalizado) + S2 (edge case 0) + S3 (payload keys). Out of scope: last_payment_at bug.
