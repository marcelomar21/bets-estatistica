import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';

// Relaxed UUID pattern — Zod's .uuid() rejects non-RFC-4122 UUIDs (e.g. seed data)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const distributeSchema = z.object({
  groupId: z.string().regex(UUID_RE, 'groupId deve ser um UUID valido'),
});

export const POST = createApiHandler(
  async (req, context, routeContext) => {
    const { supabase } = context;
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

    const { groupId } = body;

    // Validate group exists and is not deleted
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('id', groupId)
      .neq('status', 'deleted')
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 400 },
      );
    }

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
    const isRedistribution = oldGroupId !== null;

    // Update bet: set group_id, bet_status='ready', distributed_at=now (D4)
    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update({
        group_id: groupId,
        bet_status: 'ready',
        distributed_at: new Date().toISOString(),
      })
      .eq('id', betId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao distribuir aposta' } },
        { status: 500 },
      );
    }

    // Audit log for redistribution (P5)
    if (isRedistribution) {
      await supabase.from('audit_log').insert({
        table_name: 'suggested_bets',
        record_id: betId.toString(),
        action: 'redistribute',
        changed_by: context.user.id,
        changes: { old_group_id: oldGroupId, new_group_id: groupId },
      });
    }

    // Fetch updated bet
    const { data: updatedBet } = await supabase
      .from('suggested_bets')
      .select('id, group_id, bet_status, distributed_at')
      .eq('id', betId)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        bet: updatedBet ?? currentBet,
        redistributed: isRedistribution,
        groupName: group.name,
      },
    });
  },
  { allowedRoles: ['super_admin'] },
);
