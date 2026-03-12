import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';

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
      .select('id, is_admin, group_id')
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

    const { error: updateError } = await supabase
      .from('members')
      .update({ is_admin: newValue })
      .eq('id', memberId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 },
      );
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
          },
        });
      } catch {
        // Best-effort
      }
    }

    return NextResponse.json({
      success: true,
      data: { id: memberId, is_admin: newValue },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
