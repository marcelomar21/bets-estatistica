import { fetchWithRetry } from './fetch-utils';

interface RenderSuccess {
  success: true;
  data: { service_id: string };
}

interface RenderError {
  success: false;
  error: string;
}

type RenderResult = RenderSuccess | RenderError;

interface CreateBotServiceOptions {
  groupId: string;
  botToken: string;
  groupName: string;
  telegramGroupId: number;
  checkoutUrl?: string | null;
}

interface RestartResult {
  success: true;
}

interface RestartError {
  success: false;
  error: string;
}

type RestartBotResult = RestartResult | RestartError;

interface SuspendResult {
  success: true;
}

interface SuspendError {
  success: false;
  error: string;
}

type SuspendBotResult = SuspendResult | SuspendError;

/** Convert MTProto channel ID (positive) to Bot API format (-100 prefix) */
export function toBotApiGroupId(id: number): string {
  return id > 0 ? `-100${id}` : String(id);
}

/**
 * @deprecated Use restartBotService() instead. The project now uses a unified bot
 * (bets-bot-unified) that loads all bots from bot_pool via initBots().
 */
export async function createBotService(
  options: CreateBotServiceOptions,
): Promise<RenderResult> {
  const { groupId, botToken, groupName, telegramGroupId, checkoutUrl } = options;
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'RENDER_API_KEY não configurado' };
  }

  const repoUrl = process.env.RENDER_REPO_URL;
  if (!repoUrl) {
    return { success: false, error: 'RENDER_REPO_URL não configurado' };
  }

  const ownerId = process.env.RENDER_OWNER_ID;
  if (!ownerId) {
    return { success: false, error: 'RENDER_OWNER_ID não configurado' };
  }

  // Central admin group — all bots report to the same admin group
  const centralAdminGroupId = process.env.TELEGRAM_ADMIN_GROUP_ID;
  if (!centralAdminGroupId) {
    return { success: false, error: 'TELEGRAM_ADMIN_GROUP_ID não configurado' };
  }

  try {
    const response = await fetchWithRetry(
      'https://api.render.com/v1/services',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'web_service',
          name: `bot-${groupName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          ownerId,
          repo: repoUrl,
          branch: 'master',
          serviceDetails: {
            env: 'node',
            plan: 'starter',
            region: 'oregon',
            envSpecificDetails: {
              buildCommand: 'npm install',
              startCommand: 'node bot/server.js',
            },
          },
          envVars: [
            { key: 'GROUP_ID', value: groupId },
            { key: 'TELEGRAM_BOT_TOKEN', value: botToken },
            { key: 'TELEGRAM_PUBLIC_GROUP_ID', value: toBotApiGroupId(telegramGroupId) },
            { key: 'TELEGRAM_ADMIN_GROUP_ID', value: centralAdminGroupId },
            { key: 'BOT_MODE', value: 'group' },
            { key: 'SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL || '' },
            { key: 'SUPABASE_SERVICE_KEY', value: process.env.SUPABASE_SERVICE_KEY || '' },
            { key: 'NODE_ENV', value: 'production' },
            ...(checkoutUrl ? [{ key: 'MP_CHECKOUT_URL', value: checkoutUrl }] : []),
          ],
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Erro ao criar serviço no Render' };
    }

    const serviceId = data.service?.id || data.id;
    if (!serviceId) {
      return { success: false, error: 'Render não retornou service ID' };
    }

    return {
      success: true,
      data: { service_id: serviceId },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao conectar com Render',
    };
  }
}

const DEFAULT_UNIFIED_SERVICE_ID = 'srv-d6fliv6a2pns7382ckd0';

/**
 * Restart the unified bot service so it reloads all bots from bot_pool via initBots().
 * Triggers a new deploy (without clearing cache) on the bets-bot-unified service.
 */
export async function restartBotService(): Promise<RestartBotResult> {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'RENDER_API_KEY não configurado' };
  }

  const serviceId = process.env.RENDER_UNIFIED_SERVICE_ID || DEFAULT_UNIFIED_SERVICE_ID;

  try {
    const response = await fetchWithRetry(
      `https://api.render.com/v1/services/${serviceId}/deploys`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clearCache: 'do_not_clear' }),
      },
    );

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.message || 'Erro ao reiniciar bot unificado' };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao conectar com Render',
    };
  }
}

/**
 * Suspend a Render service. Used when deleting/deactivating a group to stop its
 * individual bot service (for legacy groups that still have their own service).
 */
export async function suspendBotService(serviceId: string): Promise<SuspendBotResult> {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'RENDER_API_KEY não configurado' };
  }

  try {
    const response = await fetchWithRetry(
      `https://api.render.com/v1/services/${serviceId}/suspend`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.message || 'Erro ao suspender serviço' };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao conectar com Render',
    };
  }
}
