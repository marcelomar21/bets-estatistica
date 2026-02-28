/**
 * WhatsApp group management service.
 * Creates and configures WhatsApp groups for influencer groups.
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { getClient } = require('../clientRegistry');

/**
 * Create a WhatsApp group for an existing platform group.
 * Uses the active number's BaileyClient to create the group,
 * adds all allocated numbers as admins, and sets announce mode.
 *
 * @param {string} groupId - UUID of the platform group
 * @param {string} groupName - Name for the WhatsApp group
 * @returns {Promise<{success: boolean, data?: {groupJid: string}, error?: {code: string, message: string}}>}
 */
async function createWhatsAppGroup(groupId, groupName) {
  // 1. Check if group already has WhatsApp
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, whatsapp_group_jid, channels')
    .eq('id', groupId)
    .single();

  if (groupError || !group) {
    return { success: false, error: { code: 'GROUP_NOT_FOUND', message: `Group ${groupId} not found` } };
  }

  if (group.whatsapp_group_jid) {
    return { success: false, error: { code: 'ALREADY_EXISTS', message: 'Group already has a WhatsApp group' } };
  }

  // 2. Get allocated numbers for this group
  const { data: numbers, error: numbersError } = await supabase
    .from('whatsapp_numbers')
    .select('id, jid, role, status')
    .eq('group_id', groupId)
    .in('role', ['active', 'backup']);

  if (numbersError) {
    return { success: false, error: { code: 'DB_ERROR', message: numbersError.message } };
  }

  if (!numbers || numbers.length === 0) {
    return { success: false, error: { code: 'NO_NUMBERS_ALLOCATED', message: 'Aloque numeros do pool antes de criar o grupo WhatsApp' } };
  }

  // 3. Find the active number's client
  const activeNumber = numbers.find((n) => n.role === 'active');
  if (!activeNumber) {
    return { success: false, error: { code: 'NO_ACTIVE_NUMBER', message: 'Nenhum numero ativo alocado para este grupo' } };
  }

  const activeClient = getClient(activeNumber.id);
  if (!activeClient) {
    return { success: false, error: { code: 'CLIENT_NOT_CONNECTED', message: 'Numero ativo nao esta conectado ao WhatsApp' } };
  }

  // 4. Collect backup JIDs as participants (active number creates the group, so it's already in)
  const backupJids = numbers
    .filter((n) => n.role === 'backup' && n.jid)
    .map((n) => n.jid);

  // 5. Create the group via Baileys
  const name = groupName || group.name;
  const createResult = await activeClient.createGroup(name, backupJids);

  if (!createResult.success) {
    return createResult;
  }

  const { groupJid } = createResult.data;

  // 6. Save the WhatsApp group JID and update channels
  const currentChannels = group.channels || ['telegram'];
  const updatedChannels = currentChannels.includes('whatsapp')
    ? currentChannels
    : [...currentChannels, 'whatsapp'];

  const { error: updateError } = await supabase
    .from('groups')
    .update({
      whatsapp_group_jid: groupJid,
      channels: updatedChannels,
    })
    .eq('id', groupId);

  if (updateError) {
    logger.error('Failed to save WhatsApp group JID', { groupId, groupJid, error: updateError.message });
    return { success: false, error: { code: 'DB_ERROR', message: 'Grupo criado mas falhou ao salvar JID no banco' } };
  }

  logger.info('WhatsApp group created successfully', { groupId, groupJid, channels: updatedChannels });

  return { success: true, data: { groupJid } };
}

module.exports = { createWhatsAppGroup };
