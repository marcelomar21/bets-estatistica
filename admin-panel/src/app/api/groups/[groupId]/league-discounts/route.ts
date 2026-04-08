import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';

type DiscountRouteContext = { params: Promise<{ groupId: string }> };

const putDiscountSchema = z.object({
  league_name: z.string().min(1, 'league_name is required'),
  discount_percent: z.number()
    .int('discount_percent must be an integer')
    .min(1, 'discount_percent must be at least 1')
    .max(100, 'discount_percent must be at most 100'),
});

const deleteDiscountSchema = z.object({
  league_name: z.string().min(1, 'league_name is required'),
});

/**
 * GET /api/groups/[groupId]/league-discounts
 * Returns all league discounts for a specific group.
 */
export const GET = createApiHandler(
  async (_req: NextRequest, _context, routeContext) => {
    const { groupId } = await (routeContext as DiscountRouteContext).params;
    const { supabase } = _context;

    const { data: discounts, error } = await supabase
      .from('league_discounts')
      .select('league_name, discount_percent')
      .eq('group_id', groupId)
      .order('league_name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { discounts: discounts || [] },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

/**
 * PUT /api/groups/[groupId]/league-discounts
 * Upserts a discount for a league in this group.
 */
export const PUT = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as DiscountRouteContext).params;
    const { supabase } = context;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = putDiscountSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    // Verify group exists
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 },
      );
    }

    const { error: upsertError } = await supabase
      .from('league_discounts')
      .upsert(
        {
          group_id: groupId,
          league_name: parsed.data.league_name,
          discount_percent: parsed.data.discount_percent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'group_id,league_name' },
      );

    if (upsertError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: upsertError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        league_name: parsed.data.league_name,
        discount_percent: parsed.data.discount_percent,
      },
    });
  },
  { allowedRoles: ['super_admin'] },
);

/**
 * DELETE /api/groups/[groupId]/league-discounts
 * Removes a discount for a league in this group.
 */
export const DELETE = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as DiscountRouteContext).params;
    const { supabase } = context;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = deleteDiscountSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { error: deleteError } = await supabase
      .from('league_discounts')
      .delete()
      .eq('group_id', groupId)
      .eq('league_name', parsed.data.league_name);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: deleteError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { deleted: parsed.data.league_name },
    });
  },
  { allowedRoles: ['super_admin'] },
);
