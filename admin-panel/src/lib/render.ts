interface RenderSuccess {
  success: true;
  data: { service_id: string };
}

interface RenderError {
  success: false;
  error: string;
}

type RenderResult = RenderSuccess | RenderError;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) return response;
      if (attempt === retries) return response;
    } catch (err) {
      if (attempt === retries) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, delay * attempt));
  }
  throw new Error('Max retries reached');
}

export async function createBotService(
  groupId: string,
  botToken: string,
  groupName: string,
): Promise<RenderResult> {
  const apiKey = process.env.RENDER_API_KEY;
  const blueprintId = process.env.RENDER_BLUEPRINT_ID;

  if (!apiKey) {
    return { success: false, error: 'RENDER_API_KEY não configurado' };
  }
  if (!blueprintId) {
    return { success: false, error: 'RENDER_BLUEPRINT_ID não configurado' };
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
          repo: process.env.RENDER_REPO_URL || 'https://github.com/user/bets-estatistica',
          envVars: [
            { key: 'GROUP_ID', value: groupId },
            { key: 'TELEGRAM_BOT_TOKEN', value: botToken },
            { key: 'SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL || '' },
            { key: 'SUPABASE_SERVICE_KEY', value: process.env.SUPABASE_SERVICE_KEY || '' },
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
