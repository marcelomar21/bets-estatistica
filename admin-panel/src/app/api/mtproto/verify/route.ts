import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Api } from 'telegram';
import { createApiHandler } from '@/middleware/api-handler';
import { encrypt } from '@/lib/encryption';
import { logAudit } from '@/lib/audit';
import { pendingSetups } from '../setup/route';

const verifySchema = z.object({
  setup_token: z.string().uuid('Token inválido'),
  code: z.string().min(4, 'Código deve ter pelo menos 4 dígitos').max(6, 'Código deve ter no máximo 6 dígitos'),
  password: z.string().optional(),
});

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

    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map(e => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { setup_token, code, password } = parsed.data;

    const setup = pendingSetups.get(setup_token);
    if (!setup) {
      return NextResponse.json(
        { success: false, error: { code: 'MTPROTO_SETUP_EXPIRED', message: 'Token de setup expirado ou inválido. Inicie novamente.' } },
        { status: 400 },
      );
    }

    // Rate limit: max 5 attempts per setup_token
    if (setup.attempts >= 5) {
      setup.client.disconnect().catch(() => {});
      pendingSetups.delete(setup_token);
      return NextResponse.json(
        { success: false, error: { code: 'MTPROTO_VERIFICATION_FAILED', message: 'Máximo de tentativas atingido. Inicie novamente.' } },
        { status: 429 },
      );
    }

    // Check TTL (5 minutes)
    if (Date.now() - setup.createdAt > 5 * 60 * 1000) {
      setup.client.disconnect().catch(() => {});
      pendingSetups.delete(setup_token);
      return NextResponse.json(
        { success: false, error: { code: 'MTPROTO_SETUP_EXPIRED', message: 'Setup expirou (5 min). Inicie novamente.' } },
        { status: 400 },
      );
    }

    setup.attempts++;

    try {
      try {
        await setup.client.invoke(
          new Api.auth.SignIn({
            phoneNumber: setup.phoneNumber,
            phoneCodeHash: setup.phoneHash,
            phoneCode: code,
          }),
        );
      } catch (signInError) {
        // Check if 2FA is required
        if (signInError instanceof Error && signInError.message.includes('SESSION_PASSWORD_NEEDED')) {
          if (!password) {
            return NextResponse.json(
              { success: false, error: { code: 'MTPROTO_2FA_REQUIRED', message: 'Senha 2FA necessária' } },
              { status: 400 },
            );
          }

          const passwordResult = await setup.client.invoke(new Api.account.GetPassword());
          await setup.client.invoke(
            new Api.auth.CheckPassword({
              password: await setup.client.computePasswordCheck(passwordResult, password),
            }),
          );
        } else {
          throw signInError;
        }
      }

      // Extract session string
      const sessionString = (setup.client.session as { save: () => string }).save();
      const encryptedSession = encrypt(sessionString);

      // Save to database
      const { data: savedSession, error: dbError } = await context.supabase
        .from('mtproto_sessions')
        .upsert(
          {
            phone_number: setup.phoneNumber,
            session_string: encryptedSession,
            key_version: 1,
            label: `founder_${context.user.email.split('@')[0]}`,
            is_active: true,
            requires_reauth: false,
            locked_at: null,
            locked_by: null,
            last_used_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'phone_number' },
        )
        .select('id, phone_number, label')
        .single();

      if (dbError || !savedSession) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'DB_ERROR', message: dbError?.message || 'Falha ao salvar sessão' },
          },
          { status: 500 },
        );
      }

      // Cleanup
      await setup.client.disconnect();
      pendingSetups.delete(setup_token);

      logAudit(context.supabase, context.user.id, savedSession.id, 'mtproto_sessions', 'session_created', {
        phone_number: setup.phoneNumber,
        label: savedSession.label,
      });

      return NextResponse.json({
        success: true,
        data: {
          session_id: savedSession.id,
          label: savedSession.label,
          phone_number: savedSession.phone_number,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha na verificação';
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MTPROTO_VERIFICATION_FAILED', message },
        },
        { status: 400 },
      );
    }
  },
  { allowedRoles: ['super_admin'] },
);
