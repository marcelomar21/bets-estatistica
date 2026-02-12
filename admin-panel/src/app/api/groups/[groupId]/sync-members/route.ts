import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { withMtprotoSession, getGroupParticipants, classifyMtprotoError } from '@/lib/mtproto';

type GroupRouteContext = { params: Promise<{ groupId: string }> };

/**
 * POST /api/groups/[groupId]/sync-members
 *
 * Sync ALL group members from Telegram into the members table using MTProto.
 * Uses channels.getParticipants to fetch every member (not just admins).
 * Used for manual recovery when webhook events (new_chat_members) are lost.
 */
export const POST = createApiHandler(
  async (_req: NextRequest, context, routeContext) => {
    const { groupId } = await (routeContext as GroupRouteContext).params;

    // Tenant filter: group_admin can only sync their own group
    if (context.groupFilter && context.groupFilter !== groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this group' } },
        { status: 403 },
      );
    }

    // Fetch group
    const { data: group, error: groupError } = await context.supabase
      .from('groups')
      .select('id, name, telegram_group_id')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } },
        { status: 404 },
      );
    }

    if (!group.telegram_group_id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Group has no Telegram group ID configured' } },
        { status: 400 },
      );
    }

    // Use MTProto to fetch ALL participants
    let participants: Awaited<ReturnType<typeof getGroupParticipants>>;
    try {
      participants = await withMtprotoSession(context.supabase, (client) =>
        getGroupParticipants(client, group.telegram_group_id!),
      );
    } catch (err) {
      const mtErr = classifyMtprotoError(err);
      return NextResponse.json(
        { success: false, error: { code: mtErr.code, message: mtErr.message } },
        { status: mtErr.code === 'MTPROTO_SESSION_NOT_FOUND' ? 400 : 502 },
      );
    }

    // Filter out bots
    const humans = participants.filter((p) => !p.isBot);

    const created: Array<{ telegram_id: number; username: string | null }> = [];
    const updated: Array<{ telegram_id: number; username: string | null }> = [];
    const skipped: Array<{ telegram_id: number; username: string | null }> = [];

    for (const member of humans) {
      const telegramId = member.userId;
      const username = member.username || null;

      // Check if member exists in DB for this group
      const { data: existing } = await context.supabase
        .from('members')
        .select('id, joined_group_at')
        .eq('telegram_id', telegramId)
        .eq('group_id', groupId)
        .maybeSingle();

      if (!existing) {
        // INSERT new member
        const { error: insertError } = await context.supabase
          .from('members')
          .insert({
            telegram_id: telegramId,
            telegram_username: username,
            group_id: groupId,
            status: 'ativo',
            joined_group_at: new Date().toISOString(),
          });

        if (insertError) {
          console.warn('[sync-members] Insert failed', { telegramId, error: insertError.message });
          skipped.push({ telegram_id: telegramId, username });
        } else {
          created.push({ telegram_id: telegramId, username });
        }
      } else if (!existing.joined_group_at) {
        // UPDATE joined_group_at
        const { error: updateError } = await context.supabase
          .from('members')
          .update({
            joined_group_at: new Date().toISOString(),
            telegram_username: username,
          })
          .eq('id', existing.id);

        if (updateError) {
          console.warn('[sync-members] Update failed', { telegramId, error: updateError.message });
          skipped.push({ telegram_id: telegramId, username });
        } else {
          updated.push({ telegram_id: telegramId, username });
        }
      } else {
        skipped.push({ telegram_id: telegramId, username });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        created,
        updated,
        skipped,
        total_from_telegram: humans.length,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
