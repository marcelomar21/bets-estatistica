import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * PATCH /api/members/[id]/toggle-admin
 * Toggles the is_admin flag on a member. Admins are excluded from dashboard stats.
 */
export const PATCH = createApiHandler(
  async (_req, context, routeContext) => {
    const { supabase, groupFilter, user } = context;
    const { id } = await routeContext.params;
    const memberId = Number.parseInt(id, 10);

    if (Number.isNaN(memberId) || memberId <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID de membro invalido' } },
        { status: 400 },
      );
    }

    // Fetch member with group filter (RLS enforcement)
    let query = supabase
      .from('members')
      .select('id, is_admin, group_id, telegram_id, status, mp_subscription_id, subscription_ends_at')
      .eq('id', memberId);

    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    }

    const { data: member, error: fetchError } = await query.single();

    if (fetchError || !member) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Membro nao encontrado' } },
        { status: 404 },
      );
    }

    const newValue = !member.is_admin;

    // Não permitir ativar admin em membro removido ou cancelado
    if (newValue === true && (member.status === 'removido' || member.status === 'cancelado')) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `Nao e possivel tornar admin um membro com status '${member.status}'` } },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = { is_admin: newValue };

    if (newValue === true && member.status === 'trial') {
      // Admin ativado: promover trial → ativo
      updateData.status = 'ativo';
    }

    if (newValue === false && member.status === 'ativo') {
      const now = new Date();
      const hasActiveSubscription =
        member.mp_subscription_id != null &&
        member.subscription_ends_at != null &&
        new Date(member.subscription_ends_at) > now;

      if (!hasActiveSubscription) {
        // Sem assinatura: reverter para trial com 7 dias frescos
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + 7);

        updateData.status = 'trial';
        updateData.trial_started_at = now.toISOString();
        updateData.trial_ends_at = trialEnd.toISOString();
      }
      // Com assinatura ativa: manter ativo (não faz nada)
    }

    let updateQuery = supabase
      .from('members')
      .update(updateData)
      .eq('id', memberId);

    if (groupFilter) {
      updateQuery = updateQuery.eq('group_id', groupFilter);
    }

    const { error: updateError } = await updateQuery;

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    // Telegram promote/demote (best-effort)
    if (member.telegram_id && member.group_id) {
      try {
        const { data: botData } = await getSupabaseAdmin()
          .from('bot_pool')
          .select('bot_token, public_group_id')
          .eq('group_id', member.group_id)
          .eq('is_active', true)
          .single();

        if (botData?.bot_token && botData.public_group_id) {
          const res = await fetch(
            `https://api.telegram.org/bot${botData.bot_token}/promoteChatMember`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: botData.public_group_id,
                user_id: member.telegram_id,
                can_manage_chat: newValue,
                can_delete_messages: newValue,
                can_restrict_members: newValue,
                can_invite_users: newValue,
                can_pin_messages: newValue,
                can_manage_video_chats: newValue,
              }),
            },
          );
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            console.warn('[toggle-admin] Telegram promoteChatMember failed:', body);
          }
        }
      } catch (err) {
        console.warn('[toggle-admin] Telegram promoteChatMember error:', err instanceof Error ? err.message : err);
      }
    }

    // Audit log (best-effort)
    if (member.group_id) {
      try {
        await supabase.from('audit_log').insert({
          table_name: 'members',
          record_id: member.group_id,
          action: newValue ? 'member_set_admin' : 'member_unset_admin',
          changed_by: user.id,
          changes: {
            member_id: memberId,
            is_admin: newValue,
            ...(updateData.status !== undefined && {
              status_changed: true,
              new_status: updateData.status,
            }),
          },
        });
      } catch {
        // Best-effort
      }
    }

    return NextResponse.json({
      success: true,
      data: { id: memberId, is_admin: newValue, status: (updateData.status as string) ?? member.status },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
