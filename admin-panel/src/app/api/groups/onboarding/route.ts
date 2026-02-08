import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createApiHandler } from '@/middleware/api-handler';
import { validateBotToken } from '@/lib/telegram';
import { createCheckoutPreference } from '@/lib/mercadopago';
import { createBotService } from '@/lib/render';
import type { TenantContext } from '@/middleware/tenant';

const creatingSchema = z.object({
  step: z.literal('creating'),
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().email('Email inválido'),
  bot_id: z.string().uuid('ID do bot inválido'),
  price: z.number().min(1, 'Preço deve ser pelo menos R$ 1,00'),
});

const validatingBotSchema = z.object({
  step: z.literal('validating_bot'),
  group_id: z.string().uuid('ID do grupo inválido'),
});

const configuringMpSchema = z.object({
  step: z.literal('configuring_mp'),
  group_id: z.string().uuid('ID do grupo inválido'),
  price: z.number().min(1, 'Preço deve ser pelo menos R$ 1,00'),
});

const deployingBotSchema = z.object({
  step: z.literal('deploying_bot'),
  group_id: z.string().uuid('ID do grupo inválido'),
});

const creatingAdminSchema = z.object({
  step: z.literal('creating_admin'),
  group_id: z.string().uuid('ID do grupo inválido'),
  email: z.string().trim().email('Email inválido'),
});

const finalizingSchema = z.object({
  step: z.literal('finalizing'),
  group_id: z.string().uuid('ID do grupo inválido'),
});

const stepSchema = z.discriminatedUnion('step', [
  creatingSchema,
  validatingBotSchema,
  configuringMpSchema,
  deployingBotSchema,
  creatingAdminSchema,
  finalizingSchema,
]);

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

function logAudit(
  supabase: TenantContext['supabase'],
  userId: string,
  groupId: string,
  step: string,
  status: string,
  error?: string,
) {
  supabase.from('audit_log').insert({
    table_name: 'groups',
    record_id: groupId,
    action: 'onboarding',
    changed_by: userId,
    changes: { step, status, ...(error ? { error } : {}) },
  }).then(({ error: auditErr }) => {
    if (auditErr) console.warn('[audit_log] Failed to insert onboarding audit', groupId, auditErr.message);
  });
}

async function handleCreating(data: z.infer<typeof creatingSchema>, context: TenantContext) {
  const { name, email, bot_id } = data;

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

  // Service role client for admin operations (bypass RLS for email check)
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

  // Create group
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
          step: 'creating',
        },
      },
      { status: 500 },
    );
  }

  // Associate bot with group (reserve it)
  await context.supabase
    .from('bot_pool')
    .update({ group_id: group.id })
    .eq('id', bot_id);

  logAudit(context.supabase, context.user.id, group.id, 'creating', 'success');

  return NextResponse.json({
    success: true,
    data: { group_id: group.id, bot_username: bot.bot_username },
  });
}

async function handleValidatingBot(data: z.infer<typeof validatingBotSchema>, context: TenantContext) {
  const { group_id } = data;

  const { data: bot } = await context.supabase
    .from('bot_pool')
    .select('id, bot_token, bot_username')
    .eq('group_id', group_id)
    .single();

  if (!bot) {
    return NextResponse.json(
      { success: false, error: { code: 'ONBOARDING_FAILED', message: 'Bot não encontrado para este grupo', step: 'validating_bot', group_id } },
      { status: 500 },
    );
  }

  const telegramResult = await validateBotToken(bot.bot_token);
  if (!telegramResult.success) {
    await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
    logAudit(context.supabase, context.user.id, group_id, 'validating_bot', 'error', telegramResult.error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ONBOARDING_FAILED',
          message: `Falha ao validar bot: ${telegramResult.error}`,
          step: 'validating_bot',
          group_id,
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
      .eq('id', bot.id);
  }

  logAudit(context.supabase, context.user.id, group_id, 'validating_bot', 'success');

  return NextResponse.json({
    success: true,
    data: { bot_username: telegramResult.data.username },
  });
}

async function handleConfiguringMp(data: z.infer<typeof configuringMpSchema>, context: TenantContext) {
  const { group_id, price } = data;

  const { data: group } = await context.supabase
    .from('groups')
    .select('id, name, mp_product_id, checkout_url')
    .eq('id', group_id)
    .single();

  if (!group) {
    return NextResponse.json(
      { success: false, error: { code: 'ONBOARDING_FAILED', message: 'Grupo não encontrado', step: 'configuring_mp', group_id } },
      { status: 500 },
    );
  }

  // Idempotent: skip if already configured
  if (group.mp_product_id) {
    logAudit(context.supabase, context.user.id, group_id, 'configuring_mp', 'success');
    return NextResponse.json({
      success: true,
      data: { checkout_url: group.checkout_url },
    });
  }

  const mpResult = await createCheckoutPreference(group.name, group_id, price);
  if (!mpResult.success) {
    await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
    logAudit(context.supabase, context.user.id, group_id, 'configuring_mp', 'error', mpResult.error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ONBOARDING_FAILED',
          message: `Falha ao configurar Mercado Pago: ${mpResult.error}`,
          step: 'configuring_mp',
          group_id,
        },
      },
      { status: 500 },
    );
  }

  await context.supabase
    .from('groups')
    .update({ mp_product_id: mpResult.data.id, checkout_url: mpResult.data.checkout_url })
    .eq('id', group_id);

  logAudit(context.supabase, context.user.id, group_id, 'configuring_mp', 'success');

  return NextResponse.json({
    success: true,
    data: { checkout_url: mpResult.data.checkout_url },
  });
}

async function handleDeployingBot(data: z.infer<typeof deployingBotSchema>, context: TenantContext) {
  const { group_id } = data;

  const { data: group } = await context.supabase
    .from('groups')
    .select('id, name, render_service_id')
    .eq('id', group_id)
    .single();

  if (!group) {
    return NextResponse.json(
      { success: false, error: { code: 'ONBOARDING_FAILED', message: 'Grupo não encontrado', step: 'deploying_bot', group_id } },
      { status: 500 },
    );
  }

  // Idempotent: skip if already deployed
  if (group.render_service_id) {
    logAudit(context.supabase, context.user.id, group_id, 'deploying_bot', 'success');
    return NextResponse.json({
      success: true,
      data: { service_id: group.render_service_id },
    });
  }

  const { data: bot } = await context.supabase
    .from('bot_pool')
    .select('bot_token')
    .eq('group_id', group_id)
    .single();

  if (!bot) {
    return NextResponse.json(
      { success: false, error: { code: 'ONBOARDING_FAILED', message: 'Bot não encontrado para este grupo', step: 'deploying_bot', group_id } },
      { status: 500 },
    );
  }

  const renderResult = await createBotService(group_id, bot.bot_token, group.name);
  if (!renderResult.success) {
    await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
    logAudit(context.supabase, context.user.id, group_id, 'deploying_bot', 'error', renderResult.error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ONBOARDING_FAILED',
          message: `Falha ao fazer deploy do bot: ${renderResult.error}`,
          step: 'deploying_bot',
          group_id,
        },
      },
      { status: 500 },
    );
  }

  await context.supabase
    .from('groups')
    .update({ render_service_id: renderResult.data.service_id })
    .eq('id', group_id);

  logAudit(context.supabase, context.user.id, group_id, 'deploying_bot', 'success');

  return NextResponse.json({
    success: true,
    data: { service_id: renderResult.data.service_id },
  });
}

async function handleCreatingAdmin(data: z.infer<typeof creatingAdminSchema>, context: TenantContext) {
  const { group_id, email } = data;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );

  // Idempotent: skip if admin already exists for this group
  const { data: existingAdmin } = await supabaseAdmin
    .from('admin_users')
    .select('id, email')
    .eq('group_id', group_id)
    .single();

  if (existingAdmin) {
    logAudit(context.supabase, context.user.id, group_id, 'creating_admin', 'success');
    return NextResponse.json({
      success: true,
      data: { admin_email: existingAdmin.email, temp_password: null },
    });
  }

  const tempPassword = generateTempPassword();
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
    logAudit(context.supabase, context.user.id, group_id, 'creating_admin', 'error', authError?.message);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ONBOARDING_FAILED',
          message: `Falha ao criar admin: ${authError?.message || 'Erro desconhecido'}`,
          step: 'creating_admin',
          group_id,
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
      group_id,
    });

  if (adminInsertError) {
    await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
    logAudit(context.supabase, context.user.id, group_id, 'creating_admin', 'error', adminInsertError.message);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ONBOARDING_FAILED',
          message: `Falha ao registrar admin: ${adminInsertError.message}`,
          step: 'creating_admin',
          group_id,
        },
      },
      { status: 500 },
    );
  }

  logAudit(context.supabase, context.user.id, group_id, 'creating_admin', 'success');

  return NextResponse.json({
    success: true,
    data: { admin_email: email, temp_password: tempPassword },
  });
}

async function handleFinalizing(data: z.infer<typeof finalizingSchema>, context: TenantContext) {
  const { group_id } = data;

  // Set bot to in_use
  await context.supabase
    .from('bot_pool')
    .update({ status: 'in_use' })
    .eq('group_id', group_id);

  // Create bot_health (idempotent)
  const { data: existingHealth } = await context.supabase
    .from('bot_health')
    .select('group_id')
    .eq('group_id', group_id)
    .single();

  if (!existingHealth) {
    await context.supabase
      .from('bot_health')
      .insert({ group_id, status: 'offline' });
  }

  // Activate group
  await context.supabase
    .from('groups')
    .update({ status: 'active' })
    .eq('id', group_id);

  logAudit(context.supabase, context.user.id, group_id, 'finalizing', 'success');

  // Fetch final group state
  const { data: finalGroup } = await context.supabase
    .from('groups')
    .select('id, name, status, checkout_url, mp_product_id, render_service_id, created_at')
    .eq('id', group_id)
    .single();

  return NextResponse.json({
    success: true,
    data: { group: finalGroup },
  });
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

    const parsed = stepSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const data = parsed.data;

    switch (data.step) {
      case 'creating':
        return handleCreating(data, context);
      case 'validating_bot':
        return handleValidatingBot(data, context);
      case 'configuring_mp':
        return handleConfiguringMp(data, context);
      case 'deploying_bot':
        return handleDeployingBot(data, context);
      case 'creating_admin':
        return handleCreatingAdmin(data, context);
      case 'finalizing':
        return handleFinalizing(data, context);
    }
  },
  { allowedRoles: ['super_admin'] },
);
