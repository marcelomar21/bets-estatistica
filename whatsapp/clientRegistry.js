/**
 * Client registry for WhatsApp BaileyClient instances.
 * Shared module to avoid circular dependencies between server.js and whatsappSender.js.
 */

/** @type {Map<string, import('./client/baileyClient').BaileyClient>} */
const clients = new Map();

/**
 * Get a BaileyClient by number ID.
 * @param {string} numberId - UUID of the whatsapp_number
 * @returns {import('./client/baileyClient').BaileyClient|undefined}
 */
function getClient(numberId) {
  return clients.get(numberId);
}

module.exports = { clients, getClient };
