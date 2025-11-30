const SAFE_MARKER = '🛡️ Apostas Seguras (Bankroll Builder):';
const OPP_MARKER = '🚀 Oportunidades (Valor):';

const sanitizeText = (value) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();

const sliceSection = (text, marker, nextMarker) => {
  const start = text.indexOf(marker);
  if (start === -1) return null;
  const fromMarker = text.slice(start + marker.length);
  if (!nextMarker) {
    return fromMarker.trim();
  }
  const nextIndex = fromMarker.indexOf(nextMarker);
  if (nextIndex === -1) {
    return fromMarker.trim();
  }
  return fromMarker.slice(0, nextIndex).trim();
};

const parseItems = (sectionText) => {
  if (!sectionText) return [];
  const normalized = sanitizeText(sectionText);
  const regex = /\*\*(\d+)\)\s*(.+?)\*\*\s*—\s*([\s\S]*?)(?=\n\*\*\d+\)|$)/g;
  const items = [];
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const [, index, title, reasoning] = match;
    const normalizedTitle = String(title || '').trim();
    const normalizedReasoning = String(reasoning || '').trim();
    if (!normalizedTitle || !normalizedReasoning) continue;
    items.push({
      index: Number(index),
      title: normalizedTitle,
      reasoning: normalizedReasoning.replace(/\s+/g, ' '),
    });
  }
  return items;
};

const extractSections = (analysisText) => {
  if (!analysisText || typeof analysisText !== 'string') {
    return { analysis: '', safe: [], opportunities: [] };
  }

  const normalized = sanitizeText(analysisText);
  const safeSection = sliceSection(normalized, SAFE_MARKER, OPP_MARKER);
  const oppSection = sliceSection(normalized, OPP_MARKER, null);

  const firstMarkerIndex = [SAFE_MARKER, OPP_MARKER]
    .map((marker) => normalized.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  const analysisSection =
    typeof firstMarkerIndex === 'number'
      ? normalized.slice(0, firstMarkerIndex).trim()
      : normalized;

  return {
    analysis: analysisSection,
    safe: parseItems(safeSection),
    opportunities: parseItems(oppSection),
  };
};

module.exports = {
  extractSections,
};


