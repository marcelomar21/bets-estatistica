import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizeTelegramChatId } from '@/lib/telegram-chat-id';

/**
 * POST /api/members/[id]/reactivate
 * Reactivates a cancelled member: updates status to 'ativo', clears cancellation fields,
 * unbans from Telegram group (best-effort), and logs to audit_log.
 */
export const POST = createApiHandler(
  async (req, context, routeContext) => {
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
      .select('id, telegram_id, telegram_username, status, group_id')
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

    if (member.status !== 'cancelado') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `Somente membros cancelados podem ser reativados (status atual: '${member.status}')` } },
        { status: 400 },
      );
    }

    // Update member status with optimistic locking
    const { data: updated, error: updateError } = await supabase
      .from('members')
      .update({
        status: 'ativo',
        kicked_at: null,
        cancellation_reason: null,
        cancelled_by: null,
      })
      .eq('id', memberId)
      .eq('status', 'cancelado')
      .select('id')
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao atualizar status do membro' } },
        { status: 500 },
      );
    }

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Status do membro foi alterado por outra operacao' } },
        { status: 409 },
      );
    }

    // Unban from Telegram group (best-effort)
    // Uses service_role client to bypass bot_pool RLS (restricted to super_admin)
    if (member.telegram_id && member.group_id) {
      try {
        const { data: botData } = await getSupabaseAdmin()
          .from('bot_pool')
          .select('bot_token, public_group_id')
          .eq('group_id', member.group_id)
          .eq('is_active', true)
          .single();

        const normalizedPublicGroupId = normalizeTelegramChatId(botData?.public_group_id);
        if (botData?.bot_token && normalizedPublicGroupId) {
          const res = await fetch(`https://api.telegram.org/bot${botData.bot_token}/unbanChatMember`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: normalizedPublicGroupId,
              user_id: member.telegram_id,
              only_if_banned: true,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            console.warn('[reactivate] Telegram unbanChatMember failed:', body);
          }
        } else if (botData?.bot_token) {
          console.warn('[reactivate] Skipping unbanChatMember: publicGroupId invalid after normalization', {
            rawPublicGroupId: botData?.public_group_id,
            memberId,
          });
        }
      } catch (err) {
        console.warn('[reactivate] Telegram unbanChatMember error:', err instanceof Error ? err.message : err);
      }
    }

    // Audit log (best-effort)
    if (member.group_id) {
      try {
        await supabase.from('audit_log').insert({
          table_name: 'members',
          record_id: member.group_id,
          action: 'member_reactivated',
          changed_by: user.id,
          changes: {
            member_id: memberId,
            telegram_id: member.telegram_id,
            actor_type: 'operator',
          },
        });
      } catch {
        // Best-effort
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: memberId,
        status: 'ativo',
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
