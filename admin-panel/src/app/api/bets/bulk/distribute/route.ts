import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';
import { buildPostTimeContext, pickPostTime } from '@/lib/distribute-utils';

const MAX_BULK_ITEMS = 50;

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bulkDistributeSchema = z.object({
  betIds: z.array(z.number().int().positive()).min(1).max(MAX_BULK_ITEMS),
  // Multi-group: accepts array of UUIDs
  groupIds: z.array(z.string().regex(UUID_RE, 'groupId deve ser um UUID valido')).min(1).optional(),
  // Backward compat: single groupId
  groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido').optional(),
});

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

    // Normalize: accept groupIds[] or groupId (backward compat)
    const groupIds = body.groupIds ?? (body.groupId ? [body.groupId] : null);
    if (!groupIds || groupIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'groupIds ou groupId e obrigatorio' } },
        { status: 400 },
      );
    }

    const { betIds } = body;

    // Group admin scope enforcement: can only distribute to own group
    if (groupFilter) {
      const unauthorized = groupIds.filter((gid) => gid !== groupFilter);
      if (unauthorized.length > 0) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Sem permissao para distribuir para esses grupos' } },
          { status: 403 },
        );
      }
    }

    // Validate all groups exist and are active — bulk fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: validGroups, error: groupError } = await (supabase as any)
      .from('groups')
      .select('id, name, posting_schedule')
      .in('id', groupIds)
      .neq('status', 'deleted');

    if (groupError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao validar grupos' } },
        { status: 500 },
      );
    }

    const validGroupMap = new Map<string, { id: string; name: string; posting_schedule: unknown }>();
    for (const g of (validGroups || [])) validGroupMap.set(g.id, g);

    // Identify skipped (inactive/not found) groups
    const skippedGroupIds = groupIds.filter((gid) => !validGroupMap.has(gid));

    if (validGroupMap.size === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Nenhum grupo valido encontrado' } },
        { status: 400 },
      );
    }

    // Check which (bet_id, group_id) pairs already exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingAssignments } = await (supabase as any)
      .from('bet_group_assignments')
      .select('bet_id, group_id')
      .in('bet_id', betIds)
      .in('group_id', Array.from(validGroupMap.keys()));

    const existingSet = new Set<string>();
    for (const ea of (existingAssignments || [])) {
      existingSet.add(`${ea.bet_id}:${ea.group_id}`);
    }

    // Pre-compute post_at contexts per group
    const postTimeContexts = new Map<string, Awaited<ReturnType<typeof buildPostTimeContext>>>();
    await Promise.all(
      Array.from(validGroupMap.entries()).map(async ([gid, group]) => {
        const schedule = group.posting_schedule as { enabled?: boolean; times?: string[] } | null;
        const ctx = await buildPostTimeContext(supabase, gid, schedule);
        postTimeContexts.set(gid, ctx);
      }),
    );

    // Build batch of new assignments (skip already-existing)
    const now = new Date().toISOString();
    const newAssignments: Array<{
      bet_id: number;
      group_id: string;
      posting_status: string;
      distributed_at: string;
      distributed_by: string;
      post_at: string | null;
    }> = [];

    let alreadyExisted = existingSet.size;
    const skipped = skippedGroupIds.length * betIds.length;

    for (const betId of betIds) {
      for (const [gid] of validGroupMap) {
        const key = `${betId}:${gid}`;
        if (existingSet.has(key)) continue;

        const ctx = postTimeContexts.get(gid)!;
        const postAt = pickPostTime(ctx);

        newAssignments.push({
          bet_id: betId,
          group_id: gid,
          posting_status: 'ready',
          distributed_at: now,
          distributed_by: context.user.id,
          post_at: postAt,
        });
      }
    }

    // Batch INSERT with ON CONFLICT DO NOTHING
    let created = 0;
    let failed = 0;
    const errors: Array<{ betId: number; groupId: string; error: string }> = [];

    if (newAssignments.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: insertError } = await (supabase as any)
        .from('bet_group_assignments')
        .insert(newAssignments)
        .select('bet_id, group_id');

      if (insertError) {
        // If batch fails, try individual inserts for partial success (NFR7)
        for (const assignment of newAssignments) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: singleErr } = await (supabase as any)
            .from('bet_group_assignments')
            .insert(assignment);

          if (singleErr) {
            failed++;
            errors.push({ betId: assignment.bet_id, groupId: assignment.group_id, error: singleErr.message });
          } else {
            created++;
          }
        }
      } else {
        created = inserted?.length ?? newAssignments.length;
        // Recount alreadyExisted: some may have been caught by ON CONFLICT
        const actuallyCreated = inserted?.length ?? 0;
        const conflicted = newAssignments.length - actuallyCreated;
        if (conflicted > 0) alreadyExisted += conflicted;
      }
    }

    // Build group names for response
    const groupNames = Array.from(validGroupMap.values()).map((g) => g.name);

    return NextResponse.json({
      success: true,
      data: {
        created,
        alreadyExisted,
        skipped,
        failed,
        errors,
        groupNames,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
