/**
 * Telegram Markdown sanitizer and oddLabel enforcer
 *
 * Targets Telegram legacy Markdown (parse_mode: 'Markdown'):
 *   *bold*, _italic_, `code`, [text](url)
 *
 * Pure JS — no external dependencies.
 */

/**
 * Sanitize text for Telegram legacy Markdown.
 * Fixes unbalanced markers and broken links so the message renders cleanly.
 *
 * @param {string} text
 * @returns {string}
 */
function sanitizeTelegramMarkdown(text) {
  if (!text) return text || '';

  let result = text;

  // 1. Fix broken links: [text](url) — must have both ] and ) in the right order
  //    Remove formatting from incomplete links, keeping the text
  result = result.replace(/\[([^\]]*?)(?:\]\([^)]*$|\]$)/g, '$1');
  // Handle orphan [ without matching ]
  result = result.replace(/\[([^\]]*?)$/gm, '$1');

  // 2. Fix problematic nesting: *_text_* or _*text*_ → remove outer markers
  result = result.replace(/\*_([^_*]+)_\*/g, '$1');
  result = result.replace(/_\*([^*_]+)\*_/g, '$1');

  // 3. Balance markers for *, _, and `
  result = balanceMarker(result, '*');
  result = balanceMarker(result, '_');
  result = balanceMarker(result, '`');

  return result;
}

/**
 * Build a set of character positions that are inside link URLs [text](url).
 * Returns a Set of indices that fall within the (url) portion.
 */
function getLinkUrlPositions(text) {
  const positions = new Set();
  const linkRegex = /\[([^\]]*)\]\(([^)]*)\)/g;
  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    // Mark positions within the ( ... ) part (URL), including parens
    const urlStart = match.index + match[1].length + 2; // skip [text](
    const urlEnd = urlStart + match[2].length + 1; // include )
    for (let i = urlStart; i <= urlEnd && i < text.length; i++) {
      positions.add(i);
    }
  }
  return positions;
}

/**
 * Ensure marker characters are balanced (even count).
 * Skips markers inside link URLs to avoid miscounting underscores in URLs.
 * If odd, remove the last orphan occurrence.
 *
 * @param {string} text
 * @param {string} marker - Single character marker (*, _, `)
 * @returns {string}
 */
function balanceMarker(text, marker) {
  const urlPositions = getLinkUrlPositions(text);
  let count = 0;
  const positions = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === marker && (i === 0 || text[i - 1] !== '\\') && !urlPositions.has(i)) {
      count++;
      positions.push(i);
    }
  }

  if (count % 2 === 0) return text; // Already balanced

  // Remove the last orphan marker
  const lastPos = positions[positions.length - 1];
  return text.slice(0, lastPos) + text.slice(lastPos + 1);
}

/**
 * Replace "Odd:"/"Odds:" variants with the configured oddLabel.
 *
 * @param {string} text
 * @param {string|null|undefined} oddLabel - Label to use (e.g. "Cotação"). If falsy, returns text unchanged.
 * @returns {string}
 */
function enforceOddLabel(text, oddLabel) {
  if (!text || !oddLabel || oddLabel.trim() === '') return text || '';
  return text.replace(/\bOdds?\s*:/gi, `${oddLabel}:`);
}

module.exports = {
  sanitizeTelegramMarkdown,
  enforceOddLabel,
};
