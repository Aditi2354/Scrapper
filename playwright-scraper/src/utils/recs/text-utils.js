// src/utils/recs/text-utils.js

export function cleanText(input) {
  return (input || '').replace(/\s+/g, ' ').trim();
}

const DEFAULT_STOPWORDS = new Set([
  'the','a','an','for','and','or','of','to','in','on','with','by','from','plus','pro','max','mini','new','official','store',
  'gb','tb','ram','rom','phone','mobile','smartphone','case','cover','2024','2025'
]);

export function tokenize(text, { stopwords = DEFAULT_STOPWORDS, limit = undefined } = {}) {
  const tokens = cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !stopwords.has(t));
  return typeof limit === 'number' ? tokens.slice(0, limit) : tokens;
}

export function parseRating(text) {
  if (text == null) return null;
  const m = String(text).match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return isNaN(n) ? null : n;
}

export function toNumberPrice(text) {
  if (text == null) return null;
  if (typeof text === 'number') return text;
  const cleaned = String(text)
    .replace(/[^0-9.,]/g, '')
    // Remove thousands separators (heuristic): commas/dots followed by 3 digits
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    // Normalize decimal separator to dot
    .replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseInlinePrice(text) {
  return toNumberPrice(text);
}
