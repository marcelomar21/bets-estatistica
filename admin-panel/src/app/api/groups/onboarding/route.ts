import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createApiHandler } from '@/middleware/api-handler';
import { validateBotToken } from '@/lib/telegram';
import { createSubscriptionPlan } from '@/lib/mercadopago';
import { createBotService } from '@/lib/render';
import { logAudit } from '@/lib/audit';
import { withMtprotoSession, createSupergroup, addBotAsAdmin, createInviteLink, verifyBotIsAdmin, classifyMtprotoError, MtprotoError } from '@/lib/mtproto';
import { getBotConfig, sendFounderNotification, sendInvite } from '@/lib/super-admin-bot';
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

const creatingTelegramGroupSchema = z.object({
  step: z.literal('creating_telegram_group'),
  group_id: z.string().uuid('ID do grupo inválido'),
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
  creatingTelegramGroupSchema,
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

function logOnboardingAudit(
  supabase: TenantContext['supabase'],
  userId: string,
  groupId: string,
  step: string,
  status: string,
  error?: string,
) {
  logAudit(supabase, userId, groupId, 'groups', 'onboarding', { step, status, ...(error ? { error } : {}) });
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

  logOnboardingAudit(context.supabase, context.user.id, group.id, 'creating', 'success');

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
    logOnboardingAudit(context.supabase, context.user.id, group_id, 'validating_bot', 'error', telegramResult.error);
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

  logOnboardingAudit(context.supabase, context.user.id, group_id, 'validating_bot', 'success');

  return NextResponse.json({
    success: true,
    data: { bot_username: telegramResult.data.username },
  });
}

async function handleConfiguringMp(data: z.infer<typeof configuringMpSchema>, context: TenantContext) {
  const { group_id, price } = data;

  const { data: group } = await context.supabase
    .from('groups')
    .select('id, name, mp_plan_id, checkout_url')
    .eq('id', group_id)
    .single();

  if (!group) {
    return NextResponse.json(
      { success: false, error: { code: 'ONBOARDING_FAILED', message: 'Grupo não encontrado', step: 'configuring_mp', group_id } },
      { status: 500 },
    );
  }

  // Idempotent: skip if already configured
  if (group.mp_plan_id) {
    logOnboardingAudit(context.supabase, context.user.id, group_id, 'configuring_mp', 'success');
    return NextResponse.json({
      success: true,
      data: { checkout_url: group.checkout_url },
    });
  }

  const mpResult = await createSubscriptionPlan(group.name, group_id, price);
  if (!mpResult.success) {
    await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
    logOnboardingAudit(context.supabase, context.user.id, group_id, 'configuring_mp', 'error', mpResult.error);
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

  const { error: savePlanError } = await context.supabase
    .from('groups')
    .update({ mp_plan_id: mpResult.data.planId, checkout_url: mpResult.data.checkoutUrl })
    .eq('id', group_id);

  if (savePlanError) {
    await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
    const recoveryMessage = `Plano criado no MP (${mpResult.data.planId}), mas falhou ao salvar no DB: ${savePlanError.message}`;
    console.error('[onboarding:configuring_mp]', recoveryMessage);
    logOnboardingAudit(context.supabase, context.user.id, group_id, 'configuring_mp', 'error', recoveryMessage);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ONBOARDING_FAILED',
          message: `Plano criado no Mercado Pago (planId: ${mpResult.data.planId}), mas falhou ao salvar no banco`,
          step: 'configuring_mp',
          group_id,
        },
      },
      { status: 500 },
    );
  }

  logOnboardingAudit(context.supabase, context.user.id, group_id, 'configuring_mp', 'success');

  return NextResponse.json({
    success: true,
    data: { checkout_url: mpResult.data.checkoutUrl },
  });
}

async function handleDeployingBot(data: z.infer<typeof deployingBotSchema>, context: TenantContext) {
  const { group_id } = data;

  const { data: group } = await context.supabase
    .from('groups')
    .select('id, name, render_service_id, telegram_group_id, checkout_url')
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
    logOnboardingAudit(context.supabase, context.user.id, group_id, 'deploying_bot', 'success');
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

  if (!group.telegram_group_id) {
    return NextResponse.json(
      { success: false, error: { code: 'ONBOARDING_FAILED', message: 'Grupo Telegram ainda não foi criado. Crie o grupo Telegram antes do deploy.', step: 'deploying_bot', group_id } },
      { status: 400 },
    );
  }

  const renderResult = await createBotService({
    groupId: group_id,
    botToken: bot.bot_token,
    groupName: group.name,
    telegramGroupId: group.telegram_group_id,
    telegramAdminGroupId: process.env.CENTRAL_ADMIN_GROUP_ID,
    checkoutUrl: group.checkout_url,
  });
  if (!renderResult.success) {
    await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
    logOnboardingAudit(context.supabase, context.user.id, group_id, 'deploying_bot', 'error', renderResult.error);
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

  logOnboardingAudit(context.supabase, context.user.id, group_id, 'deploying_bot', 'success');

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
    logOnboardingAudit(context.supabase, context.user.id, group_id, 'creating_admin', 'success');
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
    logOnboardingAudit(context.supabase, context.user.id, group_id, 'creating_admin', 'error', authError?.message);
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
    logOnboardingAudit(context.supabase, context.user.id, group_id, 'creating_admin', 'error', adminInsertError.message);
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

  logOnboardingAudit(context.supabase, context.user.id, group_id, 'creating_admin', 'success');

  return NextResponse.json({
    success: true,
    data: { admin_email: email, temp_password: tempPassword },
  });
}

async function handleCreatingTelegramGroup(data: z.infer<typeof creatingTelegramGroupSchema>, context: TenantContext) {
  const { group_id } = data;

  // 1. Fetch group current state
  const { data: group, error: groupError } = await context.supabase
    .from('groups')
    .select('id, name, telegram_group_id, telegram_invite_link, additional_invitee_ids')
    .eq('id', group_id)
    .single();

  if (groupError || !group) {
    return NextResponse.json(
      { success: false, error: { code: 'ONBOARDING_FAILED', message: 'Grupo não encontrado', step: 'creating_telegram_group', group_id } },
      { status: 500 },
    );
  }

  // 2. Fetch associated bot (no status filter — bot is still 'available' during onboarding,
  //    it transitions to 'in_use' in the finalizing step)
  const { data: bot } = await context.supabase
    .from('bot_pool')
    .select('bot_token, bot_username')
    .eq('group_id', group_id)
    .single();

  if (!bot) {
    // Config error — do NOT mark group as failed
    return NextResponse.json(
      { success: false, error: { code: 'BOT_NOT_ASSIGNED', message: 'Nenhum bot associado ao grupo', step: 'creating_telegram_group', group_id } },
      { status: 400 },
    );
  }

  // 3. GRANULAR IDEMPOTENCY
  if (group.telegram_group_id) {
    try {
      const isAdmin = await withMtprotoSession(context.supabase, async (client) => {
        return verifyBotIsAdmin(client, group.telegram_group_id!, bot.bot_username);
      });

      if (isAdmin && group.telegram_invite_link) {
        // All done — skip
        logOnboardingAudit(context.supabase, context.user.id, group_id, 'creating_telegram_group', 'success');
        return NextResponse.json({
          success: true,
          data: { telegram_group_id: group.telegram_group_id, invite_link: group.telegram_invite_link, skipped: true },
        });
      }

      if (!isAdmin) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'BOT_NOT_ADMIN',
              message: 'Grupo existe mas bot não é admin. Verifique manualmente.',
              step: 'creating_telegram_group',
              group_id,
            },
          },
          { status: 400 },
        );
      }
    } catch (err) {
      if (err instanceof MtprotoError && err.code === 'MTPROTO_SESSION_NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: { code: err.code, message: err.message, step: 'creating_telegram_group', group_id } },
          { status: 400 },
        );
      }
      const classified = classifyMtprotoError(err);
      return NextResponse.json(
        { success: false, error: { code: classified.code, message: classified.message, step: 'creating_telegram_group', group_id, retryable: classified.retryable } },
        { status: 500 },
      );
    }
  }

  // 4. Create full group
  try {
    const result = await withMtprotoSession(context.supabase, async (client) => {
      // Create supergroup
      const { groupId: telegramGroupId, channel } = await createSupergroup(
        client,
        group.name,
        `Grupo de apostas - ${group.name}`,
      );

      // Add bot as admin
      await addBotAsAdmin(client, channel, bot.bot_username);

      // Generate invite link
      const inviteLink = await createInviteLink(client, channel, `Convite ${group.name}`);

      return { telegramGroupId, inviteLink };
    });

    // 5. Save to database (admin group = public group for now)
    await context.supabase
      .from('groups')
      .update({
        telegram_group_id: result.telegramGroupId,
        telegram_admin_group_id: result.telegramGroupId,
        telegram_invite_link: result.inviteLink,
      })
      .eq('id', group_id);

    // 6. Notify founders via Bot Super Admin (fire-and-forget)
    const botConfig = await getBotConfig(context.supabase);
    if (botConfig) {
      sendFounderNotification(
        botConfig.bot_token,
        botConfig.founder_chat_ids,
        group.name,
        group.name, // influencer name is group name in this context
        result.inviteLink,
      ).then(({ failed }) => {
        // Log individual failures as notifications
        for (const f of failed) {
          context.supabase.from('notifications').insert({
            type: 'telegram_notification_failed',
            severity: 'warning',
            title: 'Falha ao notificar founder',
            message: `Falha ao enviar notificação para chat_id ${f.chatId}: ${f.error}`,
            group_id,
            metadata: { failed_chat_id: f.chatId, error: f.error },
          }).then(() => {});
        }
      }).catch(() => {});

      // 7. Send invites to influencer and additional invitees
      const additionalInvitees = (group.additional_invitee_ids as Array<{ type: 'telegram' | 'email'; value: string }>) || [];
      for (const invitee of additionalInvitees) {
        const target = invitee.type === 'telegram'
          ? { type: 'telegram' as const, chatId: Number(invitee.value) }
          : { type: 'email' as const, email: invitee.value };
        sendInvite(botConfig.bot_token, target, group.name, result.inviteLink).catch(() => {});
      }
    }

    // 8. Create success notification
    context.supabase.from('notifications').insert({
      type: 'telegram_group_created',
      severity: 'success',
      title: 'Grupo Telegram criado',
      message: `Grupo "${group.name}" criado com sucesso no Telegram`,
      group_id,
      metadata: { telegram_group_id: result.telegramGroupId, invite_link: result.inviteLink },
    }).then(() => {});

    logOnboardingAudit(context.supabase, context.user.id, group_id, 'creating_telegram_group', 'success');

    return NextResponse.json({
      success: true,
      data: {
        telegram_group_id: result.telegramGroupId,
        invite_link: result.inviteLink,
      },
    });
  } catch (err) {
    const classified = classifyMtprotoError(err);

    // Create failure notification
    context.supabase.from('notifications').insert({
      type: 'telegram_group_failed',
      severity: 'error',
      title: 'Falha ao criar grupo Telegram',
      message: `Falha ao criar grupo "${group.name}": ${classified.message}`,
      group_id,
      metadata: { error_code: classified.code, error_message: classified.message, retryable: classified.retryable },
    }).then(() => {});

    // Handle session expiration notification
    if (classified.code === 'MTPROTO_SESSION_EXPIRED') {
      context.supabase.from('notifications').insert({
        type: 'mtproto_session_expired',
        severity: 'error',
        title: 'Sessão MTProto expirada',
        message: 'Sessão MTProto expirada. Re-autentique em /settings/telegram',
        metadata: { reason: classified.message },
      }).then(() => {});
    }

    logOnboardingAudit(context.supabase, context.user.id, group_id, 'creating_telegram_group', 'error', classified.message);

    // Do NOT mark group as failed — this is a retryable/config error
    return NextResponse.json(
      {
        success: false,
        error: {
          code: classified.code,
          message: classified.message,
          step: 'creating_telegram_group',
          group_id,
          retryable: classified.retryable,
          ...(classified.retryAfterSeconds ? { retryAfterSeconds: classified.retryAfterSeconds } : {}),
        },
      },
      { status: 500 },
    );
  }
}

async function handleFinalizing(data: z.infer<typeof finalizingSchema>, context: TenantContext) {
  const { group_id } = data;

  // Set bot to in_use and fetch token
  const { data: bot } = await context.supabase
    .from('bot_pool')
    .update({ status: 'in_use' })
    .eq('group_id', group_id)
    .select('bot_token')
    .single();

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

  // Activate group and copy bot_token from bot_pool
  await context.supabase
    .from('groups')
    .update({ status: 'active', ...(bot?.bot_token ? { bot_token: bot.bot_token } : {}) })
    .eq('id', group_id);

  logOnboardingAudit(context.supabase, context.user.id, group_id, 'finalizing', 'success');

  // Fetch final group state
  const { data: finalGroup } = await context.supabase
    .from('groups')
    .select('id, name, status, checkout_url, mp_plan_id, render_service_id, created_at')
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
      case 'creating_telegram_group':
        return handleCreatingTelegramGroup(data, context);
      case 'finalizing':
        return handleFinalizing(data, context);
    }
  },
  { allowedRoles: ['super_admin'] },
);
