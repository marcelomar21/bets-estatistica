export interface TelegramGetMeResult {
  success: true;
  data: { username: string };
}

export interface TelegramError {
  success: false;
  error: string;
}

export type TelegramResult = TelegramGetMeResult | TelegramError;

export async function validateBotToken(token: string): Promise<TelegramResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();

    if (!data.ok) {
      return { success: false, error: data.description || 'Token inválido' };
    }

    return {
      success: true,
      data: { username: data.result.username },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao validar token do bot',
    };
  }
}
