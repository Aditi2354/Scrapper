/**
 * Amazon page selectors for product data extraction
 */

// Product Detail Page (PDP) selectors
export const PDP_SELECTORS = {
  // Basic product info
  title: [
    '#productTitle',
    'h1#title span',
    '#titleSection #title'
  ],

  // Price selectors (prioritized by reliability)
  price: [
    '#corePriceDisplay_desktop_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#apex_desktop .a-price[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#priceblock_dealprice',
    '#priceblock_ourprice',
    '.a-price .a-offscreen'
  ],

  // Rating and review count
  rating: [
    '#acrPopover .a-icon-alt',
    'span[data-hook="rating-out-of-text"]',
    'i[data-hook="average-star-rating"] span'
  ],

  ratingCount: [
    '#acrCustomerReviewText',
    'span[data-hook="total-review-count"]',
    '#acrCustomerReviewText .a-size-base'
  ],

  // Product image
  image: [
    '#imgTagWrapperId img',
    '#landingImage',
    '.imageThumb img',
    '#imageBlock img'
  ],

  // Image attributes to try (in order of preference)
  imageAttrs: ['src', 'data-old-hires', 'data-src', 'srcset', 'data-a-dynamic-image'],

  // Brand (sometimes in title or dedicated field)
  brand: [
    '.a-size-base.a-text-bold:contains("Brand") + .a-size-base',
    '.a-section.a-spacing-small .a-size-base:contains("Brand") + span',
    'tr:contains("Brand") td:last-child',
    'th:contains("Brand") + td'
  ],

  // Features/benefits (bullet points)
  features: [
    '#feature-bullets li',
    '.a-unordered-list.a-vertical li',
    '.a-list-item',
    '#productDetails_detailBullets_sections1 li'
  ]
};

// Search Results Page (SRP) selectors
export const SRP_SELECTORS = {
  // Product cards (avoid sponsored)
  productCards: [
    '[data-component-type="s-search-result"].s-result-item:not([data-component-type="sp-sponsored-result"])',
    '.s-result-item[data-asin]:not([aria-label*="Sponsored"])'
  ],

  // Card data selectors (relative to card)
  cardTitle: [
    'h2 a span',
    'h5 a span'
  ],

  cardUrl: [
    'h2 a',
    'h5 a',
    'a.a-link-normal.s-no-outline'
  ],

  cardImage: [
    'img.s-image',
    'img'
  ],

  cardPrice: [
    '.a-price[data-a-color="price"] .a-offscreen',
    '.a-price .a-offscreen',
    '.a-color-price'
  ],

  cardRating: [
    'i.a-icon-star-small span.a-icon-alt',
    'i.a-icon-star span.a-icon-alt'
  ],

  cardRatingCount: [
    '[aria-label$="ratings"]',
    '.s-link-style .s-underline-text',
    '[aria-label$="rating"]'
  ],

  cardAsin: 'data-asin'
};

// JSON-LD structured data selectors
export const JSON_LD_SELECTORS = {
  productScript: 'script[type="application/ld+json"]',
  productTypes: ['Product']
};

// Helper to extract ASIN from URL
export function extractASIN(url) {
  if (!url) return null;
  const asinMatch = url.match(/(?:dp|gp\/product|aw\/d)\/([A-Z0-9]{10})/i) ||
                   url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return asinMatch ? asinMatch[1] : null;
}

// Helper to derive TLD from URL
export function extractTLD(url) {
  if (!url) return 'com';
  const hostname = new URL(url).hostname;
  const tldMatch = hostname.match(/amazon\.([a-z]+)/i);
  return tldMatch ? tldMatch[1] : 'com';
}