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
  reactivateRemovedMember,
} = require('./memberService');
const { sendPaymentConfirmation } = require('../handlers/memberEvents');
const { sendReactivationNotification } = require('./notificationService');

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
 * Extract affiliate code from Cakto webhook payload
 * Story 18: Affiliate tracking from webhook
 *
 * The webhook contains affiliate info in two places:
 * - payload.affiliate: affiliate's EMAIL (e.g., "affiliate@example.com")
 * - payload.checkoutUrl: contains affiliate CODE (e.g., "?affiliate=5ZSwLuCf")
 *
 * We extract the CODE from checkoutUrl since that's what we store in member records.
 *
 * @param {object} payload - Webhook payload (Cakto Order object)
 * @returns {string|null} - Affiliate code or null if not found
 */
function extractAffiliateCode(payload) {
  // Try to extract from checkoutUrl first (contains the actual code)
  const checkoutUrl = payload?.checkoutUrl || payload?.data?.checkoutUrl || null;

  if (checkoutUrl) {
    try {
      const url = new URL(checkoutUrl);
      const affiliateCode = url.searchParams.get('affiliate');
      if (affiliateCode) {
        logger.debug('[webhookProcessors] extractAffiliateCode: found in checkoutUrl', { affiliateCode });
        return affiliateCode;
      }
    } catch (err) {
      logger.warn('[webhookProcessors] extractAffiliateCode: invalid checkoutUrl', { checkoutUrl });
    }
  }

  // Fallback: check if affiliate field exists (this is the email, not code)
  // We log it for debugging but can't use it as the code
  const affiliateEmail = payload?.affiliate || payload?.data?.affiliate || null;
  if (affiliateEmail && !checkoutUrl) {
    logger.debug('[webhookProcessors] extractAffiliateCode: has affiliate email but no code in URL', { affiliateEmail });
  }

  return null;
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

    // Story 18: Extract affiliate code from webhook payload
    const affiliateCode = extractAffiliateCode(payload);
    if (affiliateCode) {
      logger.info('[webhookProcessors] handlePurchaseApproved: affiliate code found', { affiliateCode });
    }

    // Try to find existing member by email
    const memberResult = await getMemberByEmail(email);

    if (memberResult.success) {
      // Member exists - check status to determine action
      const member = memberResult.data;
      logger.info('[webhookProcessors] handlePurchaseApproved: processing existing member', {
        memberId: member.id,
        email,
        currentStatus: member.status
      });

      // Story 16.10 AC6: Idempotency - detect already reactivated member
      // If member is 'ativo' and was recently reactivated, skip processing to avoid duplicates
      const wasRecentlyReactivated = member.status === 'ativo'
        && member.notes?.includes('Reativado após pagamento');

      if (wasRecentlyReactivated) {
        logger.info('[webhookProcessors] handlePurchaseApproved: idempotency - member already reactivated', {
          memberId: member.id,
          email
        });
        return { success: true, data: { skipped: true, reason: 'already_reactivated' } };
      }

      // Story 16.10: Handle reactivation of removed members
      if (member.status === 'removido') {
        logger.info('[webhookProcessors] handlePurchaseApproved: reactivating removed member', {
          memberId: member.id,
          email
        });

        const reactivateResult = await reactivateRemovedMember(member.id, {
          subscriptionId: subscriptionData.subscriptionId,
          paymentMethod: subscriptionData.paymentMethod
        });

        // Send reactivation notification with invite link if reactivation succeeded
        if (reactivateResult.success && reactivateResult.data?.telegram_id) {
          try {
            await sendReactivationNotification(
              reactivateResult.data.telegram_id,
              reactivateResult.data.id
            );
          } catch (notifErr) {
            // Don't fail the webhook processing if notification fails
            logger.warn('[webhookProcessors] handlePurchaseApproved: reactivation notification failed', {
              memberId: reactivateResult.data.id,
              error: notifErr.message
            });
          }
        } else if (reactivateResult.success && !reactivateResult.data?.telegram_id) {
          // AC4: Member without telegram_id - note is already added in reactivateRemovedMember
          logger.info('[webhookProcessors] handlePurchaseApproved: reactivated member without telegram_id', {
            memberId: reactivateResult.data.id
          });
        }

        return reactivateResult;
      }

      // Normal activation flow for non-removed members
      const activateResult = await activateMember(member.id, subscriptionData);

      // Send payment confirmation if activation succeeded and member has telegram_id
      if (activateResult.success && activateResult.data?.telegram_id) {
        try {
          await sendPaymentConfirmation(
            activateResult.data.telegram_id,
            activateResult.data.id,
            activateResult.data.subscription_ends_at
          );
        } catch (notifErr) {
          // Don't fail the webhook processing if notification fails
          logger.warn('[webhookProcessors] handlePurchaseApproved: payment confirmation failed', {
            memberId: activateResult.data.id,
            error: notifErr.message
          });
        }
      }

      return activateResult;
    }

    // Member doesn't exist - create as active (payment before trial)
    if (memberResult.error?.code === 'MEMBER_NOT_FOUND') {
      logger.info('[webhookProcessors] handlePurchaseApproved: creating new active member', { email });

      const createResult = await createActiveMember({
        email,
        subscriptionData,
        affiliateCode  // Story 18: Pass affiliate code from webhook
      });

      // Send payment confirmation if creation succeeded and member has telegram_id
      if (createResult.success && createResult.data?.telegram_id) {
        try {
          await sendPaymentConfirmation(
            createResult.data.telegram_id,
            createResult.data.id,
            createResult.data.subscription_ends_at
          );
        } catch (notifErr) {
          logger.warn('[webhookProcessors] handlePurchaseApproved: payment confirmation failed (new member)', {
            memberId: createResult.data.id,
            error: notifErr.message
          });
        }
      }

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
    logger.info('[webhookProcessors] handleSubscriptionRenewed: processing member', {
      memberId: member.id,
      email,
      currentStatus: member.status
    });

    // Story 16.10 AC6: Idempotency - detect already reactivated member
    const wasRecentlyReactivated = member.status === 'ativo'
      && member.notes?.includes('Reativado após pagamento');

    if (wasRecentlyReactivated) {
      logger.info('[webhookProcessors] handleSubscriptionRenewed: idempotency - member already reactivated', {
        memberId: member.id,
        email
      });
      return { success: true, data: { skipped: true, reason: 'already_reactivated' } };
    }

    // Story 16.10: Handle reactivation of removed members (AC2)
    if (member.status === 'removido') {
      logger.info('[webhookProcessors] handleSubscriptionRenewed: reactivating removed member', {
        memberId: member.id,
        email
      });

      const subscriptionData = extractSubscriptionData(payload);
      const reactivateResult = await reactivateRemovedMember(member.id, {
        subscriptionId: subscriptionData.subscriptionId,
        paymentMethod: subscriptionData.paymentMethod
      });

      // Send reactivation notification with invite link if reactivation succeeded
      if (reactivateResult.success && reactivateResult.data?.telegram_id) {
        try {
          await sendReactivationNotification(
            reactivateResult.data.telegram_id,
            reactivateResult.data.id
          );
        } catch (notifErr) {
          logger.warn('[webhookProcessors] handleSubscriptionRenewed: reactivation notification failed', {
            memberId: reactivateResult.data.id,
            error: notifErr.message
          });
        }
      }

      return reactivateResult;
    }

    // Normal renewal flow for non-removed members
    const renewResult = await renewMemberSubscription(member.id);

    // Send payment confirmation if renewal succeeded and member has telegram_id
    if (renewResult.success && renewResult.data?.telegram_id) {
      try {
        await sendPaymentConfirmation(
          renewResult.data.telegram_id,
          renewResult.data.id,
          renewResult.data.subscription_ends_at
        );
      } catch (notifErr) {
        logger.warn('[webhookProcessors] handleSubscriptionRenewed: payment confirmation failed', {
          memberId: renewResult.data.id,
          error: notifErr.message
        });
      }
    }

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
 * Handle refund event
 * Removes member from group when payment is refunded
 * @param {object} payload - Webhook event payload
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function handleRefund(payload) {
  logger.info('[webhookProcessors] handleRefund: processing', {
    status: payload?.status,
    refundedAt: payload?.refundedAt
  });

  try {
    const email = extractEmail(payload);
    if (!email) {
      logger.warn('[webhookProcessors] handleRefund: no email in payload');
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'No email found in payload' }
      };
    }

    // Find member by email
    const memberResult = await getMemberByEmail(email);
    if (!memberResult.success) {
      // Member not found - might be a refund before registration completed
      logger.info('[webhookProcessors] handleRefund: member not found, skipping', { email });
      return { success: true, data: { skipped: true, reason: 'member_not_found' } };
    }

    const member = memberResult.data;

    // If already removed, skip (idempotency)
    if (member.status === 'removido') {
      logger.info('[webhookProcessors] handleRefund: member already removed, skipping', {
        memberId: member.id,
        email
      });
      return { success: true, data: { skipped: true, reason: 'already_removed' } };
    }

    logger.info('[webhookProcessors] handleRefund: removing member due to refund', {
      memberId: member.id,
      email,
      currentStatus: member.status
    });

    // Import markMemberAsRemoved function
    const { markMemberAsRemoved } = require('./memberService');

    // Remove member with refund reason
    const removeResult = await markMemberAsRemoved(member.id, 'refund');
    return removeResult;

  } catch (err) {
    logger.error('[webhookProcessors] handleRefund: error', { error: err.message });
    return {
      success: false,
      error: { code: 'HANDLER_ERROR', message: err.message }
    };
  }
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
  'refund': handleRefund,
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
  handleRefund,

  // Utility functions (for testing)
  normalizePaymentMethod,
  extractEmail,
  extractSubscriptionData,
  extractAffiliateCode,  // Story 18: Affiliate tracking from webhook
};
