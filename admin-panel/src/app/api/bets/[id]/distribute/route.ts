import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';
import { computeAvailableTimes, createPostTimePicker } from '@/lib/distribute-utils';
import type { PostingSchedule } from '@/lib/distribute-utils';

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

    const groupIds = normalizeGroupIds(body);

    // Group admin scope enforcement: can only distribute to their own group
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

    // Prepare assignments to insert
    const toInsert: Array<{ groupId: string; group: typeof groups extends Array<infer T> ? T : never; postAt: string | null }> = [];

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

      toInsert.push({ groupId: gid, group, postAt: null });
    }

    // Compute post_at for each group that needs insertion
    for (const item of toInsert) {
      const schedule = item.group.posting_schedule as PostingSchedule | null;
      const availableTimes = computeAvailableTimes(schedule);

      if (availableTimes.length > 0) {
        // Count existing scheduled assignments for this group
        const { data: scheduled } = await supabase
          .from('bet_group_assignments')
          .select('post_at')
          .eq('group_id', item.groupId)
          .not('post_at', 'is', null)
          .neq('posting_status', 'posted');

        const existingCounts: Record<string, number> = {};
        for (const t of availableTimes) existingCounts[t] = 0;
        for (const s of (scheduled || [])) {
          if (s.post_at && existingCounts[s.post_at] !== undefined) existingCounts[s.post_at]++;
        }

        const pickPostTime = createPostTimePicker(availableTimes, existingCounts);
        item.postAt = pickPostTime();
      }
    }

    // Batch insert all new assignments
    if (toInsert.length > 0) {
      const rows = toInsert.map((item) => ({
        bet_id: betId,
        group_id: item.groupId,
        posting_status: 'ready' as const,
        distributed_at: new Date().toISOString(),
        distributed_by: user.id,
        post_at: item.postAt,
      }));

      const { data: inserted, error: insertError } = await supabase
        .from('bet_group_assignments')
        .insert(rows)
        .select('group_id');

      if (insertError) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: 'Erro ao criar atribuicoes' } },
          { status: 500 },
        );
      }

      // Build created list from successfully inserted rows
      const insertedGroupIds = new Set((inserted || []).map((r) => r.group_id));
      for (const item of toInsert) {
        if (insertedGroupIds.has(item.groupId)) {
          created.push({
            groupId: item.groupId,
            groupName: item.group.name,
            postAt: item.postAt,
          });
        }
      }
    }

    // Audit log for distribution
    if (created.length > 0) {
      await supabase.from('audit_log').insert({
        table_name: 'bet_group_assignments',
        record_id: betId.toString(),
        action: 'distribute',
        changed_by: user.id,
        changes: {
          group_ids: created.map((c) => c.groupId),
          already_existed: alreadyExisted.map((a) => a.groupId),
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
