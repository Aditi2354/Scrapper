/**
 * Text processing utilities for Amazon recommendations
 */

/**
 * Clean and normalize text
 */
export function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
}

/**
 * Tokenize text into keywords, removing stop words
 */
export function tokenize(text) {
  if (!text) return [];
  
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'am', 'pm', 'new', 'old', 'best', 'top', 'good', 'great', 'excellent', 'amazing', 'awesome',
    'buy', 'purchase', 'shop', 'store', 'official', 'brand', 'product', 'item', 'model', 'version',
    'gb', 'tb', 'mb', 'inch', 'inches', 'cm', 'mm', 'kg', 'lb', 'lbs', 'oz', 'ml', 'l', 'gal',
    'color', 'colour', 'size', 'sizes', 'small', 'medium', 'large', 'xl', 'xxl', 'xs', 'xxs',
    'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'gray', 'grey',
    'plus', 'pro', 'max', 'mini', 'ultra', 'premium', 'basic', 'standard', 'deluxe', 'limited',
    'edition', 'special', 'exclusive', 'original', 'genuine', 'authentic', 'real', 'fake', 'copy'
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Parse rating from text (e.g., "4.5 out of 5 stars" -> 4.5)
 */
export function parseRating(text) {
  if (!text) return null;
  
  const match = String(text).match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const rating = parseFloat(match[1]);
    return rating >= 0 && rating <= 5 ? rating : null;
  }
  return null;
}

/**
 * Parse inline price from text (e.g., "$29.99", "₹1,299", "€45.50")
 */
export function parseInlinePrice(text) {
  if (!text) return null;
  
  // Remove common non-price text
  const cleanText = String(text)
    .replace(/(emi|saving|savings|save|coupon|bank|m\.?r\.?p|exchange|without exchange|with exchange|offer|discount)/gi, '')
    .trim();
  
  // Match various price formats
  const patterns = [
    /[\$₹€£]\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/,  // Currency symbols
    /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*[\$₹€£]/,  // Currency after number
    /(\d+(?:,\d{3})*(?:\.\d{2})?)/             // Just numbers
  ];
  
  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (price > 0 && price < 1000000) { // Reasonable price range
        return price;
      }
    }
  }
  
  return null;
}

/**
 * Convert price text to number
 */
export function toNumberPrice(text) {
  const price = parseInlinePrice(text);
  return price !== null ? price : null;
}

/**
 * Extract brand from product title
 */
export function extractBrand(title) {
  if (!title) return null;
  
  // Common brand patterns
  const brandPatterns = [
    /^([A-Z][a-zA-Z0-9\s&.-]+?)\s+[A-Z]/,  // Title case brand
    /^([A-Z][a-zA-Z0-9\s&.-]+?)\s+\d/,     // Brand followed by number
    /^([A-Z][a-zA-Z0-9\s&.-]+?)\s*[-|]/,   // Brand followed by separator
  ];
  
  for (const pattern of brandPatterns) {
    const match = title.match(pattern);
    if (match) {
      const brand = match[1].trim();
      if (brand.length > 1 && brand.length < 50) {
        return brand;
      }
    }
  }
  
  return null;
}

/**
 * Extract features from product title and description
 */
export function extractFeatures(text) {
  if (!text) return [];
  
  const features = [];
  const textLower = text.toLowerCase();
  
  // Common feature keywords
  const featureKeywords = [
    'wireless', 'bluetooth', 'wifi', 'usb', 'hdmi', '4k', 'hd', 'waterproof', 'water resistant',
    'rechargeable', 'battery', 'fast charging', 'wireless charging', 'touchscreen', 'led',
    'smart', 'ai', 'voice control', 'app control', 'remote control', 'portable', 'compact',
    'lightweight', 'durable', 'stainless steel', 'aluminum', 'plastic', 'wood', 'leather',
    'adjustable', 'foldable', 'collapsible', 'detachable', 'removable', 'washable',
    'anti-bacterial', 'anti-microbial', 'uv protection', 'shockproof', 'dustproof',
    'noise cancelling', 'noise reduction', 'surround sound', 'stereo', 'mono',
    'memory foam', 'gel', 'foam', 'cotton', 'polyester', 'nylon', 'spandex'
  ];
  
  for (const keyword of featureKeywords) {
    if (textLower.includes(keyword)) {
      features.push(keyword);
    }
  }
  
  return [...new Set(features)]; // Remove duplicates
}

/**
 * Calculate text similarity using Jaccard index
 */
export function calculateSimilarity(text1, text2) {
  const tokens1 = new Set(tokenize(text1));
  const tokens2 = new Set(tokenize(text2));
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}

/**
 * Extract ASIN from Amazon URL
 */
export function extractASIN(url) {
  if (!url) return null;
  
  const patterns = [
    /(?:dp|gp\/product|aw\/d)\/([A-Z0-9]{10})/i,
    /\/([A-Z0-9]{10})(?:[/?]|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = String(url).match(pattern);
    if (match) return match[1];
  }
  
  return null;
}
