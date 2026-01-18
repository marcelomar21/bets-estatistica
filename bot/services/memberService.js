/**
 * Member Service - CRUD operations and state machine for membership management
 * Story 16.1: Criar Infraestrutura de Membros e State Machine
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

/**
 * Valid status values for members
 */
const MEMBER_STATUSES = ['trial', 'ativo', 'inadimplente', 'removido'];

/**
 * State Machine: Valid transitions between member statuses
 *
 * trial ──────► ativo ──────► inadimplente
 *   │             │                │
 *   │             │                ▼
 *   └─────────────┴──────────► removido
 */
const VALID_TRANSITIONS = {
  trial: ['ativo', 'removido'],
  ativo: ['inadimplente', 'removido'],
  inadimplente: ['ativo', 'removido'],
  removido: []  // Estado final - sem transições permitidas
};

/**
 * Check if a status transition is valid according to the state machine
 * @param {string} currentStatus - Current member status
 * @param {string} newStatus - Desired new status
 * @returns {boolean} - True if transition is valid, false otherwise
 */
function canTransition(currentStatus, newStatus) {
  // Validate inputs
  if (!MEMBER_STATUSES.includes(currentStatus)) {
    logger.warn('[memberService] canTransition: invalid currentStatus', { currentStatus });
    return false;
  }

  if (!MEMBER_STATUSES.includes(newStatus)) {
    logger.warn('[memberService] canTransition: invalid newStatus', { newStatus });
    return false;
  }

  // Same status is not a transition
  if (currentStatus === newStatus) {
    logger.debug('[memberService] canTransition: same status is not a transition', { status: currentStatus });
    return false;
  }

  // Check if transition is allowed
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * Get member by internal ID
 * @param {number} memberId - Internal member ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMemberById(memberId) {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return {
          success: false,
          error: { code: 'MEMBER_NOT_FOUND', message: `Member with id ${memberId} not found` }
        };
      }
      logger.error('[memberService] getMemberById: database error', { memberId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] getMemberById: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get member by Telegram ID
 * @param {number|string} telegramId - Telegram user ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMemberByTelegramId(telegramId) {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return {
          success: false,
          error: { code: 'MEMBER_NOT_FOUND', message: `Member with telegram_id ${telegramId} not found` }
        };
      }
      logger.error('[memberService] getMemberByTelegramId: database error', { telegramId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] getMemberByTelegramId: unexpected error', { telegramId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Update member status with state machine validation
 * @param {number} memberId - Internal member ID
 * @param {string} newStatus - New status to set
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function updateMemberStatus(memberId, newStatus) {
  try {
    // First, get current member to validate transition
    const memberResult = await getMemberById(memberId);

    if (!memberResult.success) {
      return memberResult; // Pass through the error
    }

    const currentStatus = memberResult.data.status;

    // Validate transition
    if (!canTransition(currentStatus, newStatus)) {
      logger.warn('[memberService] updateMemberStatus: invalid transition', {
        memberId,
        currentStatus,
        newStatus,
        allowedTransitions: VALID_TRANSITIONS[currentStatus]
      });
      return {
        success: false,
        error: {
          code: 'INVALID_MEMBER_STATUS',
          message: `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed: ${VALID_TRANSITIONS[currentStatus].join(', ') || 'none'}`
        }
      };
    }

    // Perform the update with optimistic locking (WHERE status = currentStatus)
    // This prevents race conditions where two concurrent updates could cause invalid transitions
    const { data, error } = await supabase
      .from('members')
      .update({ status: newStatus })
      .eq('id', memberId)
      .eq('status', currentStatus)  // Optimistic lock: only update if status hasn't changed
      .select()
      .single();

    if (error) {
      // PGRST116 means no rows matched - status changed between read and update (race condition)
      if (error.code === 'PGRST116') {
        logger.warn('[memberService] updateMemberStatus: race condition detected', {
          memberId,
          expectedStatus: currentStatus,
          newStatus
        });
        return {
          success: false,
          error: {
            code: 'RACE_CONDITION',
            message: `Member status changed during update. Expected '${currentStatus}', retry operation.`
          }
        };
      }
      logger.error('[memberService] updateMemberStatus: database error', { memberId, newStatus, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] updateMemberStatus: success', {
      memberId,
      previousStatus: currentStatus,
      newStatus
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] updateMemberStatus: unexpected error', { memberId, newStatus, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Create a new trial member
 * @param {object} memberData - Member data
 * @param {number|string} memberData.telegramId - Telegram user ID
 * @param {string} [memberData.telegramUsername] - Telegram username
 * @param {string} [memberData.email] - Email address
 * @param {number} [trialDays=7] - Number of trial days
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function createTrialMember({ telegramId, telegramUsername, email }, trialDays = 7) {
  try {
    // Check if member already exists
    const existingResult = await getMemberByTelegramId(telegramId);

    if (existingResult.success) {
      logger.warn('[memberService] createTrialMember: member already exists', { telegramId });
      return {
        success: false,
        error: { code: 'MEMBER_ALREADY_EXISTS', message: `Member with telegram_id ${telegramId} already exists` }
      };
    }

    // Only proceed if error was MEMBER_NOT_FOUND
    if (existingResult.error.code !== 'MEMBER_NOT_FOUND') {
      return existingResult; // Pass through other errors
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('members')
      .insert({
        telegram_id: telegramId,
        telegram_username: telegramUsername || null,
        email: email || null,
        status: 'trial',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEndsAt.toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('[memberService] createTrialMember: database error', { telegramId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] createTrialMember: success', {
      memberId: data.id,
      telegramId,
      trialEndsAt: trialEndsAt.toISOString()
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] createTrialMember: unexpected error', { telegramId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get member by email address
 * Story 16.3: Added for webhook processing
 * @param {string} email - Email address
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMemberByEmail(email) {
  try {
    if (!email) {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Email is required' }
      };
    }

    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return {
          success: false,
          error: { code: 'MEMBER_NOT_FOUND', message: `Member with email ${email} not found` }
        };
      }
      logger.error('[memberService] getMemberByEmail: database error', { email, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] getMemberByEmail: unexpected error', { email, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Activate a member with subscription data
 * Story 16.3: Added for webhook processing
 * Transitions from 'trial' to 'ativo' and sets subscription fields
 * @param {number} memberId - Internal member ID
 * @param {object} subscriptionData - Subscription information
 * @param {string} subscriptionData.subscriptionId - Cakto subscription ID
 * @param {string} subscriptionData.customerId - Cakto customer ID
 * @param {string} subscriptionData.paymentMethod - Payment method (pix, boleto, cartao_recorrente)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function activateMember(memberId, { subscriptionId, customerId, paymentMethod }) {
  try {
    // Get current member
    const memberResult = await getMemberById(memberId);
    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;
    const currentStatus = member.status;

    // If already active, just update subscription data
    if (currentStatus === 'ativo') {
      const { data, error } = await supabase
        .from('members')
        .update({
          cakto_subscription_id: subscriptionId,
          cakto_customer_id: customerId,
          payment_method: paymentMethod,
          last_payment_at: new Date().toISOString()
        })
        .eq('id', memberId)
        .select()
        .single();

      if (error) {
        logger.error('[memberService] activateMember: failed to update active member', { memberId, error: error.message });
        return { success: false, error: { code: 'DB_ERROR', message: error.message } };
      }

      logger.info('[memberService] activateMember: updated already active member', { memberId });
      return { success: true, data };
    }

    // Validate transition
    if (!canTransition(currentStatus, 'ativo')) {
      logger.warn('[memberService] activateMember: invalid transition', {
        memberId,
        currentStatus,
        targetStatus: 'ativo'
      });
      return {
        success: false,
        error: {
          code: 'INVALID_MEMBER_STATUS',
          message: `Cannot activate member from '${currentStatus}' status`
        }
      };
    }

    // Calculate subscription dates
    const now = new Date();
    const subscriptionEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    // Update with optimistic locking
    const { data, error } = await supabase
      .from('members')
      .update({
        status: 'ativo',
        cakto_subscription_id: subscriptionId,
        cakto_customer_id: customerId,
        payment_method: paymentMethod,
        subscription_started_at: now.toISOString(),
        subscription_ends_at: subscriptionEndsAt.toISOString(),
        last_payment_at: now.toISOString()
      })
      .eq('id', memberId)
      .eq('status', currentStatus) // Optimistic lock
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.warn('[memberService] activateMember: race condition', { memberId });
        return {
          success: false,
          error: { code: 'RACE_CONDITION', message: 'Member status changed during update' }
        };
      }
      logger.error('[memberService] activateMember: database error', { memberId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] activateMember: success', {
      memberId,
      previousStatus: currentStatus,
      subscriptionEndsAt: subscriptionEndsAt.toISOString()
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] activateMember: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Renew member subscription
 * Story 16.3: Added for webhook processing
 * Updates last_payment_at and extends subscription_ends_at by 30 days
 * If inadimplente, transitions to ativo
 * @param {number} memberId - Internal member ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function renewMemberSubscription(memberId) {
  try {
    // Get current member
    const memberResult = await getMemberById(memberId);
    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;
    const currentStatus = member.status;

    // Calculate new subscription end date
    const now = new Date();
    const subscriptionEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    // If inadimplente, transition to ativo
    if (currentStatus === 'inadimplente') {
      if (!canTransition(currentStatus, 'ativo')) {
        return {
          success: false,
          error: { code: 'INVALID_MEMBER_STATUS', message: 'Cannot renew from inadimplente status' }
        };
      }

      const { data, error } = await supabase
        .from('members')
        .update({
          status: 'ativo',
          last_payment_at: now.toISOString(),
          subscription_ends_at: subscriptionEndsAt.toISOString()
        })
        .eq('id', memberId)
        .eq('status', currentStatus) // Optimistic lock
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: false, error: { code: 'RACE_CONDITION', message: 'Status changed during update' } };
        }
        logger.error('[memberService] renewMemberSubscription: database error', { memberId, error: error.message });
        return { success: false, error: { code: 'DB_ERROR', message: error.message } };
      }

      logger.info('[memberService] renewMemberSubscription: reactivated from inadimplente', {
        memberId,
        subscriptionEndsAt: subscriptionEndsAt.toISOString()
      });

      return { success: true, data };
    }

    // For ativo members, just update dates
    if (currentStatus === 'ativo') {
      const { data, error } = await supabase
        .from('members')
        .update({
          last_payment_at: now.toISOString(),
          subscription_ends_at: subscriptionEndsAt.toISOString()
        })
        .eq('id', memberId)
        .select()
        .single();

      if (error) {
        logger.error('[memberService] renewMemberSubscription: database error', { memberId, error: error.message });
        return { success: false, error: { code: 'DB_ERROR', message: error.message } };
      }

      logger.info('[memberService] renewMemberSubscription: extended subscription', {
        memberId,
        subscriptionEndsAt: subscriptionEndsAt.toISOString()
      });

      return { success: true, data };
    }

    // For other statuses, renewal doesn't make sense
    return {
      success: false,
      error: {
        code: 'INVALID_MEMBER_STATUS',
        message: `Cannot renew member with status '${currentStatus}'`
      }
    };
  } catch (err) {
    logger.error('[memberService] renewMemberSubscription: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Mark member as defaulted (inadimplente)
 * Story 16.3: Added for webhook processing
 * Transitions from 'ativo' to 'inadimplente'
 * @param {number} memberId - Internal member ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function markMemberAsDefaulted(memberId) {
  try {
    // Get current member
    const memberResult = await getMemberById(memberId);
    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;
    const currentStatus = member.status;

    // Validate transition
    if (!canTransition(currentStatus, 'inadimplente')) {
      logger.warn('[memberService] markMemberAsDefaulted: invalid transition', {
        memberId,
        currentStatus
      });
      return {
        success: false,
        error: {
          code: 'INVALID_MEMBER_STATUS',
          message: `Cannot mark member as defaulted from '${currentStatus}' status`
        }
      };
    }

    // Update with optimistic locking
    const { data, error } = await supabase
      .from('members')
      .update({ status: 'inadimplente' })
      .eq('id', memberId)
      .eq('status', currentStatus) // Optimistic lock
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.warn('[memberService] markMemberAsDefaulted: race condition', { memberId });
        return {
          success: false,
          error: { code: 'RACE_CONDITION', message: 'Member status changed during update' }
        };
      }
      logger.error('[memberService] markMemberAsDefaulted: database error', { memberId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] markMemberAsDefaulted: success', {
      memberId,
      previousStatus: currentStatus
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] markMemberAsDefaulted: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Create an active member directly (for payments before trial)
 * Story 16.3: Added for webhook processing
 * @param {object} memberData - Member data
 * @param {string} memberData.email - Email address
 * @param {object} memberData.subscriptionData - Subscription information
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function createActiveMember({ email, subscriptionData }) {
  try {
    const { subscriptionId, customerId, paymentMethod } = subscriptionData;

    const now = new Date();
    const subscriptionEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    const { data, error } = await supabase
      .from('members')
      .insert({
        email: email,
        status: 'ativo',
        cakto_subscription_id: subscriptionId,
        cakto_customer_id: customerId,
        payment_method: paymentMethod,
        subscription_started_at: now.toISOString(),
        subscription_ends_at: subscriptionEndsAt.toISOString(),
        last_payment_at: now.toISOString()
      })
      .select()
      .single();

    if (error) {
      // Check for unique constraint violation (email already exists)
      if (error.code === '23505') {
        logger.warn('[memberService] createActiveMember: email already exists', { email });
        return {
          success: false,
          error: { code: 'MEMBER_ALREADY_EXISTS', message: `Member with email ${email} already exists` }
        };
      }
      logger.error('[memberService] createActiveMember: database error', { email, error: error.message, code: error.code });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] createActiveMember: success', {
      memberId: data.id,
      email,
      subscriptionEndsAt: subscriptionEndsAt.toISOString()
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] createActiveMember: unexpected error', { email, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Check if a removed member can rejoin the group (within 24h of kick)
 * Story 16.4: Added for member entry detection
 * @param {number} memberId - Internal member ID
 * @returns {Promise<{success: boolean, data?: {canRejoin: boolean, hoursSinceKick?: number}, error?: object}>}
 */
async function canRejoinGroup(memberId) {
  try {
    const memberResult = await getMemberById(memberId);

    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;

    // Only removed members can rejoin
    if (member.status !== 'removido') {
      return { success: true, data: { canRejoin: false, reason: 'not_removed' } };
    }

    // If no kicked_at, treat as inconsistent state - don't allow rejoin
    if (!member.kicked_at) {
      logger.warn('[memberService] canRejoinGroup: removed member without kicked_at', { memberId });
      return { success: true, data: { canRejoin: false, reason: 'no_kicked_at' } };
    }

    const kickedAt = new Date(member.kicked_at);
    const now = new Date();
    const hoursSinceKick = (now.getTime() - kickedAt.getTime()) / (1000 * 60 * 60);

    // Can rejoin within 24 hours
    const canRejoin = hoursSinceKick < 24;

    logger.debug('[memberService] canRejoinGroup: checked', {
      memberId,
      hoursSinceKick: hoursSinceKick.toFixed(2),
      canRejoin
    });

    return {
      success: true,
      data: { canRejoin, hoursSinceKick }
    };
  } catch (err) {
    logger.error('[memberService] canRejoinGroup: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Reactivate a removed member as trial
 * Story 16.4: Added for member entry detection
 * Resets trial period and clears kick data
 * @param {number} memberId - Internal member ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function reactivateMember(memberId) {
  try {
    const { config } = require('../../lib/config');
    const trialDays = config.membership?.trialDays || 7;

    // Get current member to validate
    const memberResult = await getMemberById(memberId);
    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;

    // Only removed members can be reactivated
    if (member.status !== 'removido') {
      logger.warn('[memberService] reactivateMember: member not in removido status', {
        memberId,
        currentStatus: member.status
      });
      return {
        success: false,
        error: { code: 'INVALID_MEMBER_STATUS', message: `Member is in '${member.status}' status, not 'removido'` }
      };
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    // Update with optimistic locking
    const { data, error } = await supabase
      .from('members')
      .update({
        status: 'trial',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        kicked_at: null,
        notes: `Reativado em ${now.toISOString()}`
      })
      .eq('id', memberId)
      .eq('status', 'removido')  // Optimistic lock
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.warn('[memberService] reactivateMember: race condition', { memberId });
        return {
          success: false,
          error: { code: 'RACE_CONDITION', message: 'Member status changed during update' }
        };
      }
      logger.error('[memberService] reactivateMember: database error', { memberId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] reactivateMember: success', {
      memberId,
      trialEndsAt: trialEndsAt.toISOString()
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] reactivateMember: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get remaining trial days for a member
 * @param {number} memberId - Internal member ID
 * @returns {Promise<{success: boolean, data?: {daysRemaining: number}, error?: object}>}
 */
async function getTrialDaysRemaining(memberId) {
  try {
    const memberResult = await getMemberById(memberId);

    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;

    if (member.status !== 'trial') {
      return {
        success: true,
        data: { daysRemaining: 0, reason: 'not_in_trial' }
      };
    }

    if (!member.trial_ends_at) {
      return {
        success: false,
        error: { code: 'INVALID_DATA', message: 'Trial member missing trial_ends_at' }
      };
    }

    const now = new Date();
    const trialEnds = new Date(member.trial_ends_at);
    const msRemaining = trialEnds.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));

    return { success: true, data: { daysRemaining } };
  } catch (err) {
    logger.error('[memberService] getTrialDaysRemaining: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

module.exports = {
  // Constants
  MEMBER_STATUSES,
  VALID_TRANSITIONS,

  // State machine
  canTransition,

  // CRUD operations
  getMemberById,
  getMemberByTelegramId,
  getMemberByEmail,
  updateMemberStatus,
  createTrialMember,
  createActiveMember,
  getTrialDaysRemaining,

  // Story 16.3: Webhook processing helpers
  activateMember,
  renewMemberSubscription,
  markMemberAsDefaulted,

  // Story 16.4: Member entry detection helpers
  canRejoinGroup,
  reactivateMember,
};
