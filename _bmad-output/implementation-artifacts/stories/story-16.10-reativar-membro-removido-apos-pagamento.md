---
id: "16.10"
epicId: "16"
title: "Reativar Membro Removido Após Pagamento"
status: "ready-for-dev"
priority: "medium"
createdAt: "2026-01-18"
origin: "teste-e2e-fluxo-kick"
---

# Story 16.10: Reativar Membro Removido Após Pagamento

## User Story

**As a** membro que foi removido do grupo,
**I want** voltar automaticamente após efetuar o pagamento,
**So that** não precise passar pelo processo de cadastro novamente.

## Contexto

Durante teste E2E do fluxo de kick, identificamos um gap no sistema:

**Cenário atual:** Quando um membro é removido (`status = 'removido'`), esse é um estado final sem transições válidas. Se o membro pagar novamente via Cakto, o webhook `purchase_approved` falha porque:

1. O `renewMemberSubscription` não aceita status `removido`
2. O state machine não permite transição `removido → ativo`
3. Não há fluxo para gerar novo invite e notificar o membro

**Impacto:** Cliente paga, mas não consegue voltar ao grupo automaticamente. Requer intervenção manual do admin.

## State Machine Atual

```
trial ──────► ativo ──────► inadimplente
  │             │                │
  │             │                ▼
  └─────────────┴──────────► removido (FINAL)
```

## Proposta

Adicionar transição especial `removido → ativo` quando há pagamento confirmado:

```
removido ──[pagamento]──► ativo + gerar invite + notificar
```

## Acceptance Criteria

### AC1: Webhook purchase_approved para Membro Removido

**Given** membro com `status = 'removido'`
**When** Cakto envia webhook `purchase_approved` com email do membro
**Then** sistema atualiza status para `ativo`
**And** preenche `subscription_started_at` e `subscription_ends_at`
**And** limpa `kicked_at`
**And** gera novo invite link único (24h, 1 uso)
**And** envia mensagem privada com link de reentrada
**And** registra nota: "Reativado após pagamento"

### AC2: Webhook subscription_renewed para Membro Removido

**Given** membro com `status = 'removido'`
**When** Cakto envia webhook `subscription_renewed`
**Then** mesmo comportamento do AC1

### AC3: Notificação de Reativação

**Given** membro reativado com sucesso
**When** sistema gera invite link
**Then** envia mensagem no formato:

```
🎉 *Bem-vindo de volta!*

Seu pagamento foi confirmado e seu acesso foi restaurado.

👉 [Entrar no Grupo](INVITE_LINK)

_Link válido por 24h (uso único)_
```

### AC4: Membro Sem telegram_id

**Given** membro removido sem `telegram_id` (nunca deu /start)
**When** pagamento é aprovado
**Then** atualiza status para `ativo`
**And** NÃO tenta enviar mensagem
**And** registra nota: "Reativado - aguardando /start para invite"

### AC5: Confirmação de Entrada

**Given** membro reativado entra no grupo via invite
**When** bot detecta `new_chat_members`
**Then** atualiza `joined_group_at = NOW()`
**And** registra notificação tipo `reactivation_join`

### AC6: Idempotência

**Given** webhook já foi processado (duplicate)
**When** mesmo evento chega novamente
**Then** retorna sucesso sem reprocessar
**And** não gera novo invite link

## Tasks/Subtasks

### Task 1: Implementar função `reactivateRemovedMember` no memberService.js
- [x] 1.1: Criar função `reactivateRemovedMember(memberId, options)` com validação de status
- [x] 1.2: Implementar update: status='ativo', kicked_at=null, subscription dates, notes
- [x] 1.3: Se tem telegram_id: gerar invite link único (24h, 1 uso) via Telegram API
- [x] 1.4: Enviar mensagem de reativação com link de convite
- [x] 1.5: Retornar { success, data: { inviteLink, member } }

### Task 2: Modificar webhookProcessors.js para tratar status 'removido'
- [x] 2.1: Em handlePurchaseApproved: detectar status 'removido' e chamar reactivateRemovedMember
- [x] 2.2: Em handleSubscriptionRenewed: detectar status 'removido' e chamar reactivateRemovedMember

### Task 3: Adicionar template de notificação de reativação
- [x] 3.1: Criar função `sendReactivationNotification(telegramId, inviteLink)` no notificationService.js
- [x] 3.2: Implementar template de mensagem conforme AC3

### Task 4: Atualizar memberEvents.js para confirmação de entrada
- [x] 4.1: Detectar quando membro reativado entra no grupo
- [x] 4.2: Atualizar joined_group_at e registrar notificação tipo 'reactivation_join'

### Task 5: Implementar testes unitários
- [x] 5.1: Testes para reactivateRemovedMember (sucesso, sem telegram_id, status inválido)
- [x] 5.2: Testes para handlePurchaseApproved com status 'removido'
- [x] 5.3: Testes para handleSubscriptionRenewed com status 'removido'
- [x] 5.4: Testes para idempotência (AC6)

### Task 6: Teste E2E e validação final
- [x] 6.1: Executar teste E2E: membro removido → webhook purchase_approved → reativado → convite gerado
- [x] 6.2: Validar todos os ACs estão satisfeitos

## Dev Notes

### Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/services/memberService.js` | Modificar | Adicionar `reactivateRemovedMember()` |
| `bot/services/webhookProcessors.js` | Modificar | Tratar status `removido` em handlers |
| `bot/services/notificationService.js` | Modificar | Adicionar template de reativação |
| `bot/handlers/memberEvents.js` | Modificar | Detectar entrada de membro reativado |
| `__tests__/services/memberService.test.js` | Modificar | Testes para reactivateRemovedMember |
| `__tests__/services/webhookProcessors.test.js` | Modificar | Testes para handlers |

### Função Principal (Referência)

```javascript
/**
 * Reactivate a removed member after payment
 * Bypasses normal state machine for this special case
 * @param {number} memberId
 * @param {object} options - { subscriptionId, paymentMethod, etc }
 */
async function reactivateRemovedMember(memberId, options = {}) {
  // 1. Validar que status atual é 'removido'
  // 2. Update: status='ativo', kicked_at=null, subscription dates
  // 3. Se tem telegram_id: gerar invite + enviar mensagem
  // 4. Registrar nota e log
  // 5. Retornar { success, data: { inviteLink } }
}
```

### Patterns do Projeto

- Usar `{ success: true/false, data/error }` para retornos
- Logging com prefixo `[memberService]` ou `[webhookProcessors]`
- Usar `lib/supabase.js` para acesso ao banco
- Invite link via `bot.createChatInviteLink()` com `member_limit: 1` e `expire_date: 24h`

### Validação do State Machine

Manter `removido` como estado final no `VALID_TRANSITIONS`, mas criar função separada que faz bypass controlado.

## Out of Scope

- Reativação via comando admin (já existe `/membro extender`)
- Reativação automática sem pagamento
- Alteração do state machine geral

## Dev Agent Record

### Implementation Plan
1. Criar `reactivateRemovedMember` no memberService.js
2. Criar `sendReactivationNotification` no notificationService.js
3. Modificar webhookProcessors.js para tratar status 'removido'
4. Atualizar memberEvents.js para detectar reactivation_join
5. Criar migration para novos tipos de notificação
6. Adicionar testes unitários
7. Executar teste E2E

### Debug Log
- Teste E2E com usuária 9 (thaiza.walter@gmail.com) executado com sucesso
- Constraint de tipos de notificação precisa de migration manual no Supabase

### Completion Notes
Story implementada com sucesso. Todos os ACs foram satisfeitos:
- AC1: Webhook purchase_approved reativa membro removido
- AC2: Webhook subscription_renewed também reativa
- AC3: Mensagem de boas-vindas enviada com invite link
- AC4: Membro sem telegram_id é reativado sem notificação
- AC5: memberEvents detecta reactivation_join e atualiza joined_group_at
- AC6: Idempotência via optimistic lock no DB

**Pendência:** Executar migration 010 no Supabase Dashboard para adicionar tipos 'reactivation' e 'reactivation_join'.

## File List

**Modified:**
- `bot/services/memberService.js` - Adicionada função `reactivateRemovedMember`
- `bot/services/webhookProcessors.js` - Tratamento de status 'removido' nos handlers
- `bot/services/notificationService.js` - Adicionada função `sendReactivationNotification`
- `bot/handlers/memberEvents.js` - Detecção de reactivation_join
- `__tests__/services/memberService.test.js` - Testes para reactivateRemovedMember
- `__tests__/services/webhookProcessors.test.js` - Testes para handlers com status removido

**Created:**
- `sql/migrations/010_add_reactivation_notification_types.sql` - Migration para novos tipos

## Change Log

| Date | Change |
|------|--------|
| 2026-01-18 | Story criada após identificação de gap em teste E2E |
| 2026-01-18 | Story formatada para dev-story workflow |
| 2026-01-18 | Implementação completa - todos os ACs satisfeitos |
| 2026-01-18 | Code Review adversarial executado - 7 issues identificados e corrigidos |

## Code Review Fixes

### Issues Corrigidos (2026-01-18)

| # | Severidade | Descrição | Arquivo |
|---|------------|-----------|---------|
| 1 | HIGH | AC6 Idempotência - webhook duplicado para membro reativado era processado incorretamente | webhookProcessors.js |
| 2 | HIGH | AC4 Nota específica - nota "aguardando /start" não era adicionada para membros sem telegram_id | memberService.js |
| 3 | MEDIUM | Detecção genérica - `notes?.includes('Reativado')` muito genérico, falsos positivos | memberEvents.js |
| 4 | MEDIUM | Testes faltando - sendReactivationNotification sem testes unitários | notificationService.test.js |
| 5 | MEDIUM | DB failure handling - falha no update de invite_link não interrompia execução | notificationService.js |
| 6 | LOW | Input validation - telegramId/memberId não validados | notificationService.js |
| 7 | LOW | Export faltando - registerReactivationJoinNotification não exportada | memberEvents.js |

## Status

**Current:** done
