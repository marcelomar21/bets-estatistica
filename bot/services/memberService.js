/**
 * Member Service - CRUD operations and state machine for membership management
 * Story 16.1: Criar Infraestrutura de Membros e State Machine
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { validateMemberId, validateTelegramId } = require('../../lib/validators');

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
 * Resolve group context for multi-tenant lookups/inserts.
 * If caller omits groupId, use configured GROUP_ID from bot process.
 * Explicit null disables tenant filtering for backward-compatible/global paths.
 * @param {string|null|undefined} groupId
 * @returns {string|null}
 */
function resolveGroupId(groupId) {
  const configuredGroupId = config.membership?.groupId || null;

  if (groupId === undefined) {
    return configuredGroupId;
  }

  if (groupId === null || groupId === '') {
    return null;
  }

  return groupId;
}

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
 * Story 3.1: Added optional groupId parameter for multi-tenant context
 * @param {number} memberId - Internal member ID
 * @param {string|null} [groupId=null] - Group ID for multi-tenant context
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMemberById(memberId, groupId = undefined) {
  // Validate input
  const validation = validateMemberId(memberId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const effectiveGroupId = resolveGroupId(groupId);

    let query = supabase
      .from('members')
      .select('*')
      .eq('id', validation.value);

    // Story 3.1: Filter by group_id when provided (multi-tenant)
    if (effectiveGroupId) {
      query = query.eq('group_id', effectiveGroupId);
    }

    const { data, error } = await query.single();

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
 * Story 3.1: Added optional groupId parameter for multi-tenant filtering
 * @param {number|string} telegramId - Telegram user ID
 * @param {string|null} [groupId=null] - Group ID for multi-tenant filtering
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMemberByTelegramId(telegramId, groupId = undefined) {
  // Validate input
  const validation = validateTelegramId(telegramId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const effectiveGroupId = resolveGroupId(groupId);

    let query = supabase
      .from('members')
      .select('*')
      .eq('telegram_id', validation.value);

    // Story 3.1: Filter by group_id when provided (multi-tenant)
    if (effectiveGroupId) {
      query = query.eq('group_id', effectiveGroupId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        const details = (error.details || '').toLowerCase();
        const noRows = details.includes('0 rows') || !details;

        // No rows returned
        if (noRows) {
          return {
            success: false,
            error: { code: 'MEMBER_NOT_FOUND', message: `Member with telegram_id ${telegramId} not found` }
          };
        }

        // Backward compatible behavior: when query is intentionally global and
        // multiple rows exist across tenants, return the first match deterministically.
        if (!effectiveGroupId) {
          const { data: firstMatch, error: fallbackError } = await supabase
            .from('members')
            .select('*')
            .eq('telegram_id', validation.value)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (fallbackError) {
            logger.error('[memberService] getMemberByTelegramId: fallback query failed', {
              telegramId,
              error: fallbackError.message
            });
            return { success: false, error: { code: 'DB_ERROR', message: fallbackError.message } };
          }

          if (!firstMatch) {
            return {
              success: false,
              error: { code: 'MEMBER_NOT_FOUND', message: `Member with telegram_id ${telegramId} not found` }
            };
          }

          return { success: true, data: firstMatch };
        }
      }

      logger.error('[memberService] getMemberByTelegramId: database error', {
        telegramId,
        groupId: effectiveGroupId,
        error: error.message
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] getMemberByTelegramId: unexpected error', {
      telegramId,
      groupId: resolveGroupId(groupId),
      error: err.message
    });
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
 * Story 3.1: Added optional groupId parameter for multi-tenant support
 * @param {object} memberData - Member data
 * @param {number|string} memberData.telegramId - Telegram user ID
 * @param {string} [memberData.telegramUsername] - Telegram username
 * @param {string} [memberData.email] - Email address
 * @param {string} [memberData.affiliateCode] - Affiliate code from deep link (optional)
 * @param {string} [memberData.groupId] - Group ID for multi-tenant (optional)
 * @param {number} [trialDays=7] - Number of trial days
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function createTrialMember({ telegramId, telegramUsername, email, affiliateCode, groupId }, trialDays = 7) {
  try {
    const effectiveGroupId = resolveGroupId(groupId);

    // Check if member already exists (filter by groupId if multi-tenant)
    const existingResult = await getMemberByTelegramId(telegramId, effectiveGroupId);

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

    // Build insert data with optional affiliate fields
    const insertData = {
      telegram_id: telegramId,
      telegram_username: telegramUsername || null,
      email: email || null,
      status: 'trial',
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEndsAt.toISOString()
    };

    // Story 3.1: Add group_id for multi-tenant (nullable for backward compat)
    if (effectiveGroupId) {
      insertData.group_id = effectiveGroupId;
    }

    // Story 18.1: Add affiliate tracking if code provided
    if (affiliateCode) {
      insertData.affiliate_code = affiliateCode;
      insertData.affiliate_clicked_at = now.toISOString();
      insertData.affiliate_history = JSON.stringify([
        { code: affiliateCode, clicked_at: now.toISOString() }
      ]);
      logger.info('[membership:affiliate] New member with affiliate', {
        telegramId,
        affiliateCode
      });
    }

    const { data, error } = await supabase
      .from('members')
      .insert(insertData)
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
 * Story 3.1: Added optional groupId parameter for multi-tenant filtering
 * @param {string} email - Email address
 * @param {string|null} [groupId=null] - Group ID for multi-tenant filtering
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMemberByEmail(email, groupId = undefined) {
  try {
    if (!email) {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Email is required' }
      };
    }

    const effectiveGroupId = resolveGroupId(groupId);

    let query = supabase
      .from('members')
      .select('*')
      .eq('email', email);

    // Story 3.1: Filter by group_id when provided (multi-tenant)
    if (effectiveGroupId) {
      query = query.eq('group_id', effectiveGroupId);
    }

    const { data, error } = await query.single();

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
 * @param {string} subscriptionData.subscriptionId - Mercado Pago subscription ID
 * @param {string} subscriptionData.customerId - Mercado Pago customer/payer ID
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
          mp_subscription_id: subscriptionId,
          mp_payer_id: customerId,
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
        mp_subscription_id: subscriptionId,
        mp_payer_id: customerId,
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
          subscription_ends_at: subscriptionEndsAt.toISOString(),
          inadimplente_at: null // Clear grace period tracking
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
 * Reactivate a removed member after payment
 * Story 16.10: Reativar Membro Removido Após Pagamento
 *
 * This function bypasses the normal state machine for the special case
 * where a previously removed member pays again and needs to be reactivated.
 *
 * @param {number} memberId - Internal member ID
 * @param {object} options - Additional options
 * @param {string} options.subscriptionId - Cakto subscription ID (optional)
 * @param {string} options.paymentMethod - Payment method (optional)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function reactivateRemovedMember(memberId, options = {}) {
  try {
    // Get current member
    const memberResult = await getMemberById(memberId);
    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;
    const currentStatus = member.status;

    // Validate that member is in 'removido' status
    if (currentStatus !== 'removido') {
      logger.warn('[memberService] reactivateRemovedMember: member not in removido status', {
        memberId,
        currentStatus
      });
      return {
        success: false,
        error: {
          code: 'INVALID_MEMBER_STATUS',
          message: `Cannot reactivate member with status '${currentStatus}'. Expected 'removido'.`
        }
      };
    }

    // Calculate subscription dates
    const now = new Date();
    const subscriptionStartsAt = now;
    const subscriptionEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    // Build note for audit trail
    // AC4: Different note for members without telegram_id
    let reactivationNote;
    if (!member.telegram_id) {
      reactivationNote = 'Reativado após pagamento - aguardando /start para invite';
    } else if (options.subscriptionId) {
      reactivationNote = `Reativado após pagamento (subscription: ${options.subscriptionId})`;
    } else {
      reactivationNote = 'Reativado após pagamento';
    }

    // Update member with optimistic locking
    const { data, error } = await supabase
      .from('members')
      .update({
        status: 'ativo',
        kicked_at: null,
        subscription_started_at: subscriptionStartsAt.toISOString(),
        subscription_ends_at: subscriptionEndsAt.toISOString(),
        last_payment_at: now.toISOString(),
        notes: member.notes
          ? `${member.notes}\n${reactivationNote}`
          : reactivationNote,
        // Reset invite fields for new invite generation
        invite_link: null,
        invite_generated_at: null,
        joined_group_at: null,
        // Update Mercado Pago IDs if provided
        ...(options.subscriptionId && { mp_subscription_id: options.subscriptionId }),
        ...(options.paymentMethod && { payment_method: options.paymentMethod })
      })
      .eq('id', memberId)
      .eq('status', 'removido') // Optimistic lock
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.warn('[memberService] reactivateRemovedMember: race condition', { memberId });
        return {
          success: false,
          error: { code: 'RACE_CONDITION', message: 'Status changed during update' }
        };
      }
      logger.error('[memberService] reactivateRemovedMember: database error', {
        memberId,
        error: error.message
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] reactivateRemovedMember: member reactivated', {
      memberId,
      telegramId: data.telegram_id,
      subscriptionEndsAt: subscriptionEndsAt.toISOString()
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] reactivateRemovedMember: unexpected error', {
      memberId,
      error: err.message
    });
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
    // Set inadimplente_at for grace period tracking
    const { data, error } = await supabase
      .from('members')
      .update({
        status: 'inadimplente',
        inadimplente_at: new Date().toISOString()
      })
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
 * Tech-Spec: Migração MP - Uses mp_subscription_id and affiliate_coupon
 * Story 3.1: Added optional groupId parameter for multi-tenant support
 * @param {object} memberData - Member data
 * @param {string} memberData.email - Email address
 * @param {object} memberData.subscriptionData - Subscription information
 * @param {string} [memberData.affiliateCoupon] - Coupon code from MP checkout (optional)
 * @param {string} [memberData.groupId] - Group ID for multi-tenant (optional)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function createActiveMember({ email, subscriptionData, affiliateCoupon, groupId }) {
  try {
    const effectiveGroupId = resolveGroupId(groupId);
    const { subscriptionId, customerId, paymentMethod } = subscriptionData;

    const now = new Date();
    const subscriptionEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    // Build insert data
    const insertData = {
      email: email,
      status: 'ativo',
      mp_subscription_id: subscriptionId,
      mp_payer_id: customerId,
      payment_method: paymentMethod,
      subscription_started_at: now.toISOString(),
      subscription_ends_at: subscriptionEndsAt.toISOString(),
      last_payment_at: now.toISOString()
    };

    // Story 3.1: Add group_id for multi-tenant (nullable for backward compat)
    if (effectiveGroupId) {
      insertData.group_id = effectiveGroupId;
    }

    // Add affiliate coupon if provided
    if (affiliateCoupon) {
      insertData.affiliate_coupon = affiliateCoupon;
      logger.info('[memberService] createActiveMember: with affiliate coupon', {
        email,
        affiliateCoupon
      });
    }

    const { data, error } = await supabase
      .from('members')
      .insert(insertData)
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
      subscriptionEndsAt: subscriptionEndsAt.toISOString(),
      hasAffiliate: !!affiliateCoupon
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
 * Kick a member from the Telegram group
 * Story 16.6: Implementar Remocao Automatica de Inadimplentes
 * Uses banChatMember with until_date for 24h temporary ban (allows re-entry after)
 * @param {number|string} telegramId - Telegram user ID
 * @param {string} chatId - Telegram chat/group ID
 * @returns {Promise<{success: boolean, data?: {until_date: number}, error?: object}>}
 */
async function kickMemberFromGroup(telegramId, chatId) {
  const { getBot } = require('../telegram');
  const bot = getBot();

  try {
    // Ban temporario de 24h (permite reentrada depois)
    // until_date = Unix timestamp (segundos desde epoch)
    const until_date = Math.floor(Date.now() / 1000) + (24 * 60 * 60);

    await bot.banChatMember(chatId, telegramId, { until_date });

    logger.info('[memberService] kickMemberFromGroup: success', { telegramId, chatId, until_date });
    return { success: true, data: { until_date } };
  } catch (err) {
    // Usuario nao encontrado no grupo (400)
    if (err.response?.statusCode === 400) {
      const description = err.response?.body?.description || '';
      if (description.includes('user not found') || description.includes('USER_NOT_PARTICIPANT')) {
        logger.warn('[memberService] kickMemberFromGroup: user not in group', { telegramId });
        return { success: false, error: { code: 'USER_NOT_IN_GROUP', message: 'User is not a member of the group' } };
      }
      if (description.includes('already kicked') || description.includes('PARTICIPANT_ID_INVALID')) {
        logger.warn('[memberService] kickMemberFromGroup: user already kicked', { telegramId });
        return { success: false, error: { code: 'USER_NOT_IN_GROUP', message: 'User was already kicked' } };
      }
    }

    // Bot sem permissao (403)
    if (err.response?.statusCode === 403) {
      logger.error('[memberService] kickMemberFromGroup: bot lacks permissions', { telegramId, chatId });
      return { success: false, error: { code: 'BOT_NO_PERMISSION', message: 'Bot lacks permission to ban users' } };
    }

    // Outros erros
    logger.error('[memberService] kickMemberFromGroup: failed', { telegramId, chatId, error: err.message });
    return { success: false, error: { code: 'TELEGRAM_ERROR', message: err.message } };
  }
}

/**
 * Mark a member as removed (kicked) from the group
 * Story 16.6: Implementar Remocao Automatica de Inadimplentes
 * Updates status to 'removido' and sets kicked_at timestamp
 * @param {string} memberId - Internal member ID (UUID)
 * @param {string} reason - Kick reason: 'trial_expired' or 'payment_failed'
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function markMemberAsRemoved(memberId, reason = null) {
  try {
    // Get current member to validate transition
    const memberResult = await getMemberById(memberId);

    if (!memberResult.success) {
      return memberResult;
    }

    const currentStatus = memberResult.data.status;

    // Validate transition using state machine
    // VALID_TRANSITIONS allows: trial->removido, ativo->removido, inadimplente->removido
    // Only 'removido' status cannot transition to 'removido' (final state)
    if (!canTransition(currentStatus, 'removido')) {
      logger.warn('[memberService] markMemberAsRemoved: invalid transition', {
        memberId,
        currentStatus,
        targetStatus: 'removido'
      });
      return {
        success: false,
        error: {
          code: 'INVALID_MEMBER_STATUS',
          message: `Cannot remove member from '${currentStatus}' status (already in final state).`
        }
      };
    }

    // Update with optimistic locking
    const { data, error } = await supabase
      .from('members')
      .update({
        status: 'removido',
        kicked_at: new Date().toISOString(),
        notes: reason ? `Removed: ${reason}` : null
      })
      .eq('id', memberId)
      .eq('status', currentStatus) // Optimistic lock
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.warn('[memberService] markMemberAsRemoved: race condition', { memberId });
        return {
          success: false,
          error: { code: 'RACE_CONDITION', message: 'Member status changed during update' }
        };
      }
      logger.error('[memberService] markMemberAsRemoved: database error', { memberId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] markMemberAsRemoved: success', {
      memberId,
      previousStatus: currentStatus,
      reason
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] markMemberAsRemoved: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

// ============================================
// Story 16.7: Statistics functions (AC: #1)
// ============================================

/**
 * Get member statistics for /membros command
 * Story 16.7: Implementar Comandos Admin para Gestao de Membros
 * @returns {Promise<{success: boolean, data?: {total, ativo, trial, inadimplente, removido}, error?: object}>}
 */
async function getMemberStats() {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('status');

    if (error) {
      logger.error('[memberService] getMemberStats: database error', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const counts = {
      total: data.length,
      ativo: data.filter(m => m.status === 'ativo').length,
      trial: data.filter(m => m.status === 'trial').length,
      inadimplente: data.filter(m => m.status === 'inadimplente').length,
      removido: data.filter(m => m.status === 'removido').length,
    };

    logger.debug('[memberService] getMemberStats: success', counts);
    return { success: true, data: counts };
  } catch (err) {
    logger.error('[memberService] getMemberStats: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Calculate Monthly Recurring Revenue
 * Story 16.7: Implementar Comandos Admin para Gestao de Membros
 * @param {number} activeCount - Number of active members
 * @param {number} pricePerMember - Price per member (default: 50)
 * @returns {number} MRR in BRL
 */
function calculateMRR(activeCount, pricePerMember = 50) {
  return activeCount * pricePerMember;
}

/**
 * Calculate trial to active conversion rate
 * Story 16.7: Implementar Comandos Admin para Gestao de Membros
 * @returns {Promise<{success: boolean, data?: {rate, converted, totalTrials}, error?: object}>}
 */
async function calculateConversionRate() {
  try {
    // Count members who were trial and are now active
    // (those with trial_started_at and status='ativo')
    const { data: activeConverted, error: error1 } = await supabase
      .from('members')
      .select('id')
      .eq('status', 'ativo')
      .not('trial_started_at', 'is', null);

    const { data: allTrials, error: error2 } = await supabase
      .from('members')
      .select('id')
      .not('trial_started_at', 'is', null);

    if (error1 || error2) {
      logger.error('[memberService] calculateConversionRate: database error', {
        error: error1?.message || error2?.message
      });
      return { success: false, error: { code: 'DB_ERROR', message: error1?.message || error2?.message } };
    }

    const converted = activeConverted?.length || 0;
    const totalTrials = allTrials?.length || 0;
    const rate = totalTrials > 0 ? (converted / totalTrials) * 100 : 0;

    logger.debug('[memberService] calculateConversionRate: success', { rate, converted, totalTrials });
    return { success: true, data: { rate, converted, totalTrials } };
  } catch (err) {
    logger.error('[memberService] calculateConversionRate: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get count of new members in the last 7 days
 * Story 16.7: Implementar Comandos Admin para Gestao de Membros
 * @returns {Promise<{success: boolean, data?: {count}, error?: object}>}
 */
async function getNewMembersThisWeek() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('members')
      .select('id')
      .gte('created_at', sevenDaysAgo);

    if (error) {
      logger.error('[memberService] getNewMembersThisWeek: database error', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const count = data?.length || 0;
    logger.debug('[memberService] getNewMembersThisWeek: success', { count });
    return { success: true, data: { count } };
  } catch (err) {
    logger.error('[memberService] getNewMembersThisWeek: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get member details by identifier (@username or telegram_id)
 * Story 16.7: ADR-002 - Username first, fallback telegram_id
 * @param {string} identifier - @username or numeric telegram_id
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMemberDetails(identifier) {
  try {
    // Clean identifier and determine type
    const cleanId = identifier.startsWith('@') ? identifier.slice(1) : identifier;
    const isNumeric = /^\d+$/.test(cleanId);

    // Try username first (ADR-002)
    if (!isNumeric) {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('telegram_username', cleanId)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('[memberService] getMemberDetails: database error', { error: error.message });
        return { success: false, error: { code: 'DB_ERROR', message: error.message } };
      }

      if (data) {
        logger.debug('[memberService] getMemberDetails: found by username', { username: cleanId });
        return { success: true, data };
      }
    }

    // Fallback to telegram_id
    const telegramId = isNumeric ? cleanId : null;
    if (telegramId) {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('[memberService] getMemberDetails: database error', { error: error.message });
        return { success: false, error: { code: 'DB_ERROR', message: error.message } };
      }

      if (data) {
        logger.debug('[memberService] getMemberDetails: found by telegram_id', { telegramId });
        return { success: true, data };
      }
    }

    logger.warn('[memberService] getMemberDetails: member not found', { identifier });
    return { success: false, error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found' } };
  } catch (err) {
    logger.error('[memberService] getMemberDetails: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get notification history for a member
 * Story 16.7: Task 2 - CRUD para gestao manual
 * @param {number} memberId - Internal member ID
 * @param {number} limit - Max records to return (default 10)
 * @returns {Promise<{success: boolean, data?: array, error?: object}>}
 */
async function getNotificationHistory(memberId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('member_notifications')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('[memberService] getNotificationHistory: database error', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.debug('[memberService] getNotificationHistory: success', { memberId, count: data?.length || 0 });
    return { success: true, data: data || [] };
  } catch (err) {
    logger.error('[memberService] getNotificationHistory: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Add a manual trial member (admin action)
 * Story 16.7: Task 2 - CRUD para gestao manual
 * @param {string} telegramId - Telegram user ID
 * @param {string} username - Telegram username (without @)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function addManualTrialMember(telegramId, username) {
  try {
    // Check if member exists
    const existingResult = await getMemberByTelegramId(telegramId);

    if (existingResult.success) {
      const existing = existingResult.data;

      // If already active, reject
      if (existing.status === 'ativo') {
        logger.warn('[memberService] addManualTrialMember: member already active', { telegramId });
        return { success: false, error: { code: 'MEMBER_ACTIVE', message: 'Member is already active' } };
      }

      // If removed, reactivate as trial
      if (existing.status === 'removido') {
        // Use dynamic trial days from system_config (ADR-001)
        const trialDaysResult = await getTrialDays();
        const trialDays = trialDaysResult.success ? trialDaysResult.data.days : 7;
        const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('members')
          .update({
            status: 'trial',
            trial_ends_at: trialEndsAt,
            telegram_username: username,
            kicked_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          logger.error('[memberService] addManualTrialMember: reactivate error', { error: error.message });
          return { success: false, error: { code: 'DB_ERROR', message: error.message } };
        }

        logger.info('[memberService] addManualTrialMember: reactivated as trial', { telegramId });
        return { success: true, data, isNew: false };
      }
    }

    // Create new trial member
    const createResult = await createTrialMember({ telegramId, telegramUsername: username });
    if (createResult.success) {
      return { ...createResult, isNew: true };
    }
    return createResult;
  } catch (err) {
    logger.error('[memberService] addManualTrialMember: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Extend membership by X days
 * Story 16.7: Task 2 - CRUD para gestao manual
 * @param {number} memberId - Internal member ID
 * @param {number} days - Days to extend
 * @param {string} operatorUsername - Operator performing the action
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function extendMembership(memberId, days, operatorUsername) {
  try {
    const memberResult = await getMemberById(memberId);

    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;

    // Only removido members cannot be extended (AC6: "se membro 'removido', retorna erro")
    if (member.status === 'removido') {
      logger.warn('[memberService] extendMembership: cannot extend removed member', { memberId, status: member.status });
      return { success: false, error: { code: 'INVALID_MEMBER_STATUS', message: 'Membro removido. Use /add_trial para reativar.' } };
    }

    const updateData = { updated_at: new Date().toISOString() };

    if (member.status === 'trial') {
      // Extend trial_ends_at
      const currentEnd = member.trial_ends_at ? new Date(member.trial_ends_at) : new Date();
      const newEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);
      updateData.trial_ends_at = newEnd.toISOString();
    } else if (member.status === 'ativo' || member.status === 'inadimplente') {
      // Extend subscription_ends_at (AC6: "adiciona dias a subscription_ends_at se ativo/inadimplente")
      const currentEnd = member.subscription_ends_at ? new Date(member.subscription_ends_at) : new Date();
      const newEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);
      updateData.subscription_ends_at = newEnd.toISOString();
    }

    const { data, error } = await supabase
      .from('members')
      .update(updateData)
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      logger.error('[memberService] extendMembership: database error', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    // Append to notes for audit trail (ADR-004)
    await appendToNotes(memberId, operatorUsername, `Estendeu ${member.status} por ${days} dias`);

    logger.info('[memberService] extendMembership: success', { memberId, days, operator: operatorUsername });
    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] extendMembership: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Append structured note to member notes field
 * Story 16.7: ADR-004 - Notes em formato estruturado
 * @param {number} memberId - Internal member ID
 * @param {string} operador - Operator username
 * @param {string} acao - Action description
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function appendToNotes(memberId, operador, acao) {
  try {
    // Get current member
    const memberResult = await getMemberById(memberId);

    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;
    const currentNotes = member.notes || '';
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const newEntry = `[${timestamp}] @${operador}: ${acao}`;
    const updatedNotes = currentNotes ? `${currentNotes}\n${newEntry}` : newEntry;

    const { error } = await supabase
      .from('members')
      .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
      .eq('id', memberId);

    if (error) {
      logger.error('[memberService] appendToNotes: database error', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.debug('[memberService] appendToNotes: success', { memberId, operador, acao });
    return { success: true };
  } catch (err) {
    logger.error('[memberService] appendToNotes: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get current trial days configuration
 * Story 16.7: ADR-001 - Read from system_config, fallback to env
 * @returns {Promise<{success: boolean, data?: {days, source}, error?: object}>}
 */
async function getTrialDays() {
  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'TRIAL_DAYS')
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('[memberService] getTrialDays: database error', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    if (data) {
      const days = parseInt(data.value, 10);
      logger.debug('[memberService] getTrialDays: from system_config', { days });
      return { success: true, data: { days, source: 'system_config' } };
    }

    // Fallback to environment variable
    const envDays = parseInt(process.env.TRIAL_DAYS || '7', 10);
    logger.debug('[memberService] getTrialDays: from env fallback', { days: envDays });
    return { success: true, data: { days: envDays, source: 'env' } };
  } catch (err) {
    logger.error('[memberService] getTrialDays: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Set trial days configuration
 * Story 16.7: ADR-001 - Store in system_config
 * @param {number} days - Number of trial days (1-30)
 * @param {string} operatorUsername - Operator performing the change
 * @returns {Promise<{success: boolean, data?: {oldValue, newValue}, error?: object}>}
 */
async function setTrialDays(days, operatorUsername) {
  try {
    // Validate range
    if (days < 1 || days > 30) {
      return { success: false, error: { code: 'INVALID_VALUE', message: 'Trial days must be between 1 and 30' } };
    }

    // Get current value
    const currentResult = await getTrialDays();
    const oldValue = currentResult.success ? currentResult.data.days : null;

    // Upsert the value
    const { error } = await supabase
      .from('system_config')
      .upsert({
        key: 'TRIAL_DAYS',
        value: days.toString(),
        updated_at: new Date().toISOString(),
        updated_by: operatorUsername
      }, { onConflict: 'key' });

    if (error) {
      logger.error('[memberService] setTrialDays: database error', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] setTrialDays: success', {
      operator: operatorUsername,
      oldValue,
      newValue: days
    });

    return { success: true, data: { oldValue, newValue: days } };
  } catch (err) {
    logger.error('[memberService] setTrialDays: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get members that need reconciliation with Mercado Pago
 * Story 16.8: Members with active status and subscription that need status verification
 * Returns only active members with mp_subscription_id (trial members are ignored)
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getMembersForReconciliation() {
  try {
    // H1 FIX: Query only 'ativo' status directly - don't fetch trial members just to filter them out
    const { data, error } = await supabase
      .from('members')
      .select('id, telegram_id, telegram_username, email, status, mp_subscription_id')
      .eq('status', 'ativo')
      .not('mp_subscription_id', 'is', null);

    if (error) {
      logger.error('[memberService] getMembersForReconciliation: database error', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] getMembersForReconciliation: found members', {
      count: data?.length || 0
    });

    return { success: true, data: data || [] };
  } catch (err) {
    logger.error('[memberService] getMembersForReconciliation: unexpected error', { error: err.message });
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

// ============================================
// Story 18.1: Affiliate Tracking Functions
// ============================================

/**
 * Set affiliate code for a member (last-click attribution model)
 * Story 18.1: Tracking de Afiliados e Entrada
 *
 * Updates affiliate_code, affiliate_clicked_at, and appends to affiliate_history.
 * Implements last-click model: new affiliate overwrites previous.
 *
 * @param {number} memberId - Internal member ID
 * @param {string} affiliateCode - Affiliate code from deep link
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function setAffiliateCode(memberId, affiliateCode) {
  try {
    if (!affiliateCode || typeof affiliateCode !== 'string') {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Affiliate code is required' }
      };
    }

    // Get current member to preserve history
    const memberResult = await getMemberById(memberId);
    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;
    const now = new Date().toISOString();

    // Parse existing history (default to empty array)
    let history = [];
    try {
      history = member.affiliate_history || [];
      if (typeof history === 'string') {
        history = JSON.parse(history);
      }
    } catch {
      logger.warn('[membership:affiliate] Failed to parse affiliate_history, starting fresh', { memberId });
      history = [];
    }

    // Append new click to history (never delete previous entries)
    history.push({ code: affiliateCode, clicked_at: now });

    // Update member with new affiliate data
    const { data, error } = await supabase
      .from('members')
      .update({
        affiliate_code: affiliateCode,
        affiliate_clicked_at: now,
        affiliate_history: history
      })
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      logger.error('[membership:affiliate] setAffiliateCode: database error', {
        memberId,
        affiliateCode,
        error: error.message
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[membership:affiliate] Affiliate code set', {
      memberId,
      affiliateCode,
      previousCode: member.affiliate_code,
      historyCount: history.length
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[membership:affiliate] setAffiliateCode: unexpected error', {
      memberId,
      error: err.message
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get affiliate history for a member
 * Story 18.1: Tracking de Afiliados e Entrada
 *
 * Returns the full append-only history of affiliate clicks.
 *
 * @param {number} memberId - Internal member ID
 * @returns {Promise<{success: boolean, data?: {history: Array, currentCode: string|null}, error?: object}>}
 */
async function getAffiliateHistory(memberId) {
  try {
    const memberResult = await getMemberById(memberId);
    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;

    // Parse history
    let history = [];
    try {
      history = member.affiliate_history || [];
      if (typeof history === 'string') {
        history = JSON.parse(history);
      }
    } catch {
      history = [];
    }

    return {
      success: true,
      data: {
        history,
        currentCode: member.affiliate_code,
        clickedAt: member.affiliate_clicked_at
      }
    };
  } catch (err) {
    logger.error('[membership:affiliate] getAffiliateHistory: unexpected error', {
      memberId,
      error: err.message
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Check if affiliate attribution is valid (within 14-day window)
 * Story 18.1 / 18.2: Lógica de Expiração de Atribuição
 *
 * @param {object} member - Member object with affiliate_code and affiliate_clicked_at
 * @returns {boolean} - True if affiliate is valid (clicked within 14 days)
 */
function isAffiliateValid(member) {
  if (!member || !member.affiliate_code || !member.affiliate_clicked_at) {
    return false;
  }

  const clickedAt = new Date(member.affiliate_clicked_at);
  const now = new Date();
  const daysSinceClick = (now.getTime() - clickedAt.getTime()) / (1000 * 60 * 60 * 24);

  // Valid if clicked within 14 days
  return daysSinceClick < 14;
}

/**
 * Clear expired affiliate attributions (clicked > 14 days ago)
 * Story 18.2: Lógica de Expiração de Atribuição
 *
 * Clears affiliate_code and affiliate_clicked_at for members whose
 * last affiliate click was more than 14 days ago.
 * Preserves affiliate_history (never deleted).
 *
 * Edge cases:
 * - Members with affiliate_code but NULL affiliate_clicked_at are NOT expired
 *   (can't determine expiration date, likely data inconsistency)
 * - Uses batch processing (500 at a time) to avoid Supabase query limits
 *
 * @returns {Promise<{success: boolean, data?: {cleared: number}, error?: object}>}
 */
async function clearExpiredAffiliates() {
  const BATCH_SIZE = 500; // Supabase IN clause limit safety margin

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    // Find members with expired affiliates
    // Note: Members with affiliate_code but NULL affiliate_clicked_at are NOT selected
    // (NULL < date evaluates to false in PostgreSQL)
    const { data: expired, error: selectError } = await supabase
      .from('members')
      .select('id, telegram_id, affiliate_code')
      .not('affiliate_code', 'is', null)
      .lt('affiliate_clicked_at', cutoffDate.toISOString());

    if (selectError) {
      logger.error('[membership:check-affiliate-expiration] clearExpiredAffiliates: select error', {
        error: selectError.message,
      });
      return { success: false, error: { code: 'DB_ERROR', message: selectError.message } };
    }

    if (!expired || expired.length === 0) {
      logger.info('[membership:check-affiliate-expiration] clearExpiredAffiliates: no expired affiliates found');
      return { success: true, data: { cleared: 0 } };
    }

    // Process in batches to avoid Supabase IN clause limits
    const ids = expired.map((m) => m.id);
    let processedCount = 0;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);

      const { error: updateError } = await supabase
        .from('members')
        .update({
          affiliate_code: null,
          affiliate_clicked_at: null,
          updated_at: new Date().toISOString(),
        })
        .in('id', batchIds);

      if (updateError) {
        logger.error('[membership:check-affiliate-expiration] clearExpiredAffiliates: update error', {
          error: updateError.message,
          batch: Math.floor(i / BATCH_SIZE) + 1,
          batchSize: batchIds.length,
          processedSoFar: processedCount,
        });
        return { success: false, error: { code: 'DB_ERROR', message: updateError.message } };
      }

      processedCount += batchIds.length;
    }

    // Log without exposing full affiliate codes (privacy)
    logger.info('[membership:check-affiliate-expiration] clearExpiredAffiliates: cleared expired affiliates', {
      count: expired.length,
      batches: Math.ceil(ids.length / BATCH_SIZE),
    });

    return { success: true, data: { cleared: expired.length } };
  } catch (err) {
    logger.error('[membership:check-affiliate-expiration] clearExpiredAffiliates: unexpected error', {
      error: err.message,
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Generate payment link with affiliate tracking when applicable
 * Story 18.3: Link de Pagamento Dinamico com Tracking
 *
 * Uses isAffiliateValid() to check if affiliate attribution is valid (within 14 days).
 * If valid, appends affiliate code to checkout URL.
 *
 * @param {object} member - Member object with affiliate_code and affiliate_clicked_at
 * @returns {{success: boolean, data?: {url: string, hasAffiliate: boolean, affiliateCode: string|null}, error?: object}}
 */
function generatePaymentLink(member) {
  const checkoutUrl = config.membership?.checkoutUrl;

  if (!checkoutUrl) {
    logger.warn('[membership:payment-link] generatePaymentLink: CAKTO_CHECKOUT_URL not configured');
    return {
      success: false,
      error: { code: 'CONFIG_MISSING', message: 'CAKTO_CHECKOUT_URL not configured' }
    };
  }

  // Validate member input - return generic link if null/undefined
  if (!member) {
    logger.debug('[membership:payment-link] generatePaymentLink: no member provided, using generic link');
    return {
      success: true,
      data: { url: checkoutUrl, hasAffiliate: false, affiliateCode: null }
    };
  }

  // Check if affiliate is valid using existing function
  const hasValidAffiliate = isAffiliateValid(member);

  if (hasValidAffiliate) {
    const affiliateCode = member.affiliate_code;
    const url = `${checkoutUrl}?affiliate=${encodeURIComponent(affiliateCode)}`;

    logger.info('[membership:payment-link] Generated link with affiliate tracking', {
      memberId: member.id,
      telegramId: member.telegram_id,
      hasAffiliate: true,
      affiliateCode
    });

    return {
      success: true,
      data: { url, hasAffiliate: true, affiliateCode }
    };
  }

  // No valid affiliate - return plain URL (debug level - routine case)
  logger.debug('[membership:payment-link] Generated link without affiliate tracking', {
    memberId: member.id,
    telegramId: member.telegram_id,
    hasAffiliate: false,
    reason: !member.affiliate_code ? 'no_affiliate_code' : 'affiliate_expired'
  });

  return {
    success: true,
    data: { url: checkoutUrl, hasAffiliate: false, affiliateCode: null }
  };
}

// ============================================
// MERCADO PAGO FUNCTIONS
// Tech-Spec: Migração Cakto → Mercado Pago
// ============================================

/**
 * Get member by Mercado Pago subscription ID
 * Story 4.3: Added optional groupId parameter for multi-tenant filtering
 * @param {string} subscriptionId - MP preapproval ID
 * @param {string|null} [groupId=undefined] - Group ID for multi-tenant filtering
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMemberBySubscription(subscriptionId, groupId = undefined) {
  try {
    if (!subscriptionId) {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'subscriptionId is required' }
      };
    }

    const effectiveGroupId = resolveGroupId(groupId);

    let query = supabase
      .from('members')
      .select('*')
      .eq('mp_subscription_id', subscriptionId);

    // Story 4.3: Filter by group_id when provided (multi-tenant)
    if (effectiveGroupId) {
      query = query.eq('group_id', effectiveGroupId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: false,
          error: { code: 'MEMBER_NOT_FOUND', message: `Member with subscription ${subscriptionId} not found` }
        };
      }
      logger.error('[memberService] getMemberBySubscription: database error', { subscriptionId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] getMemberBySubscription: unexpected error', { subscriptionId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get member by Mercado Pago payer ID
 * Story 3.1: Added optional groupId parameter for multi-tenant filtering
 * @param {string} payerId - MP payer ID
 * @param {string|null} [groupId=null] - Group ID for multi-tenant filtering
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMemberByPayerId(payerId, groupId = undefined) {
  try {
    if (!payerId) {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'payerId is required' }
      };
    }

    const effectiveGroupId = resolveGroupId(groupId);

    let query = supabase
      .from('members')
      .select('*')
      .eq('mp_payer_id', payerId.toString());

    // Story 3.1: Filter by group_id when provided (multi-tenant)
    if (effectiveGroupId) {
      query = query.eq('group_id', effectiveGroupId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      logger.error('[memberService] getMemberByPayerId: database error', { payerId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    if (!data) {
      return { success: false, error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found' } };
    }

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] getMemberByPayerId: unexpected error', { payerId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Create a trial member from Mercado Pago subscription
 * MP manages the trial period (7 days free, then charges automatically)
 * Story 3.1: Added optional groupId parameter for multi-tenant support
 * @param {object} memberData - Member data from MP
 * @param {string} memberData.email - Email from MP payer
 * @param {string} memberData.subscriptionId - MP preapproval ID
 * @param {string} memberData.payerId - MP payer ID
 * @param {string} [memberData.couponCode] - Affiliate coupon used at checkout
 * @param {string} [memberData.groupId] - Group ID for multi-tenant (optional)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function createTrialMemberMP({ email, subscriptionId, payerId, couponCode, groupId }) {
  try {
    const effectiveGroupId = resolveGroupId(groupId);

    const insertData = {
      email,
      status: 'trial',
      mp_subscription_id: subscriptionId,
      mp_payer_id: payerId
    };

    // Story 3.1: Add group_id for multi-tenant (nullable for backward compat)
    if (effectiveGroupId) {
      insertData.group_id = effectiveGroupId;
    }

    // Add affiliate coupon if provided
    if (couponCode) {
      insertData.affiliate_coupon = couponCode;
    }

    const { data, error } = await supabase
      .from('members')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        logger.warn('[memberService] createTrialMemberMP: email already exists', { email });
        return {
          success: false,
          error: { code: 'MEMBER_ALREADY_EXISTS', message: `Member with email ${email} already exists` }
        };
      }
      logger.error('[memberService] createTrialMemberMP: database error', { email, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] createTrialMemberMP: success', {
      memberId: data.id,
      email,
      subscriptionId,
      hasCoupon: !!couponCode
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] createTrialMemberMP: unexpected error', { email, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Update subscription data for an existing member
 * Used when member already exists and makes a new subscription
 * @param {number} memberId - Internal member ID
 * @param {object} subscriptionData - Data to update
 * @param {string} subscriptionData.subscriptionId - MP preapproval ID
 * @param {string} [subscriptionData.payerId] - MP payer ID
 * @param {string} [subscriptionData.couponCode] - Affiliate coupon
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function updateSubscriptionData(memberId, { subscriptionId, payerId, couponCode }) {
  try {
    const updateData = {
      mp_subscription_id: subscriptionId
    };

    if (payerId) {
      updateData.mp_payer_id = payerId;
    }

    if (couponCode) {
      updateData.affiliate_coupon = couponCode;
    }

    const { data, error } = await supabase
      .from('members')
      .update(updateData)
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      logger.error('[memberService] updateSubscriptionData: database error', { memberId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] updateSubscriptionData: success', {
      memberId,
      subscriptionId
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] updateSubscriptionData: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Link telegram_id to an existing member (for MP flow where payment happens before /start)
 * @param {number} memberId - Internal member ID
 * @param {number|string} telegramId - Telegram user ID to link
 * @param {string} [telegramUsername] - Telegram username (optional)
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function linkTelegramId(memberId, telegramId, telegramUsername = null) {
  try {
    if (!memberId || !telegramId) {
      return {
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Member ID and Telegram ID are required' }
      };
    }

    // Check if this telegram_id is already linked to another member
    const existingResult = await getMemberByTelegramId(telegramId);
    if (existingResult.success) {
      // Already has a member with this telegram_id
      if (existingResult.data.id === memberId) {
        // Same member - already linked
        return { success: true, data: existingResult.data };
      }
      return {
        success: false,
        error: { code: 'TELEGRAM_ALREADY_LINKED', message: 'Este Telegram já está vinculado a outra conta' }
      };
    }

    const updateData = {
      telegram_id: telegramId.toString(),
      updated_at: new Date().toISOString()
    };

    if (telegramUsername) {
      updateData.telegram_username = telegramUsername;
    }

    const { data, error } = await supabase
      .from('members')
      .update(updateData)
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      logger.error('[memberService] linkTelegramId: database error', { memberId, telegramId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] linkTelegramId: success', {
      memberId,
      telegramId,
      telegramUsername
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] linkTelegramId: unexpected error', { memberId, telegramId, error: err.message });
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

  // Story 16.10: Reactivate removed member after payment
  reactivateRemovedMember,

  // Story 16.4: Member entry detection helpers
  canRejoinGroup,
  reactivateMember,

  // Story 16.6: Kick expired members helpers
  kickMemberFromGroup,
  markMemberAsRemoved,

  // Story 16.7: Statistics functions (AC: #1)
  getMemberStats,
  calculateMRR,
  calculateConversionRate,
  getNewMembersThisWeek,

  // Story 16.7: CRUD functions for admin commands (Task 2)
  getMemberDetails,
  getNotificationHistory,
  addManualTrialMember,
  extendMembership,
  appendToNotes,

  // Story 16.7: System config functions (Task 5)
  getTrialDays,
  setTrialDays,

  // Story 16.8: Reconciliation helpers
  getMembersForReconciliation,

  // Story 18.1: Affiliate tracking functions
  setAffiliateCode,
  getAffiliateHistory,
  isAffiliateValid,

  // Story 18.2: Affiliate expiration
  clearExpiredAffiliates,

  // Story 18.3: Payment link with affiliate tracking
  generatePaymentLink,

  // Tech-Spec: Migração Mercado Pago
  getMemberBySubscription,
  getMemberByPayerId,
  createTrialMemberMP,
  updateSubscriptionData,
  linkTelegramId,
};
