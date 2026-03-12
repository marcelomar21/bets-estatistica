---
title: 'Heartbeat Bot Unificado + Notificações Trial/Pagamento'
slug: 'heartbeat-notifications'
created: '2026-03-12'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['node.js (bot)', 'next.js 14 (admin-panel)', 'supabase (postgres)', 'vitest (admin tests)', 'jest (bot tests)']
files_to_modify:
  - 'bot/jobs/healthCheck.js'
  - 'bot/handlers/memberEvents.js'
  - 'bot/services/webhookProcessors.js'
  - 'bot/handlers/startCommand.js'
  - 'admin-panel/src/app/api/dashboard/stats/route.ts'
  - 'admin-panel/src/types/database.ts'
  - 'admin-panel/src/components/features/dashboard/NotificationsPanel.tsx'
  - 'sql/migrations/053_notifications_check_constraint.sql'
files_to_create:
  - '__tests__/jobs/healthCheck.test.js'
code_patterns:
  - 'Bot usa singleton supabase de lib/supabase.js'
  - 'Notifications INSERT usa dedup por type::group_id na última hora'
  - 'persistNotifications() já tem fallback para tipos desconhecidos (severity info, title Alerta)'
  - 'NotificationsPanel usa Record<type, emoji> para ícones'
test_patterns:
  - 'Bot tests: Jest em __tests__/ com mocks do supabase'
  - 'Admin tests: Vitest com createDashboardMock() table-aware'
  - 'Dashboard mock diferencia tabelas no mockFrom'
---

# Tech-Spec: Heartbeat Bot Unificado + Notificações Trial/Pagamento

**Created:** 2026-03-12

## Overview

### Problem Statement

1. **Bot Offline falso**: O bot unificado (`bets-bot-unified`) roda como serviço único no Render mas nunca escreve na tabela `bot_health`. O onboarding cria registros com `status: 'offline'` que nunca são atualizados, gerando notificações "Bot Offline" eternas no painel.
2. **Sem notificações de trial/pagamento**: Quando um novo membro entra em trial ou um pagamento é confirmado, não há notificação no painel admin — apenas registros em `member_notifications` (visível só para o membro).
3. **CHECK constraint desatualizado**: A tabela `notifications` no SQL aceita apenas 5 tipos (`bot_offline`, `group_failed`, `onboarding_completed`, `group_paused`, `integration_error`), mas o TypeScript define 9 tipos. Inserts dos tipos extras falham silenciosamente.

### Solution

- Adicionar heartbeat no `healthCheck.js` que faz upsert de um **registro único** (sem group_id, channel='telegram') em `bot_health` a cada 5 min
- Dashboard considera offline quando `last_heartbeat > 30 min` (independente do campo `status`)
- Criar notificações individuais `new_trial` e `payment_received` nos handlers do bot
- Migration para alinhar CHECK constraint com todos os tipos

### Scope

**In Scope:**
- Heartbeat do bot unificado (registro único em `bot_health`)
- Detecção de offline por `last_heartbeat > 30 min` no dashboard
- Notificação individual `new_trial` quando membro entra em trial
- Notificação individual `payment_received` quando pagamento é confirmado
- Migration SQL para atualizar CHECK constraint da tabela `notifications`
- Testes unitários para todas as mudanças

**Out of Scope:**
- Heartbeat WhatsApp (já tem via `heartbeatService.js`)
- Refactor do NotificationsPanel UI
- Notificações agrupadas/batch
- Notificações push/real-time (WebSocket)

## Context for Development

### Codebase Patterns

- **Bot supabase**: Singleton em `lib/supabase.js` (line 13-22), importado via `const { supabase } = require('../../lib/supabase')`
- **bot_health upsert**: WhatsApp heartbeat usa `supabase.from('bot_health').upsert(payload)` com campos `group_id, channel, number_id, status, last_heartbeat, error_message, updated_at`
- **bot_health schema**: PK é `id UUID`, unique constraint em `(group_id, channel, COALESCE(number_id))`. `group_id` é nullable (pra WhatsApp pool). `channel` default `'telegram'`.
- **notifications INSERT**: `persistNotifications()` no dashboard stats faz dedup por `type::group_id` na última hora. Usa `SEVERITY_MAP` com fallback `'info'` e `alertTitle()` com default `'Alerta'`.
- **NotificationsPanel**: Usa `Record<Notification['type'], string>` para mapear tipos a emojis. Fallback para `typeIcons.bot_offline` (🔴) em tipos desconhecidos.
- **Trial creation paths**: `memberEvents.js:191` (group join) e `startCommand.js:382` (internal trial /start)
- **Payment confirmation paths**: `webhookProcessors.js` em 4 cenários (novo membro, trial→ativo, renovação, recuperação de inadimplente), todos chamam `sendPaymentConfirmation()`

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `bot/jobs/healthCheck.js` | Job de health check (cada 5 min) — adicionar heartbeat aqui |
| `bot/handlers/memberEvents.js:191` | `processNewMember()` chama `createTrialMember()` — inserir notif `new_trial` |
| `bot/handlers/startCommand.js:382` | `handleInternalTrialStart()` chama `createTrialMember()` — inserir notif `new_trial` |
| `bot/services/webhookProcessors.js:706,801,863,931` | 4 pontos onde `sendPaymentConfirmation()` é chamado — inserir notif `payment_received` |
| `admin-panel/src/app/api/dashboard/stats/route.ts:7-13,77-85,250-260` | SEVERITY_MAP, alertTitle(), detecção offline |
| `admin-panel/src/types/database.ts:109-118` | NotificationType union — adicionar novos tipos |
| `admin-panel/src/components/features/dashboard/NotificationsPanel.tsx:11-21` | typeIcons mapping — adicionar novos tipos |
| `sql/migrations/022_notifications.sql:10` | CHECK constraint original (5 tipos) |
| `sql/migrations/052_groups_deleted_status.sql` | Última migration — próxima é 053 |
| `whatsapp/services/heartbeatService.js` | Referência de como fazer heartbeat (padrão a seguir) |
| `lib/supabase.js:13-22` | Singleton supabase usado pelo bot |
| `admin-panel/src/app/api/__tests__/dashboard.test.ts` | Mock patterns para testes do dashboard |

### Technical Decisions

- Heartbeat como registro único (sem group_id, channel='telegram') porque o bot unificado é um serviço só
- Offline = `last_heartbeat > 30 min` (6x o intervalo de 5 min, margem generosa)
- Notificações individuais por membro (não agrupadas)
- Bot insere diretamente na tabela `notifications` (não usa `persistNotifications` do dashboard — essa roda no admin-panel)
- Sem dedup no bot para `new_trial` e `payment_received` — cada evento é único (um membro diferente a cada vez)

## Implementation Plan

### Tasks

#### Task 1: Migration SQL — Atualizar CHECK constraint da tabela `notifications`

- [ ] **1.1**: Criar `sql/migrations/053_notifications_type_constraint.sql`
  - File: `sql/migrations/053_notifications_type_constraint.sql`
  - Action: DROP o CHECK constraint existente e recriar com todos os 11 tipos
  - SQL:
    ```sql
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type IN (
        'bot_offline',
        'group_failed',
        'onboarding_completed',
        'group_paused',
        'integration_error',
        'telegram_group_created',
        'telegram_group_failed',
        'telegram_notification_failed',
        'mtproto_session_expired',
        'new_trial',
        'payment_received'
      ));
    ```
- [ ] **1.2**: Aplicar migration via Supabase Management API
  - Notes: Usar o padrão documentado no CLAUDE.md com curl + access token do Keychain

#### Task 2: Heartbeat no bot unificado

- [ ] **2.1**: Adicionar função `updateHeartbeat()` em `bot/jobs/healthCheck.js`
  - File: `bot/jobs/healthCheck.js`
  - Action: Criar função que faz upsert em `bot_health` com:
    - `group_id: null` (registro único do serviço unificado)
    - `channel: 'telegram'`
    - `number_id: null`
    - `status: 'online'`
    - `last_heartbeat: new Date().toISOString()`
    - `error_message: null`
    - `updated_at: new Date().toISOString()`
  - Notes: Usar `supabase.from('bot_health').upsert()` com `onConflict: 'group_id,channel'`. Como `group_id` é null, a unique constraint `(group_id, channel, COALESCE(number_id, ...))` vai tratar como registro único. Se o upsert com null não funcionar no unique constraint, usar um SELECT + INSERT/UPDATE manual.
- [ ] **2.2**: Chamar `updateHeartbeat()` no final de `runHealthCheck()` quando DB está ok
  - File: `bot/jobs/healthCheck.js`
  - Action: Após `checkDatabaseConnection()` retornar success, chamar `await updateHeartbeat()`. Se DB falhou, chamar com `status: 'offline'` e `error_message` do erro.
- [ ] **2.3**: Importar supabase no healthCheck.js
  - File: `bot/jobs/healthCheck.js`
  - Action: Adicionar `const { supabase } = require('../../lib/supabase');` nos imports

#### Task 3: Dashboard — Detecção offline por `last_heartbeat > 30 min`

- [ ] **3.1**: Alterar lógica de detecção offline em `stats/route.ts`
  - File: `admin-panel/src/app/api/dashboard/stats/route.ts`
  - Action: No loop de `botHealth` (linhas 250-260), mudar a condição de `h.status === 'offline'` para:
    ```typescript
    const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutos
    const isOffline = h.status === 'offline' ||
      (h.last_heartbeat && (Date.now() - new Date(h.last_heartbeat).getTime()) > OFFLINE_THRESHOLD_MS);
    ```
  - Notes: Isso cobre tanto o caso onde status foi explicitamente setado para offline quanto o caso onde o heartbeat parou de chegar

#### Task 4: Notificações `new_trial` — Criar helper e inserir nos handlers

- [ ] **4.1**: Criar função helper `insertAdminNotification()` em `bot/services/notificationHelper.js`
  - File: `bot/services/notificationHelper.js` (NOVO)
  - Action: Criar módulo com função:
    ```javascript
    async function insertAdminNotification({ type, severity, title, message, groupId, metadata }) {
      const { supabase } = require('../../lib/supabase');
      try {
        const { error } = await supabase.from('notifications').insert({
          type,
          severity,
          title,
          message,
          group_id: groupId || null,
          metadata: metadata || {},
        });
        if (error) {
          logger.warn('[notificationHelper] Failed to insert notification', { type, error: error.message });
        }
      } catch (err) {
        logger.warn('[notificationHelper] Error inserting notification', { type, error: err.message });
      }
    }
    ```
  - Notes: Fire-and-forget — nunca deve bloquear o fluxo principal. Sem dedup aqui porque cada new_trial/payment_received é um evento distinto (membro diferente).
- [ ] **4.2**: Inserir notificação `new_trial` em `memberEvents.js` após `createTrialMember()`
  - File: `bot/handlers/memberEvents.js`
  - Action: Após linha ~205 (depois do `member_events` insert), adicionar:
    ```javascript
    insertAdminNotification({
      type: 'new_trial',
      severity: 'info',
      title: 'Novo Membro Trial',
      message: `Novo membro trial "${username}" no grupo "${groupName}"`,
      groupId,
      metadata: { member_id: createResult.data.id, telegram_username: username },
    }).catch(() => {});
    ```
  - Notes: `.catch(() => {})` para garantir fire-and-forget
- [ ] **4.3**: Inserir notificação `new_trial` em `startCommand.js` após `handleInternalTrialStart()`
  - File: `bot/handlers/startCommand.js`
  - Action: Após linha ~407 (depois do `member_events` insert), mesmo padrão da 4.2
  - Notes: Precisa obter o `groupName` — pode vir do contexto do bot ou de uma query ao grupo

#### Task 5: Notificações `payment_received` — Inserir nos 4 cenários do webhookProcessors

- [ ] **5.1**: Inserir notificação `payment_received` nos 4 cenários de pagamento
  - File: `bot/services/webhookProcessors.js`
  - Action: Nos 4 pontos onde `sendPaymentConfirmation()` é chamado (linhas ~706, ~801, ~863, ~931), adicionar antes:
    ```javascript
    insertAdminNotification({
      type: 'payment_received',
      severity: 'success',
      title: 'Pagamento Confirmado',
      message: `Pagamento confirmado para membro "${memberName}" no grupo "${groupName}"`,
      groupId: member.group_id,
      metadata: { member_id: member.id, payment_id: payment.id },
    }).catch(() => {});
    ```
  - Notes: O `memberName` pode ser `member.telegram_username` ou `member.email`. O `groupName` precisa ser resolvido — verificar se já está disponível no contexto.

#### Task 6: Admin-panel — Tipos e UI

- [ ] **6.1**: Adicionar `new_trial` e `payment_received` ao NotificationType
  - File: `admin-panel/src/types/database.ts`
  - Action: Adicionar `| 'new_trial'` e `| 'payment_received'` ao type union (linhas 109-118)
- [ ] **6.2**: Adicionar ao SEVERITY_MAP e alertTitle() no dashboard stats
  - File: `admin-panel/src/app/api/dashboard/stats/route.ts`
  - Action: Adicionar ao `SEVERITY_MAP` (linhas 7-13):
    ```typescript
    new_trial: 'info',
    payment_received: 'success',
    ```
  - Action: Adicionar ao `alertTitle()` (linhas 77-85):
    ```typescript
    case 'new_trial': return 'Novo Membro Trial';
    case 'payment_received': return 'Pagamento Confirmado';
    ```
- [ ] **6.3**: Adicionar ícones no NotificationsPanel
  - File: `admin-panel/src/components/features/dashboard/NotificationsPanel.tsx`
  - Action: Adicionar ao `typeIcons` (linhas 11-21):
    ```typescript
    new_trial: '👤',
    payment_received: '💰',
    ```

#### Task 7: Testes

- [ ] **7.1**: Criar teste do heartbeat
  - File: `__tests__/jobs/healthCheck.test.js` (NOVO)
  - Action: Testar que `runHealthCheck()`:
    - Chama upsert em `bot_health` com `status: 'online'` quando DB está ok
    - Chama upsert em `bot_health` com `status: 'offline'` quando DB falha
    - Não falha se upsert falhar (fire-and-forget para heartbeat)
- [ ] **7.2**: Atualizar teste do dashboard para detecção offline por timestamp
  - File: `admin-panel/src/app/api/__tests__/dashboard.test.ts`
  - Action: Adicionar testes:
    - Bot com `status: 'online'` mas `last_heartbeat` > 30 min atrás → deve aparecer como offline
    - Bot com `status: 'online'` e `last_heartbeat` < 30 min → deve aparecer como online
    - Bot com `status: 'offline'` → deve aparecer como offline independente do timestamp
- [ ] **7.3**: Testar inserção de notificações em memberEvents
  - File: `__tests__/handlers/memberEvents.test.js`
  - Action: Verificar que após `createTrialMember()`, um INSERT em `notifications` é chamado com `type: 'new_trial'`
- [ ] **7.4**: Testar inserção de notificações em webhookProcessors
  - File: `__tests__/services/webhookProcessors.test.js`
  - Action: Verificar que após pagamento aprovado, um INSERT em `notifications` é chamado com `type: 'payment_received'`

### Acceptance Criteria

- [ ] **AC 1**: Given o bot unificado rodando, when `healthCheck.js` executa a cada 5 min, then um registro em `bot_health` é atualizado com `status: 'online'` e `last_heartbeat: now()`
- [ ] **AC 2**: Given o bot unificado parado há mais de 30 min, when o dashboard carrega, then o bot aparece como "Bot Offline" nas notificações
- [ ] **AC 3**: Given o bot unificado rodando com heartbeat recente (< 30 min), when o dashboard carrega, then nenhum alerta "Bot Offline" é gerado
- [ ] **AC 4**: Given um novo membro entra em trial (via group join), when `createTrialMember()` executa com sucesso, then uma notificação `new_trial` é inserida na tabela `notifications` com o `group_id` correto
- [ ] **AC 5**: Given um novo membro entra em trial (via /start internal), when `handleInternalTrialStart()` executa com sucesso, then uma notificação `new_trial` é inserida na tabela `notifications`
- [ ] **AC 6**: Given um pagamento aprovado (qualquer dos 4 cenários), when `sendPaymentConfirmation()` é chamado, then uma notificação `payment_received` é inserida na tabela `notifications` com `group_id` e `member_id` no metadata
- [ ] **AC 7**: Given a migration 053 aplicada, when qualquer dos 11 tipos de notificação é inserido, then o INSERT não viola o CHECK constraint
- [ ] **AC 8**: Given notificações `new_trial` e `payment_received` no banco, when o painel admin carrega, then elas aparecem com ícones corretos (👤 e 💰) e cores adequadas (info azul e success verde)
- [ ] **AC 9**: Given o healthCheck falha ao fazer upsert no bot_health, when isso acontece, then o erro é logado mas o healthCheck não falha (fire-and-forget)
- [ ] **AC 10**: Given o insertAdminNotification falha, when isso acontece, then o fluxo principal (trial creation, payment processing) não é afetado

## Additional Context

### Dependencies

- `lib/supabase.js` — já disponível em todos os handlers do bot
- Tabela `bot_health` — já existe, schema compatível. Unique constraint permite `group_id: null`
- Tabela `notifications` — precisa da migration 053 para aceitar novos tipos
- Nenhuma nova dependência externa necessária

### Testing Strategy

- **Bot (Jest)**:
  - `__tests__/jobs/healthCheck.test.js` — heartbeat upsert (novo)
  - `__tests__/handlers/memberEvents.test.js` — notificação new_trial (update)
  - `__tests__/handlers/startCommand.test.js` — notificação new_trial (update)
  - `__tests__/services/webhookProcessors.test.js` — notificação payment_received (update)
- **Admin (Vitest)**:
  - `admin-panel/src/app/api/__tests__/dashboard.test.ts` — detecção offline por timestamp (update)
- **E2E (Playwright)**:
  - Logar como super_admin → Dashboard → verificar que não aparece "Bot Offline" falso
  - Verificar que notificações de trial/pagamento aparecem com ícones corretos

### Notes

- **Risco**: O unique constraint de `bot_health` usa `COALESCE(number_id, ...)` para WhatsApp. Com `group_id: null` e `channel: 'telegram'`, precisa validar que o upsert funciona. Se não funcionar, alternativa é usar um `group_id` sentinela (UUID fixo tipo `00000000-0000-0000-0000-000000000000`) ou fazer SELECT+INSERT/UPDATE manual.
- **Ordem de execução**: Migration primeiro (Task 1), depois bot (Tasks 2, 4, 5), depois admin (Tasks 3, 6), depois testes (Task 7).
- O `persistNotifications()` do dashboard NÃO precisa de mudanças — ele já lida com tipos novos via fallback. Mas adicionamos ao SEVERITY_MAP e alertTitle() para ter severity/título corretos.

## Review Notes

- Adversarial review completed
- Findings: 10 total, 7 fixed (F1-F6, F10), 3 skipped (F7-F9 noise)
- Resolution approach: auto-fix all Real findings
- Key fixes: race condition handling (F1), skip heartbeat when DB down (F2), BotHealth.group_id nullable (F3), DashboardAlertType excludes bot-only types (F5), null last_heartbeat = offline (F10)
