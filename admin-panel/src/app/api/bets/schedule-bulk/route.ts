import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

/**
 * PATCH /api/bets/schedule-bulk
 * Set the same posting time for multiple bets at once.
 * Body: { bet_ids: number[], post_at: "HH:MM" | null }
 */
export const PATCH = createApiHandler(
  async (req: NextRequest, context) => {
    const { supabase, groupFilter } = context;

    const body = await req.json();
    const { bet_ids, post_at } = body;

    if (!Array.isArray(bet_ids) || bet_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'bet_ids deve ser um array nao vazio' } },
        { status: 400 },
      );
    }

    const postAt: string | null = post_at ?? null;

    if (postAt !== null && !/^\d{2}:\d{2}$/.test(postAt)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'post_at deve estar no formato HH:MM' } },
        { status: 400 },
      );
    }

    // Determine effective group for the assignment update
    const effectiveGroupId = groupFilter || body.group_id;

    if (!effectiveGroupId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id is required' } },
        { status: 400 },
      );
    }

    // Update post_at on assignments (source of truth since migration 061)
    let query = supabase
      .from('bet_group_assignments')
      .update({ post_at: postAt })
      .in('bet_id', bet_ids)
      .eq('group_id', effectiveGroupId);

    const { error: updateError } = await query;

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: { updated: bet_ids.length } });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
