/**
 * Phone number utilities for WhatsApp/Baileys integration.
 * Handles E.164 format validation and JID conversions.
 */

const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const JID_SUFFIX = '@s.whatsapp.net';

/**
 * Validate that a phone number is in E.164 format.
 * @param {string} phoneNumber - Phone number to validate (e.g. +5511999887766)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateE164(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  if (!E164_REGEX.test(phoneNumber)) {
    return { valid: false, error: 'Phone number must be in E.164 format (e.g. +5511999887766)' };
  }

  return { valid: true };
}

/**
 * Convert E.164 phone number to Baileys JID.
 * @param {string} phoneNumber - E.164 format (e.g. +5511999887766)
 * @returns {string} Baileys JID (e.g. 5511999887766@s.whatsapp.net)
 */
function phoneToJid(phoneNumber) {
  const digits = phoneNumber.replace('+', '');
  return `${digits}${JID_SUFFIX}`;
}

/**
 * Convert Baileys JID to E.164 phone number.
 * @param {string} jid - Baileys JID (e.g. 5511999887766@s.whatsapp.net)
 * @returns {string} E.164 format (e.g. +5511999887766)
 */
function jidToPhone(jid) {
  const digits = jid.replace(JID_SUFFIX, '');
  return `+${digits}`;
}

module.exports = { validateE164, phoneToJid, jidToPhone };
