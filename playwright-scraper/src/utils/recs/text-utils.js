/**
 * Cleans text by removing extra whitespace and special characters
 */
export function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-.,!?()&/]/g, '')
    .trim();
}

/**
 * Tokenizes text into words, removing stopwords and short words
 */
export function tokenize(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their'
  ]);

  return cleanText(text)
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10); // Limit to top 10 tokens
}

/**
 * Parses rating from text like "4.5 out of 5 stars"
 */
export function parseRating(text) {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Parses inline price text like "$123.45" or "₹1,234"
 */
export function parseInlinePrice(text) {
  if (!text) return null;

  // Remove currency symbols and commas, extract number
  const cleaned = text.replace(/[₹$€£¥,\s]/g, '');
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);

  if (match) {
    const price = parseFloat(match[1]);
    return isNaN(price) ? null : price;
  }

  return null;
}

/**
 * Converts price string to number, handling various formats
 */
export function toNumberPrice(priceText) {
  if (!priceText) return null;

  // Handle common price formats
  let cleaned = priceText.replace(/[₹$€£¥]/g, '').trim();

  // Remove commas and spaces
  cleaned = cleaned.replace(/[,\s]/g, '');

  // Extract the first number found
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const price = parseFloat(match[1]);
    return isNaN(price) ? null : price;
  }

  return null;
}

/**
 * Extracts top keywords from text
 */
export function extractTopKeywords(text, maxTokens = 6) {
  return tokenize(text).slice(0, maxTokens);
}

/**
 * Calculates Jaccard similarity between two token sets
 */
export function jaccardSimilarity(tokens1, tokens2) {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / Math.max(1, union.size);
}