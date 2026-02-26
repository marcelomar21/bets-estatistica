# Story 5.1: Tabela scheduled_messages e API de CRUD

Status: done

## Story

As a **admin (Super or Group)**,
I want uma API para agendar, listar e cancelar mensagens avulsas,
So that eu tenha controle total sobre comunicacoes customizadas para meus membros.

## Acceptance Criteria

1. **Given** a migration 034 is executed
   **When** applied to the database
   **Then** creates table `scheduled_messages` with columns: id (UUID PK), group_id (UUID FK), created_by (UUID FK), message_text (TEXT), scheduled_at (TIMESTAMPTZ), sent_at (TIMESTAMPTZ), status (VARCHAR), telegram_message_id (BIGINT), attempts (INT DEFAULT 0), created_at (TIMESTAMPTZ)
   **And** creates index on `(status, scheduled_at)` for job queries
   **And** creates index on `group_id` for filtering by group
   **And** RLS policies: Super Admin accesses all; Group Admin accesses only `group_id` of their group (NFR-S5)

2. **Given** a Super Admin makes `POST /api/messages` with group_id of any group
   **When** the API processes
   **Then** creates message with `status = 'pending'` (FR21)
   **And** validates input with Zod: message_text (required), scheduled_at (future), group_id (UUID)
   **And** returns `{ success: true, data: { id, status, scheduled_at } }`

3. **Given** a Group Admin makes `POST /api/messages` with group_id of their own group
   **When** the API processes
   **Then** creates message normally (FR22)

4. **Given** a Group Admin makes `POST /api/messages` with group_id of another group
   **When** the API processes
   **Then** returns `{ success: false, error: 'Forbidden' }` with status 403

5. **Given** an admin makes `GET /api/messages`
   **When** the API processes
   **Then** returns filtered list by permission (Super: all, Group: only their group) (FR27)
   **And** includes status of each message: pending, sent, failed, cancelled

6. **Given** an admin makes `DELETE /api/messages/[id]` for message with `status = 'pending'`
   **When** the API processes
   **Then** updates `status` to `cancelled` (FR26)
   **And** returns `{ success: true }`

7. **Given** an admin tries to cancel message with `status = 'sent'`
   **When** the API processes
   **Then** returns `{ success: false, error: 'Message already sent' }` with status 400

8. **Given** all API routes for this epic
   **When** processed
   **Then** use `createApiHandler` with `groupFilter` applied (P7)

## Tasks / Subtasks

- [ ] Task 1: Criar migration 034_scheduled_messages.sql (AC: #1)
  - [ ] 1.1 Criar tabela `scheduled_messages` com todas as colunas
  - [ ] 1.2 Criar indexes: `(status, scheduled_at)` e `group_id`
  - [ ] 1.3 Criar RLS policies: Super Admin all, Group Admin por group_id
  - [ ] 1.4 Aplicar migration via Supabase Management API

- [ ] Task 2: Adicionar types ao database.ts (AC: #2, #5)
  - [ ] 2.1 Criar interface `ScheduledMessage`
  - [ ] 2.2 Criar interface `ScheduledMessageListItem`
  - [ ] 2.3 Definir type `MessageStatus = 'pending' | 'sent' | 'failed' | 'cancelled'`

- [ ] Task 3: Criar API route GET/POST /api/messages (AC: #2, #3, #4, #5, #8)
  - [ ] 3.1 Criar `admin-panel/src/app/api/messages/route.ts`
  - [ ] 3.2 GET: listar mensagens com filtro por groupFilter (P7)
  - [ ] 3.3 GET: ordenar por scheduled_at (proximas primeiro)
  - [ ] 3.4 GET: incluir join com groups para nome do grupo
  - [ ] 3.5 POST: validar input com Zod (message_text, scheduled_at futuro, group_id UUID)
  - [ ] 3.6 POST: Super Admin pode qualquer group_id; Group Admin so seu groupFilter
  - [ ] 3.7 POST: inserir com status='pending', created_by=user.id
  - [ ] 3.8 POST: retornar dados criados

- [ ] Task 4: Criar API route DELETE /api/messages/[id] (AC: #6, #7, #8)
  - [ ] 4.1 Criar `admin-panel/src/app/api/messages/[id]/route.ts`
  - [ ] 4.2 Validar que mensagem existe e pertence ao grupo permitido
  - [ ] 4.3 Validar status='pending' (rejeitar se sent/failed/cancelled)
  - [ ] 4.4 UPDATE status='cancelled'
  - [ ] 4.5 Retornar `{ success: true }`

- [ ] Task 5: Escrever testes unitarios (AC: #1-#8)
  - [ ] 5.1 Testar: POST /api/messages cria mensagem com status pending
  - [ ] 5.2 Testar: POST /api/messages com scheduled_at no passado -> 400
  - [ ] 5.3 Testar: POST /api/messages group_admin com group_id errado -> 403
  - [ ] 5.4 Testar: GET /api/messages retorna lista filtrada
  - [ ] 5.5 Testar: DELETE /api/messages/[id] com status pending -> cancela
  - [ ] 5.6 Testar: DELETE /api/messages/[id] com status sent -> 400
  - [ ] 5.7 Testar: migration file syntax valida

- [ ] Task 6: Validacao completa
  - [ ] 6.1 `cd admin-panel && npm test` — todos os testes passam
  - [ ] 6.2 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### Migration 034: scheduled_messages

Proximo numero disponivel: **034** (apos 033_post_previews.sql)

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  message_text TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  telegram_message_id BIGINT,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_scheduled_messages_status_scheduled
  ON scheduled_messages (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX idx_scheduled_messages_group_id
  ON scheduled_messages (group_id);

-- RLS
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY scheduled_messages_super_admin_all ON scheduled_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
      AND admin_users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
      AND admin_users.role = 'super_admin'
    )
  );

-- Group Admin: access own group only
CREATE POLICY scheduled_messages_group_admin ON scheduled_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
      AND admin_users.role = 'group_admin'
      AND admin_users.group_id = scheduled_messages.group_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
      AND admin_users.role = 'group_admin'
      AND admin_users.group_id = scheduled_messages.group_id
    )
  );

COMMIT;
```

### Types

```typescript
export type MessageStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface ScheduledMessage {
  id: string;
  group_id: string;
  created_by: string;
  message_text: string;
  scheduled_at: string;
  sent_at: string | null;
  status: MessageStatus;
  telegram_message_id: number | null;
  attempts: number;
  created_at: string;
}

export interface ScheduledMessageListItem extends ScheduledMessage {
  groups: { name: string } | null;
}
```

### API Patterns

Follow groups CRUD pattern from `admin-panel/src/app/api/groups/route.ts`:
- Zod `.safeParse()` for validation (groups pattern) or `.parse()` in try/catch (bets pattern)
- `context.groupFilter` for multi-tenant filtering (null for super_admin, UUID for group_admin)
- Group admin POST: validate `body.group_id === context.groupFilter`
- 201 for successful creation, 200 for list/cancel

### Multi-tenant access control

```typescript
// GET: apply groupFilter automatically
let query = supabase
  .from('scheduled_messages')
  .select('*, groups(name)');

if (context.groupFilter) {
  query = query.eq('group_id', context.groupFilter);
}

// POST: Super admin can target any group, Group admin only theirs
if (context.groupFilter && body.group_id !== context.groupFilter) {
  return NextResponse.json(
    { success: false, error: { code: 'FORBIDDEN', message: 'Cannot schedule for other groups' } },
    { status: 403 },
  );
}
```

### Scheduled_at validation

Must be in the future. Use Zod `.refine()`:

```typescript
const createMessageSchema = z.object({
  message_text: z.string().min(1, 'Texto da mensagem e obrigatorio'),
  scheduled_at: z.string().datetime().refine(
    (val) => new Date(val) > new Date(),
    'Data de agendamento deve ser no futuro',
  ),
  group_id: z.string().uuid('group_id deve ser um UUID valido'),
});
```

### DELETE (cancel) pattern

Soft-delete: UPDATE status='cancelled', not actual DELETE.

```typescript
// 1. Fetch message to check status
// 2. Validate status === 'pending'
// 3. UPDATE status = 'cancelled'
// 4. Return success
```

### Existing Files (context)

| File | Purpose |
|------|---------|
| `admin-panel/src/app/api/groups/route.ts` | CRUD pattern reference (GET/POST) |
| `admin-panel/src/app/api/groups/[groupId]/route.ts` | Entity route pattern (GET/PUT) |
| `admin-panel/src/middleware/api-handler.ts` | createApiHandler with groupFilter |
| `admin-panel/src/types/database.ts` | Types (add ScheduledMessage) |
| `sql/migrations/033_post_previews.sql` | Latest migration (034 is next) |
| `admin-panel/src/middleware/tenant.ts` | TenantContext with groupFilter |

### Previous Story Learnings (Story 4-3, Epic 4)

- Zod v4 uses `.issues` not `.errors` for error messages
- `createApiHandler` automatically handles withTenant and role checking
- `context.groupFilter` is null for super_admin, UUID for group_admin
- Sequential processing for bulk operations works well
- Tests need valid UUIDs for Zod validation tests

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1] — AC
- [Source: _bmad-output/planning-artifacts/architecture.md#P6] — Scheduled Messages job pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#P7] — API route checklist
- [Source: admin-panel/src/app/api/groups/route.ts] — CRUD pattern reference

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Task 1: Migration 034 applied — table, indexes, RLS policies (fixed admin_users.id not user_id)
- Task 2: Added ScheduledMessage, ScheduledMessageListItem, MessageStatus types
- Task 3: GET /api/messages with multi-tenant filtering, POST with Zod (future date, group access)
- Task 4: DELETE /api/messages/[id] — cancel pending only, rejects sent/failed/cancelled
- Task 5: 10 tests — GET list, group filtering, POST create, past date rejection, empty text, group_admin forbidden, DELETE cancel/reject sent/404/invalid UUID
- Task 6: 572 admin-panel tests pass, build OK

### File List
- sql/migrations/034_scheduled_messages.sql (NEW — table + RLS + indexes)
- admin-panel/src/types/database.ts (MODIFIED — ScheduledMessage types)
- admin-panel/src/app/api/messages/route.ts (NEW — GET/POST messages CRUD)
- admin-panel/src/app/api/messages/[id]/route.ts (NEW — DELETE cancel message)
- admin-panel/src/app/api/__tests__/messages.test.ts (NEW — 10 tests)
