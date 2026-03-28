import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';
import { buildPostTimeContext, pickPostTime } from '@/lib/distribute-utils';

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const distributeSchema = z.union([
  z.object({
    groupIds: z.array(z.string().regex(UUID_RE, 'Cada groupId deve ser um UUID valido')).min(1),
  }),
  // Backward compat: single groupId wrapped to array
  z.object({
    groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido'),
  }),
]);

type DistributeBody = z.infer<typeof distributeSchema>;

function normalizeGroupIds(body: DistributeBody): string[] {
  if ('groupIds' in body) return body.groupIds;
  return [body.groupId];
}

export const POST = createApiHandler(
  async (req, context, routeContext) => {
    const { supabase, groupFilter, user } = context;
    const { id } = await routeContext.params;
    const betId = Number.parseInt(id, 10);

    if (Number.isNaN(betId) || betId <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID de aposta invalido' } },
        { status: 400 },
      );
    }

    // Parse and validate body
    let body: DistributeBody;
    try {
      body = distributeSchema.parse(await req.json());
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : 'Corpo da requisicao invalido';
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const groupIds = normalizeGroupIds(body);

    // Enforce group_admin scope: can only distribute to their own group
    if (groupFilter) {
      const unauthorized = groupIds.filter((gid) => gid !== groupFilter);
      if (unauthorized.length > 0) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Sem permissao para distribuir para grupos fora do seu escopo' } },
          { status: 403 },
        );
      }
    }

    // Verify bet exists
    const { data: currentBet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('id')
      .eq('id', betId)
      .single();

    if (fetchError || !currentBet) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    // Bulk-validate groups: fetch all requested groups in one query
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, status, posting_schedule')
      .in('id', groupIds);

    if (groupsError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao buscar grupos' } },
        { status: 500 },
      );
    }

    const groupMap = new Map((groups || []).map((g) => [g.id, g]));

    // Check existing assignments for this bet
    const { data: existingAssignments } = await supabase
      .from('bet_group_assignments')
      .select('group_id')
      .eq('bet_id', betId);

    const existingGroupIds = new Set((existingAssignments || []).map((a: { group_id: string }) => a.group_id));

    // Categorize each requested group
    const created: Array<{ groupId: string; groupName: string; postAt: string | null }> = [];
    const alreadyExisted: Array<{ groupId: string; groupName: string }> = [];
    const skipped: Array<{ groupId: string; reason: string }> = [];

    for (const gid of groupIds) {
      const group = groupMap.get(gid);

      if (!group) {
        skipped.push({ groupId: gid, reason: 'Grupo nao encontrado' });
        continue;
      }

      if (group.status === 'deleted' || group.status === 'inactive') {
        skipped.push({ groupId: gid, reason: `Grupo ${group.status}` });
        continue;
      }

      if (existingGroupIds.has(gid)) {
        alreadyExisted.push({ groupId: gid, groupName: group.name });
        continue;
      }

      // Build post-time context for this group
      const schedule = group.posting_schedule as { enabled?: boolean; times?: string[] } | null;
      const ptCtx = await buildPostTimeContext(supabase, gid, schedule);
      const postAt = pickPostTime(ptCtx);

      created.push({ groupId: gid, groupName: group.name, postAt });
    }

    // Batch INSERT all new assignments
    if (created.length > 0) {
      const rows = created.map((c) => ({
        bet_id: betId,
        group_id: c.groupId,
        posting_status: 'ready' as const,
        distributed_at: new Date().toISOString(),
        distributed_by: user.id,
        post_at: c.postAt,
      }));

      const { error: insertError } = await supabase
        .from('bet_group_assignments')
        .upsert(rows, { onConflict: 'bet_id,group_id', ignoreDuplicates: true });

      if (insertError) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: 'Erro ao criar assignments' } },
          { status: 500 },
        );
      }
    }

    // Audit log for new distributions
    if (created.length > 0) {
      await supabase.from('audit_log').insert({
        table_name: 'bet_group_assignments',
        record_id: betId.toString(),
        action: 'distribute',
        changed_by: user.id,
        changes: { group_ids: created.map((c) => c.groupId) },
      });
    }

    return NextResponse.json({
      success: true,
      data: { created, alreadyExisted, skipped },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
