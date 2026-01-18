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
  updateMemberStatus,
  createTrialMember,
  getTrialDaysRemaining
};
