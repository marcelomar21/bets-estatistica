/**
 * Mercado Pago Service
 * Tech-Spec: Migração Cakto → Mercado Pago
 *
 * Cliente para API do Mercado Pago.
 * Funções para buscar assinaturas, pagamentos e cancelar assinaturas.
 */
const axios = require('axios');
const logger = require('../../lib/logger');

const MP_API_URL = 'https://api.mercadopago.com';

/**
 * Get authorization headers for MP API
 * @returns {object} Headers with Bearer token
 */
function getHeaders() {
  const accessToken = process.env.MP_ACCESS_TOKEN;

  if (!accessToken) {
    logger.error('[mercadoPago] MP_ACCESS_TOKEN not configured');
    throw new Error('MP_ACCESS_TOKEN not configured');
  }

  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Fetch subscription (preapproval) details from Mercado Pago
 * @param {string} subscriptionId - Preapproval ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getSubscription(subscriptionId) {
  try {
    if (!subscriptionId) {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'subscriptionId is required' }
      };
    }

    const response = await axios.get(
      `${MP_API_URL}/preapproval/${subscriptionId}`,
      { headers: getHeaders(), timeout: 10000 }
    );

    logger.debug('[mercadoPago] getSubscription: success', {
      subscriptionId,
      status: response.data?.status
    });

    return { success: true, data: response.data };
  } catch (err) {
    const statusCode = err.response?.status;
    const message = err.response?.data?.message || err.message;

    if (statusCode === 404) {
      logger.warn('[mercadoPago] getSubscription: not found', { subscriptionId });
      return {
        success: false,
        error: { code: 'SUBSCRIPTION_NOT_FOUND', message: `Subscription ${subscriptionId} not found` }
      };
    }

    logger.error('[mercadoPago] getSubscription: API error', {
      subscriptionId,
      statusCode,
      message
    });

    return {
      success: false,
      error: { code: 'MP_API_ERROR', message, statusCode }
    };
  }
}

/**
 * Fetch authorized payment details from Mercado Pago (for subscription payments)
 * @param {string|number} authorizedPaymentId - Authorized Payment ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getAuthorizedPayment(authorizedPaymentId) {
  try {
    if (!authorizedPaymentId) {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'authorizedPaymentId is required' }
      };
    }

    const response = await axios.get(
      `${MP_API_URL}/authorized_payments/${authorizedPaymentId}`,
      { headers: getHeaders(), timeout: 10000 }
    );

    logger.debug('[mercadoPago] getAuthorizedPayment: success', {
      authorizedPaymentId,
      status: response.data?.status
    });

    return { success: true, data: response.data };
  } catch (err) {
    const statusCode = err.response?.status;
    const message = err.response?.data?.message || err.message;

    if (statusCode === 404) {
      logger.warn('[mercadoPago] getAuthorizedPayment: not found', { authorizedPaymentId });
      return {
        success: false,
        error: { code: 'AUTHORIZED_PAYMENT_NOT_FOUND', message: `Authorized payment ${authorizedPaymentId} not found` }
      };
    }

    logger.error('[mercadoPago] getAuthorizedPayment: API error', {
      authorizedPaymentId,
      statusCode,
      message
    });

    return {
      success: false,
      error: { code: 'MP_API_ERROR', message, statusCode }
    };
  }
}

/**
 * Fetch payment details from Mercado Pago
 * @param {string|number} paymentId - Payment ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getPayment(paymentId) {
  try {
    if (!paymentId) {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'paymentId is required' }
      };
    }

    const response = await axios.get(
      `${MP_API_URL}/v1/payments/${paymentId}`,
      { headers: getHeaders(), timeout: 10000 }
    );

    logger.debug('[mercadoPago] getPayment: success', {
      paymentId,
      status: response.data?.status
    });

    return { success: true, data: response.data };
  } catch (err) {
    const statusCode = err.response?.status;
    const message = err.response?.data?.message || err.message;

    if (statusCode === 404) {
      logger.warn('[mercadoPago] getPayment: not found', { paymentId });
      return {
        success: false,
        error: { code: 'PAYMENT_NOT_FOUND', message: `Payment ${paymentId} not found` }
      };
    }

    logger.error('[mercadoPago] getPayment: API error', {
      paymentId,
      statusCode,
      message
    });

    return {
      success: false,
      error: { code: 'MP_API_ERROR', message, statusCode }
    };
  }
}

/**
 * Fetch customer (payer) details from Mercado Pago
 * Used to get email when subscription doesn't have payer_email
 * @param {string|number} customerId - Customer/Payer ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getCustomer(customerId) {
  try {
    if (!customerId) {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'customerId is required' }
      };
    }

    const response = await axios.get(
      `${MP_API_URL}/v1/customers/${customerId}`,
      { headers: getHeaders(), timeout: 10000 }
    );

    logger.debug('[mercadoPago] getCustomer: success', {
      customerId,
      email: response.data?.email
    });

    return { success: true, data: response.data };
  } catch (err) {
    const statusCode = err.response?.status;
    const message = err.response?.data?.message || err.message;

    if (statusCode === 404) {
      logger.warn('[mercadoPago] getCustomer: not found', { customerId });
      return {
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: `Customer ${customerId} not found` }
      };
    }

    logger.error('[mercadoPago] getCustomer: API error', {
      customerId,
      statusCode,
      message
    });

    return {
      success: false,
      error: { code: 'MP_API_ERROR', message, statusCode }
    };
  }
}

/**
 * Cancel a subscription in Mercado Pago
 * @param {string} subscriptionId - Preapproval ID to cancel
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function cancelSubscription(subscriptionId) {
  try {
    if (!subscriptionId) {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'subscriptionId is required' }
      };
    }

    const response = await axios.put(
      `${MP_API_URL}/preapproval/${subscriptionId}`,
      { status: 'cancelled' },
      { headers: getHeaders(), timeout: 10000 }
    );

    logger.info('[mercadoPago] cancelSubscription: success', { subscriptionId });

    return { success: true, data: response.data };
  } catch (err) {
    const statusCode = err.response?.status;
    const message = err.response?.data?.message || err.message;

    logger.error('[mercadoPago] cancelSubscription: API error', {
      subscriptionId,
      statusCode,
      message
    });

    return {
      success: false,
      error: { code: 'MP_API_ERROR', message, statusCode }
    };
  }
}

/**
 * Extract coupon code from subscription or payment data
 * MP can include coupon info in different fields depending on the flow
 * @param {object} data - Subscription or payment data from MP
 * @returns {string|null} Coupon code if found
 */
function extractCouponCode(data) {
  if (!data) return null;

  // Try different possible locations for coupon code
  return data.coupon_code
    || data.coupon_id
    || data.metadata?.coupon_code
    || data.additional_info?.coupon_code
    || data.external_reference // Some integrations pass coupon in external_reference
    || null;
}

/**
 * Map MP payment method to internal format
 * @param {string} mpMethod - Payment method ID from MP
 * @returns {string} Internal payment method name
 */
function mapPaymentMethod(mpMethod) {
  if (!mpMethod) return 'cartao_recorrente';

  const map = {
    'visa': 'cartao_recorrente',
    'master': 'cartao_recorrente',
    'amex': 'cartao_recorrente',
    'elo': 'cartao_recorrente',
    'hipercard': 'cartao_recorrente',
    'diners': 'cartao_recorrente',
    'pix': 'pix',
    'bolbradesco': 'boleto',
    'pec': 'boleto',
    'account_money': 'mercadopago_saldo'
  };

  return map[mpMethod.toLowerCase()] || 'cartao_recorrente';
}

module.exports = {
  getSubscription,
  getAuthorizedPayment,
  getPayment,
  getCustomer,
  cancelSubscription,
  extractCouponCode,
  mapPaymentMethod
};
