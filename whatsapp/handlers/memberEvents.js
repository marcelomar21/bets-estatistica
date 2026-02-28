/**
 * WhatsApp Member Events Handler
 * Story 15-1: Detect new members joining/leaving WhatsApp groups
 * and register them in the members table with channel='whatsapp'.
 */
const logger = require('../../lib/logger');
const { supabase } = require('../../lib/supabase');
const { jidToPhone } = require('../../lib/phoneUtils');
const {
  getMemberByChannelUserId,
  createWhatsAppTrialMember,
  markMemberAsRemoved,
} = require('../../bot/services/memberService');
const { sendDM } = require('../../lib/channelAdapter');

const JID_SUFFIX_GROUP = '@g.us';

/**
 * Resolve group_id from a WhatsApp group JID.
 * Looks up the groups table for a matching whatsapp_group_jid.
 * @param {string} groupJid - WhatsApp group JID (e.g. '120363xxx@g.us')
 * @returns {Promise<string|null>} - Group UUID or null if not found
 */
async function resolveGroupId(groupJid) {
  const { data, error } = await supabase
    .from('groups')
    .select('id')
    .eq('whatsapp_group_jid', groupJid)
    .maybeSingle();

  if (error) {
    logger.error('[wa-member-events] Failed to resolve group', { groupJid, error: error.message });
    return null;
  }

  return data?.id || null;
}

/**
 * Extract phone number from a participant JID.
 * @param {string} participantJid - e.g. '5511999887766@s.whatsapp.net'
 * @returns {string} - E.164 phone number (e.g. '+5511999887766')
 */
function extractPhone(participantJid) {
  return jidToPhone(participantJid);
}

/**
 * Handle group-participants.update event from Baileys.
 * Called by BaileyClient when participants join or leave a group.
 *
 * Event shape from Baileys:
 * { id: groupJid, participants: [jid1, ...], action: 'add' | 'remove' | 'promote' | 'demote' }
 *
 * @param {object} event - Baileys group-participants.update event
 * @param {import('../client/baileyClient').BaileyClient} client - The BaileyClient instance
 */
async function handleGroupParticipantsUpdate(event, client) {
  const { id: groupJid, participants, action } = event;

  // Only handle group JIDs
  if (!groupJid || !groupJid.endsWith(JID_SUFFIX_GROUP)) {
    return;
  }

  // Only process add and remove actions
  if (action !== 'add' && action !== 'remove') {
    return;
  }

  const groupId = await resolveGroupId(groupJid);
  if (!groupId) {
    logger.debug('[wa-member-events] Ignoring event for unregistered group', { groupJid, action });
    return;
  }

  logger.info('[wa-member-events] Processing group event', {
    groupJid, groupId, action, participantCount: participants?.length || 0,
  });

  for (const participantJid of (participants || [])) {
    // Skip our own numbers (bot numbers)
    if (participantJid === client.jid) {
      continue;
    }

    try {
      if (action === 'add') {
        await handleMemberJoin(participantJid, groupId, groupJid);
      } else if (action === 'remove') {
        await handleMemberLeave(participantJid, groupId, groupJid);
      }
    } catch (err) {
      logger.error('[wa-member-events] Error processing participant', {
        participantJid, groupId, action, error: err.message,
      });
    }
  }
}

/**
 * Handle a new member joining the WhatsApp group.
 * Creates a trial member record if they don't already exist.
 * If they're already active via Telegram, skips trial creation.
 */
async function handleMemberJoin(participantJid, groupId, groupJid) {
  const phone = extractPhone(participantJid);
  const WA_TRIAL_DAYS = 3;

  logger.info('[wa-member-events] Member joined', { phone, groupId, groupJid });

  // Check if this member already exists in this group+channel
  const existingResult = await getMemberByChannelUserId(phone, groupId, 'whatsapp');

  if (existingResult.success) {
    const member = existingResult.data;

    // If member was previously removed, they've re-entered — mark for review
    if (member.status === 'removido' || member.status === 'cancelado') {
      logger.info('[wa-member-events] Previously removed member re-joined', {
        memberId: member.id, phone, groupId, previousStatus: member.status,
      });
      // Update status back to trial for removed members re-entering
      const { error } = await supabase
        .from('members')
        .update({
          status: 'trial',
          trial_started_at: new Date().toISOString(),
          trial_ends_at: new Date(Date.now() + WA_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          kicked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.id);

      if (error) {
        logger.error('[wa-member-events] Failed to reactivate member', { memberId: member.id, error: error.message });
      }
      return;
    }

    // Already active/trial — nothing to do
    logger.debug('[wa-member-events] Member already exists, skipping', {
      memberId: member.id, phone, status: member.status,
    });
    return;
  }

  // Create new trial member for WhatsApp (3-day trial per epics spec)
  const createResult = await createWhatsAppTrialMember({
    channelUserId: phone,
    groupId,
  }, WA_TRIAL_DAYS);

  if (createResult.success) {
    logger.info('[wa-member-events] New WhatsApp trial member created', {
      memberId: createResult.data.id, phone, groupId,
    });

    // Register join event
    await registerMemberEvent(createResult.data.id, 'join', {
      channel: 'whatsapp',
      channel_user_id: phone,
      group_jid: groupJid,
      source: 'baileys_event',
    });

    // Story 15-3: Send welcome DM (non-blocking)
    await _sendWelcomeDM(phone, groupId);
  } else {
    logger.error('[wa-member-events] Failed to create trial member', {
      phone, groupId, error: createResult.error,
    });
  }
}

/**
 * Handle a member leaving/being removed from the WhatsApp group.
 * Updates their status to 'removido'.
 */
async function handleMemberLeave(participantJid, groupId, groupJid) {
  const phone = extractPhone(participantJid);

  logger.info('[wa-member-events] Member left', { phone, groupId, groupJid });

  const existingResult = await getMemberByChannelUserId(phone, groupId, 'whatsapp');

  if (!existingResult.success) {
    // Member not found — they may have never been registered
    logger.debug('[wa-member-events] Leaving member not found in DB', { phone, groupId });
    return;
  }

  const member = existingResult.data;

  // Only update if currently active
  if (member.status === 'trial' || member.status === 'ativo' || member.status === 'inadimplente') {
    const result = await markMemberAsRemoved(member.id, 'Left WhatsApp group');

    if (result.success) {
      logger.info('[wa-member-events] Member marked as removed', { memberId: member.id, phone });

      await registerMemberEvent(member.id, 'leave', {
        channel: 'whatsapp',
        channel_user_id: phone,
        group_jid: groupJid,
        source: 'baileys_event',
      });
    } else {
      logger.error('[wa-member-events] Failed to mark member as removed', {
        memberId: member.id, error: result.error,
      });
    }
  }
}

/**
 * Register a member event in the member_events table for audit.
 */
async function registerMemberEvent(memberId, eventType, metadata = {}) {
  try {
    const { error } = await supabase
      .from('member_events')
      .insert({
        member_id: memberId,
        event_type: eventType,
        metadata,
      });

    if (error) {
      logger.warn('[wa-member-events] Failed to register event', {
        memberId, eventType, error: error.message,
      });
    }
  } catch (err) {
    logger.warn('[wa-member-events] Error registering event', {
      memberId, eventType, error: err.message,
    });
  }
}

/**
 * Send a welcome DM to a new WhatsApp trial member.
 * Story 15-3 AC1: Non-blocking — failure does not affect member creation.
 * @param {string} phone - E.164 phone number
 * @param {string} groupId - Group UUID
 */
async function _sendWelcomeDM(phone, groupId) {
  try {
    // Get group config for checkout URL
    const { data: group } = await supabase
      .from('groups')
      .select('name, checkout_url')
      .eq('id', groupId)
      .maybeSingle();

    const groupName = group?.name || 'Guru da Bet';
    const checkoutUrl = group?.checkout_url || '';

    const trialDays = 3;
    let message = `Bem-vindo ao *${groupName}*! 🎉\n\n`;
    message += `Voce tem *${trialDays} dias de trial gratuito* para experimentar nossas apostas com analise estatistica.\n\n`;
    message += `Receba ate 3 apostas diarias selecionadas por IA.\n\n`;
    if (checkoutUrl) {
      message += `Para continuar apos o trial, assine aqui:\n${checkoutUrl}\n\n`;
    }
    message += `Aproveite! 🍀`;

    const result = await sendDM(phone, message, { channel: 'whatsapp', groupId });

    if (result.success) {
      logger.info('[wa-member-events] Welcome DM sent', { phone, groupId });
    } else {
      logger.warn('[wa-member-events] Welcome DM failed (non-blocking)', {
        phone, groupId, error: result.error,
      });
    }
  } catch (err) {
    logger.warn('[wa-member-events] Welcome DM error (non-blocking)', {
      phone, groupId, error: err.message,
    });
  }
}

module.exports = { handleGroupParticipantsUpdate, resolveGroupId };
