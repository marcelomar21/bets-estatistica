import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';
import { createSubscriptionPlan, updateSubscriptionPlanPrice } from '@/lib/mercadopago';

type CheckoutRouteContext = { params: Promise<{ groupId: string }> };

const checkoutSchema = z.object({
  league_names: z.array(z.string().min(1)).min(1, 'Selecione ao menos uma liga'),
});

/**
 * POST /api/groups/[groupId]/league-checkout
 * Initiates a Mercado Pago checkout for extra league subscriptions.
 * Validates leagues are tier='extra', calculates total price with discounts,
 * creates/updates MP plan, and inserts pending subscription records.
 */
export const POST = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as CheckoutRouteContext).params;
    const { supabase, groupFilter, role } = context;

    // group_admin can only checkout for their own group
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

    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { league_names } = parsed.data;

    // Fetch group name
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 },
      );
    }

    // Verify all requested leagues are tier='extra' and active
    const { data: leagueData, error: leagueError } = await supabase
      .from('league_seasons')
      .select('league_name, tier')
      .in('league_name', league_names)
      .eq('tier', 'extra')
      .eq('active', true);

    if (leagueError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: leagueError.message } },
        { status: 500 },
      );
    }

    // Deduplicate valid league names
    const validLeagueNames: string[] = Array.from(new Set<string>((leagueData || []).map((l: { league_name: string; tier: string }) => l.league_name)));

    // Check if any requested league was not found as extra
    const invalidLeagues = league_names.filter((name) => !validLeagueNames.includes(name));
    if (invalidLeagues.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Ligas indisponíveis ou não são extras: ${invalidLeagues.join(', ')}`,
          },
        },
        { status: 400 },
      );
    }

    // Fetch pricing for each league
    const { data: pricingData, error: pricingError } = await supabase
      .from('league_pricing')
      .select('league_name, monthly_price')
      .in('league_name', validLeagueNames);

    if (pricingError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: pricingError.message } },
        { status: 500 },
      );
    }

    const priceMap = new Map<string, number>();
    for (const p of pricingData || []) {
      priceMap.set(p.league_name, Number(p.monthly_price));
    }

    // Fetch discounts for this group
    const { data: discountData, error: discountError } = await supabase
      .from('league_discounts')
      .select('league_name, discount_percent')
      .eq('group_id', groupId)
      .in('league_name', validLeagueNames);

    if (discountError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: discountError.message } },
        { status: 500 },
      );
    }

    const discountMap = new Map<string, number>();
    for (const d of discountData || []) {
      discountMap.set(d.league_name, d.discount_percent);
    }

    // Calculate total price (server-side only, never from client)
    let totalPrice = 0;
    for (const league of validLeagueNames) {
      const price = priceMap.get(league) ?? 200;
      const discount = discountMap.get(league) ?? 0;
      totalPrice += price * (1 - discount / 100);
    }
    totalPrice = Math.round(totalPrice * 100) / 100;

    if (totalPrice <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Total price must be greater than zero' } },
        { status: 400 },
      );
    }

    // Check for existing active MP plan for this group
    const { data: existingSubscriptions, error: existingError } = await supabase
      .from('group_league_subscriptions')
      .select('mp_plan_id, status')
      .eq('group_id', groupId)
      .eq('status', 'active');

    if (existingError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: existingError.message } },
        { status: 500 },
      );
    }

    let planId: string;
    let checkoutUrl: string;

    // If existing active plan, update its price; otherwise create new plan
    const existingPlanId = existingSubscriptions?.[0]?.mp_plan_id;

    if (existingPlanId) {
      const updateResult = await updateSubscriptionPlanPrice(existingPlanId, totalPrice);
      if (!updateResult.success) {
        return NextResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: updateResult.error } },
          { status: 500 },
        );
      }
      planId = existingPlanId;

      // Fetch the existing checkout URL from an active subscription
      const { data: existingSub } = await supabase
        .from('group_league_subscriptions')
        .select('mp_checkout_url')
        .eq('group_id', groupId)
        .eq('mp_plan_id', existingPlanId)
        .limit(1);

      checkoutUrl = existingSub?.[0]?.mp_checkout_url || '';
    } else {
      const planResult = await createSubscriptionPlan(
        `Ligas Extras - ${group.name}`,
        groupId,
        totalPrice,
      );

      if (!planResult.success) {
        return NextResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: planResult.error } },
          { status: 500 },
        );
      }

      planId = planResult.data.planId;
      checkoutUrl = planResult.data.checkoutUrl;
    }

    // Upsert subscription records for each league with status='pending'
    const rows = validLeagueNames.map((league_name) => ({
      group_id: groupId,
      league_name,
      status: 'pending',
      mp_plan_id: planId,
      mp_checkout_url: checkoutUrl,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from('group_league_subscriptions')
      .upsert(rows, { onConflict: 'group_id,league_name' });

    if (upsertError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: upsertError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        checkoutUrl,
        totalPrice,
        leagues: validLeagueNames,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
