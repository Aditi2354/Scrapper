export function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

export function tokenize(text, maxTokens = 10) {
  if (!text) return [];
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'amazon', 'buy', 'now', 'new', 'used', 'refurbished', 'official', 'store'
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, maxTokens);
}

export function parseRating(ratingText) {
  if (!ratingText) return null;
  const match = String(ratingText).match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

export function parseInlinePrice(priceText) {
  if (!priceText) return null;
  
  // Remove common non-price text
  const cleaned = String(priceText)
    .replace(/(emi|saving|savings|save|coupon|bank|m\.?r\.?p|exchange|without exchange|with exchange|offer|discount)/gi, '')
    .trim();
  
  // Extract price patterns
  const patterns = [
    /[\₹$€£]\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/,
    /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*[\₹$€£]/,
    /(\d+(?:,\d{3})*(?:\.\d{2})?)/
  ];
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const priceStr = match[1].replace(/,/g, '');
      const price = parseFloat(priceStr);
      return isNaN(price) ? null : price;
    }
  }
  
  return null;
}

export function toNumberPrice(priceText) {
  return parseInlinePrice(priceText);
}

export function extractBrand(title) {
  if (!title) return null;
  
  // Common brand patterns
  const brandPatterns = [
    /^([A-Z][a-zA-Z0-9\s&]+?)(?:\s+[-–—]\s+|\s+\|\s+|\s+by\s+)/i,
    /by\s+([A-Z][a-zA-Z0-9\s&]+?)(?:\s|$)/i,
    /^([A-Z][a-zA-Z0-9\s&]{2,20}?)(?:\s+\d|\s+[A-Z]{2,}|\s+Pro|\s+Max|\s+Mini)/i
  ];
  
  for (const pattern of brandPatterns) {
    const match = title.match(pattern);
    if (match) {
      const brand = cleanText(match[1]);
      if (brand.length > 1 && brand.length < 50) {
        return brand;
      }
    }
  }
  
  return null;
}

export function extractFeatures(title, description = '') {
  const text = `${title} ${description}`.toLowerCase();
  const features = [];
  
  // Common feature keywords
  const featureKeywords = [
    'wireless', 'bluetooth', 'wifi', 'usb-c', 'usb', 'hdmi', '4k', 'hd', 'waterproof',
    'water resistant', 'shockproof', 'fast charging', 'wireless charging', 'touchscreen',
    'retina', 'oled', 'led', 'camera', 'dual camera', 'triple camera', 'night mode',
    'portable', 'compact', 'lightweight', 'durable', 'premium', 'professional',
    'gaming', 'office', 'home', 'outdoor', 'indoor', 'travel', 'car'
  ];
  
  for (const keyword of featureKeywords) {
    if (text.includes(keyword)) {
      features.push(keyword);
    }
  }
  
  return features.slice(0, 8); // Limit to 8 features
}