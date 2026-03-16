import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const CANCELLABLE_STATUSES = new Set(['trial', 'ativo']);

/**
 * POST /api/members/[id]/cancel
 * Cancels a member: updates status, kicks from Telegram, sends farewell DM.
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

    // Parse body
    let body: { reason?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Body invalido' } },
        { status: 400 },
      );
    }

    const reason = body.reason?.trim();
    if (!reason || reason.length < 3) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Motivo deve ter pelo menos 3 caracteres' } },
        { status: 400 },
      );
    }
    if (reason.length > 500) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Motivo deve ter no maximo 500 caracteres' } },
        { status: 400 },
      );
    }

    // Fetch member with group filter (RLS enforcement)
    let query = supabase
      .from('members')
      .select('id, telegram_id, telegram_username, status, group_id, is_admin')
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

    if (member.is_admin) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Membros admin nao podem ser cancelados. Remova o flag de admin primeiro.' } },
        { status: 400 },
      );
    }

    if (!CANCELLABLE_STATUSES.has(member.status)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `Membro com status '${member.status}' nao pode ser cancelado` } },
        { status: 400 },
      );
    }

    // Update member status with optimistic locking (WHERE status = current)
    const { data: updated, error: updateError } = await supabase
      .from('members')
      .update({
        status: 'cancelado',
        kicked_at: new Date().toISOString(),
        cancellation_reason: reason,
        cancelled_by: user.id,
      })
      .eq('id', memberId)
      .eq('status', member.status)
      .select('id')
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Status do membro foi alterado por outra operacao' } },
        { status: 409 },
      );
    }

    // Get bot token and group info for Telegram operations (best-effort)
    // Uses service_role client to bypass bot_pool RLS (restricted to super_admin)
    // Entire block is try/catch to avoid 500 after successful DB update
    if (member.telegram_id && member.group_id) {
      try {
        const { data: botData } = await getSupabaseAdmin()
          .from('bot_pool')
          .select('bot_token, public_group_id, groups(checkout_url)')
          .eq('group_id', member.group_id)
          .eq('is_active', true)
          .single();

        if (botData?.bot_token) {
          const botToken = botData.bot_token;
          const publicGroupId = botData.public_group_id;
          const groupsData = botData.groups as unknown as { checkout_url: string | null } | { checkout_url: string | null }[] | null;
          const checkoutUrl = (Array.isArray(groupsData) ? groupsData[0]?.checkout_url : groupsData?.checkout_url) || '';

          // Ban member from group (best-effort)
          if (publicGroupId) {
            const banUntil = Math.floor(Date.now() / 1000) + 86400; // 24h
            try {
              const res = await fetch(`https://api.telegram.org/bot${botToken}/banChatMember`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: publicGroupId,
                  user_id: member.telegram_id,
                  until_date: banUntil,
                }),
              });
              if (!res.ok) {
                const resBody = await res.json().catch(() => null);
                console.warn('[cancel] Telegram banChatMember failed:', resBody);
              }
            } catch (err) {
              console.warn('[cancel] Telegram banChatMember error:', err instanceof Error ? err.message : err);
            }
          }

          // Send farewell DM (best-effort)
          const farewellText = checkoutUrl
            ? `Sua assinatura foi cancelada.\n\nPara reativar: ${checkoutUrl}`
            : 'Sua assinatura foi cancelada.';

          try {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: member.telegram_id,
                text: farewellText,
              }),
            });
            if (!res.ok) {
              const resBody = await res.json().catch(() => null);
              console.warn('[cancel] Telegram sendMessage failed:', resBody);
            }
          } catch (err) {
            console.warn('[cancel] Telegram sendMessage error:', err instanceof Error ? err.message : err);
          }
        }
      } catch (err) {
        console.warn('[cancel] Telegram operations failed:', err instanceof Error ? err.message : err);
      }
    }

    // Audit log (best-effort)
    if (member.group_id) {
      try {
        await supabase.from('audit_log').insert({
          table_name: 'members',
          record_id: member.group_id,
          action: 'member_cancelled',
          changed_by: user.id,
          changes: {
            member_id: memberId,
            telegram_id: member.telegram_id,
            reason,
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
        status: 'cancelado',
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
