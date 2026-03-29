import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { createPostTimePicker } from '@/lib/distribute-utils';
import { z } from 'zod';

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const distributeSchema = z.union([
  z.object({
    groupIds: z.array(z.string().regex(UUID_RE, 'Cada groupId deve ser um UUID valido')).min(1),
  }),
  z.object({
    groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido'),
  }),
]);

function normalizeGroupIds(body: z.infer<typeof distributeSchema>): string[] {
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
    let body: z.infer<typeof distributeSchema>;
    try {
      body = distributeSchema.parse(await req.json());
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : 'Corpo da requisicao invalido';
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const groupIds = [...new Set(normalizeGroupIds(body))]; // deduplicate

    // group_admin scope: can only distribute to their own group
    if (groupFilter) {
      const unauthorized = groupIds.filter((gid) => gid !== groupFilter);
      if (unauthorized.length > 0) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Voce so pode distribuir para o seu proprio grupo' } },
          { status: 403 },
        );
      }
    }

    // Validate bet exists
    const { data: currentBet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('id, bet_status')
      .eq('id', betId)
      .single();

    if (fetchError || !currentBet) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    // Fetch all requested groups in bulk
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

    const existingGroupIds = new Set((existingAssignments || []).map((a) => a.group_id));

    // Categorize groups
    const created: Array<{ groupId: string; groupName: string; postAt: string | null }> = [];
    const alreadyExisted: Array<{ groupId: string; groupName: string }> = [];
    const skipped: Array<{ groupId: string; reason: string }> = [];

    // Build post time pickers per active group (pre-compute)
    const postTimePickers = new Map<string, () => string | null>();
    for (const gid of groupIds) {
      const group = groupMap.get(gid);
      if (group && group.status === 'active' && !existingGroupIds.has(gid)) {
        const picker = await createPostTimePicker(
          supabase,
          gid,
          group.posting_schedule as { enabled?: boolean; times?: string[] } | null,
        );
        postTimePickers.set(gid, picker);
      }
    }

    // Process each group
    const toInsert: Array<{
      bet_id: number;
      group_id: string;
      posting_status: string;
      distributed_at: string;
      distributed_by: string;
      post_at: string | null;
    }> = [];

    for (const gid of groupIds) {
      const group = groupMap.get(gid);

      if (!group) {
        skipped.push({ groupId: gid, reason: 'Grupo nao encontrado' });
        continue;
      }

      if (group.status !== 'active') {
        skipped.push({ groupId: gid, reason: `Grupo inativo (status: ${group.status})` });
        continue;
      }

      if (existingGroupIds.has(gid)) {
        alreadyExisted.push({ groupId: gid, groupName: group.name });
        continue;
      }

      const picker = postTimePickers.get(gid);
      const postAt = picker ? picker() : null;

      toInsert.push({
        bet_id: betId,
        group_id: gid,
        posting_status: 'ready',
        distributed_at: new Date().toISOString(),
        distributed_by: user.id,
        post_at: postAt,
      });

      created.push({ groupId: gid, groupName: group.name, postAt });
    }

    // Batch insert new assignments (ON CONFLICT DO NOTHING handled by unique constraint)
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('bet_group_assignments')
        .insert(toInsert);

      if (insertError) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: 'Erro ao criar atribuicoes de grupo' } },
          { status: 500 },
        );
      }

      // Update bet_status to 'ready' if not already
      if (currentBet.bet_status !== 'ready' && currentBet.bet_status !== 'posted') {
        await supabase
          .from('suggested_bets')
          .update({ bet_status: 'ready' })
          .eq('id', betId);
      }

      // Audit log
      await supabase.from('audit_log').insert({
        table_name: 'bet_group_assignments',
        record_id: betId.toString(),
        action: 'distribute',
        changed_by: user.id,
        changes: { group_ids: toInsert.map((r) => r.group_id) },
      });
    }

    return NextResponse.json({
      success: true,
      data: { created, alreadyExisted, skipped },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
