import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';
import { buildPostTimeContext, pickPostTime } from '@/lib/distribute-utils';

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const distributeSchema = z.object({
  // New multi-group field
  groupIds: z.array(z.string().regex(UUID_RE, 'Cada groupId deve ser um UUID valido')).min(1).optional(),
  // Backward compat: single groupId (wrapped to array internally)
  groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido').optional(),
}).refine(
  (data) => data.groupIds || data.groupId,
  { message: 'groupIds ou groupId e obrigatorio' },
);

export const POST = createApiHandler(
  async (req, context, routeContext) => {
    const { supabase, groupFilter } = context;
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

    // Normalize to array of group IDs, deduplicated (#10)
    const groupIds = [...new Set(body.groupIds ?? [body.groupId!])];

    // Group admin scope enforcement (#4): can only distribute to own group
    if (groupFilter) {
      const unauthorized = groupIds.filter((gId) => gId !== groupFilter);
      if (unauthorized.length > 0) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Sem permissao para distribuir para esses grupos' } },
          { status: 403 },
        );
      }
    }

    // Validate all groups exist and are active
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, posting_schedule')
      .in('id', groupIds)
      .neq('status', 'deleted');

    if (groupsError || !groups || groups.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 400 },
      );
    }

    // Build a map of valid groups for quick lookup
    const groupMap = new Map(groups.map((g: { id: string; name: string; posting_schedule: unknown }) => [g.id, g]));

    // Fetch current bet
    const { data: currentBet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('id, group_id, bet_status')
      .eq('id', betId)
      .single();

    if (fetchError || !currentBet) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    const oldGroupId = currentBet.group_id;

    // Check existing assignments in bet_group_assignments
    const { data: existingAssignments } = await supabase
      .from('bet_group_assignments')
      .select('group_id')
      .eq('bet_id', betId)
      .in('group_id', groupIds);

    const existingGroupIds = new Set(
      (existingAssignments || []).map((a: { group_id: string }) => a.group_id),
    );

    // Categorize groups
    const created: Array<{ groupId: string; groupName: string; postAt: string | null }> = [];
    const alreadyExisted: Array<{ groupId: string; groupName: string }> = [];
    const skipped: Array<{ groupId: string; reason: string }> = [];

    // Build rows to upsert — using correct column names from migration 061 (#1, #6, #7)
    const upsertRows: Array<{
      bet_id: number;
      group_id: string;
      posting_status: string;
      distributed_at: string;
      distributed_by: string;
      post_at: string | null;
    }> = [];

    for (const gId of groupIds) {
      const group = groupMap.get(gId);
      if (!group) {
        skipped.push({ groupId: gId, reason: 'Grupo nao encontrado ou inativo' });
        continue;
      }

      if (existingGroupIds.has(gId)) {
        alreadyExisted.push({ groupId: gId, groupName: group.name });
        continue;
      }

      // Compute post_at from posting_schedule
      const schedule = group.posting_schedule as { enabled?: boolean; times?: string[] } | null;
      let postAt: string | null = null;
      if (schedule?.times && schedule.times.length > 0) {
        const postTimeContext = await buildPostTimeContext(supabase, gId, schedule);
        const availableTimes = Object.keys(postTimeContext);
        postAt = pickPostTime(postTimeContext, availableTimes);
      }

      upsertRows.push({
        bet_id: betId,
        group_id: gId,
        posting_status: 'ready',
        distributed_at: new Date().toISOString(),
        distributed_by: context.user.id,
        post_at: postAt,
      });

      created.push({ groupId: gId, groupName: group.name, postAt });
    }

    // Upsert new assignments (ignoreDuplicates handles race conditions)
    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('bet_group_assignments')
        .upsert(upsertRows, { onConflict: 'bet_id,group_id', ignoreDuplicates: true });

      if (upsertError) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: 'Erro ao distribuir aposta' } },
          { status: 500 },
        );
      }
    }

    // Audit log for redistribution (#11: consistent structure)
    const isRedistribution = oldGroupId !== null && created.length > 0;
    if (isRedistribution) {
      await supabase.from('audit_log').insert({
        table_name: 'bet_group_assignments',
        record_id: betId.toString(),
        action: 'distribute',
        changed_by: context.user.id,
        changes: {
          old_group_id: oldGroupId,
          new_group_ids: created.map((c) => c.groupId),
          type: 'multi_group_distribute',
        },
      });
    }

    // First group info for backward compat fields (#8: safe fallback)
    const firstCreated = created.length > 0 ? created[0] : null;
    const firstExisting = alreadyExisted.length > 0 ? alreadyExisted[0] : null;
    const firstGroupName = firstCreated?.groupName ?? firstExisting?.groupName ?? '';

    return NextResponse.json({
      success: true,
      data: {
        // New multi-group response
        created,
        alreadyExisted,
        skipped,
        // Backward compat fields (for existing frontend)
        redistributed: isRedistribution,
        groupName: firstGroupName,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
