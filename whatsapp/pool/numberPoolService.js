const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { validateE164, phoneToJid } = require('../../lib/phoneUtils');

// Valid status transitions
const VALID_TRANSITIONS = {
  connecting: ['available', 'banned'],
  available: ['active', 'backup', 'connecting', 'cooldown'],
  active: ['available', 'banned', 'cooldown'],
  backup: ['active', 'available', 'banned'],
  banned: ['cooldown'],
  cooldown: ['available'],
};

/**
 * Add a new WhatsApp number to the pool.
 * @param {string} phoneNumber - E.164 format phone number
 * @returns {{ success: boolean, data?: Object, error?: { code: string, message: string } }}
 */
async function addNumber(phoneNumber) {
  const validation = validateE164(phoneNumber);
  if (!validation.valid) {
    return { success: false, error: { code: 'INVALID_PHONE', message: validation.error } };
  }

  const jid = phoneToJid(phoneNumber);

  const { data, error } = await supabase
    .from('whatsapp_numbers')
    .insert({
      phone_number: phoneNumber,
      jid,
      status: 'connecting',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: { code: 'DUPLICATE_NUMBER', message: 'Phone number already exists in pool' } };
    }
    logger.error('Failed to add number', { phoneNumber, error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  logger.info('Number added to pool', { id: data.id, phoneNumber });
  return { success: true, data };
}

/**
 * List all numbers in the pool with optional status filter.
 * @param {{ status?: string }} options
 * @returns {{ success: boolean, data?: Object[], error?: { code: string, message: string } }}
 */
async function listNumbers({ status } = {}) {
  let query = supabase
    .from('whatsapp_numbers')
    .select('*')
    .order('created_at', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Failed to list numbers', { error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  return { success: true, data: data || [] };
}

/**
 * Get a single number by ID.
 * @param {string} numberId - UUID
 * @returns {{ success: boolean, data?: Object, error?: { code: string, message: string } }}
 */
async function getNumberById(numberId) {
  const { data, error } = await supabase
    .from('whatsapp_numbers')
    .select('*')
    .eq('id', numberId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Number not found' } };
    }
    logger.error('Failed to get number', { numberId, error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  return { success: true, data };
}

/**
 * Update the status of a number with transition validation.
 * @param {string} numberId - UUID
 * @param {string} newStatus - Target status
 * @returns {{ success: boolean, data?: Object, error?: { code: string, message: string } }}
 */
async function updateNumberStatus(numberId, newStatus) {
  const current = await getNumberById(numberId);
  if (!current.success) return current;

  const currentStatus = current.data.status;
  const allowed = VALID_TRANSITIONS[currentStatus];

  if (!allowed || !allowed.includes(newStatus)) {
    return {
      success: false,
      error: {
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
      },
    };
  }

  const update = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === 'banned') {
    update.banned_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('whatsapp_numbers')
    .update(update)
    .eq('id', numberId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update number status', { numberId, newStatus, error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  logger.info('Number status updated', { numberId, from: currentStatus, to: newStatus });
  return { success: true, data };
}

/**
 * Remove a number from the pool.
 * @param {string} numberId - UUID
 * @returns {{ success: boolean, error?: { code: string, message: string } }}
 */
async function removeNumber(numberId) {
  const { error } = await supabase
    .from('whatsapp_numbers')
    .delete()
    .eq('id', numberId);

  if (error) {
    logger.error('Failed to remove number', { numberId, error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  logger.info('Number removed from pool', { numberId });
  return { success: true };
}

module.exports = { addNumber, listNumbers, getNumberById, updateNumberStatus, removeNumber };
