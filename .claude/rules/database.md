# Database Conventions (Supabase / PostgreSQL)

## Query Pattern

```javascript
const { data, error } = await supabase
  .from('table_name')
  .select('col1, col2, nested_table!inner(col3, col4)')
  .eq('filter_col', value)
  .order('col', { ascending: true })
  .limit(50);

if (error) {
  logger.error('Query failed', { error: error.message });
  return { success: false, error: { code: 'DB_ERROR', message: error.message } };
}
```

## Relations

- `!inner()` for mandatory JOINs (INNER JOIN)
- `()` for optional relations (LEFT JOIN)

```typescript
.select(`
  id, name,
  league_matches!inner(home_team_name, kickoff_time),
  groups(name)
`)
```

## RLS (Row-Level Security)

- All tables have RLS policies scoped by `group_id`
- API routes use anon key — RLS enforces tenant isolation
- Bot uses service_role key (bypasses RLS) — filter explicitly
- super_admin sees all groups; group_admin sees only their group

```typescript
let query = supabase.from('bets').select('*');
if (context.groupFilter) {
  query = query.eq('group_id', context.groupFilter);
}
```

## Migrations

- Location: `sql/migrations/` with sequential numbering (e.g., `059_description.sql`)
- Apply via Supabase Management API (see CLAUDE.md)
- Always test migration on dev before production
- Include rollback comments in migration file

## Naming

- Tables: `snake_case` plural (`league_matches`, `bet_results`)
- Columns: `snake_case` (`home_team_name`, `kickoff_time`)
- Indexes: `idx_table_column` or `idx_table_purpose`
- Policies: `policy_table_role_action` (e.g., `policy_bets_admin_select`)

## Type Safety

Admin panel has generated types in `src/types/database.ts`:
- Use `Pick<>` for partial types
- Create specific list/detail types per use case
- Keep types in sync with schema changes
