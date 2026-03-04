import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/admin-users/[id]/reset-password
 * Reset password for an admin user. No need to know the previous password.
 * Super admin only.
 *
 * Body: { password: string }
 */
export const POST = createApiHandler(
  async (req: NextRequest, _context, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID do usuário é obrigatório' } },
        { status: 400 },
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const { password } = body;

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Senha deve ter no mínimo 6 caracteres' } },
        { status: 400 },
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

    // Update password via Supabase Auth admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password,
    });

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_ERROR', message: updateError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { id, email: adminUser.email },
    });
  },
  { allowedRoles: ['super_admin'] },
);
