/**
 * Format converter for multi-channel messaging.
 * Converts Telegram Markdown to WhatsApp format.
 *
 * Telegram Markdown format:
 * - *bold* → *bold* (same in WhatsApp)
 * - _italic_ → _italic_ (same in WhatsApp)
 * - `code` → `code` (same in WhatsApp)
 * - [text](url) → text (url) (WhatsApp has no inline links)
 *
 * Both channels use the same bold/italic/monospace syntax,
 * so the main conversion is for inline links.
 */

/**
 * Convert Telegram Markdown to WhatsApp format.
 * @param {string} text - Telegram Markdown text
 * @returns {string} WhatsApp-formatted text
 */
function telegramToWhatsApp(text) {
  if (!text || typeof text !== 'string') return '';

  // Convert inline links: [text](url) → text (url)
  // Uses non-greedy matching to handle multiple links
  let result = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  return result;
}

/**
 * Convert WhatsApp format to Telegram Markdown.
 * Currently a no-op since formatting is compatible,
 * but provided for symmetry and future use.
 * @param {string} text - WhatsApp-formatted text
 * @returns {string} Telegram Markdown text
 */
function whatsAppToTelegram(text) {
  if (!text || typeof text !== 'string') return '';
  return text;
}

module.exports = { telegramToWhatsApp, whatsAppToTelegram };
