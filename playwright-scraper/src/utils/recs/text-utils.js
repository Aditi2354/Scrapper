// Text processing utilities for recommendations

export function cleanText(text) {
  if (!text) return null;
  return text.trim().replace(/\s+/g, ' ').replace(/\n/g, ' ');
}

export function tokenize(text, limit = 6) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'among', 'under', 'over', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'myself',
    'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
    'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
    'new', 'old', 'first', 'last', 'good', 'great', 'big', 'small', 'large', 'little', 'high', 'low', 'long', 'short', 'right', 'left', 'next', 'previous',
    'pro', 'max', 'mini', 'plus', 'lite', 'premium', 'standard', 'basic', 'advanced', 'official', 'original', 'genuine', 'authentic',
    'pack', 'set', 'kit', 'bundle', 'combo', 'piece', 'pieces', 'pcs', 'pc', 'item', 'items',
    '2024', '2025', 'year', 'years', 'month', 'months', 'day', 'days', 'gb', 'mb', 'tb', 'kg', 'g', 'cm', 'mm', 'inch', 'inches'
  ]);

  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, limit);
}

export function parseRating(text) {
  if (!text) return null;
  
  // Match patterns like "4.5 out of 5", "4.2 stars", "4.5/5", "4.3"
  const patterns = [
    /(\d+\.?\d*)\s*out\s*of\s*5/i,
    /(\d+\.?\d*)\s*\/\s*5/i,
    /(\d+\.?\d*)\s*stars?/i,
    /(\d+\.?\d*)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const rating = parseFloat(match[1]);
      if (rating >= 0 && rating <= 5) {
        return rating;
      }
    }
  }
  
  return null;
}

export function parseInlinePrice(text) {
  if (!text) return null;
  
  // Remove common non-price indicators
  const cleanedText = text.toLowerCase();
  const excludePatterns = [
    /emi/i, /saving/i, /save/i, /coupon/i, /bank/i, /offer/i, /discount/i,
    /m\.?r\.?p/i, /mrp/i, /exchange/i, /without/i, /with/i, /shipping/i, /delivery/i
  ];
  
  for (const pattern of excludePatterns) {
    if (pattern.test(cleanedText)) return null;
  }
  
  // Match currency symbols followed by numbers
  const currencyPatterns = [
    /[₹$€£¥]\s*([0-9,]+(?:\.[0-9]{1,2})?)/,
    /([0-9,]+(?:\.[0-9]{1,2})?)\s*[₹$€£¥]/,
    /([0-9,]{4,}(?:\.[0-9]{1,2})?)/  // Numbers with 4+ digits (assume currency)
  ];
  
  for (const pattern of currencyPatterns) {
    const match = text.match(pattern);
    if (match) {
      const numStr = match[1].replace(/,/g, '');
      const num = parseFloat(numStr);
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }
  
  return null;
}

export function toNumberPrice(text) {
  if (typeof text === 'number') return text;
  if (!text) return null;
  
  const price = parseInlinePrice(text);
  return price;
}

// Calculate text similarity using Jaccard index
export function textSimilarity(tokens1, tokens2) {
  if (!tokens1.length || !tokens2.length) return 0;
  
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  
  const intersection = [...set1].filter(token => set2.has(token));
  const union = new Set([...set1, ...set2]);
  
  return intersection.length / union.size;
}