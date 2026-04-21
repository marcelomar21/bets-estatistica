/**
 * Telegram chat_id normalization helper (TypeScript).
 *
 * Telegram supergroups use the `-100<id>` format. Some sources in our DB
 * store the raw positive id (without the `-100` prefix), and other sources
 * store the full negative id. This helper normalizes all incoming forms to
 * the canonical `-100<id>` string format at the consumption point.
 *
 * Idempotent: running on an already-normalized id returns it unchanged.
 * Invalid inputs (null, undefined, empty, zero, non-numeric) return `null`.
 *
 * Mirror of lib/telegramChatId.js used by the bot.
 */

export function normalizeTelegramChatId(
  rawId: number | string | null | undefined
): string | null {
  if (rawId === null || rawId === undefined) return null;

  if (typeof rawId === 'number') {
    if (!Number.isFinite(rawId)) return null;
    if (!Number.isInteger(rawId)) return null;
  }

  const str = String(rawId).trim();
  if (str === '' || str === '0' || str === '-0') return null;

  if (str.startsWith('-100')) {
    const rest = str.slice(4);
    if (!/^\d+$/.test(rest)) return null;
    return str;
  }

  if (str.startsWith('-')) {
    const digits = str.slice(1);
    if (!/^\d+$/.test(digits) || digits === '0') return null;
    return `-100${digits}`;
  }

  if (!/^\d+$/.test(str)) return null;
  return `-100${str}`;
}
