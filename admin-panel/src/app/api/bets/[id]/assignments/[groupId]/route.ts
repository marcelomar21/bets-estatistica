import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^\d{2}:\d{2}$/;

const patchSchema = z
  .object({
    postAt: z
      .string()
      .regex(TIME_RE, 'postAt deve estar no formato HH:MM')
      .nullable()
      .optional(),
    postingStatus: z.enum(['ready', 'cancelled']).optional(),
  })
  .refine((data) => data.postAt !== undefined || data.postingStatus !== undefined, {
    message: 'Pelo menos um campo deve ser fornecido (postAt ou postingStatus)',
  });

type ValidationOk = { ok: true; betId: number };
type ValidationFail = { ok: false; response: NextResponse };

function validateParams(id: string, groupId: string): ValidationOk | ValidationFail {
  const betId = Number.parseInt(id, 10);
  if (Number.isNaN(betId) || betId <= 0) {
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
  return { ok: true, betId };
}

/**
 * DELETE /api/bets/[id]/assignments/[groupId]
 * Removes a specific bet-group assignment without affecting other groups.
 */
export const DELETE = createApiHandler(
  async (_req, context, routeContext) => {
    const { supabase, groupFilter } = context;
    const { id, groupId } = await routeContext.params;

    const validation = validateParams(id, groupId);
    if (!validation.ok) return validation.response;
    const { betId } = validation;

    // Group admin can only manage their own group
    if (groupFilter && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        { status: 403 },
      );
    }

    // Fetch assignment to confirm it exists
    const { data: assignment, error: fetchError } = await supabase
      .from('bet_group_assignments')
      .select('*')
      .eq('bet_id', betId)
      .eq('group_id', groupId)
      .single();

    if (fetchError || !assignment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Assignment not found' } },
        { status: 404 },
      );
    }

    // Delete the assignment
    const { error: deleteError } = await supabase
      .from('bet_group_assignments')
      .delete()
      .eq('bet_id', betId)
      .eq('group_id', groupId);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: deleteError.message } },
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
    const { id, groupId } = await routeContext.params;

    const validation = validateParams(id, groupId);
    if (!validation.ok) return validation.response;
    const { betId } = validation;

    // Group admin can only manage their own group
    if (groupFilter && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        { status: 403 },
      );
    }

    // Parse and validate body
    let body: z.infer<typeof patchSchema>;
    try {
      body = patchSchema.parse(await req.json());
    } catch (err) {
      const message =
        err instanceof z.ZodError ? err.issues[0]?.message : 'Corpo da requisicao invalido';
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    // Verify assignment exists
    const { data: assignment, error: fetchError } = await supabase
      .from('bet_group_assignments')
      .select('*')
      .eq('bet_id', betId)
      .eq('group_id', groupId)
      .single();

    if (fetchError || !assignment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Assignment not found' } },
        { status: 404 },
      );
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {};
    if (body.postAt !== undefined) updatePayload.post_at = body.postAt;
    if (body.postingStatus !== undefined) updatePayload.posting_status = body.postingStatus;

    const { error: updateError } = await supabase
      .from('bet_group_assignments')
      .update(updatePayload)
      .eq('bet_id', betId)
      .eq('group_id', groupId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    // Re-fetch updated assignment
    const { data: updated } = await supabase
      .from('bet_group_assignments')
      .select('*')
      .eq('bet_id', betId)
      .eq('group_id', groupId)
      .single();

    return NextResponse.json({
      success: true,
      data: { updated: updated ?? { ...assignment, ...updatePayload } },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
