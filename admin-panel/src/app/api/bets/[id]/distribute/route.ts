import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';
import { buildPostTimeContext, pickPostTime } from '@/lib/distribute-utils';

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const distributeSchema = z.object({
  groupIds: z.array(z.string().regex(UUID_RE, 'cada groupId deve ser um UUID valido')).min(1).optional(),
  groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido').optional(),
}).refine(
  (data) => data.groupIds || data.groupId,
  { message: 'groupIds ou groupId e obrigatorio' },
);

interface CreatedAssignment {
  groupId: string;
  groupName: string;
  postAt: string | null;
}

interface SkippedGroup {
  groupId: string;
  reason: string;
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

    // Normalize: accept groupIds[] or groupId (backward compat)
    const groupIds = body.groupIds ?? [body.groupId!];

    // Enforce group_admin scope: can only distribute to their own group
    if (groupFilter) {
      const unauthorized = groupIds.filter((gid) => gid !== groupFilter);
      if (unauthorized.length > 0) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Sem permissao para distribuir para esses grupos' } },
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

    // Categorize results
    const created: CreatedAssignment[] = [];
    const alreadyExisted: string[] = [];
    const skipped: SkippedGroup[] = [];

    // Process each group
    for (const gid of groupIds) {
      const group = groupMap.get(gid);

      // Group not found
      if (!group) {
        skipped.push({ groupId: gid, reason: 'Grupo nao encontrado' });
        continue;
      }

      // Group inactive/deleted
      if (group.status !== 'active') {
        skipped.push({ groupId: gid, reason: `Grupo inativo (status: ${group.status})` });
        continue;
      }

      // Already assigned
      if (existingGroupIds.has(gid)) {
        alreadyExisted.push(gid);
        continue;
      }

      // Compute post_at for this group
      const schedule = group.posting_schedule as { enabled?: boolean; times?: string[] } | null;
      const postTimeCtx = await buildPostTimeContext(supabase, gid, schedule);
      const postAt = pickPostTime(postTimeCtx);

      // Insert assignment with ON CONFLICT DO NOTHING for race conditions
      const { error: insertError } = await supabase
        .from('bet_group_assignments')
        .insert({
          bet_id: betId,
          group_id: gid,
          posting_status: 'ready',
          distributed_by: user.id,
          post_at: postAt,
        });

      if (insertError) {
        // Unique constraint violation means it was just created concurrently
        if (insertError.code === '23505') {
          alreadyExisted.push(gid);
        } else {
          skipped.push({ groupId: gid, reason: insertError.message });
        }
        continue;
      }

      created.push({ groupId: gid, groupName: group.name, postAt });
    }

    // Audit log for distribution
    if (created.length > 0) {
      await supabase.from('audit_log').insert({
        table_name: 'bet_group_assignments',
        record_id: betId.toString(),
        action: 'distribute',
        changed_by: user.id,
        changes: {
          created_groups: created.map((c) => c.groupId),
          already_existed: alreadyExisted,
          skipped: skipped.map((s) => s.groupId),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { created, alreadyExisted, skipped },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
