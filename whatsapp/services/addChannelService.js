/**
 * Orchestrates adding WhatsApp channel to an existing group.
 * Chains: allocate numbers → create group → generate invite link.
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { allocateToGroup } = require('../pool/numberPoolService');
const { createWhatsAppGroup } = require('./groupService');
const { generateInviteLink } = require('./inviteLinkService');

/**
 * Add WhatsApp channel to an existing group (1-click).
 * @param {string} groupId - UUID of the platform group
 * @returns {Promise<{success: boolean, data?: {groupJid: string, inviteLink: string, numbersAllocated: number}, error?: {code: string, message: string, step?: string}}>}
 */
async function addWhatsAppChannel(groupId) {
  // 1. Validate group exists and doesn't have WhatsApp yet
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, whatsapp_group_jid, channels')
    .eq('id', groupId)
    .single();

  if (groupError || !group) {
    return { success: false, error: { code: 'GROUP_NOT_FOUND', message: `Group ${groupId} not found` } };
  }

  if (group.whatsapp_group_jid) {
    return { success: false, error: { code: 'ALREADY_EXISTS', message: 'Grupo ja possui WhatsApp' } };
  }

  // 2. Allocate numbers from pool
  const allocResult = await allocateToGroup(groupId);
  if (!allocResult.success) {
    return { success: false, error: { ...allocResult.error, step: 'allocate' } };
  }

  const numbersAllocated = allocResult.data.length;
  logger.info('Numbers allocated for WhatsApp channel', { groupId, count: numbersAllocated });

  // 3. Create WhatsApp group
  const createResult = await createWhatsAppGroup(groupId, group.name);
  if (!createResult.success) {
    return { success: false, error: { ...createResult.error, step: 'create_group' } };
  }

  const { groupJid } = createResult.data;

  // 4. Generate invite link
  const inviteResult = await generateInviteLink(groupId);
  if (!inviteResult.success) {
    // Group was created but invite link failed — return partial success info
    logger.warn('WhatsApp channel added but invite link generation failed', { groupId, groupJid });
    return {
      success: true,
      data: { groupJid, inviteLink: null, numbersAllocated },
    };
  }

  const { inviteLink } = inviteResult.data;

  logger.info('WhatsApp channel added successfully', { groupId, groupJid, inviteLink, numbersAllocated });
  return { success: true, data: { groupJid, inviteLink, numbersAllocated } };
}

module.exports = { addWhatsAppChannel };
