# Story 4.5: Kick Automático de Membros Expirados

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **sistema**,
I want remover automaticamente membros cuja assinatura expirou no MP,
So that o grupo mantenha apenas membros ativos.

## Acceptance Criteria

1. **AC1: Kick de membros expirados via cron diário**
   - Given um membro com `status = 'expired'` (marcado pelo webhook do MP via `handleSubscriptionCancelled`)
   - When o job de kick roda (cron diário, 00:01 BRT)
   - Then o bot remove (kick) o membro do grupo Telegram via `kickMemberFromGroup()` (FR11)
   - And o membro é marcado como `removido` no banco via `markMemberAsRemoved()`
   - And audit log registra o kick: membro, grupo, timestamp via `registerMemberEvent()`

2. **AC2: DM de despedida com link de retorno**
   - Given um membro está sendo removido pelo job de kick
   - When o kick é processado
   - Then bot envia DM: "Sua assinatura expirou. Quer voltar? [link checkout]" (FR53)
   - And a mensagem usa `formatFarewellMessage()` com `reason = 'payment_failed'`
   - And o link de checkout é o `checkout_url` do grupo (multi-tenant)
   - And se bot foi bloqueado (`USER_BLOCKED_BOT`), falha silenciosa sem impedir o kick

3. **AC3: Kick apenas de membros do group_id do bot**
   - Given o bot roda com `GROUP_ID` no environment
   - When o job busca membros para kick
   - Then filtra APENAS membros com `group_id` igual ao `GROUP_ID` do bot
   - And usa `group.telegram_group_id` para o kick (NÃO `config.telegram.publicGroupId`)

4. **AC4: Proteção de membros ativos**
   - Given membros com `status = 'active'` e `subscription_ends_at` futuro
   - When o job de kick roda
   - Then esses membros NÃO são removidos
   - And membros com `status = 'trial'` NÃO são removidos pelo job (trial gerenciado pelo MP)
   - And APENAS membros `inadimplente` que passaram do grace period são kickados

5. **AC5: Grace period com warnings diários**
   - Given um membro `inadimplente` dentro do grace period (default: 2 dias)
   - When o job roda e `daysRemaining > 0`
   - Then envia DM de warning via `sendKickWarningNotification()`
   - And NÃO remove o membro do grupo
   - And deduplicação: máximo 1 warning por dia via `hasNotificationToday()`

6. **AC6: Multi-tenant — grupo correto para kick**
   - Given o bot resolve o grupo via `config.membership.groupId` (env `GROUP_ID`)
   - When o kick precisa executar `banChatMember`
   - Then usa o `telegram_group_id` do grupo resolvido no banco
   - And NÃO usa `config.telegram.publicGroupId` (que pode ser do single-tenant)

## Tasks / Subtasks

- [x] Task 1: Adaptar `kick-expired.js` para multi-tenant (AC: #3, #6)
  - [x] 1.1 Em `getAllInadimplenteMembers()`: adicionar filtro `.eq('group_id', config.membership.groupId)` quando `GROUP_ID` estiver definido
  - [x] 1.2 Em `processMemberKick()`: resolver `telegram_group_id` do grupo via query `groups` em vez de usar `config.telegram.publicGroupId`
  - [x] 1.3 Fallback single-tenant: se `GROUP_ID` não definido, manter comportamento atual com `config.telegram.publicGroupId`
  - [x] 1.4 Passar `groupTelegramId` explícito para `kickMemberFromGroup()` e `formatFarewellMessage()`

- [x] Task 2: Integrar `checkout_url` do grupo na DM de despedida (AC: #2, #6)
  - [x] 2.1 Em `processMemberKick()`: buscar `checkout_url` do grupo (não do config estático)
  - [x] 2.2 Passar `checkout_url` para `formatFarewellMessage(member, reason, checkoutUrl)`
  - [x] 2.3 Fallback: se grupo não encontrado, usar `config.membership.checkoutUrl`

- [x] Task 3: Audit log do kick (AC: #1)
  - [x] 3.1 Após `markMemberAsRemoved()`: chamar `registerMemberEvent(memberId, 'kick', { reason, groupId, groupName })`
  - [x] 3.2 Logar resultado com prefixo `[membership:kick-expired]`

- [x] Task 4: Testes cobrindo fluxo multi-tenant (AC: #1-#6)
  - [x] 4.1 Testar: inadimplente com grace period expirado → kick + DM + mark removed
  - [x] 4.2 Testar: inadimplente dentro do grace period → warning DM, NÃO kick
  - [x] 4.3 Testar: membro ativo → NÃO removido (job só busca 'inadimplente', cobertura implícita)
  - [x] 4.4 Testar: membro trial → NÃO removido (job só busca 'inadimplente', cobertura implícita)
  - [x] 4.5 Testar: multi-tenant — filtro por `GROUP_ID`, usa `telegram_group_id` do grupo
  - [x] 4.6 Testar: fallback single-tenant (sem `GROUP_ID`) → comportamento legado
  - [x] 4.7 Testar: `USER_BLOCKED_BOT` → DM falha silenciosa, kick continua
  - [x] 4.8 Testar: `USER_NOT_IN_GROUP` → marca como removido sem erro
  - [x] 4.9 Testar: `BOT_NO_PERMISSION` → alerta admin, NÃO marca como removido
  - [x] 4.10 Verificar baseline de testes: 788 testes passando (770 baseline + 18 novos)

## Dev Notes

### Contexto Crítico: Infraestrutura 90% Pronta, Falta Multi-tenant

**O job `kick-expired.js` JÁ EXISTE e funciona para single-tenant.** O trabalho principal é **adaptar para multi-tenant** (filtrar por `GROUP_ID`, usar `telegram_group_id` do grupo, e `checkout_url` do grupo) + garantir audit log completo.

**O que JÁ funciona:**

| Função | Arquivo | Status |
|--------|---------|--------|
| `getAllInadimplenteMembers()` | `bot/jobs/membership/kick-expired.js:55-80` | **Existe, busca todos inadimplentes — falta filtro por group_id** |
| `calculateDaysRemaining(member)` | `bot/jobs/membership/kick-expired.js:87-98` | **Existe, calcula dias restantes no grace period** |
| `shouldKickMember(member)` | `bot/jobs/membership/kick-expired.js:105-107` | **Existe, decide se deve kickar** |
| `processMemberKick(member, reason)` | `bot/jobs/membership/kick-expired.js:122-224` | **Existe — falta usar telegram_group_id do grupo** |
| `runKickExpired()` | `bot/jobs/membership/kick-expired.js:230-243` | **Existe, entry point com lock** |
| `_runKickExpiredInternal()` | `bot/jobs/membership/kick-expired.js:251-342` | **Existe, loop de processamento** |
| `kickMemberFromGroup(telegramId, chatId)` | `bot/services/memberService.js:1034-1071` | **Existe, ban temporário 24h** |
| `markMemberAsRemoved(memberId, reason)` | `bot/services/memberService.js:1081-1146` | **Existe, atualiza DB com state machine** |
| `formatFarewellMessage(member, reason, checkoutUrl)` | `bot/services/notificationService.js:296-319` | **Existe, formata DM de despedida** |
| `sendPrivateMessage(telegramId, message)` | `bot/services/notificationService.js:128-162` | **Existe, envia DM** |
| `sendKickWarningNotification(member, daysRemaining)` | `bot/services/notificationService.js:644-698` | **Existe, warning durante grace period** |
| `hasNotificationToday(memberId, type)` | `bot/services/notificationService.js:36-69` | **Existe, deduplicação** |
| `registerMemberEvent(memberId, eventType, payload)` | `bot/handlers/memberEvents.js:421-448` | **Existe, audit log** |

### Fluxo Atual vs. Desejado

**Atual (single-tenant):**
```
kick-expired.js (cron 00:01 BRT)
    ├─ getAllInadimplenteMembers()  ← SEM filtro group_id
    ├─ Para cada inadimplente:
    │   ├─ shouldKickMember()?
    │   │   ├─ SIM: processMemberKick()
    │   │   │   ├─ sendFarewellMessage()  ← usa config.membership.checkoutUrl (estático)
    │   │   │   ├─ kickMemberFromGroup()  ← usa config.telegram.publicGroupId (estático)
    │   │   │   └─ markMemberAsRemoved()
    │   │   └─ NÃO: sendKickWarningNotification()
    │   └─ Métricas: kicked, warned, alreadyRemoved, failed
    └─ Resumo + alertas admin
```

**Desejado (multi-tenant):**
```
kick-expired.js (cron 00:01 BRT)
    ├─ getAllInadimplenteMembers()  ← COM filtro .eq('group_id', GROUP_ID)
    ├─ resolveGroupData(GROUP_ID)  ← NOVO: busca telegram_group_id + checkout_url do grupo
    ├─ Para cada inadimplente:
    │   ├─ shouldKickMember()?
    │   │   ├─ SIM: processMemberKick()
    │   │   │   ├─ sendFarewellMessage()  ← usa group.checkout_url (dinâmico)
    │   │   │   ├─ kickMemberFromGroup()  ← usa group.telegram_group_id (dinâmico)
    │   │   │   ├─ markMemberAsRemoved()
    │   │   │   └─ registerMemberEvent()  ← NOVO: audit log do kick
    │   │   └─ NÃO: sendKickWarningNotification()
    │   └─ Métricas
    └─ Resumo + alertas admin
```

### Padrão Multi-tenant JÁ Estabelecido (Story 4.4)

O padrão de resolução de grupo já foi implementado em `webhookProcessors.js`:
```javascript
// Padrão para resolver dados do grupo
async function resolveGroupData(groupId) {
  const { data: group, error } = await supabase
    .from('groups')
    .select('id, name, telegram_group_id, checkout_url, status')
    .eq('id', groupId)
    .single();

  if (error || !group) {
    return { success: false, error: { code: 'GROUP_NOT_FOUND' } };
  }
  return { success: true, data: group };
}
```

**Usar `config.membership.groupId`** (que lê de `process.env.GROUP_ID`) para saber qual grupo o bot atende.

### Formato da DM de Despedida (Já Implementado)

A função `formatFarewellMessage` em `notificationService.js:296-319` já gera:

```
⚠️ *Assinatura Expirada*

Sua assinatura no grupo *{nome do grupo}* não foi renovada.

Você será removido do grupo.

📲 Quer voltar? Assine novamente:
{checkout_url}

Sentiremos sua falta! 🍀
```

Para `reason = 'trial_expired'`:
```
⏰ *Período de Teste Encerrado*

Seu trial de 7 dias no grupo *{nome do grupo}* terminou.

📲 Gostou das dicas? Assine:
{checkout_url}

Boas apostas! 🍀
```

### Formato do Warning Diário (Já Implementado)

`formatKickWarning` em `notificationService.js:606-635`:

**Último dia (daysRemaining <= 1):**
```
🚨 *ÚLTIMO AVISO*

Sua assinatura no *{grupo}* vence AMANHÃ.

💳 Regularize agora:
{checkout_url}

Após remoção, use o mesmo link para voltar.
```

**Dias restantes > 1:**
```
⚠️ *Pagamento Pendente*

Sua assinatura no *{grupo}* não foi renovada.
Você será removido em {X} dias.

💳 Regularize agora:
{checkout_url}
```

### Padrão de Kick com Ban Temporário

`kickMemberFromGroup()` em `memberService.js:1034-1071`:
```javascript
// Ban temporário de 24h (após 24h, ban expira automaticamente)
const untilDate = Math.floor(Date.now() / 1000) + 86400;
await bot.banChatMember(chatId, telegramId, { until_date: untilDate });
```

**Nota:** O ban de 24h significa que se o membro pagar dentro de 24h, o `unbanChatMember` é necessário (já implementado na Story 4.4). Após 24h, o ban expira sozinho.

### State Machine — Transições de Kick

```
inadimplente ──► removido   (via kick-expired job, após grace period)
trial ──────────► removido   (via MP webhook: handleSubscriptionCancelled)
ativo ──────────► removido   (via MP webhook: subscription_cancelled)
```

**IMPORTANTE:** O job de kick NÃO deve processar membros `trial` — trial expiration é responsabilidade do MP via webhooks. O job processa APENAS `inadimplente` (membros cujo pagamento recorrente falhou).

### Tratamento de Erros — Padrão do Job

O `processMemberKick()` já tem error handling robusto:

1. **`USER_NOT_IN_GROUP`**: Não é erro — membro já saiu. Marca como removido.
2. **`BOT_NO_PERMISSION`**: Erro persistente — alerta admin, NÃO marca como removido (precisa fix manual).
3. **`USER_BLOCKED_BOT`**: DM falha silenciosa — kick e mark removed continuam.
4. **Erro transient (TELEGRAM_ERROR)**: Retry natural no próximo run diário.

### Config: Grace Period

```javascript
// lib/config.js
membership: {
  gracePeriodDays: 2,  // 2 dias de graça antes do kick
  groupId: process.env.GROUP_ID || null,
  checkoutUrl: process.env.MP_CHECKOUT_URL || null,
}
```

**O grace period de 2 dias dá tempo ao membro para regularizar.** Fluxo:
1. Dia 0: MP envia webhook `subscription_renewal_refused` → status muda para `inadimplente`
2. Dia 0-1: Job envia warnings diários
3. Dia 2+: Job executa kick

### Padrões Obrigatórios

1. **Service Response Pattern:** `{ success: true/false, data/error }` — MANTER em todos os services
2. **Logging:** `logger.info/warn/error` com prefixo `[membership:kick-expired]` — NUNCA `console.log`
3. **Multi-tenant:** Usar `group.telegram_group_id` e `group.checkout_url` do grupo resolvido
4. **State Machine:** Transições validadas via `canTransition()` em `markMemberAsRemoved()` — NÃO reimplementar
5. **Error Codes:** `USER_NOT_IN_GROUP`, `BOT_NO_PERMISSION`, `USER_BLOCKED_BOT`, `CONFIG_MISSING`
6. **Naming:** camelCase JS, snake_case DB
7. **Supabase:** Via `lib/supabase.js` — NUNCA instanciar novo
8. **Lock:** `withLock('kick-expired', 300, fn)` — JÁ implementado, manter

### Learnings da Story 4.4

- Multi-tenant group resolution: usar `group.telegram_group_id` (não `config.telegram.publicGroupId`)
- `sendReactivationNotification` aceita `groupTelegramId` explícito — padrão para funções multi-tenant
- DMs são "best-effort": falha de DM NUNCA impede operação principal (kick, ativação)
- `renewMemberSubscription` estende a partir de `subscription_ends_at` quando no futuro
- Baseline: **770/770 testes passando** pós Story 4.4

### Learnings da Story 4.3

- `resolveGroupFromPayment()` resolve grupo via `preapproval_plan_id → groups.mp_plan_id`
- `handleSubscriptionCancelled()` já faz kick via webhook para cancelamentos diretos do MP
- `buildNotifyContext(group)` extrai dados do grupo para notificações admin
- Non-critical failures logam warnings, não lançam exceções

### Git Intelligence

**Commits recentes:**
```
4168205 fix(story-4.4): resolve review findings and finalize status
9ec7acf fix(story-4.3): apply review fixes and finalize status
112cb3f feat(bot): implement multi-tenant webhook processing for Mercado Pago (story 4.3)
8597a6e Merge pull request #26 (story 4.2)
```

**Branch naming:** `feature/story-4.5-kick-automatico-de-membros-expirados`
**Commit pattern:** `feat(bot): description (story 4.5)`

### Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| `GROUP_ID` não definido no env | Job processa membros de todos os grupos | Fallback single-tenant: usa `config.telegram.publicGroupId` |
| Grupo não encontrado no banco | Não sabe telegram_group_id | `resolveGroupData()` retorna erro, job aborta com alerta admin |
| Bot sem permissão de ban | Não consegue kickar | Alerta admin, NÃO marca como removido — retry próximo run |
| Membro já saiu do grupo | `banChatMember` retorna erro | `USER_NOT_IN_GROUP`: marca como removido normalmente |
| Múltiplos bots processando mesmo membro | Duplicação de kick | Lock `withLock()` previne execução concorrente no mesmo bot |
| Grace period insuficiente | Membro não tem tempo de pagar | Configurável via `config.membership.gracePeriodDays` (default 2 dias) |
| Regressão em testes existentes | Suite quebrada | Baseline: 770 testes — rodar antes e depois |

### Project Structure Notes

- Arquivo principal: `bot/jobs/membership/kick-expired.js` (modificar para multi-tenant)
- Nenhum arquivo novo necessário — adaptação de código existente
- Nenhuma migration SQL necessária (tabelas já existem)
- Admin panel NÃO é modificado
- Testes em `__tests__/jobs/membership/kick-expired.story45.test.js` (novo arquivo de testes)

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 4, Story 4.5]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md - Multi-tenant, Bot Management]
- [Source: _bmad-output/project-context.md - Member State Machine, Multi-Tenant Rules, Job Execution Pattern]
- [Source: bot/jobs/membership/kick-expired.js - Job completo de kick]
- [Source: bot/services/memberService.js - kickMemberFromGroup:1034, markMemberAsRemoved:1081]
- [Source: bot/services/notificationService.js - formatFarewellMessage:296, sendKickWarningNotification:644]
- [Source: bot/handlers/memberEvents.js - registerMemberEvent:421]
- [Source: bot/services/webhookProcessors.js - handleSubscriptionCancelled:1059]
- [Source: lib/config.js - membership.groupId, membership.gracePeriodDays]
- [Source: stories/4-4-acesso-instantaneo-pos-pagamento.md - Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

Nenhum debug log necessário — implementação direta sem bloqueios.

### Completion Notes List

- **Review fixes (Code Review):** Corrigidos todos os achados HIGH/MEDIUM da revisão adversarial: (1) job não aborta mais imediatamente quando resolução de grupo falha, (2) auditoria de kick agora cobre fluxos sem `telegram_id` e `USER_NOT_IN_GROUP`, (3) falha de `markMemberAsRemoved()` após kick não é mais mascarada como sucesso, (4) fallback para `config.telegram.publicGroupId` foi bloqueado em modo multi-tenant (`GROUP_ID` definido), (5) testes expandidos para cobrir cenários críticos.
- **Task 1 (Multi-tenant):** Adicionada função `resolveGroupData(groupId)` que busca dados do grupo (telegram_group_id, checkout_url, name) do banco. `getAllInadimplenteMembers()` agora filtra por `group_id` quando `GROUP_ID` está configurado. `_runKickExpiredInternal()` resolve grupo antes do loop e passa `groupData` para `processMemberKick()`. Fallback single-tenant mantido quando `GROUP_ID` não está definido.
- **Task 2 (Checkout URL dinâmico):** `processMemberKick()` agora usa `groupData.checkout_url` para a DM de despedida em vez do config estático. Fallback para `config.membership.checkoutUrl` via `getCheckoutLink()` quando grupo não tem checkout_url.
- **Task 3 (Audit log):** Após kick bem-sucedido, `registerMemberEvent(memberId, 'kick', { reason, groupId, groupName })` é chamado. Logging com prefixo `[membership:kick-expired]` inclui groupId.
- **Task 4 (Testes):** 18 novos testes em `kick-expired.story45.test.js` cobrindo: resolveGroupData, filtro multi-tenant, uso de telegram_group_id/checkout_url do grupo, fallbacks single-tenant, audit log, USER_BLOCKED_BOT, USER_NOT_IN_GROUP, BOT_NO_PERMISSION, integração completa kick+DM+mark+audit. Total: 788/788 testes passando (baseline era 770).

### Change Log

- **2026-02-10:** Fix(review): correções pós-code-review aplicadas no job `kick-expired` e testes (`story45` + suíte legada) para eliminar achados críticos/altos.
- **2026-02-10:** Story 4.5 implementada — Adaptação do job kick-expired para multi-tenant. Filtro por group_id, resolução de telegram_group_id e checkout_url do grupo, audit log via registerMemberEvent, 18 novos testes. Nenhum arquivo novo de produção criado (apenas adaptação de existente). 1 novo arquivo de teste.

### File List

- `bot/jobs/membership/kick-expired.js` — Modificado: hardening pós-review (chat ID seguro em multi-tenant, auditoria em todos os fluxos de remoção, falha explícita em inconsistência kick sem update DB, melhoria de tratamento de falha na resolução de grupo)
- `__tests__/jobs/membership/kick-expired.story45.test.js` — Modificado: novos cenários críticos (audit em fluxos alternativos, falha DB pós-kick, bloqueio de fallback inseguro multi-tenant, validação de continuidade com erro de resolução de grupo)
- `__tests__/jobs/membership/kick-expired.test.js` — Modificado: ajustes de mocks para o novo contrato de auditoria e manutenção da suíte legada

## Senior Developer Review (AI)

### Reviewer

Marcelomendes

### Date

2026-02-10

### Outcome

Approved

### Summary of Fixes Applied

- Corrigido risco de kick no grupo errado: em modo multi-tenant, não há fallback para `config.telegram.publicGroupId`.
- Corrigida inconsistência de estado: kick com falha no update DB agora retorna erro e alerta admin.
- Corrigida lacuna de auditoria: eventos de kick agora são registrados também nos fluxos sem `telegram_id` e `USER_NOT_IN_GROUP`.
- Corrigida cobertura de testes: adicionados testes para os cenários críticos acima.
