# Story 2.5: Notificações e Alertas no Painel

Status: done

## Story

As a **Super Admin**,
I want ver alertas e notificações importantes no painel,
So that eu esteja ciente de problemas e eventos relevantes com histórico persistido.

## Acceptance Criteria

1. **Given** Super Admin está no dashboard **When** eventos relevantes ocorrem (onboarding concluído, grupo pausado, erro de integração) **Then** alertas aparecem na seção de notificações do dashboard (FR38)
2. **Given** alertas existem no sistema **When** Super Admin visualiza a seção de notificações **Then** alertas mostram: tipo (icon + label), mensagem, timestamp formatado
3. **Given** alertas são gerados pelo sistema **When** um evento relevante ocorre **Then** alertas são persistidos na tabela `notifications` no banco para histórico
4. **Given** Super Admin quer ver histórico **When** acessa a seção de notificações **Then** pode ver notificações recentes (últimos 7 dias por padrão) com paginação
5. **Given** Super Admin vê uma notificação **When** clica para marcar como lida **Then** notificação é marcada como `read` no banco e visualmente diferenciada
6. **Given** audit log registra eventos críticos **When** ações críticas ocorrem (status change, onboarding, erro) **Then** audit log registra com retenção de 90 dias (NFR-S5)
7. **Given** Super Admin está no dashboard **When** existem notificações não lidas **Then** badge/contador de não-lidas aparece visível na seção de alertas

## Tasks / Subtasks

- [x] Task 1: Criar migration SQL para tabela `notifications` (AC: #3, #6)
  - [x] 1.1 Criar tabela `notifications` com campos: id, type, severity, title, message, group_id (nullable), metadata (jsonb), read (boolean), created_at
  - [x] 1.2 Criar índices: `idx_notifications_created_at`, `idx_notifications_read`, `idx_notifications_type`
  - [x] 1.3 Criar RLS policies: super_admin SELECT/UPDATE all, group_admin SELECT apenas do seu group_id — usando `public.get_my_role()` e `public.get_my_group_id()`
  - [x] 1.4 Criar policy de retenção: função SQL para limpar notificações > 90 dias (NFR-S5)
- [x] Task 2: Criar API Route `/api/notifications` com GET e PATCH (AC: #1, #2, #4, #5)
  - [x] 2.1 GET `/api/notifications` — lista notificações com filtros: `?read=false`, `?days=7`, `?limit=50`, `?offset=0`
  - [x] 2.2 PATCH `/api/notifications/[id]` — marcar como lida (`{ read: true }`)
  - [x] 2.3 PATCH `/api/notifications/mark-all-read` — marcar todas como lidas
  - [x] 2.4 Validação com Zod para query params e body
- [x] Task 3: Criar serviço de criação de notificações no dashboard stats (AC: #1, #3)
  - [x] 3.1 Refatorar `/api/dashboard/stats` para persistir alertas detectados na tabela `notifications` (insert se não existe, usando deduplicação por type+group_id+intervalo de 1h)
  - [x] 3.2 Manter alertas inline no dashboard response (retrocompatível) MAS agora lidos da tabela `notifications`
  - [x] 3.3 Adicionar novos tipos de notificação: `group_paused`, `integration_error`
- [x] Task 4: Evoluir componente AlertsSection para NotificationsPanel (AC: #2, #4, #5, #7)
  - [x] 4.1 Criar `NotificationsPanel.tsx` que substitui `AlertsSection` com: lista de notificações, badge de não-lidas, botão "marcar todas como lidas"
  - [x] 4.2 Adicionar visual diferenciado para notificações lidas vs não-lidas (opacity, background)
  - [x] 4.3 Adicionar badge/contador de não-lidas no header da seção
  - [x] 4.4 Manter `AlertsSection.tsx` como deprecated (não deletar — é referenciado nos testes da story 2.4)
- [x] Task 5: Integrar NotificationsPanel na Dashboard page (AC: #1, #7)
  - [x] 5.1 Atualizar `dashboard/page.tsx` para usar `NotificationsPanel` em vez de `AlertsSection` — mantém AlertsSection como legacy para retrocompatibilidade
  - [x] 5.2 Adicionar fetch para `/api/notifications?limit=20` no dashboard
  - [x] 5.3 Implementar ação "marcar como lida" inline e "marcar todas" com optimistic update
- [x] Task 6: Testes (AC: todos)
  - [x] 6.1 Testes da API `/api/notifications` — 23 testes (GET com filtros, PATCH marcar lida, mark-all-read, validação Zod, 401, 500)
  - [x] 6.2 Testes do componente `NotificationsPanel` — 12 testes (renderiza lista, badge de não-lidas, ação marcar lida, empty state, diferentes tipos de alerta, ícones, opacity/border)
  - [x] 6.3 Testes de integração do dashboard — 9 testes (3 novos: fetch notifications, render NotificationsPanel, mark-as-read optimistic update)
  - [x] 6.4 Verificar zero regressões — 272 testes passando em 31 arquivos (0 falhas)

## Dev Notes

### Contexto Crítico

Esta story evolui o sistema de alertas básico (implementado em 2.4 como alertas calculados on-the-fly) para um sistema de notificações persistido com histórico. A tabela `audit_log` já existe mas é usada para tracking genérico de mudanças. A nova tabela `notifications` é dedicada a alertas do sistema com semântica de lido/não-lido.

**IMPORTANTE:** A story 2.4 já implementou `AlertsSection` que calcula alertas em tempo real a partir de `bot_health`, `groups` e `audit_log`. Esta story deve EVOLUIR esse sistema, não substituir abruptamente. O `AlertsSection` existente deve ser mantido (deprecated) pois os testes da story 2.4 dependem dele.

### Stack Tecnológica do Admin Panel

| Technology | Version | Notes |
|------------|---------|-------|
| Next.js | 16.1.6 | App Router (NOT Pages Router) |
| React | 19.2.3 | |
| TypeScript | 5.x | Strict mode |
| Tailwind CSS | 4.x | Styling |
| @supabase/supabase-js | ^2.95.3 | Database client |
| @supabase/ssr | ^0.8.0 | Auth helpers for Next.js App Router |
| Zod | 4.3.6 | Schema validation (v4 usa `.issues` não `.errors`) |
| Vitest | 3.2.4 | Testing framework (NÃO Jest) |
| Testing Library | latest | @testing-library/react |

### Middleware e API Handler (OBRIGATÓRIO)

```typescript
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (req, context) => {
    // context.user, context.role, context.groupFilter, context.supabase
    // context.supabase usa anon key com RLS
  }
);
```

### Database — Tabela `notifications` (nova)

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR NOT NULL,  -- bot_offline, group_failed, onboarding_completed, group_paused, integration_error
  severity VARCHAR NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'success')),
  title VARCHAR NOT NULL,
  message TEXT NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_read ON notifications(read) WHERE read = false;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_group_id ON notifications(group_id);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Super Admin vê tudo
CREATE POLICY "super_admin_select_notifications"
  ON notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
      AND admin_users.role = 'super_admin'
    )
  );

-- Super Admin pode atualizar (marcar lida)
CREATE POLICY "super_admin_update_notifications"
  ON notifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
      AND admin_users.role = 'super_admin'
    )
  );

-- Group Admin vê apenas do seu grupo
CREATE POLICY "group_admin_select_notifications"
  ON notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
      AND admin_users.role = 'group_admin'
      AND admin_users.group_id = notifications.group_id
    )
  );

-- Retenção 90 dias (NFR-S5) — executar via cron/scheduled function
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications WHERE created_at < now() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
```

### Tabelas Existentes Relevantes

- **`groups`**: id, name, status (creating/active/paused/inactive/failed), created_at
- **`bot_health`**: group_id (PK, FK→groups), last_heartbeat, status (online/offline), error_message
- **`audit_log`**: id, table_name, record_id, action, changed_by, changes (jsonb), created_at
- **`admin_users`**: id, user_id, email, role (super_admin/group_admin), group_id

### Tipos TypeScript (adicionar em database.ts)

```typescript
export type NotificationType = 'bot_offline' | 'group_failed' | 'onboarding_completed' | 'group_paused' | 'integration_error';
export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';

export interface Notification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  group_id: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}
```

### Mapeamento de Tipos → Severidade/Ícones

| type | severity | icon | cor |
|------|----------|------|-----|
| bot_offline | error | 🔴 | red |
| group_failed | error | ❌ | orange |
| group_paused | warning | ⏸️ | yellow |
| integration_error | error | ⚠️ | red |
| onboarding_completed | success | ✅ | green |

### Deduplicação de Notificações

Para evitar spam de notificações repetidas (ex: bot offline gerando alerta a cada refresh do dashboard), usar deduplicação:

```typescript
// Antes de inserir, verificar se já existe notificação similar recente (1h)
const { data: existing } = await supabase
  .from('notifications')
  .select('id')
  .eq('type', notificationType)
  .eq('group_id', groupId)
  .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
  .limit(1);

if (!existing?.length) {
  await supabase.from('notifications').insert({ ... });
}
```

### Padrões Estabelecidos na Story 2.4 (SEGUIR)

1. **API Handler sem allowedRoles** — ambos os roles acessam, RLS filtra automaticamente
2. **Parallel queries** com `Promise.all()`
3. **Client Component** com `useEffect` + `useCallback` + estados loading/error/data
4. **Response format**: `{ success: true, data: {...} }` ou `{ success: false, error: { code, message } }`
5. **Componentes em** `components/features/dashboard/`
6. **Testes API em** `app/api/__tests__/`
7. **Testes de componente** no mesmo diretório do componente (`.test.tsx`)
8. **Status badge cores**: green=active, yellow=paused, gray=inactive, blue=creating, red=failed
9. **formatDateTime** de `@/lib/format-utils.ts` para timestamps

### Padrões de Teste (Vitest — NÃO Jest)

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock createApiHandler
vi.mock('@/middleware/api-handler', () => ({
  createApiHandler: (handler: Function) => handler,
}));

// Mock Supabase com query builder table-aware
function createMockQueryBuilder(responses: Record<string, { data: any; error: any }>) {
  return {
    from: (table: string) => {
      const response = responses[table] ?? { data: [], error: null };
      return {
        select: () => ({
          order: () => Promise.resolve(response),
          eq: () => ({ gte: () => ({ limit: () => Promise.resolve(response), order: () => Promise.resolve(response) }) }),
          gte: () => ({ limit: () => ({ order: () => Promise.resolve(response) }) }),
          limit: () => ({ order: () => Promise.resolve(response) }),
          ...response,
        }),
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      };
    },
  };
}
```

### Arquivos que Serão Criados/Modificados

**Novos:**
- `sql/migrations/004_notifications.sql` — migration da tabela
- `admin-panel/src/app/api/notifications/route.ts` — GET lista notificações
- `admin-panel/src/app/api/notifications/[id]/route.ts` — PATCH marcar lida
- `admin-panel/src/app/api/notifications/mark-all-read/route.ts` — PATCH marcar todas
- `admin-panel/src/components/features/dashboard/NotificationsPanel.tsx` — novo componente
- `admin-panel/src/app/api/__tests__/notifications.test.ts` — testes API
- `admin-panel/src/components/features/dashboard/NotificationsPanel.test.tsx` — testes componente

**Modificados:**
- `admin-panel/src/types/database.ts` — adicionar tipos Notification
- `admin-panel/src/app/api/dashboard/stats/route.ts` — persistir alertas na tabela notifications
- `admin-panel/src/app/(auth)/dashboard/page.tsx` — usar NotificationsPanel
- `admin-panel/src/app/(auth)/dashboard/page.test.tsx` — atualizar testes do dashboard

### Referências de Learnings da Story 2.4

1. Zod v4 usa `.issues` em vez de `.errors` no resultado de `safeParse()`
2. Mock de Supabase query builder deve diferenciar por table name no `from()`
3. Audit log NÃO deve bloquear operação principal — usar `.then().catch()` sem await
4. `bot_token` NUNCA retornar em respostas de API (NFR-S2)
5. Usar `formatDateTime` de `@/lib/format-utils.ts` (DRY)
6. `useCallback` no fetch function para evitar re-renders desnecessários

### Project Structure Notes

- Alinhado com estrutura existente: API routes em `app/api/`, componentes em `components/features/dashboard/`
- Migrations SQL em `sql/migrations/` (padrão existente: 001, 002, 003 — próximo: 004)
- Tipos centralizados em `types/database.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5 - Lines 428-442]
- [Source: _bmad-output/planning-artifacts/epics.md#FR38 - Line 206]
- [Source: _bmad-output/planning-artifacts/epics.md#NFR-S5 - Line 127]
- [Source: _bmad-output/planning-artifacts/prd.md#FR38]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-S5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Notification Patterns]
- [Source: _bmad-output/project-context.md#Service Response Pattern]
- [Source: admin-panel/src/components/features/dashboard/AlertsSection.tsx - Componente existente]
- [Source: admin-panel/src/app/api/dashboard/stats/route.ts - API existente de alertas]
- [Source: admin-panel/src/types/database.ts - Tipos DashboardAlert existentes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Swarm team `story-2-5` com backend-dev + frontend-dev em paralelo
- 272 testes passando (31 arquivos), 0 regressões
- Migration numerada 022 (não 004 como planejado) seguindo sequência existente
- RLS usa `public.get_my_role()` e `public.get_my_group_id()` (padrão projeto)
- Dashboard test mocks atualizados para incluir tabela `notifications` (eliminado stderr warnings)

### Completion Notes List

- AlertsSection mantido como legacy para retrocompatibilidade com story 2.4
- Dashboard agora renderiza AMBOS AlertsSection (legacy) e NotificationsPanel
- Fire-and-forget pattern para persistência de notificações (não bloqueia response)
- Deduplicação por type+group_id em janela de 1h evita spam de notificações
- Optimistic UI updates para marcar como lida (UX responsivo)

### File List

**Novos:**
- `sql/migrations/022_notifications.sql` — Migration da tabela notifications com RLS e índices
- `admin-panel/src/app/api/notifications/route.ts` — GET lista notificações com filtros
- `admin-panel/src/app/api/notifications/[id]/route.ts` — PATCH marcar notificação como lida
- `admin-panel/src/app/api/notifications/mark-all-read/route.ts` — PATCH marcar todas como lidas
- `admin-panel/src/components/features/dashboard/NotificationsPanel.tsx` — Componente de notificações
- `admin-panel/src/app/api/__tests__/notifications.test.ts` — 23 testes API
- `admin-panel/src/components/features/dashboard/NotificationsPanel.test.tsx` — 12 testes componente

**Modificados:**
- `admin-panel/src/types/database.ts` — Adicionados tipos Notification, NotificationType, NotificationSeverity
- `admin-panel/src/app/api/dashboard/stats/route.ts` — Refatorado com persistNotifications(), alertTitle(), SEVERITY_MAP, group_paused alerts, unread_count
- `admin-panel/src/app/(auth)/dashboard/page.tsx` — Integrado NotificationsPanel com fetch, mark-as-read, mark-all-read, skeleton
- `admin-panel/src/app/(auth)/dashboard/page.test.tsx` — 3 novos testes (9 total), mockFetchByUrl helper
- `admin-panel/src/app/api/__tests__/dashboard.test.ts` — Mock atualizado com suporte a tabela notifications
