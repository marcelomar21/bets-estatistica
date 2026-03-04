import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * DELETE /api/admin-users/[id]
 * Remove an admin user: deletes admin_users row and disables Auth user.
 * Super admin only. Cannot delete yourself.
 */
export const DELETE = createApiHandler(
  async (_req: NextRequest, context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID do usuário é obrigatório' } },
        { status: 400 },
      );
    }

    // Prevent self-deletion
    if (id === context.user.id) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Não é possível remover a si mesmo' } },
        { status: 403 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify the user exists in admin_users
    const { data: adminUser, error: fetchError } = await supabaseAdmin
      .from('admin_users')
      .select('id, email')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: fetchError.message } },
        { status: 500 },
      );
    }

    if (!adminUser) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Admin user não encontrado' } },
        { status: 404 },
      );
    }

    // Delete from admin_users
    const { error: deleteError } = await supabaseAdmin
      .from('admin_users')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: deleteError.message } },
        { status: 500 },
      );
    }

    // Delete the Auth user (prevents login)
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authDeleteError) {
      // Log but don't fail — admin_users entry is already removed
      console.error('[admin-users] Failed to delete auth user', { id, error: authDeleteError.message });
    }

    return NextResponse.json({ success: true, data: { id } });
  },
  { allowedRoles: ['super_admin'] },
);
