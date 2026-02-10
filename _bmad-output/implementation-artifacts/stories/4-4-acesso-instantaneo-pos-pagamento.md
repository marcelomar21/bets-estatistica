# Story 4.4: Acesso Instantâneo Pós-Pagamento

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **membro que pagou**,
I want receber acesso instantâneo após pagamento,
So that eu não precise esperar para continuar no grupo.

## Acceptance Criteria

1. **AC1: DM de confirmação de pagamento**
   - Given webhook processou pagamento/assinatura aprovada (via Story 4.3)
   - When o status do membro é atualizado para `active`
   - Then bot envia DM: "Pagamento confirmado! Acesso liberado até DD/MM/AAAA" (FR52, FR12)
   - And mensagem inclui nome do grupo e data formatada
   - And se o bot foi bloqueado pelo membro (`USER_BLOCKED_BOT`), falha silenciosa sem quebrar o webhook

2. **AC2: Acesso em < 30 segundos após confirmação**
   - Given webhook de pagamento aprovado é processado
   - When membro é ativado
   - Then todo o fluxo (ativação + DM + re-add se necessário) completa em < 30s (NFR-P2)
   - And a DM é enviada na mesma execução do handler, sem depender de job separado

3. **AC3: Re-adição de membro removido (kick)**
   - Given membro com `status = 'removido'` paga novamente
   - When webhook processa o pagamento aprovado
   - Then bot faz unban do membro no grupo Telegram via `unbanChatMember`
   - And bot envia notificação de reativação com link de convite do grupo
   - And `kicked_at` é limpo e `invite_link` é regenerado
   - And o grupo correto é usado (multi-tenant: `group.telegram_group_id`)

4. **AC4: Membro ainda no grupo — apenas atualiza status**
   - Given membro com `status = 'trial'` ou `status = 'ativo'` paga
   - When webhook processa o pagamento aprovado
   - Then apenas atualiza status para `active` e `paid_until`
   - And envia DM de confirmação
   - And NÃO tenta unban ou gerar convite (desnecessário)

5. **AC5: Renovação estende paid_until**
   - Given membro ativo com `subscription_ends_at` existente
   - When novo pagamento aprovado é processado (renovação)
   - Then `subscription_ends_at` é estendido por +30 dias a partir do valor atual
   - And DM confirma a nova data de vencimento

6. **AC6: Recuperação de inadimplente**
   - Given membro com `status = 'inadimplente'` paga
   - When webhook processa pagamento aprovado
   - Then membro retorna para `status = 'active'` via `activateMember`
   - And DM de confirmação é enviada com nova data

## Tasks / Subtasks

- [x] Task 1: Integrar `sendPaymentConfirmation` no `handlePaymentApproved` (AC: #1, #2)
  - [x] 1.1 Importar `sendPaymentConfirmation` de `bot/handlers/memberEvents.js` em `webhookProcessors.js`
  - [x] 1.2 Após `activateMember()` (trial → ativo): chamar `sendPaymentConfirmation(member.telegram_id, member.id, subscription_ends_at)`
  - [x] 1.3 Após `renewMemberSubscription()` (ativo → renovação): chamar `sendPaymentConfirmation`
  - [x] 1.4 Após `activateMember()` (inadimplente → ativo): chamar `sendPaymentConfirmation`
  - [x] 1.5 Envolver chamada em try/catch — falha de DM NUNCA deve falhar o processamento do webhook
  - [x] 1.6 Logar resultado: `logger.info('[webhook:payment] DM confirmação enviada', { memberId, telegramId })` ou `logger.warn` se falhou

- [x] Task 2: Implementar re-adição de membros removidos no `handlePaymentApproved` (AC: #3)
  - [x] 2.1 No bloco de reativação de removido (`reactivateRemovedMember`): após reativar, verificar se membro está no grupo via `bot.getChatMember(groupTelegramId, telegramId)`
  - [x] 2.2 Se NÃO está no grupo: `bot.unbanChatMember(groupTelegramId, telegramId, { only_if_banned: true })`
  - [x] 2.3 Se NÃO está no grupo: chamar `sendReactivationNotification(telegramId, memberId)` de `notificationService.js` (gera link de convite e envia DM)
  - [x] 2.4 Se ESTÁ no grupo: chamar `sendPaymentConfirmation` normalmente
  - [x] 2.5 Usar `group.telegram_group_id` (multi-tenant) — NÃO `config.telegram.publicGroupId`
  - [x] 2.6 Envolver em try/catch — re-add falhando NÃO deve reverter a ativação do membro

- [x] Task 3: Testes cobrindo fluxo completo (AC: #1-#6)
  - [x] 3.1 Testar: trial → ativo envia DM de confirmação com `subscription_ends_at` formatada
  - [x] 3.2 Testar: renovação envia DM com nova data estendida (+30 dias)
  - [x] 3.3 Testar: inadimplente → ativo envia DM de confirmação
  - [x] 3.4 Testar: removido → ativo com membro fora do grupo → unban + reactivation notification
  - [x] 3.5 Testar: removido → ativo com membro ainda no grupo → apenas DM de confirmação
  - [x] 3.6 Testar: `USER_BLOCKED_BOT` → DM falha silenciosa, webhook continua
  - [x] 3.7 Testar: `getChatMember` falha → assume fora do grupo, tenta unban
  - [x] 3.8 Testar: `unbanChatMember` falha → loga warning, continua processamento
  - [x] 3.9 Verificar que admin notification continua funcionando (não regrediu)

## Dev Notes

### Contexto Crítico: Infraestrutura EXISTE, Falta a Integração

**Esta story NÃO é para criar funções novas.** A maioria das funções já existe e está testada. O trabalho é **integrar as chamadas** no fluxo do `handlePaymentApproved` e adicionar lógica de re-add.

**Funções existentes que JÁ funcionam:**

| Função | Arquivo | Status |
|--------|---------|--------|
| `sendPaymentConfirmation(telegramId, memberId, paidUntil)` | `bot/handlers/memberEvents.js:549-613` | **Existe, exportada, NÃO chamada em webhookProcessors** |
| `sendReactivationNotification(telegramId, memberId)` | `bot/services/notificationService.js:372-500` | **Existe, gera invite link + DM** |
| `activateMember(memberId, opts)` | `bot/services/memberService.js:443-537` | **Já chamada no handler** |
| `renewMemberSubscription(memberId)` | `bot/services/memberService.js:547-637` | **Já chamada no handler** |
| `reactivateRemovedMember(memberId, opts)` | `bot/services/memberService.js:652-748` | **Já chamada no handler** |
| `kickMemberFromGroup(memberId, groupId)` | `bot/services/memberService.js:1031-1068` | **Referência para padrão de ban** |
| `bot.unbanChatMember(groupId, telegramId, opts)` | `bot/handlers/startCommand.js:287-300` | **Padrão já usado no codebase** |
| `bot.getChatMember(groupId, telegramId)` | Telegram Bot API | **API nativa do bot** |

### Fluxo Atual vs. Desejado

**Atual (Story 4.3 - sem DM/re-add):**
```
handlePaymentApproved()
    ├─ trial → ativo: activateMember() → notifyAdmin() → FIM
    ├─ renewal: renewMemberSubscription() → notifyAdmin() → FIM
    ├─ inadimplente → ativo: activateMember() → notifyAdmin() → FIM
    └─ removido → ativo: reactivateRemovedMember() → notifyAdmin() → FIM
```

**Desejado (Story 4.4 - com DM + re-add):**
```
handlePaymentApproved()
    ├─ trial → ativo:
    │   activateMember()
    │   → sendPaymentConfirmation(telegram_id, member_id, subscription_ends_at)  ← NOVO
    │   → notifyAdmin()
    │
    ├─ renewal:
    │   renewMemberSubscription()
    │   → sendPaymentConfirmation(telegram_id, member_id, new_subscription_ends_at)  ← NOVO
    │   → notifyAdmin()
    │
    ├─ inadimplente → ativo:
    │   activateMember()
    │   → sendPaymentConfirmation(telegram_id, member_id, subscription_ends_at)  ← NOVO
    │   → notifyAdmin()
    │
    └─ removido → ativo:
        reactivateRemovedMember()
        → getChatMember(groupTelegramId, telegram_id)  ← NOVO
        ├─ IN GROUP: sendPaymentConfirmation()  ← NOVO
        └─ NOT IN GROUP:
            unbanChatMember(groupTelegramId, telegram_id)  ← NOVO
            sendReactivationNotification(telegram_id, member_id)  ← NOVO
        → notifyAdmin()
```

### Formato da DM de Confirmação (Já Implementado)

A função `sendPaymentConfirmation` em `bot/handlers/memberEvents.js:549-613` já gera a mensagem:

```
✅ *Pagamento confirmado!*

Você agora é membro ativo do *{nome do grupo}* até *DD/MM/AAAA*.

📊 Continue recebendo:
• 3 apostas diárias com análise estatística
• Horários: 10h, 15h e 22h

❓ Dúvidas? Fale com @operador

Boas apostas! 🍀
```

### Multi-tenant: Grupo Correto

O `handlePaymentApproved` já resolve o grupo via Story 4.3 (`resolveGroupFromPayment`). O `group` objeto contém:

```javascript
{
  id: 'uuid',
  name: 'GuruBet',
  telegram_group_id: -100123456789,    // ← Usar para getChatMember/unban
  telegram_admin_group_id: -100987654321,
  checkout_url: 'https://mp.com/...',
  status: 'active'
}
```

**Para re-add:** Usar `group.telegram_group_id` (NÃO `config.telegram.publicGroupId`).

### Padrão de Unban Existente no Codebase

De `bot/handlers/startCommand.js:287-300`:
```javascript
try {
  await bot.unbanChatMember(groupId, telegramId, { only_if_banned: true });
  logger.info('User unbanned for reactivation', { memberId, telegramId });
} catch (unbanErr) {
  logger.warn('Failed to unban user (may not be banned)', {
    memberId, error: unbanErr.message
  });
}
```

**Nota:** `kickMemberFromGroup` usa ban temporário de 24h (`until_date: now + 86400`), então após 24h o ban expira automaticamente. O `unbanChatMember` é necessário apenas se o pagamento acontece dentro de 24h do kick.

### Padrão de Verificação de Membership

```javascript
const { getBot } = require('../telegram');
const bot = getBot();

let isInGroup = false;
try {
  const chatMember = await bot.getChatMember(groupTelegramId, telegramId);
  isInGroup = ['member', 'administrator', 'creator'].includes(chatMember.status);
} catch (err) {
  logger.warn('[webhook:payment] Could not check group membership', {
    telegramId, error: err.message
  });
  isInGroup = false;  // Assume não está no grupo
}
```

### Tratamento de Erros — Regra de Ouro

**DM e re-add são operações "best-effort".** Se falharem, o membro JÁ foi ativado no banco. A ativação financeira é o que importa. A DM e re-add são cortesia.

```javascript
// ✅ CORRETO: Não falhar webhook por causa de DM
try {
  await sendPaymentConfirmation(member.telegram_id, member.id, paidUntil);
} catch (err) {
  logger.warn('[webhook:payment] Falha ao enviar DM de confirmação', {
    memberId: member.id, error: err.message
  });
  // Continua processamento normalmente
}
```

### NFR-P2: Acesso em < 30 Segundos

O webhook é processado pelo job `process-webhooks.js` que roda a cada 5 minutos (configurado em `bot/jobs/membership/process-webhooks.js`). O tempo total é:

```
Webhook recebido → salvo em webhook_events (imediato, <1s)
    ↓
process-webhooks job roda (a cada 5 min)
    ↓
processWebhookEvent → handlePaymentApproved → activateMember → DM (<5s)
```

**O bottleneck é o intervalo do job (5 min), não o processamento.** Se NFR-P2 (< 30s) for estritamente necessário, o intervalo do job precisaria ser reduzido para ~15s. **Verificar com o usuário se o intervalo atual é aceitável** ou se precisa ajustar.

**NOTA IMPORTANTE:** O intervalo do job `process-webhooks.js` é definido pelo cron schedule nele. Verificar valor atual antes de assumir. Se já for 30s, o NFR-P2 é atendido naturalmente.

### Padrões Obrigatórios

1. **Service Response Pattern:** `{ success: true/false, data/error }` — MANTER em todos os services
2. **Logging:** `logger.info/warn/error` com prefixo `[webhook:payment]` — NUNCA `console.log`
3. **Multi-tenant:** Usar `group.telegram_group_id` e `group.checkout_url` do grupo resolvido
4. **State Machine:** Transições já validadas via `canTransition()` — NÃO reimplementar
5. **Error Codes:** `MEMBER_NOT_FOUND`, `USER_BLOCKED_BOT`, `GROUP_NOT_FOUND`
6. **Naming:** camelCase JS, snake_case DB
7. **Supabase:** Via `lib/supabase.js` — NUNCA instanciar novo

### Learnings da Story 4.3

- Group resolution já funciona via `preapproval_plan_id → groups.mp_plan_id`
- `handlePaymentApproved` aceita `eventContext` com `eventId` para tracking em `webhook_events`
- Handler signatures: `handlePaymentApproved(payload, eventContext, paymentData)` — backward compatible
- `resolveGroupFromPayment()` já encapsula toda a lógica de resolução de grupo
- `buildNotifyContext(group)` extrai `adminGroupId`, `groupName`, `groupId` para notificações
- Non-critical failures logam warnings, não lançam exceções
- Testes existentes: `webhookProcessors.test.js`, `webhookProcessors.story43.test.js`, `webhookProcessingFlow.test.js`

### Learnings da Story 4.2

- `sendPaymentConfirmation` foi criada mas NÃO conectada ao fluxo de webhook — **esta story faz essa conexão**
- Padrão de testes com mocks estabelecido em `__tests__/handlers/memberEvents.story42.test.js`
- 749/749 testes passando pós Story 4.3 — manter como baseline

### Git Intelligence

**Commits recentes:**
```
9ec7acf fix(story-4.3): apply review fixes and finalize status
112cb3f feat(bot): implement multi-tenant webhook processing for Mercado Pago (story 4.3)
8597a6e Merge pull request #26 (story 4.2)
10d7c22 fix(story-4.2): apply code review fixes and finalize status
```

**Branch naming:** `feature/story-4.4-acesso-instantaneo-pos-pagamento`
**Commit pattern:** `feat(bot): description (story 4.4)`

### Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Bot bloqueado pelo membro | DM não entregue | `sendPaymentConfirmation` já trata `USER_BLOCKED_BOT` silenciosamente |
| `getChatMember` falha (rate limit, bot sem permissão) | Não sabe se membro está no grupo | Assume fora do grupo → tenta unban (idempotente) |
| `unbanChatMember` falha | Membro não consegue voltar | `only_if_banned: true` previne erros; link de convite é enviado como fallback |
| `sendReactivationNotification` falha ao gerar invite | Membro não recebe link | Loga warning, membro já está ativo no DB |
| Job interval > 30s (NFR-P2) | Acesso demora mais que 30s | Verificar e ajustar schedule se necessário |
| Regressão em testes existentes | Suite quebrada | Baseline: 749 testes — rodar antes e depois |

### Project Structure Notes

- Esta story afeta primariamente `bot/services/webhookProcessors.js` (integrar chamadas de DM/re-add)
- Nenhum arquivo novo necessário — apenas integração de funções existentes
- Nenhuma migration SQL necessária
- Admin panel NÃO é modificado
- Testes em `__tests__/services/webhookProcessors.story44.test.js` (novo arquivo)

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 4, Story 4.4]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md - Webhook Processing, Multi-tenant]
- [Source: _bmad-output/project-context.md - Member State Machine, Webhook Pattern]
- [Source: bot/services/webhookProcessors.js - handlePaymentApproved lines 499-802]
- [Source: bot/handlers/memberEvents.js - sendPaymentConfirmation lines 549-613]
- [Source: bot/services/notificationService.js - sendReactivationNotification lines 372-500]
- [Source: bot/services/memberService.js - activateMember, renewMemberSubscription, reactivateRemovedMember]
- [Source: bot/handlers/startCommand.js - unban pattern lines 287-300]
- [Source: bot/telegram.js - Bot singleton, getBot()]
- [Source: stories/4-3-webhook-mercado-pago-multi-tenant.md - Previous story learnings]
- [Source: stories/4-2-boas-vindas-e-registro-com-status-trial.md - sendPaymentConfirmation origin]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Revisão adversarial + correções aplicadas com validação por testes direcionados e suíte completa.

### Completion Notes List

- **Task 1:** Fluxo de DM reforçado no `handlePaymentApproved`: `sendPaymentConfirmation` agora recebe `group.name` e os logs de falha incluem `telegramId` em todos os branches (trial, renovação, inadimplente, novo membro e removido ainda no grupo).
- **Task 2:** Re-add multi-tenant corrigido: `sendReactivationNotification` recebe `groupTelegramId` explícito; fallback para `config.telegram.publicGroupId` ocorre apenas em modo single-tenant (sem tenant resolvido), evitando uso de grupo errado quando há tenant.
- **Task 3:** Regra de renovação corrigida em `renewMemberSubscription`: extensão de +30 dias passa a usar `subscription_ends_at` atual quando estiver no futuro (em vez de sempre usar `now`).
- **Task 4:** Testes fortalecidos para capturar regressões dos pontos acima (multi-tenant invite target, nome de grupo na DM, extensão real da renovação e logs de falha DM). Suite completa validada: **770/770 testes passando**.

### Change Log

- 2026-02-10: Story 4.4 implementada — DM de confirmação de pagamento integrada ao handlePaymentApproved, lógica de re-add para membros removidos com getChatMember/unbanChatMember, 13 testes adicionados
- 2026-02-10: Fixes de code review aplicados — correção de re-add multi-tenant por grupo, DM com nome real do grupo, extensão de renovação por `subscription_ends_at`, logs de falha DM enriquecidos e testes adicionais

### File List

- `bot/services/webhookProcessors.js` (modificado) — DM com `group.name`, logs de falha com `telegramId`, re-add com fallback seguro single-tenant e `sendReactivationNotification` com `groupTelegramId` explícito
- `bot/handlers/memberEvents.js` (modificado) — `sendPaymentConfirmation` agora suporta nome dinâmico do grupo na mensagem
- `bot/services/notificationService.js` (modificado) — `sendReactivationNotification` aceita `groupTelegramId` para gerar invite no grupo correto
- `bot/services/memberService.js` (modificado) — `renewMemberSubscription` estende assinatura a partir do `subscription_ends_at` atual quando aplicável
- `__tests__/services/webhookProcessors.story44.test.js` (modificado) — expectativas atualizadas para nome de grupo na DM, `groupTelegramId` no re-add e logs com `telegramId`
- `__tests__/services/webhookProcessors.test.js` (modificado) — cobertura ajustada para assinatura de `sendReactivationNotification` com `groupTelegramId`
- `__tests__/services/notificationService.test.js` (modificado) — novo teste garantindo prioridade para `groupTelegramId` explícito
- `__tests__/services/memberService.test.js` (modificado) — novos testes da regra de extensão de renovação (+30 dias a partir do vencimento atual/futuro)
