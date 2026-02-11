import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createApiHandler } from '@/middleware/api-handler';
import { logAudit } from '@/lib/audit';

const cleanupSchema = z.object({
  group_id: z.string().uuid('ID do grupo inválido'),
});

/**
 * POST /api/groups/onboarding/cleanup
 * Cleans up a failed/creating onboarding: releases bot, deletes admin user, deletes group.
 */
export const POST = createApiHandler(
  async (req, context) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = cleanupSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { group_id } = parsed.data;

    // Verify group exists and is in a cleanable state
    const { data: group, error: groupError } = await context.supabase
      .from('groups')
      .select('id, name, status')
      .eq('id', group_id)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Grupo não encontrado' } },
        { status: 404 },
      );
    }

    if (group.status !== 'failed' && group.status !== 'creating') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Apenas grupos com status "failed" ou "creating" podem ser limpos' } },
        { status: 400 },
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    // 1. Release bot (set group_id to null)
    await context.supabase
      .from('bot_pool')
      .update({ group_id: null, status: 'available' })
      .eq('group_id', group_id);

    // 2. Delete admin user if exists
    const { data: adminUser } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .eq('group_id', group_id)
      .single();

    if (adminUser) {
      // Delete from admin_users table
      await supabaseAdmin
        .from('admin_users')
        .delete()
        .eq('id', adminUser.id);

      // Delete auth user
      await supabaseAdmin.auth.admin.deleteUser(adminUser.id);
    }

    // 3. Delete bot_health if exists
    await context.supabase
      .from('bot_health')
      .delete()
      .eq('group_id', group_id);

    // 4. Delete audit logs for this group
    await context.supabase
      .from('audit_log')
      .delete()
      .eq('record_id', group_id);

    // 5. Delete notifications for this group
    await context.supabase
      .from('notifications')
      .delete()
      .eq('group_id', group_id);

    // 6. Delete the group itself
    const { error: deleteError } = await context.supabase
      .from('groups')
      .delete()
      .eq('id', group_id);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: `Falha ao deletar grupo: ${deleteError.message}` } },
        { status: 500 },
      );
    }

    logAudit(context.supabase, context.user.id, group_id, 'groups', 'onboarding_cleanup', {
      group_name: group.name,
      previous_status: group.status,
    });

    return NextResponse.json({
      success: true,
      data: { message: `Onboarding do grupo "${group.name}" foi limpo com sucesso` },
    });
  },
  { allowedRoles: ['super_admin'] },
);
