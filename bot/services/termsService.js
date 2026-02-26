/**
 * Terms Service - Register and query terms of adhesion acceptance
 * Story 3.1: Tabela terms_acceptance com Imutabilidade
 *
 * Pattern P4: Insert-only (append-only) — never update or delete records.
 * Returns { success, data/error } pattern per project convention.
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');

/**
 * Resolve group context for multi-tenant operations.
 * Same pattern as memberService.resolveGroupId.
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
 * Register a terms acceptance record (append-only insert).
 * @param {number} telegramId - Telegram user ID
 * @param {string|undefined} groupId - Group UUID (uses config fallback if omitted)
 * @param {string} termsVersion - Version of the accepted terms (e.g. '1.0')
 * @param {string} termsUrl - URL of the terms document
 * @param {object} ipMetadata - Optional metadata (IP, user agent, etc.)
 * @returns {{ success: boolean, data?: { id: string, accepted_at: string }, error?: { code: string, message: string } }}
 */
async function acceptTerms(telegramId, groupId, termsVersion, termsUrl, ipMetadata = {}) {
  try {
    const effectiveGroupId = resolveGroupId(groupId);

    const { data, error } = await supabase
      .from('terms_acceptance')
      .insert([{
        telegram_id: telegramId,
        group_id: effectiveGroupId,
        terms_version: termsVersion,
        terms_url: termsUrl,
        ip_metadata: ipMetadata
      }])
      .select('id, accepted_at');

    if (error) {
      logger.error('[terms] acceptTerms: database error', {
        telegramId,
        groupId: effectiveGroupId,
        error: error.message
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[terms] Terms accepted', {
      telegramId,
      groupId: effectiveGroupId,
      termsVersion,
      acceptanceId: data[0].id
    });

    return { success: true, data: data[0] };
  } catch (err) {
    logger.error('[terms] acceptTerms: unexpected error', {
      telegramId,
      error: err.message
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get the most recent terms acceptance for a user in a group.
 * @param {number} telegramId - Telegram user ID
 * @param {string|undefined} groupId - Group UUID (uses config fallback if omitted)
 * @returns {{ success: boolean, data?: object|null, error?: { code: string, message: string } }}
 */
async function getLatestAcceptance(telegramId, groupId) {
  try {
    const effectiveGroupId = resolveGroupId(groupId);

    let query = supabase
      .from('terms_acceptance')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('accepted_at', { ascending: false })
      .limit(1);

    if (effectiveGroupId) {
      query = query.eq('group_id', effectiveGroupId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('[terms] getLatestAcceptance: database error', {
        telegramId,
        groupId: effectiveGroupId,
        error: error.message
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { success: true, data: data.length > 0 ? data[0] : null };
  } catch (err) {
    logger.error('[terms] getLatestAcceptance: unexpected error', {
      telegramId,
      error: err.message
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Check if a user has accepted a specific terms version for a group.
 * @param {number} telegramId - Telegram user ID
 * @param {string|undefined} groupId - Group UUID (uses config fallback if omitted)
 * @param {string} termsVersion - Version to check (e.g. '1.0')
 * @returns {{ success: boolean, data?: { accepted: boolean, acceptance?: object }, error?: { code: string, message: string } }}
 */
async function hasAcceptedVersion(telegramId, groupId, termsVersion) {
  try {
    const effectiveGroupId = resolveGroupId(groupId);

    let query = supabase
      .from('terms_acceptance')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('terms_version', termsVersion)
      .order('accepted_at', { ascending: false })
      .limit(1);

    if (effectiveGroupId) {
      query = query.eq('group_id', effectiveGroupId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('[terms] hasAcceptedVersion: database error', {
        telegramId,
        groupId: effectiveGroupId,
        termsVersion,
        error: error.message
      });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    if (data.length > 0) {
      return { success: true, data: { accepted: true, acceptance: data[0] } };
    }

    return { success: true, data: { accepted: false } };
  } catch (err) {
    logger.error('[terms] hasAcceptedVersion: unexpected error', {
      telegramId,
      error: err.message
    });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

module.exports = {
  acceptTerms,
  getLatestAcceptance,
  hasAcceptedVersion
};
