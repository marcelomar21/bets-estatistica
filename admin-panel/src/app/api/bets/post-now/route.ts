import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

/**
 * POST /api/bets/post-now
 * Story 5.5: Trigger immediate posting by setting post_now_requested_at flag
 *
 * The bot polls this flag every 30s and executes runPostBets(true) when detected.
 */
export const POST = createApiHandler(
  async (req: NextRequest, context) => {
    const { supabase, groupFilter } = context;

    // Determine group ID
    let groupId = groupFilter;
    if (!groupId) {
      try {
        const body = await req.json();
        groupId = body.group_id;
      } catch {
        // No body provided
      }
    }

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id is required for super_admin' } },
        { status: 400 },
      );
    }

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('id', groupId)
      .single();

    if (groupError) {
      const msg = String(groupError.message || '');
      const isNotFound = groupError.code === 'PGRST116' || msg.includes('0 rows');
      if (isNotFound) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: groupError.message } },
        { status: 500 },
      );
    }

    if (!group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 },
      );
    }

    // Set the post_now_requested_at flag
    const { error: updateError } = await supabase
      .from('groups')
      .update({ post_now_requested_at: new Date().toISOString() })
      .eq('id', groupId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Postagem solicitada' },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
