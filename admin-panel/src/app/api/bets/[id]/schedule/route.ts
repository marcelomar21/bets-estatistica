import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

/**
 * PATCH /api/bets/:id/schedule
 * Set or clear the posting time (post_at) for a single bet.
 * Body: { post_at: "HH:MM" | null }
 */
export const PATCH = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { supabase, groupFilter } = context;
    const { id } = await routeContext.params;
    const betId = Number.parseInt(id, 10);

    if (Number.isNaN(betId) || betId <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID de aposta invalido' } },
        { status: 400 },
      );
    }

    const body = await req.json();
    const postAt: string | null = body.post_at ?? null;

    // Validate format if provided
    if (postAt !== null && !/^\d{2}:\d{2}$/.test(postAt)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'post_at deve estar no formato HH:MM' } },
        { status: 400 },
      );
    }

    // Verify the bet exists and belongs to the admin's group
    let betQuery = supabase
      .from('suggested_bets')
      .select('id')
      .eq('id', betId);

    if (groupFilter) {
      betQuery = betQuery.eq('group_id', groupFilter);
    }

    const { data: bet, error: betError } = await betQuery.single();

    if (betError || !bet) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    // Update post_at
    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update({ post_at: postAt })
      .eq('id', betId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
