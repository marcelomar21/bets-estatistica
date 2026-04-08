import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';
import { deactivateSubscriptionPlan } from '@/lib/mercadopago';

type SubscriptionRouteContext = { params: Promise<{ groupId: string }> };

interface SubscriptionRecord {
  league_name: string;
  status: string;
  mp_plan_id: string | null;
  mp_checkout_url: string | null;
  activated_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

const deleteSchema = z.object({
  league_name: z.string().min(1, 'league_name is required'),
});

/**
 * GET /api/groups/[groupId]/league-subscriptions
 * Returns current league subscriptions for a group, enriched with pricing and discount data.
 */
export const GET = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as SubscriptionRouteContext).params;
    const { supabase, groupFilter, role } = context;

    // group_admin can only access their own group
    if (role === 'group_admin' && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    // Fetch subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('group_league_subscriptions')
      .select('league_name, status, mp_plan_id, mp_checkout_url, activated_at, cancelled_at, created_at')
      .eq('group_id', groupId)
      .order('league_name', { ascending: true });

    if (subError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: subError.message } },
        { status: 500 },
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        data: { subscriptions: [] },
      });
    }

    // Fetch pricing for subscribed leagues
    const leagueNames = (subscriptions as SubscriptionRecord[]).map((s) => s.league_name);

    const { data: pricingData } = await supabase
      .from('league_pricing')
      .select('league_name, monthly_price')
      .in('league_name', leagueNames);

    const priceMap = new Map<string, number>();
    for (const p of pricingData || []) {
      priceMap.set(p.league_name, Number(p.monthly_price));
    }

    // Fetch discounts for this group
    const { data: discountData } = await supabase
      .from('league_discounts')
      .select('league_name, discount_percent')
      .eq('group_id', groupId)
      .in('league_name', leagueNames);

    const discountMap = new Map<string, number>();
    for (const d of discountData || []) {
      discountMap.set(d.league_name, d.discount_percent);
    }

    // Enrich subscriptions with pricing and discount info
    const enriched = (subscriptions as SubscriptionRecord[]).map((s) => ({
      league_name: s.league_name,
      status: s.status,
      mp_checkout_url: s.mp_checkout_url,
      monthly_price: priceMap.get(s.league_name) ?? 200,
      discount_percent: discountMap.get(s.league_name) ?? 0,
      activated_at: s.activated_at,
      cancelled_at: s.cancelled_at,
      created_at: s.created_at,
    }));

    return NextResponse.json({
      success: true,
      data: { subscriptions: enriched },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

/**
 * DELETE /api/groups/[groupId]/league-subscriptions
 * Cancel a league subscription. Deactivates the MP plan if active.
 */
export const DELETE = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as SubscriptionRouteContext).params;
    const { supabase, groupFilter, role } = context;

    // group_admin can only manage their own group
    if (role === 'group_admin' && groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { league_name } = parsed.data;

    // Fetch the subscription record
    const { data: subscription, error: fetchError } = await supabase
      .from('group_league_subscriptions')
      .select('id, league_name, status, mp_plan_id')
      .eq('group_id', groupId)
      .eq('league_name', league_name)
      .single();

    if (fetchError || !subscription) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Subscription not found' } },
        { status: 404 },
      );
    }

    // If active with an MP plan, deactivate the plan
    if (subscription.mp_plan_id && subscription.status === 'active') {
      const deactivateResult = await deactivateSubscriptionPlan(subscription.mp_plan_id);
      if (!deactivateResult.success) {
        return NextResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: deactivateResult.error } },
          { status: 500 },
        );
      }
    }

    // Update subscription status to cancelled
    const { error: updateError } = await supabase
      .from('group_league_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('group_id', groupId)
      .eq('league_name', league_name);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { cancelled: league_name },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
