import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createApiHandler } from '@/middleware/api-handler';
import { validateBotToken } from '@/lib/telegram';
import { createCheckoutPreference } from '@/lib/mercadopago';
import { createBotService } from '@/lib/render';
import type { OnboardingStep } from '@/types/database';

const onboardingSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().email('Email inválido'),
  bot_id: z.string().uuid('ID do bot inválido'),
});

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const special = '!@#$%';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  password += special.charAt(Math.floor(Math.random() * special.length));
  return password;
}

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

    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { name, email, bot_id } = parsed.data;

    // Validate bot exists and is available
    const { data: bot, error: botError } = await context.supabase
      .from('bot_pool')
      .select('id, bot_token, bot_username, status')
      .eq('id', bot_id)
      .single();

    if (botError || !bot) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Bot não encontrado' } },
        { status: 400 },
      );
    }

    if (bot.status !== 'available') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Bot não está disponível' } },
        { status: 400 },
      );
    }

    // Service role client for admin operations (auth.admin, bypass RLS for email check)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data: existingAdmin } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingAdmin) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Email já está em uso' } },
        { status: 400 },
      );
    }

    let groupId: string = '';
    let currentStep: OnboardingStep = 'creating';

    // Audit log helper (non-blocking, follows existing pattern from groups/[groupId]/route.ts)
    function logAudit(step: string, status: string, error?: string) {
      context.supabase.from('audit_log').insert({
        table_name: 'groups',
        record_id: groupId,
        action: 'onboarding',
        changed_by: context.user.id,
        changes: { step, status, ...(error ? { error } : {}) },
      }).then(({ error: auditErr }) => {
        if (auditErr) console.warn('[audit_log] Failed to insert onboarding audit', groupId, auditErr.message);
      });
    }

    try {
      // Step 1: Create group
      currentStep = 'creating';
      const { data: group, error: groupError } = await context.supabase
        .from('groups')
        .insert({ name, status: 'creating' })
        .select('id, name, status')
        .single();

      if (groupError || !group) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ONBOARDING_FAILED',
              message: groupError?.message || 'Falha ao criar grupo',
              step: currentStep,
            },
          },
          { status: 500 },
        );
      }

      groupId = group.id;
      logAudit(currentStep, 'success');

      // Step 2: Validate bot via Telegram API
      currentStep = 'validating_bot';
      const telegramResult = await validateBotToken(bot.bot_token);
      if (!telegramResult.success) {
        await context.supabase.from('groups').update({ status: 'failed' }).eq('id', groupId);
        logAudit(currentStep, 'error', telegramResult.error);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ONBOARDING_FAILED',
              message: `Falha ao validar bot: ${telegramResult.error}`,
              step: currentStep,
              group_id: groupId,
            },
          },
          { status: 500 },
        );
      }

      // Update bot_username if different
      if (telegramResult.data.username !== bot.bot_username) {
        await context.supabase
          .from('bot_pool')
          .update({ bot_username: telegramResult.data.username })
          .eq('id', bot_id);
      }
      logAudit(currentStep, 'success');

      // Step 3: Create Mercado Pago checkout preference
      currentStep = 'configuring_mp';
      const mpResult = await createCheckoutPreference(name, groupId);
      if (!mpResult.success) {
        await context.supabase.from('groups').update({ status: 'failed' }).eq('id', groupId);
        logAudit(currentStep, 'error', mpResult.error);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ONBOARDING_FAILED',
              message: `Falha ao configurar Mercado Pago: ${mpResult.error}`,
              step: currentStep,
              group_id: groupId,
            },
          },
          { status: 500 },
        );
      }

      await context.supabase
        .from('groups')
        .update({ mp_product_id: mpResult.data.id, checkout_url: mpResult.data.checkout_url })
        .eq('id', groupId);
      logAudit(currentStep, 'success');

      // Step 4: Deploy bot on Render
      currentStep = 'deploying_bot';
      const renderResult = await createBotService(groupId, bot.bot_token, name);
      if (!renderResult.success) {
        await context.supabase.from('groups').update({ status: 'failed' }).eq('id', groupId);
        logAudit(currentStep, 'error', renderResult.error);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ONBOARDING_FAILED',
              message: `Falha ao fazer deploy do bot: ${renderResult.error}`,
              step: currentStep,
              group_id: groupId,
            },
          },
          { status: 500 },
        );
      }

      await context.supabase
        .from('groups')
        .update({ render_service_id: renderResult.data.service_id })
        .eq('id', groupId);
      logAudit(currentStep, 'success');

      // Step 5: Create admin user
      currentStep = 'creating_admin';
      const tempPassword = generateTempPassword();
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

      if (authError || !authUser.user) {
        await context.supabase.from('groups').update({ status: 'failed' }).eq('id', groupId);
        logAudit(currentStep, 'error', authError?.message);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ONBOARDING_FAILED',
              message: `Falha ao criar admin: ${authError?.message || 'Erro desconhecido'}`,
              step: currentStep,
              group_id: groupId,
            },
          },
          { status: 500 },
        );
      }

      const { error: adminInsertError } = await supabaseAdmin
        .from('admin_users')
        .insert({
          id: authUser.user.id,
          email,
          role: 'group_admin',
          group_id: groupId,
        });

      if (adminInsertError) {
        await context.supabase.from('groups').update({ status: 'failed' }).eq('id', groupId);
        logAudit(currentStep, 'error', adminInsertError.message);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ONBOARDING_FAILED',
              message: `Falha ao registrar admin: ${adminInsertError.message}`,
              step: currentStep,
              group_id: groupId,
            },
          },
          { status: 500 },
        );
      }
      logAudit(currentStep, 'success');

      // Step 6: Associate bot and finalize
      currentStep = 'finalizing';
      await context.supabase
        .from('bot_pool')
        .update({ status: 'in_use', group_id: groupId })
        .eq('id', bot_id);

      await context.supabase
        .from('bot_health')
        .insert({ group_id: groupId, status: 'offline' });

      await context.supabase.from('groups').update({ status: 'active' }).eq('id', groupId);
      logAudit(currentStep, 'success');

      // Fetch final group state
      const { data: finalGroup } = await context.supabase
        .from('groups')
        .select('id, name, status, checkout_url, mp_product_id, render_service_id, created_at')
        .eq('id', groupId)
        .single();

      return NextResponse.json({
        success: true,
        data: {
          group: finalGroup,
          checkout_url: mpResult.data.checkout_url,
          admin_email: email,
          temp_password: tempPassword,
          bot_username: telegramResult.data.username,
        },
      });
    } catch (err) {
      if (groupId) {
        await context.supabase.from('groups').update({ status: 'failed' }).eq('id', groupId);
        logAudit(currentStep, 'error', err instanceof Error ? err.message : 'Unknown error');
      }
      throw err;
    }
  },
  { allowedRoles: ['super_admin'] },
);
