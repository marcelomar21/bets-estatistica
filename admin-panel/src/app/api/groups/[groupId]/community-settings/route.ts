import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/middleware/api-handler';
import { updateSubscriptionPlanPrice } from '@/lib/mercadopago';

type RouteContext = { params: Promise<{ groupId: string }> };

const SETTINGS_SELECT_FIELDS = 'trial_days, subscription_price, welcome_message_template, mp_plan_id';

const updateSettingsSchema = z.object({
  trial_days: z.number().int().min(1, 'Trial deve ser no mínimo 1 dia').max(30, 'Trial deve ser no máximo 30 dias').optional(),
  subscription_price: z.number().min(1, 'Preço deve ser no mínimo R$ 1,00').max(99999.99, 'Preço deve ser no máximo R$ 99.999,99').nullable().optional(),
  welcome_message_template: z.string().max(2000, 'Template deve ter no máximo 2000 caracteres').nullable().optional(),
});

export const GET = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as RouteContext).params;

    if (context.groupFilter && context.groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    const { data: settings, error } = await context.supabase
      .from('groups')
      .select(SETTINGS_SELECT_FIELDS)
      .eq('id', groupId)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    if (!settings) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 },
      );
    }

    // Strip mp_plan_id from response (internal field)
    const { mp_plan_id: _mp, ...settingsResponse } = settings as Record<string, unknown>;
    return NextResponse.json({ success: true, data: settingsResponse });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

// F6: super_admin has groupFilter=null by design (withTenant) — full access to all groups.
// group_admin is restricted to their own group via groupFilter check.
export const PUT = createApiHandler(
  async (req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as RouteContext).params;

    if (context.groupFilter && context.groupFilter !== groupId) {
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

    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    // F3: Fetch current values for audit log. This is a read-then-write pattern (TOCTOU)
    // consistent with groups/[groupId]/route.ts. Concurrent edits are extremely rare for
    // community settings and the audit log is best-effort (non-blocking).
    const { data: currentGroup } = await context.supabase
      .from('groups')
      .select('trial_days, subscription_price, welcome_message_template, mp_plan_id')
      .eq('id', groupId)
      .single();

    const { data: updated, error } = await context.supabase
      .from('groups')
      .update(parsed.data)
      .eq('id', groupId)
      .select(SETTINGS_SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found or update failed' } },
        { status: 404 },
      );
    }

    // MP sync — if price changed (or force_mp_sync) and group has mp_plan_id, update the MP plan
    const forceMpSync = req.nextUrl.searchParams.get('force_mp_sync') === '1';
    let mpWarning: string | undefined;
    if (
      parsed.data.subscription_price !== undefined &&
      parsed.data.subscription_price !== null &&
      currentGroup &&
      currentGroup.mp_plan_id &&
      (forceMpSync || Number(parsed.data.subscription_price) !== Number(currentGroup.subscription_price))
    ) {
      const mpResult = await updateSubscriptionPlanPrice(
        currentGroup.mp_plan_id as string,
        parsed.data.subscription_price,
      );
      if (!mpResult.success) {
        console.warn('[community-settings] MP price sync failed', groupId, mpResult.error);
        mpWarning = `Preço atualizado no banco, mas falhou ao sincronizar com Mercado Pago: ${mpResult.error}`;
      }
    }

    // Audit log — non-blocking
    if (currentGroup) {
      const changedFields: Record<string, unknown> = {};
      const oldFields: Record<string, unknown> = {};
      const auditKeys = ['trial_days', 'subscription_price', 'welcome_message_template'] as const;

      for (const key of auditKeys) {
        const oldVal = currentGroup[key as keyof typeof currentGroup];
        const newVal = parsed.data[key as keyof typeof parsed.data];
        if (newVal !== undefined && JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
          oldFields[key] = oldVal;
          changedFields[key] = newVal;
        }
      }

      if (Object.keys(changedFields).length > 0) {
        const { error: auditError } = await context.supabase.from('audit_log').insert({
          table_name: 'groups',
          record_id: groupId,
          action: 'update',
          changed_by: context.user.id,
          changes: { old: oldFields, new: changedFields },
        });
        if (auditError) {
          console.warn('[audit_log] Failed to insert audit log for community settings update', groupId, auditError.message);
        }
      }
    }

    // Strip mp_plan_id from response (internal field)
    const { mp_plan_id: _mp, ...responseData } = updated as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      data: responseData,
      ...(mpWarning ? { warning: mpWarning } : {}),
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
