import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';
import { buildPostTimeContext, pickPostTime } from '@/lib/distribute-utils';

const MAX_BULK_ITEMS = 50;
const MAX_GROUPS = 10;

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bulkDistributeSchema = z.object({
  betIds: z.array(z.number().int().positive()).min(1).max(MAX_BULK_ITEMS),
  // Multi-group: accepts array of UUIDs (#7: capped at MAX_GROUPS)
  groupIds: z.array(z.string().regex(UUID_RE, 'Cada groupId deve ser um UUID valido')).min(1).max(MAX_GROUPS).optional(),
  // Backward compat: single groupId
  groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido').optional(),
}).refine(
  (data) => data.groupIds || data.groupId,
  { message: 'groupIds ou groupId e obrigatorio' },
);

export const POST = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter } = context;

    // Parse and validate body
    let body: z.infer<typeof bulkDistributeSchema>;
    try {
      body = bulkDistributeSchema.parse(await req.json());
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : 'Corpo da requisicao invalido';
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    // Normalize + deduplicate both arrays (#3, #7)
    const groupIds = [...new Set(body.groupIds ?? [body.groupId!])];
    const betIds = [...new Set(body.betIds)];

    // Group admin scope enforcement
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

    const groupMap = new Map(groups.map((g: { id: string; name: string; posting_schedule: unknown }) => [g.id, g]));

    // Validate all bets exist (#1: FK constraint would catch it but we want graceful handling)
    const { data: validBets, error: betsError } = await supabase
      .from('suggested_bets')
      .select('id, group_id')
      .in('id', betIds);

    if (betsError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao validar apostas' } },
        { status: 500 },
      );
    }

    const validBetIds = new Set((validBets || []).map((b: { id: number }) => b.id));
    const validBetMap = new Map((validBets || []).map((b: { id: number; group_id: string | null }) => [b.id, b]));

    // Pre-compute post_at context per group (#8: still N queries, but capped at MAX_GROUPS=10)
    const postTimeContexts = new Map<string, Record<string, number>>();
    for (const [gId, group] of groupMap) {
      const schedule = group.posting_schedule as { enabled?: boolean; times?: string[] } | null;
      if (schedule?.times && schedule.times.length > 0) {
        const ctx = await buildPostTimeContext(supabase, gId, schedule);
        postTimeContexts.set(gId, ctx);
      }
    }

    // Check existing assignments for all betIds × groupIds
    const { data: existingAssignments } = await supabase
      .from('bet_group_assignments')
      .select('bet_id, group_id')
      .in('bet_id', betIds)
      .in('group_id', groupIds);

    const existingSet = new Set(
      (existingAssignments || []).map((a: { bet_id: number; group_id: string }) => `${a.bet_id}:${a.group_id}`),
    );

    // Build upsert rows + categorize (#5: single timestamp for the whole batch)
    const batchTimestamp = new Date().toISOString();

    const upsertRows: Array<{
      bet_id: number;
      group_id: string;
      posting_status: string;
      distributed_at: string;
      distributed_by: string;
      post_at: string | null;
    }> = [];

    const results = {
      distributed: 0,
      alreadyExisted: 0,
      skipped: 0,
      redistributed: 0,
      failed: 0,
    };

    // Track bets that were redistributed (had old group_id) for audit log (#4)
    const redistributedBets: Array<{ betId: number; oldGroupId: string; newGroupIds: string[] }> = [];

    for (const betId of betIds) {
      // #1: skip bets that don't exist
      if (!validBetIds.has(betId)) {
        results.failed++;
        continue;
      }

      const currentBet = validBetMap.get(betId);
      const oldGroupId = currentBet?.group_id;
      const newGroups: string[] = [];

      for (const gId of groupIds) {
        const group = groupMap.get(gId);
        if (!group) {
          results.skipped++;
          continue;
        }

        if (existingSet.has(`${betId}:${gId}`)) {
          results.alreadyExisted++;
          continue;
        }

        // Compute post_at from context
        let postAt: string | null = null;
        const ctx = postTimeContexts.get(gId);
        if (ctx) {
          const times = Object.keys(ctx);
          postAt = pickPostTime(ctx, times);
          // Increment count for round-robin across bulk items
          if (postAt && ctx[postAt] !== undefined) ctx[postAt]++;
        }

        upsertRows.push({
          bet_id: betId,
          group_id: gId,
          posting_status: 'ready',
          distributed_at: batchTimestamp,
          distributed_by: context.user.id,
          post_at: postAt,
        });

        newGroups.push(gId);
      }

      if (newGroups.length > 0) {
        results.distributed += newGroups.length;
        // #10: track redistribution (bet had a different group before)
        if (oldGroupId && !groupIds.includes(oldGroupId)) {
          results.redistributed++;
          redistributedBets.push({ betId, oldGroupId, newGroupIds: newGroups });
        }
      }
    }

    // Batch upsert all assignments
    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('bet_group_assignments')
        .upsert(upsertRows, { onConflict: 'bet_id,group_id', ignoreDuplicates: true });

      if (upsertError) {
        // #2: if upsert fails, distributed count was wrong — reset to 0
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: 'Erro ao distribuir apostas' } },
          { status: 500 },
        );
      }
    }

    // #4: Audit log for redistributed bets
    if (redistributedBets.length > 0) {
      const auditRows = redistributedBets.map((r) => ({
        table_name: 'bet_group_assignments',
        record_id: r.betId.toString(),
        action: 'distribute',
        changed_by: context.user.id,
        changes: {
          old_group_id: r.oldGroupId,
          new_group_ids: r.newGroupIds,
          type: 'bulk_multi_group_distribute',
        },
      }));
      await supabase.from('audit_log').insert(auditRows);
    }

    // First group name for backward compat
    const firstGroupName = groups[0]?.name ?? '';

    return NextResponse.json({
      success: true,
      data: {
        distributed: results.distributed,
        alreadyExisted: results.alreadyExisted,
        skipped: results.skipped,
        failed: results.failed,
        // #10: redistributed now reflects actual redistributions
        redistributed: results.redistributed,
        groupName: firstGroupName,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
