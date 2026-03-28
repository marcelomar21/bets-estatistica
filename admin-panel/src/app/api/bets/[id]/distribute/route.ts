import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { pickPostTime } from '@/lib/distribute-utils';
import { z } from 'zod';

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const distributeSchema = z.object({
  groupIds: z.array(z.string().regex(UUID_RE, 'Cada groupId deve ser um UUID valido')).min(1).optional(),
  groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido').optional(),
}).refine(
  (data) => data.groupIds || data.groupId,
  { message: 'groupIds (array) ou groupId (string) e obrigatorio' },
);

interface GroupRow {
  id: string;
  name: string;
  status: string;
  posting_schedule: { enabled?: boolean; times?: string[] } | null;
}

interface AssignmentResult {
  created: { group_id: string; group_name: string; post_at: string | null }[];
  alreadyExisted: { group_id: string; group_name: string }[];
  skipped: { group_id: string; reason: string }[];
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

    // group_admin scope enforcement: can only distribute to their own group
    if (groupFilter) {
      const unauthorized = groupIds.filter((gid) => gid !== groupFilter);
      if (unauthorized.length > 0) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Sem permissao para distribuir para grupos que nao sao seus' } },
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

    // Fetch all requested groups
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

    const groupMap = new Map((groups as GroupRow[]).map((g) => [g.id, g]));

    // Check existing assignments for this bet
    const { data: existingAssignments } = await supabase
      .from('bet_group_assignments')
      .select('group_id')
      .eq('bet_id', betId);

    const existingGroupIds = new Set(
      (existingAssignments ?? []).map((a: { group_id: string }) => a.group_id),
    );

    // Categorize each requested group
    const result: AssignmentResult = { created: [], alreadyExisted: [], skipped: [] };
    const toInsert: { bet_id: number; group_id: string; posting_status: string; distributed_by: string; post_at: string | null }[] = [];

    for (const gid of groupIds) {
      const group = groupMap.get(gid);

      if (!group) {
        result.skipped.push({ group_id: gid, reason: 'Grupo nao encontrado' });
        continue;
      }

      if (group.status !== 'active') {
        result.skipped.push({ group_id: gid, reason: `Grupo inativo (status: ${group.status})` });
        continue;
      }

      if (existingGroupIds.has(gid)) {
        result.alreadyExisted.push({ group_id: gid, group_name: group.name });
        continue;
      }

      // Compute post_at for this group — query scheduled bets from bet_group_assignments
      const { data: scheduledBets } = await supabase
        .from('bet_group_assignments')
        .select('post_at')
        .eq('group_id', gid)
        .eq('posting_status', 'ready');

      const postAt = pickPostTime(group.posting_schedule, scheduledBets ?? []);

      toInsert.push({
        bet_id: betId,
        group_id: gid,
        posting_status: 'ready',
        distributed_by: user.id,
        post_at: postAt,
      });

      result.created.push({ group_id: gid, group_name: group.name, post_at: postAt });
    }

    // Bulk insert new assignments (ON CONFLICT DO NOTHING handled by unique constraint)
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('bet_group_assignments')
        .insert(toInsert);

      if (insertError) {
        // If it's a unique constraint violation, assignments were created by a concurrent request
        if (insertError.code === '23505') {
          // Race condition — re-categorize as alreadyExisted
          for (const row of toInsert) {
            const group = groupMap.get(row.group_id);
            result.created = result.created.filter((c) => c.group_id !== row.group_id);
            result.alreadyExisted.push({ group_id: row.group_id, group_name: group?.name ?? '' });
          }
        } else {
          return NextResponse.json(
            { success: false, error: { code: 'DB_ERROR', message: 'Erro ao criar atribuicoes' } },
            { status: 500 },
          );
        }
      }

      // Audit log for distribution
      await supabase.from('audit_log').insert({
        table_name: 'bet_group_assignments',
        record_id: betId.toString(),
        action: 'distribute',
        changed_by: user.id,
        changes: {
          group_ids: toInsert.map((r) => r.group_id),
          created_count: result.created.length,
        },
      });
    }

    return NextResponse.json({ success: true, data: result });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
