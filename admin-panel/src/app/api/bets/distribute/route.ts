import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';

const MAX_BULK_ITEMS = 50;
const MAX_GROUPS = 20;

/**
 * GET /api/bets/distribute?betIds=1,2,3
 * Returns existing bet_group_assignments for the given bet IDs.
 */
export const GET = createApiHandler(
  async (req, context) => {
    const { supabase } = context;
    const url = new URL(req.url);
    const betIdsParam = url.searchParams.get('betIds');

    if (!betIdsParam) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'betIds obrigatorio' } },
        { status: 400 },
      );
    }

    const betIds = betIdsParam.split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    if (betIds.length === 0 || betIds.length > MAX_BULK_ITEMS) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'betIds invalido' } },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('bet_group_assignments')
      .select('bet_id, group_id')
      .in('bet_id', betIds);

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const distributeSchema = z.object({
  betIds: z.array(z.number().int().positive()).min(1).max(MAX_BULK_ITEMS),
  groupIds: z.array(z.string().regex(UUID_RE, 'groupId deve ser um UUID valido')).min(1).max(MAX_GROUPS),
});

export const POST = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter } = context;

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

    const { betIds, groupIds } = body;

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

    // Validate all groups exist and are not deleted
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, posting_schedule')
      .in('id', groupIds)
      .neq('status', 'deleted');

    if (groupsError || !groups || groups.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Nenhum grupo encontrado' } },
        { status: 400 },
      );
    }

    const validGroupIds = new Set(groups.map(g => g.id));
    const invalidGroups = groupIds.filter(id => !validGroupIds.has(id));
    if (invalidGroups.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: `Grupos nao encontrados: ${invalidGroups.join(', ')}` } },
        { status: 400 },
      );
    }

    // Validate all bets exist
    const { data: bets, error: betsError } = await supabase
      .from('suggested_bets')
      .select('id')
      .in('id', betIds);

    if (betsError || !bets) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao buscar apostas' } },
        { status: 500 },
      );
    }

    const validBetIds = new Set(bets.map(b => b.id));

    // Check existing assignments to return accurate counts
    const { data: existing } = await supabase
      .from('bet_group_assignments')
      .select('bet_id, group_id')
      .in('bet_id', betIds)
      .in('group_id', groupIds);

    const existingSet = new Set(
      (existing || []).map(e => `${e.bet_id}:${e.group_id}`),
    );

    // Build rows to insert (skip already existing)
    const now = new Date().toISOString();
    const rowsToInsert: Array<{
      bet_id: number;
      group_id: string;
      posting_status: string;
      distributed_at: string;
      distributed_by: string;
    }> = [];

    let alreadyExisted = 0;
    let skippedInvalidBet = 0;

    for (const betId of betIds) {
      if (!validBetIds.has(betId)) {
        skippedInvalidBet++;
        continue;
      }
      for (const groupId of groupIds) {
        const key = `${betId}:${groupId}`;
        if (existingSet.has(key)) {
          alreadyExisted++;
        } else {
          rowsToInsert.push({
            bet_id: betId,
            group_id: groupId,
            posting_status: 'ready',
            distributed_at: now,
            distributed_by: context.user.id,
          });
        }
      }
    }

    let created = 0;
    if (rowsToInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('bet_group_assignments')
        .insert(rowsToInsert)
        .select('id');

      if (insertError) {
        return NextResponse.json(
          { success: false, error: { code: 'DB_ERROR', message: insertError.message } },
          { status: 500 },
        );
      }
      created = inserted?.length ?? rowsToInsert.length;
    }

    return NextResponse.json({
      success: true,
      data: { created, alreadyExisted },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
