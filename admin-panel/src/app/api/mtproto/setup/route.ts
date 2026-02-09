import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TelegramClient, sessions } from 'telegram';

const { StringSession } = sessions;
import { createApiHandler } from '@/middleware/api-handler';
import { logAudit } from '@/lib/audit';

const setupSchema = z.object({
  phone_number: z.string().regex(/^\+\d{10,15}$/, 'Formato internacional inválido (ex: +5511999999999)'),
});

// In-memory store for pending setup flows (TTL managed manually).
// LIMITATION: GramJS client instances hold TCP connections and cannot be serialized,
// so setup→verify must hit the same process. This works on single-process deployments
// (Docker, VPS, `next start`) but NOT on serverless (Vercel, Lambda) where each
// request may land on a different instance. For serverless, migrate to a long-lived
// worker process that holds GramJS clients and communicates via a queue/webhook.
const pendingSetups = new Map<string, {
  client: TelegramClient;
  phoneHash: string;
  phoneNumber: string;
  attempts: number;
  createdAt: number;
}>();

// Clean up expired setups (5 minute TTL)
function cleanupExpired() {
  const now = Date.now();
  for (const [token, setup] of pendingSetups) {
    if (now - setup.createdAt > 5 * 60 * 1000) {
      setup.client.disconnect().catch(() => {});
      pendingSetups.delete(token);
    }
  }
}

export { pendingSetups };

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

    const parsed = setupSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map(e => e.message).join(', ');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message } },
        { status: 400 },
      );
    }

    const { phone_number } = parsed.data;

    // Clean up expired setups
    cleanupExpired();

    try {
      const setupToken = crypto.randomUUID();
      const client = new TelegramClient(
        new StringSession(''),
        Number(process.env.TELEGRAM_API_ID),
        process.env.TELEGRAM_API_HASH!,
        { connectionRetries: 3 },
      );

      await client.connect();

      const sendCodeResult = await client.invoke(
        new (await import('telegram')).Api.auth.SendCode({
          phoneNumber: phone_number,
          apiId: Number(process.env.TELEGRAM_API_ID),
          apiHash: process.env.TELEGRAM_API_HASH!,
          settings: new (await import('telegram')).Api.CodeSettings({}),
        }),
      );

      pendingSetups.set(setupToken, {
        client,
        phoneHash: sendCodeResult.phoneCodeHash,
        phoneNumber: phone_number,
        attempts: 0,
        createdAt: Date.now(),
      });

      logAudit(context.supabase, context.user.id, setupToken, 'mtproto_sessions', 'setup_initiated', { phone_number });

      return NextResponse.json({
        success: true,
        data: { setup_token: setupToken, phone_hash: sendCodeResult.phoneCodeHash },
      });
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MTPROTO_SETUP_FAILED',
            message: err instanceof Error ? err.message : 'Falha ao iniciar setup MTProto',
          },
        },
        { status: 500 },
      );
    }
  },
  { allowedRoles: ['super_admin'] },
);
