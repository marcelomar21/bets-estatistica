---
title: 'Fix Telegram integration nas ações de gestão de membros'
slug: 'fix-member-telegram-actions'
created: '2026-03-16'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16', 'TypeScript 5.x', 'Supabase (anon key + service_role)', 'Telegram Bot API', 'Vitest 3.2.x']
files_to_modify: ['admin-panel/src/app/api/members/[id]/cancel/route.ts', 'admin-panel/src/app/api/members/[id]/toggle-admin/route.ts', 'admin-panel/src/app/api/__tests__/member-cancel.test.ts', 'admin-panel/src/app/api/__tests__/member-toggle-admin.test.ts']
code_patterns: ['createApiHandler + withTenant (anon key, RLS enforced)', 'getSupabaseAdmin (service_role, bypasses RLS)', 'best-effort Telegram calls in try/catch', 'bot_pool lookup for bot_token + public_group_id']
test_patterns: ['vitest with vi.mock for tenant/supabase', 'global.fetch mock for Telegram API', 'createTableMock helper for supabase chain']
---

# Tech-Spec: Fix Telegram integration nas ações de gestão de membros

**Created:** 2026-03-16

## Overview

### Problem Statement

As ações de gestão de membros no admin panel (cancelar e promover admin) atualizam o banco de dados corretamente, mas não executam as operações correspondentes no Telegram:

1. **Cancel/Remove**: O status muda pra 'cancelado' no banco mas o membro **não é banido** do grupo Telegram (chamada `banChatMember` falha silenciosamente)
2. **Toggle Admin**: O flag `is_admin` é toggleado no banco mas **não existe código** para promover/rebaixar o membro como administrador do grupo no Telegram

### Root Cause (Identificada na Investigação)

A tabela `bot_pool` tem RLS habilitado com política **exclusiva para super_admin**:

```sql
CREATE POLICY "bot_pool_super_admin_all" ON bot_pool
  FOR ALL USING (public.get_my_role() = 'super_admin');
```

O `createApiHandler` → `withTenant()` usa **anon key** (RLS aplica). Quando um **group_admin** executa a rota de cancel:
1. A query `supabase.from('bot_pool').select(...)` retorna vazio (RLS bloqueia)
2. `botData` é `null`
3. O guard `if (botData?.bot_token && member.telegram_id)` é falso
4. Todo o bloco Telegram é silenciosamente pulado

Para **super_admin**, o ban funciona normalmente porque a política RLS permite acesso.

### Solution

1. Usar `getSupabaseAdmin()` (service_role client, que já existe em `lib/supabase-admin.ts`) para a query do `bot_pool` — resolvendo o problema de RLS para ambos os roles
2. Adicionar `console.warn` nas falhas de Telegram para visibilidade
3. Implementar `promoteChatMember` na rota de toggle-admin usando o mesmo padrão

### Scope

**In Scope:**
- Fix da query `bot_pool` nas rotas cancel e toggle-admin para usar `getSupabaseAdmin()`
- Implementação de `promoteChatMember`/demoção no toggle-admin
- Logging de falhas Telegram (console.warn)
- Testes unitários atualizados

**Out of Scope:**
- Rename de botões na UI
- Fluxo de reativação (já funciona para super_admin, mesmo bug de RLS — mas fora do escopo reportado)
- Alteração de políticas RLS no banco
- Alterações na lógica de banco de dados (já funciona corretamente)

## Context for Development

### Codebase Patterns

- **createApiHandler** (`middleware/api-handler.ts`): wrapper obrigatório para API routes autenticadas. Chama `withTenant()` que retorna `TenantContext` com supabase client (anon key, RLS aplica)
- **getSupabaseAdmin()** (`lib/supabase-admin.ts`): singleton com service_role key que bypassa RLS. Já usado em rotas de groups, admin-users, PDF, e upload
- **Best-effort Telegram**: todas operações Telegram são try/catch sem re-throw. DB update é a operação principal; Telegram é side-effect
- **bot_pool como source of truth** (migration 029): `bot_token`, `admin_group_id`, `public_group_id`, `is_active` — lookup por `group_id + is_active`
- **Service response pattern**: `{ success: true, data }` ou `{ success: false, error: { code, message } }`

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `admin-panel/src/app/api/members/[id]/cancel/route.ts` | Rota de cancelamento — ban Telegram bugado (RLS bloqueia bot_pool pra group_admin) |
| `admin-panel/src/app/api/members/[id]/toggle-admin/route.ts` | Rota de toggle admin — falta integração Telegram |
| `admin-panel/src/app/api/members/[id]/reactivate/route.ts` | Referência — mesmo padrão de unban (mesmo bug de RLS, fora de escopo) |
| `admin-panel/src/lib/supabase-admin.ts` | `getSupabaseAdmin()` — client service_role que bypassa RLS |
| `admin-panel/src/middleware/api-handler.ts` | `createApiHandler` — entry point de API routes |
| `admin-panel/src/middleware/tenant.ts` | `withTenant()` — resolve user, role, groupFilter, supabase (anon key) |
| `admin-panel/src/app/api/__tests__/member-cancel.test.ts` | Testes existentes de cancel — precisam atualizar mock |
| `admin-panel/src/app/(auth)/members/page.tsx` | Page que chama as APIs (não precisa alterar) |

### Technical Decisions

1. **getSupabaseAdmin para bot_pool**: usar service_role client apenas para ler `bot_pool` (bot_token é dado sensível que group_admin não deveria acessar via RLS, mas precisa para executar operações Telegram server-side)
2. **Manter best-effort**: não bloquear response da API se Telegram falhar, mas adicionar console.warn
3. **promoteChatMember para promote E demote**: a Telegram Bot API usa `promoteChatMember` para ambas operações — promover passa permissões como `true`, demotar passa todas como `false`
4. **Não alterar RLS**: criar política extra no bot_pool exporia bot_token via RLS — usar service_role client é mais seguro

## Implementation Plan

### Tasks

- [x] **Task 1: Fix bot_pool query na rota de cancel**
  - File: `admin-panel/src/app/api/members/[id]/cancel/route.ts`
  - Action:
    1. Adicionar import: `import { getSupabaseAdmin } from '@/lib/supabase-admin';`
    2. Trocar a query do `bot_pool` (linha ~110) de `supabase.from('bot_pool')` para `getSupabaseAdmin().from('bot_pool')`
    3. Adicionar `console.warn` nos catch blocks de `banChatMember` e `sendMessage`:
       ```typescript
       } catch (err) {
         console.warn('[cancel] Telegram banChatMember failed:', err instanceof Error ? err.message : err);
       }
       ```
  - Notes: O resto do código (query de members, update, audit_log) continua usando o `supabase` do tenant context — só a query de bot_pool muda

- [x] **Task 2: Adicionar integração Telegram na rota de toggle-admin**
  - File: `admin-panel/src/app/api/members/[id]/toggle-admin/route.ts`
  - Action:
    1. Adicionar import: `import { getSupabaseAdmin } from '@/lib/supabase-admin';`
    2. Adicionar `telegram_id` na select da query de member (atualmente só seleciona `id, is_admin, group_id`)
    3. Após o DB update e antes do audit_log, adicionar bloco Telegram best-effort:
       ```typescript
       // Telegram promote/demote (best-effort)
       if (member.telegram_id && member.group_id) {
         try {
           const { data: botData } = await getSupabaseAdmin()
             .from('bot_pool')
             .select('bot_token, public_group_id')
             .eq('group_id', member.group_id)
             .eq('is_active', true)
             .single();

           if (botData?.bot_token && botData.public_group_id) {
             const res = await fetch(
               `https://api.telegram.org/bot${botData.bot_token}/promoteChatMember`,
               {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                   chat_id: botData.public_group_id,
                   user_id: member.telegram_id,
                   can_manage_chat: newValue,
                   can_delete_messages: newValue,
                   can_restrict_members: newValue,
                   can_invite_users: newValue,
                   can_pin_messages: newValue,
                   can_manage_video_chats: newValue,
                 }),
               },
             );
             if (!res.ok) {
               const body = await res.json().catch(() => null);
               console.warn('[toggle-admin] Telegram promoteChatMember failed:', body);
             }
           }
         } catch (err) {
           console.warn('[toggle-admin] Telegram promoteChatMember error:', err instanceof Error ? err.message : err);
         }
       }
       ```
  - Notes: `promoteChatMember` com todas permissões `false` efetivamente demota o membro. O bot precisa ser admin do grupo com permissão `can_promote_members` para que a chamada funcione.

- [x] **Task 3: Atualizar testes de cancel**
  - File: `admin-panel/src/app/api/__tests__/member-cancel.test.ts`
  - Action:
    1. Adicionar mock do módulo `@/lib/supabase-admin`:
       ```typescript
       const mockAdminFrom = vi.fn();
       vi.mock('@/lib/supabase-admin', () => ({
         getSupabaseAdmin: () => ({ from: mockAdminFrom }),
       }));
       ```
    2. Em cada teste que envolve Telegram (cenário de sucesso + cenário group_admin), configurar `mockAdminFrom` para retornar `sampleBotData` quando chamado com `'bot_pool'`
    3. Adicionar teste específico: "group_admin can trigger Telegram ban via admin client" — verifica que `global.fetch` foi chamado com `banChatMember` mesmo quando role é group_admin
    4. Adicionar teste: "logs warning when Telegram ban fails" — configura `global.fetch` pra rejeitar e verifica `console.warn`
  - Notes: O mock existente de `createTableMock` para bot_pool nos testes atuais NÃO cobre o cenário real porque o mock retorna dados via o mesmo supabase mock — na realidade o bot_pool query vem de outro client

- [x] **Task 4: Criar testes de toggle-admin com Telegram**
  - File: `admin-panel/src/app/api/__tests__/member-toggle-admin.test.ts`
  - Action: Criar novo test file seguindo o padrão de `member-cancel.test.ts`:
    1. Cenário "promotes member to admin in Telegram": verifica `fetch` chamado com `promoteChatMember` e permissões `true`
    2. Cenário "demotes member from admin in Telegram": verifica `fetch` chamado com `promoteChatMember` e permissões `false`
    3. Cenário "skips Telegram when member has no telegram_id": verifica que `fetch` NÃO é chamado
    4. Cenário "continues on Telegram failure": verifica que a API retorna success mesmo se fetch falha
    5. Cenário "group_admin can toggle admin with Telegram": verifica que group_admin consegue triggerar a chamada Telegram via admin client
  - Notes: Seguir os mesmos helpers (`createMockRequest`, `createRouteContext`, `createMockContext`) do `member-cancel.test.ts`

### Acceptance Criteria

- [ ] **AC 1**: Given um membro com status 'ativo' e telegram_id válido, when um **group_admin** clica "Cancelar" e preenche motivo, then o status muda para 'cancelado' no banco **E** o membro é banido do grupo Telegram via `banChatMember`
- [ ] **AC 2**: Given um membro com status 'ativo' e telegram_id válido, when um **super_admin** clica "Cancelar" e preenche motivo, then o comportamento é idêntico ao AC 1 (sem regressão)
- [ ] **AC 3**: Given um membro não-admin com telegram_id válido, when um admin clica "Marcar Admin", then o flag `is_admin` muda pra `true` no banco **E** o membro é promovido a admin no grupo Telegram via `promoteChatMember`
- [ ] **AC 4**: Given um membro admin com telegram_id válido, when um admin clica "Remover Admin", then o flag `is_admin` muda pra `false` no banco **E** o membro é demotado no grupo Telegram via `promoteChatMember` com permissões `false`
- [ ] **AC 5**: Given uma falha na API do Telegram (bot sem permissão, grupo inválido, etc.), when qualquer ação é executada, then a operação de banco conclui com sucesso **E** um `console.warn` é logado com detalhes do erro
- [ ] **AC 6**: Given um membro sem `telegram_id` (ex: WhatsApp), when qualquer ação é executada, then a operação de banco conclui normalmente **E** o bloco Telegram é pulado sem erro
- [ ] **AC 7**: Given os testes unitários existentes, when `npm test` é executado, then todos os testes passam (zero regressão) **E** os novos cenários de Telegram são cobertos

## Additional Context

### Dependencies

- **Telegram Bot API**:
  - `banChatMember` — já usado na cancel route
  - `promoteChatMember` — novo, para promote/demote admin
  - Requer que o bot seja admin do grupo com `can_promote_members`
- **Supabase**:
  - `bot_pool` table via `getSupabaseAdmin()` (service_role, bypassa RLS)
  - `members` table via tenant `supabase` (anon key, RLS aplica)
- **Módulo existente**: `admin-panel/src/lib/supabase-admin.ts` → `getSupabaseAdmin()`

### Testing Strategy

- **Testes unitários (vitest)** — 4 cenários novos no cancel test + 5 cenários no novo toggle-admin test
  - Mock de `getSupabaseAdmin` via `vi.mock('@/lib/supabase-admin')`
  - Mock de `global.fetch` para interceptar chamadas Telegram
  - Verificar que `console.warn` é chamado em caso de falha
- **Testes E2E (Playwright)** — validação no ambiente real
  - Login como group_admin
  - Cancelar um membro trial → verificar no Telegram que o membro saiu do grupo
  - Promover membro a admin → verificar no Telegram que o membro tem badge de admin
  - Demotar admin → verificar no Telegram que o membro perdeu badge
- **Build**: `npm run build` deve passar sem erros TypeScript

### Notes

- ~~O bug de RLS no `bot_pool` também afeta a rota de **reactivate** (`unbanChatMember`) — fora do escopo mas vale fix futuro com o mesmo padrão~~ **FIXED** na revisão adversarial
- O bot precisa ter permissão `can_promote_members` no grupo Telegram para que `promoteChatMember` funcione — se não tiver, a chamada falhará best-effort e será logada
- Permissões de admin no Telegram dadas via `promoteChatMember`: `can_manage_chat`, `can_delete_messages`, `can_restrict_members`, `can_invite_users`, `can_pin_messages`, `can_manage_video_chats`

## Review Notes
- Adversarial review completed
- Findings: 8 total, 4 fixed (F1, F3, F6 real issues + F1 bonus reactivate), 4 acknowledged (F2 design choice, F4/F5 confirmed by user, F7/F8 noise)
- Resolution approach: auto-fix all real findings
- Additional files modified: `reactivate/route.ts`, `member-reactivate.test.ts`
