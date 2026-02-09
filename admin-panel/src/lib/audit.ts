import type { SupabaseClient } from '@supabase/supabase-js';

export function logAudit(
  supabase: SupabaseClient,
  userId: string,
  recordId: string,
  tableName: string,
  action: string,
  changes: Record<string, unknown>,
): void {
  supabase.from('audit_log').insert({
    table_name: tableName,
    record_id: recordId,
    action,
    changed_by: userId,
    changes,
  }).then(({ error }) => {
    if (error) console.warn(`[audit_log] Failed to insert ${action} audit for ${tableName}:${recordId}`, error.message);
  });
}
