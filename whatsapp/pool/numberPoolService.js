const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { validateE164, phoneToJid } = require('../../lib/phoneUtils');

const MAX_NUMBERS_PER_GROUP = config.whatsapp?.maxNumbersPerGroup ?? 3;
const POOL_WARN_THRESHOLD = config.whatsapp?.poolWarnThreshold ?? 5;

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

/**
 * Get all numbers allocated to a specific group.
 * @param {string} groupId - UUID
 * @returns {{ success: boolean, data?: Object[], error?: { code: string, message: string } }}
 */
async function getGroupNumbers(groupId) {
  const { data, error } = await supabase
    .from('whatsapp_numbers')
    .select('*')
    .eq('group_id', groupId)
    .order('role', { ascending: true });

  if (error) {
    logger.error('Failed to get group numbers', { groupId, error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  return { success: true, data: data || [] };
}

/**
 * Allocate available numbers from the global pool to a group.
 * Assigns 1 active + up to (maxNumbersPerGroup - 1) backup.
 * @param {string} groupId - UUID of the group
 * @returns {{ success: boolean, data?: { allocated: Object[], total: number }, error?: { code: string, message: string } }}
 */
async function allocateToGroup(groupId) {
  // Check current allocation for the group
  const existing = await getGroupNumbers(groupId);
  if (!existing.success) return existing;

  const currentCount = existing.data.length;
  if (currentCount >= MAX_NUMBERS_PER_GROUP) {
    return {
      success: false,
      error: { code: 'GROUP_FULL', message: `Group already has ${currentCount} numbers (max ${MAX_NUMBERS_PER_GROUP})` },
    };
  }

  const needed = MAX_NUMBERS_PER_GROUP - currentCount;

  // Fetch available numbers (not allocated to any group)
  const { data: available, error: fetchError } = await supabase
    .from('whatsapp_numbers')
    .select('*')
    .eq('status', 'available')
    .is('group_id', null)
    .order('created_at', { ascending: true })
    .limit(needed);

  if (fetchError) {
    logger.error('Failed to fetch available numbers', { groupId, error: fetchError.message });
    return { success: false, error: { code: 'DB_ERROR', message: fetchError.message } };
  }

  if (!available || available.length === 0) {
    return {
      success: false,
      error: { code: 'NO_NUMBERS_AVAILABLE', message: 'No available numbers in the pool' },
    };
  }

  // Determine roles: first unassigned slot gets active, rest get backup
  const hasActive = existing.data.some((n) => n.role === 'active');
  const allocated = [];

  for (let i = 0; i < available.length; i++) {
    const number = available[i];
    const role = (!hasActive && i === 0) ? 'active' : 'backup';
    const status = role === 'active' ? 'active' : 'backup';

    const { data: updated, error: updateError } = await supabase
      .from('whatsapp_numbers')
      .update({
        group_id: groupId,
        role,
        status,
        allocated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', number.id)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to allocate number', { numberId: number.id, groupId, error: updateError.message });
      continue;
    }

    allocated.push(updated);
  }

  if (allocated.length < needed) {
    logger.warn('Partial allocation — not enough numbers in pool', {
      groupId,
      needed,
      allocated: allocated.length,
    });
  }

  logger.info('Numbers allocated to group', { groupId, count: allocated.length });
  return { success: true, data: { allocated, total: currentCount + allocated.length } };
}

/**
 * Deallocate a number from its group, resetting to available.
 * @param {string} numberId - UUID
 * @returns {{ success: boolean, data?: Object, error?: { code: string, message: string } }}
 */
async function deallocateFromGroup(numberId) {
  const current = await getNumberById(numberId);
  if (!current.success) return current;

  if (!current.data.group_id) {
    return {
      success: false,
      error: { code: 'NOT_ALLOCATED', message: 'Number is not allocated to any group' },
    };
  }

  const { data, error } = await supabase
    .from('whatsapp_numbers')
    .update({
      group_id: null,
      role: null,
      status: 'available',
      allocated_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', numberId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to deallocate number', { numberId, error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  logger.info('Number deallocated from group', { numberId, previousGroup: current.data.group_id });
  return { success: true, data };
}

/**
 * Handle a number being banned: mark as banned, clear group and role.
 * @param {string} numberId - UUID
 * @returns {{ success: boolean, data?: Object, error?: { code: string, message: string } }}
 */
async function handleBan(numberId) {
  const { data, error } = await supabase
    .from('whatsapp_numbers')
    .update({
      status: 'banned',
      group_id: null,
      role: null,
      banned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', numberId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to handle ban', { numberId, error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  logger.warn('Number banned and deallocated', { numberId, phone: data.phone_number });
  return { success: true, data };
}

/**
 * Check pool health: count available numbers vs threshold.
 * @returns {{ success: boolean, data?: { available: number, threshold: number, healthy: boolean } }}
 */
async function checkPoolHealth() {
  const { data, error } = await supabase
    .from('whatsapp_numbers')
    .select('id', { count: 'exact' })
    .eq('status', 'available')
    .is('group_id', null);

  if (error) {
    logger.error('Failed to check pool health', { error: error.message });
    return { success: false, error: { code: 'DB_ERROR', message: error.message } };
  }

  const availableCount = data ? data.length : 0;
  const healthy = availableCount >= POOL_WARN_THRESHOLD;

  if (!healthy) {
    logger.warn('Pool stock low', { available: availableCount, threshold: POOL_WARN_THRESHOLD });
  }

  return {
    success: true,
    data: { available: availableCount, threshold: POOL_WARN_THRESHOLD, healthy },
  };
}

module.exports = {
  addNumber,
  listNumbers,
  getNumberById,
  updateNumberStatus,
  removeNumber,
  getGroupNumbers,
  allocateToGroup,
  deallocateFromGroup,
  handleBan,
  checkPoolHealth,
};
