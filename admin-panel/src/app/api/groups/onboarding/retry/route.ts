import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createApiHandler } from '@/middleware/api-handler';
import { validateBotToken } from '@/lib/telegram';
import { createCheckoutPreference } from '@/lib/mercadopago';
import { createBotService } from '@/lib/render';
import type { OnboardingStep } from '@/types/database';

const retrySchema = z.object({
  group_id: z.string().uuid('ID do grupo inválido'),
  step: z.enum([
    'creating',
    'validating_bot',
    'configuring_mp',
    'deploying_bot',
    'creating_admin',
    'finalizing',
  ] as const),
});

const STEP_ORDER: OnboardingStep[] = [
  'creating',
  'validating_bot',
  'configuring_mp',
  'deploying_bot',
  'creating_admin',
  'finalizing',
];

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

    const parsed = retrySchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((e) => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { group_id, step } = parsed.data;

    // Validate group exists and is failed
    const { data: group, error: groupError } = await context.supabase
      .from('groups')
      .select('id, name, status, mp_product_id, checkout_url, render_service_id')
      .eq('id', group_id)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Grupo não encontrado' } },
        { status: 400 },
      );
    }

    if (group.status !== 'failed') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Grupo não está em estado de falha' } },
        { status: 400 },
      );
    }

    // Find associated bot
    const { data: bot } = await context.supabase
      .from('bot_pool')
      .select('id, bot_token, bot_username, status')
      .eq('group_id', group_id)
      .single();

    // Find available bot if none associated yet
    let botData = bot;
    if (!botData) {
      const { data: availableBot } = await context.supabase
        .from('bot_pool')
        .select('id, bot_token, bot_username, status')
        .eq('status', 'available')
        .limit(1)
        .single();
      botData = availableBot;
    }

    if (!botData) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Nenhum bot disponível para retry' } },
        { status: 400 },
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    // Audit log helper (non-blocking)
    function logAudit(stepName: string, status: string, error?: string) {
      context.supabase.from('audit_log').insert({
        table_name: 'groups',
        record_id: group_id,
        action: 'onboarding_retry',
        changed_by: context.user.id,
        changes: { step: stepName, status, ...(error ? { error } : {}) },
      }).then(({ error: auditErr }) => {
        if (auditErr) console.warn('[audit_log] Failed to insert retry audit', group_id, auditErr.message);
      });
    }

    const startIndex = STEP_ORDER.indexOf(step);
    let currentStep: OnboardingStep = step;

    try {
      // Execute steps from the failed step onwards
      for (let i = startIndex; i < STEP_ORDER.length; i++) {
        currentStep = STEP_ORDER[i];

        switch (currentStep) {
          case 'validating_bot': {
            const telegramResult = await validateBotToken(botData.bot_token);
            if (!telegramResult.success) {
              await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
              logAudit(currentStep, 'error', telegramResult.error);
              return NextResponse.json(
                {
                  success: false,
                  error: {
                    code: 'ONBOARDING_FAILED',
                    message: `Falha ao validar bot: ${telegramResult.error}`,
                    step: currentStep,
                    group_id,
                  },
                },
                { status: 500 },
              );
            }
            if (telegramResult.data.username !== botData.bot_username) {
              await context.supabase
                .from('bot_pool')
                .update({ bot_username: telegramResult.data.username })
                .eq('id', botData.id);
            }
            logAudit(currentStep, 'success');
            break;
          }

          case 'configuring_mp': {
            if (!group.mp_product_id) {
              const mpResult = await createCheckoutPreference(group.name, group_id);
              if (!mpResult.success) {
                await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
                logAudit(currentStep, 'error', mpResult.error);
                return NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: 'ONBOARDING_FAILED',
                      message: `Falha ao configurar Mercado Pago: ${mpResult.error}`,
                      step: currentStep,
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
            }
            logAudit(currentStep, 'success');
            break;
          }

          case 'deploying_bot': {
            if (!group.render_service_id) {
              const renderResult = await createBotService(group_id, botData.bot_token, group.name);
              if (!renderResult.success) {
                await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
                logAudit(currentStep, 'error', renderResult.error);
                return NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: 'ONBOARDING_FAILED',
                      message: `Falha ao fazer deploy do bot: ${renderResult.error}`,
                      step: currentStep,
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
            }
            logAudit(currentStep, 'success');
            break;
          }

          case 'creating_admin': {
            const { data: existingAdmin } = await supabaseAdmin
              .from('admin_users')
              .select('id')
              .eq('group_id', group_id)
              .single();

            if (!existingAdmin) {
              return NextResponse.json(
                {
                  success: false,
                  error: {
                    code: 'ONBOARDING_FAILED',
                    message: 'Não é possível recriar admin sem email. Execute o onboarding completo novamente.',
                    step: currentStep,
                    group_id,
                  },
                },
                { status: 400 },
              );
            }
            logAudit(currentStep, 'success');
            break;
          }

          case 'finalizing': {
            if (botData.status === 'available') {
              await context.supabase
                .from('bot_pool')
                .update({ status: 'in_use', group_id })
                .eq('id', botData.id);
            }

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

            await context.supabase
              .from('groups')
              .update({ status: 'active' })
              .eq('id', group_id);

            logAudit(currentStep, 'success');
            break;
          }

          case 'creating':
            // Group already exists for retry - skip
            logAudit(currentStep, 'success');
            break;
        }
      }

      // Fetch final state
      const { data: finalGroup } = await context.supabase
        .from('groups')
        .select('id, name, status, checkout_url, mp_product_id, render_service_id, created_at')
        .eq('id', group_id)
        .single();

      return NextResponse.json({
        success: true,
        data: { group: finalGroup },
      });
    } catch (err) {
      await context.supabase.from('groups').update({ status: 'failed' }).eq('id', group_id);
      logAudit(currentStep, 'error', err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  },
  { allowedRoles: ['super_admin'] },
);
