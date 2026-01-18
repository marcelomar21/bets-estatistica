/**
 * Webhook Processors - Event handlers for Cakto webhooks
 * Story 16.3: Implementar Processamento Assíncrono de Webhooks
 *
 * Handles different webhook event types from Cakto payment platform.
 * Each handler processes a specific event type and updates member status accordingly.
 */
const logger = require('../../lib/logger');
const {
  getMemberByEmail,
  activateMember,
  renewMemberSubscription,
  markMemberAsDefaulted,
  createActiveMember,
} = require('./memberService');

/**
 * Normalize payment method from Cakto format to our format
 * Cakto uses: credit_card, pix, boleto, picpay, etc.
 * @param {string} caktoMethod - Payment method from Cakto
 * @returns {string} - Normalized payment method
 */
function normalizePaymentMethod(caktoMethod) {
  const methodMap = {
    'credit_card': 'cartao_recorrente',
    'debit_card': 'cartao_recorrente',
    'pix': 'pix',
    'boleto': 'boleto',
    'bank_slip': 'boleto',
    'picpay': 'pix',
  };
  return methodMap[caktoMethod?.toLowerCase()] || 'cartao_recorrente';
}

// Simple email regex for basic validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - true if valid email format
 */
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

/**
 * Extract customer email from Cakto webhook payload
 * Cakto Order structure: { customer: { email: "...", name: "..." }, ... }
 * @param {object} payload - Webhook payload (Cakto Order object)
 * @returns {string|null} - Email or null if not found or invalid
 */
function extractEmail(payload) {
  // Cakto Order structure - customer.email is the primary location
  // Also handle wrapped payloads for flexibility
  const email = payload?.customer?.email
    || payload?.data?.customer?.email
    || payload?.email
    || null;

  // Validate email format if found
  if (email && !isValidEmail(email)) {
    logger.warn('[webhookProcessors] extractEmail: invalid email format', { email });
    return null;
  }

  return email;
}

/**
 * Extract subscription data from Cakto Order payload
 * Cakto Order structure:
 * {
 *   id: "order_uuid",
 *   subscription: "subscription_uuid",
 *   paymentMethod: "credit_card",
 *   customer: { id: "...", email: "...", name: "..." },
 *   product: { id: "...", name: "...", type: "subscription" },
 *   ...
 * }
 * @param {object} payload - Webhook payload (Cakto Order object)
 * @returns {object} - Subscription data
 */
function extractSubscriptionData(payload) {
  // Cakto uses flat structure for subscription reference
  const orderId = payload?.id || payload?.data?.id || null;
  const subscriptionId = payload?.subscription || payload?.data?.subscription || null;
  const customerId = payload?.customer?.id || payload?.data?.customer?.id || null;
  const paymentMethod = payload?.paymentMethod || payload?.data?.paymentMethod || null;

  return {
    subscriptionId: subscriptionId || orderId, // Use order ID as fallback
    customerId: customerId,
    paymentMethod: normalizePaymentMethod(paymentMethod),
  };
}

/**
 * Handle purchase_approved event (AC2)
 * Creates or activates a member when payment is approved
 * @param {object} payload - Webhook event payload
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function handlePurchaseApproved(payload) {
  logger.info('[webhookProcessors] handlePurchaseApproved: processing', {
    payloadKeys: Object.keys(payload || {})
  });

  try {
    const email = extractEmail(payload);
    if (!email) {
      logger.warn('[webhookProcessors] handlePurchaseApproved: no email in payload');
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'No email found in payload' }
      };
    }

    const subscriptionData = extractSubscriptionData(payload);

    // Try to find existing member by email
    const memberResult = await getMemberByEmail(email);

    if (memberResult.success) {
      // Member exists - activate them
      const member = memberResult.data;
      logger.info('[webhookProcessors] handlePurchaseApproved: activating existing member', {
        memberId: member.id,
        email,
        currentStatus: member.status
      });

      const activateResult = await activateMember(member.id, subscriptionData);
      return activateResult;
    }

    // Member doesn't exist - create as active (payment before trial)
    if (memberResult.error?.code === 'MEMBER_NOT_FOUND') {
      logger.info('[webhookProcessors] handlePurchaseApproved: creating new active member', { email });

      const createResult = await createActiveMember({
        email,
        subscriptionData
      });
      return createResult;
    }

    // Other error
    return memberResult;

  } catch (err) {
    logger.error('[webhookProcessors] handlePurchaseApproved: error', { error: err.message });
    return {
      success: false,
      error: { code: 'HANDLER_ERROR', message: err.message }
    };
  }
}

/**
 * Handle subscription_created event
 * Similar to purchase_approved - creates or activates a member
 * @param {object} payload - Webhook event payload
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function handleSubscriptionCreated(payload) {
  logger.info('[webhookProcessors] handleSubscriptionCreated: processing');

  // Delegate to purchase_approved handler - same logic
  return handlePurchaseApproved(payload);
}

/**
 * Handle subscription_renewed event (AC3)
 * Extends subscription and reactivates from inadimplente if needed
 * @param {object} payload - Webhook event payload
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function handleSubscriptionRenewed(payload) {
  logger.info('[webhookProcessors] handleSubscriptionRenewed: processing');

  try {
    const email = extractEmail(payload);
    if (!email) {
      logger.warn('[webhookProcessors] handleSubscriptionRenewed: no email in payload');
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'No email found in payload' }
      };
    }

    // Find member by email
    const memberResult = await getMemberByEmail(email);
    if (!memberResult.success) {
      logger.warn('[webhookProcessors] handleSubscriptionRenewed: member not found', { email });
      return memberResult;
    }

    const member = memberResult.data;
    logger.info('[webhookProcessors] handleSubscriptionRenewed: renewing member', {
      memberId: member.id,
      email,
      currentStatus: member.status
    });

    // Renew subscription
    const renewResult = await renewMemberSubscription(member.id);
    return renewResult;

  } catch (err) {
    logger.error('[webhookProcessors] handleSubscriptionRenewed: error', { error: err.message });
    return {
      success: false,
      error: { code: 'HANDLER_ERROR', message: err.message }
    };
  }
}

/**
 * Handle subscription_renewal_refused event (AC4)
 * Marks member as inadimplente when renewal fails
 * @param {object} payload - Webhook event payload
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function handleRenewalRefused(payload) {
  logger.info('[webhookProcessors] handleRenewalRefused: processing');

  try {
    const email = extractEmail(payload);
    if (!email) {
      logger.warn('[webhookProcessors] handleRenewalRefused: no email in payload');
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'No email found in payload' }
      };
    }

    // Find member by email
    const memberResult = await getMemberByEmail(email);
    if (!memberResult.success) {
      logger.warn('[webhookProcessors] handleRenewalRefused: member not found', { email });
      return memberResult;
    }

    const member = memberResult.data;

    // Only mark as defaulted if currently active
    if (member.status !== 'ativo') {
      logger.info('[webhookProcessors] handleRenewalRefused: member not active, skipping', {
        memberId: member.id,
        currentStatus: member.status
      });
      return { success: true, data: { skipped: true, reason: 'not_active' } };
    }

    logger.info('[webhookProcessors] handleRenewalRefused: marking member as defaulted', {
      memberId: member.id,
      email
    });

    const defaultResult = await markMemberAsDefaulted(member.id);
    return defaultResult;

  } catch (err) {
    logger.error('[webhookProcessors] handleRenewalRefused: error', { error: err.message });
    return {
      success: false,
      error: { code: 'HANDLER_ERROR', message: err.message }
    };
  }
}

/**
 * Handle subscription_canceled event (AC4)
 * Marks member as inadimplente when subscription is canceled
 * @param {object} payload - Webhook event payload
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function handleSubscriptionCanceled(payload) {
  logger.info('[webhookProcessors] handleSubscriptionCanceled: processing');

  // Same logic as renewal refused
  return handleRenewalRefused(payload);
}

/**
 * Webhook handler registry
 * Maps event types to their handler functions
 */
const WEBHOOK_HANDLERS = {
  'purchase_approved': handlePurchaseApproved,
  'subscription_created': handleSubscriptionCreated,
  'subscription_renewed': handleSubscriptionRenewed,
  'subscription_renewal_refused': handleRenewalRefused,
  'subscription_canceled': handleSubscriptionCanceled,
};

/**
 * Process a webhook event by delegating to the appropriate handler
 * @param {object} event - Webhook event object
 * @param {string} event.event_type - Type of the webhook event
 * @param {object} event.payload - Event payload data
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function processWebhookEvent({ event_type, payload }) {
  logger.info('[webhookProcessors] processWebhookEvent: received', { eventType: event_type });

  const handler = WEBHOOK_HANDLERS[event_type];

  if (!handler) {
    logger.warn('[webhookProcessors] processWebhookEvent: unknown event type', { eventType: event_type });
    return {
      success: false,
      error: {
        code: 'UNKNOWN_EVENT_TYPE',
        message: `Unknown event type: ${event_type}`
      }
    };
  }

  try {
    const result = await handler(payload);
    logger.info('[webhookProcessors] processWebhookEvent: completed', {
      eventType: event_type,
      success: result.success
    });
    return result;
  } catch (err) {
    logger.error('[webhookProcessors] processWebhookEvent: handler error', {
      eventType: event_type,
      error: err.message
    });
    return {
      success: false,
      error: { code: 'HANDLER_ERROR', message: err.message }
    };
  }
}

module.exports = {
  // Main entry point
  processWebhookEvent,

  // Handler registry
  WEBHOOK_HANDLERS,

  // Individual handlers (for testing)
  handlePurchaseApproved,
  handleSubscriptionCreated,
  handleSubscriptionRenewed,
  handleRenewalRefused,
  handleSubscriptionCanceled,

  // Utility functions (for testing)
  normalizePaymentMethod,
  extractEmail,
  extractSubscriptionData,
};
