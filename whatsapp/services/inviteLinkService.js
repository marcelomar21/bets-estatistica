/**
 * WhatsApp invite link management service.
 * Generates and revokes invite links for WhatsApp groups.
 */
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { getClient } = require('../clientRegistry');

/**
 * Find the active number's client for a group.
 * @param {string} groupId - UUID of the platform group
 * @returns {{client: object, groupJid: string} | {error: {code: string, message: string}}}
 */
async function resolveGroupClient(groupId) {
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, whatsapp_group_jid')
    .eq('id', groupId)
    .single();

  if (groupError || !group) {
    return { error: { code: 'GROUP_NOT_FOUND', message: `Group ${groupId} not found` } };
  }

  if (!group.whatsapp_group_jid) {
    return { error: { code: 'NO_WHATSAPP_GROUP', message: 'Grupo nao tem WhatsApp configurado' } };
  }

  const { data: numbers } = await supabase
    .from('whatsapp_numbers')
    .select('id, role')
    .eq('group_id', groupId)
    .eq('role', 'active');

  const activeNumber = numbers && numbers[0];
  if (!activeNumber) {
    return { error: { code: 'NO_ACTIVE_NUMBER', message: 'Nenhum numero ativo alocado' } };
  }

  const client = getClient(activeNumber.id);
  if (!client) {
    return { error: { code: 'CLIENT_NOT_CONNECTED', message: 'Numero ativo nao esta conectado' } };
  }

  return { client, groupJid: group.whatsapp_group_jid };
}

/**
 * Generate an invite link for a group's WhatsApp group.
 * @param {string} groupId - UUID of the platform group
 * @returns {Promise<{success: boolean, data?: {inviteLink: string}, error?: {code: string, message: string}}>}
 */
async function generateInviteLink(groupId) {
  const resolved = await resolveGroupClient(groupId);
  if (resolved.error) {
    return { success: false, error: resolved.error };
  }

  const { client, groupJid } = resolved;
  const result = await client.getGroupInviteLink(groupJid);

  if (!result.success) {
    return result;
  }

  const { inviteLink } = result.data;

  const { error: updateError } = await supabase
    .from('groups')
    .update({ whatsapp_invite_link: inviteLink })
    .eq('id', groupId);

  if (updateError) {
    logger.error('Failed to save invite link', { groupId, error: updateError.message });
    return { success: false, error: { code: 'DB_ERROR', message: 'Link gerado mas falhou ao salvar no banco' } };
  }

  logger.info('Invite link generated', { groupId, inviteLink });
  return { success: true, data: { inviteLink } };
}

/**
 * Revoke the current invite link and generate a new one.
 * @param {string} groupId - UUID of the platform group
 * @returns {Promise<{success: boolean, data?: {inviteLink: string}, error?: {code: string, message: string}}>}
 */
async function revokeInviteLink(groupId) {
  const resolved = await resolveGroupClient(groupId);
  if (resolved.error) {
    return { success: false, error: resolved.error };
  }

  const { client, groupJid } = resolved;
  const result = await client.revokeGroupInviteLink(groupJid);

  if (!result.success) {
    return result;
  }

  const { inviteLink } = result.data;

  const { error: updateError } = await supabase
    .from('groups')
    .update({ whatsapp_invite_link: inviteLink })
    .eq('id', groupId);

  if (updateError) {
    logger.error('Failed to save new invite link after revoke', { groupId, error: updateError.message });
    return { success: false, error: { code: 'DB_ERROR', message: 'Link revogado mas falhou ao salvar novo no banco' } };
  }

  logger.info('Invite link revoked and regenerated', { groupId, inviteLink });
  return { success: true, data: { inviteLink } };
}

module.exports = { generateInviteLink, revokeInviteLink, resolveGroupClient };
