import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// #3: semantic time validation (00:00 to 23:59)
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const patchSchema = z
  .object({
    postAt: z
      .string()
      .regex(TIME_RE, 'postAt deve estar no formato HH:MM (00:00 a 23:59)')
      .nullable()
      .optional(),
    postingStatus: z.enum(['ready', 'cancelled']).optional(),
  })
  .refine((data) => data.postAt !== undefined || data.postingStatus !== undefined, {
    message: 'Pelo menos um campo deve ser fornecido (postAt ou postingStatus)',
  });

// #10: return both validated values
type ValidationOk = { ok: true; betId: number; groupId: string };
type ValidationFail = { ok: false; response: NextResponse };

function validateParams(id: string, groupId: string): ValidationOk | ValidationFail {
  // #11: reject non-numeric input like "42abc"
  if (!/^\d+$/.test(id)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID de aposta invalido' } },
        { status: 400 },
      ),
    };
  }
  const betId = Number.parseInt(id, 10);
  if (betId <= 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID de aposta invalido' } },
        { status: 400 },
      ),
    };
  }
  if (!UUID_RE.test(groupId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'groupId deve ser um UUID valido' } },
        { status: 400 },
      ),
    };
  }
  return { ok: true, betId, groupId };
}

/**
 * DELETE /api/bets/[id]/assignments/[groupId]
 * Removes a specific bet-group assignment without affecting other groups.
 */
export const DELETE = createApiHandler(
  async (_req, context, routeContext) => {
    const { supabase, groupFilter } = context;
    const params = await routeContext.params;

    const validation = validateParams(params.id, params.groupId);
    if (!validation.ok) return validation.response;
    const { betId, groupId } = validation;

    // #13: consistent Portuguese
    if (groupFilter && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Sem permissao para este grupo' } },
        { status: 403 },
      );
    }

    // #14: fetch only needed columns + #6: check posting_status
    const { data: assignment, error: fetchError } = await supabase
      .from('bet_group_assignments')
      .select('id, bet_id, group_id, posting_status, telegram_message_id')
      .eq('bet_id', betId)
      .eq('group_id', groupId)
      .single();

    if (fetchError || !assignment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Assignment nao encontrado' } },
        { status: 404 },
      );
    }

    // #6: cannot delete posted assignments
    if (assignment.posting_status === 'posted') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Nao e possivel remover uma aposta ja postada' } },
        { status: 400 },
      );
    }

    const { error: deleteError } = await supabase
      .from('bet_group_assignments')
      .delete()
      .eq('bet_id', betId)
      .eq('group_id', groupId);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao remover assignment' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { deleted: assignment },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

/**
 * PATCH /api/bets/[id]/assignments/[groupId]
 * Updates postAt or postingStatus for a specific assignment.
 */
export const PATCH = createApiHandler(
  async (req, context, routeContext) => {
    const { supabase, groupFilter } = context;
    const params = await routeContext.params;

    const validation = validateParams(params.id, params.groupId);
    if (!validation.ok) return validation.response;
    const { betId, groupId } = validation;

    if (groupFilter && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Sem permissao para este grupo' } },
        { status: 403 },
      );
    }

    let body: z.infer<typeof patchSchema>;
    try {
      body = patchSchema.parse(await req.json());
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : 'Corpo da requisicao invalido';
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    // #14: fetch only needed columns + #5: check status
    const { data: assignment, error: fetchError } = await supabase
      .from('bet_group_assignments')
      .select('id, bet_id, group_id, posting_status, post_at')
      .eq('bet_id', betId)
      .eq('group_id', groupId)
      .single();

    if (fetchError || !assignment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Assignment nao encontrado' } },
        { status: 404 },
      );
    }

    // #5: cannot modify posted assignments
    if (assignment.posting_status === 'posted') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Nao e possivel alterar uma aposta ja postada' } },
        { status: 400 },
      );
    }

    const updatePayload: Record<string, unknown> = {};
    if (body.postAt !== undefined) updatePayload.post_at = body.postAt;
    if (body.postingStatus !== undefined) updatePayload.posting_status = body.postingStatus;

    // #2: use .select().single() on update to get actual result in one query
    const { data: updated, error: updateError } = await supabase
      .from('bet_group_assignments')
      .update(updatePayload)
      .eq('bet_id', betId)
      .eq('group_id', groupId)
      .select('id, bet_id, group_id, posting_status, post_at, distributed_at')
      .single();

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao atualizar assignment' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { updated: updated ?? { ...assignment, ...updatePayload } },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
