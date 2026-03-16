export interface MercadoPagoSuccess {
  success: true;
  data: { planId: string; checkoutUrl: string };
}

export interface MercadoPagoError {
  success: false;
  error: string;
}

export type MercadoPagoResult = MercadoPagoSuccess | MercadoPagoError;

export interface DeactivatePlanSuccess {
  success: true;
}

export interface DeactivatePlanError {
  success: false;
  error: string;
}

export type DeactivatePlanResult = DeactivatePlanSuccess | DeactivatePlanError;

export async function deactivateSubscriptionPlan(
  planId: string,
): Promise<DeactivatePlanResult> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return { success: false, error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado' };
  }

  try {
    const response = await fetch(
      `https://api.mercadopago.com/preapproval_plan/${planId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      },
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        return { success: false, error: 'Credenciais inválidas do Mercado Pago' };
      }

      if (response.status >= 500) {
        return { success: false, error: 'Erro temporário do Mercado Pago. Tente novamente.' };
      }

      return { success: false, error: data.message || 'Erro ao desativar plano de assinatura no Mercado Pago' };
    }

    return { success: true };
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('timeout')) {
      return {
        success: false,
        error: 'Timeout ao conectar com Mercado Pago',
      };
    }

    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao conectar com Mercado Pago',
    };
  }
}

export async function createSubscriptionPlan(
  groupName: string,
  groupId: string,
  price: number,
): Promise<MercadoPagoResult> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return { success: false, error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { success: false, error: 'NEXT_PUBLIC_APP_URL não configurado' };
  }

  if (price <= 0) {
    return { success: false, error: 'Preço deve ser maior que zero' };
  }

  try {
    const response = await fetch(
      'https://api.mercadopago.com/preapproval_plan',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: `Assinatura ${groupName}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: price,
            currency_id: 'BRL',
          },
          external_reference: groupId,
          back_url: `${appUrl}/groups/${groupId}`,
        }),
      },
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Credenciais inválidas do Mercado Pago' };
      }

      if (response.status >= 500) {
        return { success: false, error: 'Erro temporário do Mercado Pago. Tente novamente.' };
      }

      return { success: false, error: data.message || 'Erro ao criar plano de assinatura no Mercado Pago' };
    }

    return {
      success: true,
      data: { planId: data.id, checkoutUrl: data.init_point },
    };
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('timeout')) {
      return {
        success: false,
        error: 'Timeout ao conectar com Mercado Pago',
      };
    }

    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao conectar com Mercado Pago',
    };
  }
}
