import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';
import { pickPostTime } from '@/lib/distribute-utils';

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidString = z.string().regex(UUID_RE, 'UUID invalido');

// Accept either { groupIds: string[] } or { groupId: string } (backward compat)
const distributeSchema = z.union([
  z.object({ groupIds: z.array(uuidString).min(1, 'groupIds deve conter ao menos 1 UUID') }),
  z.object({ groupId: uuidString }),
]);

type GroupResult = {
  groupId: string;
  groupName: string;
  postAt: string | null;
};

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
    let parsed: z.infer<typeof distributeSchema>;
    try {
      parsed = distributeSchema.parse(await req.json());
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : 'Corpo da requisicao invalido';
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    // Normalize to array
    const groupIds = 'groupIds' in parsed ? parsed.groupIds : [parsed.groupId];

    // Enforce group_admin scope: can only distribute to their own group
    if (groupFilter) {
      const unauthorized = groupIds.filter(gid => gid !== groupFilter);
      if (unauthorized.length > 0) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Voce so pode distribuir para seu proprio grupo' } },
          { status: 403 },
        );
      }
    }

    // Verify bet exists
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

    // Fetch all requested groups (active only)
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

    const groupMap = new Map((groups || []).map(g => [g.id, g]));

    // Check existing assignments to avoid duplicates
    const { data: existingAssignments } = await supabase
      .from('bet_group_assignments')
      .select('group_id')
      .eq('bet_id', betId)
      .in('group_id', groupIds);

    const existingSet = new Set((existingAssignments || []).map(a => a.group_id));

    // Categorize results
    const created: GroupResult[] = [];
    const alreadyExisted: GroupResult[] = [];
    const skipped: { groupId: string; reason: string }[] = [];
    const toInsert: {
      bet_id: number;
      group_id: string;
      posting_status: string;
      distributed_by: string;
      post_at: string | null;
    }[] = [];

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

      if (existingSet.has(gid)) {
        alreadyExisted.push({ groupId: gid, groupName: group.name, postAt: null });
        continue;
      }

      const schedule = group.posting_schedule as { enabled?: boolean; times?: string[] } | null;
      const postAt = await pickPostTime(supabase, gid, schedule);

      toInsert.push({
        bet_id: betId,
        group_id: gid,
        posting_status: 'ready',
        distributed_by: user.id,
        post_at: postAt,
      });

      created.push({ groupId: gid, groupName: group.name, postAt });
    }

    // Batch insert new assignments with ON CONFLICT DO NOTHING
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('bet_group_assignments')
        .insert(toInsert)
        .select();

      if (insertError) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: 'Erro ao criar atribuicoes' } },
          { status: 500 },
        );
      }
    }

    // Audit log for distribution
    if (created.length > 0) {
      await supabase.from('audit_log').insert({
        table_name: 'bet_group_assignments',
        record_id: betId.toString(),
        action: 'distribute',
        changed_by: user.id,
        changes: { group_ids: created.map(c => c.groupId) },
      });
    }

    return NextResponse.json({
      success: true,
      data: { created, alreadyExisted, skipped },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
