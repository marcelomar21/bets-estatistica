import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { pickPostTime } from '@/lib/distribute-utils';
import { z } from 'zod';

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const distributeSchema = z
  .object({
    groupIds: z.array(z.string().regex(UUID_RE, 'cada groupId deve ser um UUID valido')).min(1).optional(),
    groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido').optional(),
  })
  .refine((data) => data.groupIds || data.groupId, {
    message: 'groupIds (array) ou groupId (string) e obrigatorio',
  });

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

    // Normalize to array (backward compat: groupId → groupIds)
    const groupIds = body.groupIds ?? [body.groupId!];

    // Enforce group_admin scope: can only distribute to their own group
    if (groupFilter) {
      const unauthorized = groupIds.filter((gid) => gid !== groupFilter);
      if (unauthorized.length > 0) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Sem permissao para distribuir para grupos que nao sao seus' } },
          { status: 403 },
        );
      }
    }

    // Fetch current bet (validate it exists)
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

    // Validate groups: fetch all requested, check active status
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

    // Check existing assignments
    const { data: existingAssignments, error: existingError } = await supabase
      .from('bet_group_assignments')
      .select('group_id')
      .eq('bet_id', betId)
      .in('group_id', groupIds);

    if (existingError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao verificar assignments existentes' } },
        { status: 500 },
      );
    }

    const existingGroupIds = new Set((existingAssignments || []).map((a) => a.group_id));

    // Categorize each requested group
    const created: { groupId: string; groupName: string; postAt: string | null }[] = [];
    const alreadyExisted: { groupId: string; groupName: string }[] = [];
    const skipped: { groupId: string; reason: string }[] = [];
    const toInsert: {
      bet_id: number;
      group_id: string;
      posting_status: string;
      distributed_at: string;
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

      if (existingGroupIds.has(gid)) {
        alreadyExisted.push({ groupId: gid, groupName: group.name });
        continue;
      }

      const postAt = await pickPostTime(
        supabase as Parameters<typeof pickPostTime>[0],
        gid,
        group.posting_schedule as { enabled?: boolean; times?: string[] } | null,
      );

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

    // Bulk insert new assignments (ON CONFLICT DO NOTHING handled by unique constraint)
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('bet_group_assignments')
        .insert(toInsert);

      if (insertError) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: 'Erro ao criar assignments' } },
          { status: 500 },
        );
      }

      // Audit log for distribution
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
