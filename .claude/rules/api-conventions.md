# API Route Conventions (Next.js App Router)

## Handler Pattern

All API routes MUST use `createApiHandler` from `@/middleware/api-handler`:

```typescript
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter, user, role } = context;
    // ...
    return NextResponse.json({ success: true, data: result });
  },
  { allowedRoles: ['super_admin', 'group_admin'] }
);
```

## Middleware Stack

`createApiHandler()` wraps with `withTenant()` which provides:
- `supabase` — client scoped to the tenant (anon key, RLS enforced)
- `user` — authenticated user
- `role` — user's role (`super_admin` | `group_admin`)
- `groupFilter` — group ID for group_admin (null for super_admin)

## Options

- `allowedRoles`: restrict access to specific roles
- `preventRoleChange`: block privilege escalation in mutations

## Response Format

Success:
```json
{ "success": true, "data": [...], "count": 42 }
```

Error:
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

## Validation

- Parse query params with defaults
- Validate against `Set` of allowed values
- Return 400 with `VALIDATION_ERROR` for bad input

```typescript
const VALID_STATUSES = new Set(['generated', 'pending_link', 'ready']);
if (status && !VALID_STATUSES.has(status)) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid status' } },
    { status: 400 }
  );
}
```

## Auth Rules

- API routes use anon key (RLS enforced), never service_role
- service_role only in `lib/supabase-admin.ts` for auth operations
- Always apply `groupFilter` for group_admin queries
