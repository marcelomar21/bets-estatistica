import { fetchWithRetry } from './fetch-utils';

interface MercadoPagoSuccess {
  success: true;
  data: { id: string; checkout_url: string };
}

interface MercadoPagoError {
  success: false;
  error: string;
}

type MercadoPagoResult = MercadoPagoSuccess | MercadoPagoError;

export async function createCheckoutPreference(
  groupName: string,
  groupId: string,
  price: number,
): Promise<MercadoPagoResult> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return { success: false, error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado' };
  }

  try {
    const response = await fetchWithRetry(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              title: `Assinatura ${groupName}`,
              quantity: 1,
              currency_id: 'BRL',
              unit_price: price,
            },
          ],
          external_reference: groupId,
          auto_return: 'approved',
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Erro ao criar preferência no Mercado Pago' };
    }

    return {
      success: true,
      data: { id: data.id, checkout_url: data.init_point },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao conectar com Mercado Pago',
    };
  }
}
