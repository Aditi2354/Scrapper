const STOPWORDS = new Set([
  'the','a','an','for','and','or','of','to','in','on','with','by','from',
  'plus','pro','max','mini','new','gb','tb','ram','rom','phone','mobile',
  'smartphone','official','store','lifetime','warranty','pack','set'
]);

export function cleanText(text) {
  if (!text) return '';
  return String(text).replace(/\s+/g, ' ').trim();
}

export function tokenize(text) {
  if (!text) return [];
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w));
}

export function parseRating(text) {
  if (!text) return null;
  const str = String(text).toLowerCase();
  const match = str.match(/([0-9]+(\.[0-9]+)?)/);
  if (!match) return null;
  const rating = parseFloat(match[1]);
  return rating >= 0 && rating <= 5 ? rating : null;
}

export function parseInlinePrice(text) {
  if (!text) return null;
  const str = String(text);
  // Extract numeric portion: ₹1,234.56 or $12.34
  const cleaned = str.replace(/[₹$€£,]/g, '');
  const match = cleaned.match(/([0-9]+\.?[0-9]*)/);
  return match ? parseFloat(match[1]) : null;
}

export function toNumberPrice(priceText) {
  if (!priceText) return null;
  const str = String(priceText).toLowerCase();
  
  // Skip text that indicates non-price
  if (/(emi|saving|save|coupon|bank|mrp|m\.r\.p|exchange|offer|discount)/i.test(str)) {
    return null;
  }
  
  return parseInlinePrice(priceText);
}
