import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/admin-users
 * List all admin users with their associated group names.
 * Super admin only.
 */
export const GET = createApiHandler(
  async (_req, context) => {
    const { data: users, error } = await context.supabase
      .from('admin_users')
      .select('id, email, role, group_id, created_at, groups(name)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: users });
  },
  { allowedRoles: ['super_admin'] },
);

/**
 * POST /api/admin-users
 * Create a new admin user: Supabase Auth invite + admin_users row.
 * Super admin only.
 *
 * Body: { email: string, role: 'super_admin' | 'group_admin', group_id?: string }
 */
export const POST = createApiHandler(
  async (req: NextRequest) => {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const { email, role, group_id } = body;

    // Validate required fields
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Email inválido' } },
        { status: 400 },
      );
    }

    if (role !== 'super_admin' && role !== 'group_admin') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Role deve ser super_admin ou group_admin' } },
        { status: 400 },
      );
    }

    if (role === 'group_admin' && !group_id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id obrigatório para group_admin' } },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Check for existing admin user with same email
    const { data: existing } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE', message: 'Usuário admin já existe com esse email' } },
        { status: 409 },
      );
    }

    // Invite user via Supabase Auth (sends magic link email)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.toLowerCase().trim(),
    );

    if (authError) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_ERROR', message: authError.message } },
        { status: 500 },
      );
    }

    // Insert into admin_users table
    const { error: insertError } = await supabaseAdmin
      .from('admin_users')
      .insert({
        id: authData.user.id,
        email: email.toLowerCase().trim(),
        role,
        group_id: role === 'group_admin' ? group_id : null,
      });

    if (insertError) {
      // Cleanup: delete the auth user if admin_users insert failed
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: insertError.message } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: authData.user.id,
        email: email.toLowerCase().trim(),
        role,
        group_id: role === 'group_admin' ? group_id : null,
      },
    }, { status: 201 });
  },
  { allowedRoles: ['super_admin'] },
);
