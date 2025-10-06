// DOM selectors for Amazon product pages and search results

// Product Detail Page (PDP) selectors
export const PDP_SELECTORS = {
  // Product title
  title: [
    '#productTitle',
    'h1#title span',
    '#titleSection #title',
    '.product-title'
  ],
  
  // Brand information
  brand: [
    '#bylineInfo',
    '.a-link-normal#bylineInfo',
    '#brand',
    '.po-brand .po-break-word'
  ],
  
  // Price selectors (core containers first)
  price: [
    '#corePriceDisplay_desktop_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#apex_desktop .a-price[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#priceblock_dealprice',
    '#priceblock_ourprice',
    '.a-price .a-offscreen',
    '.a-color-price'
  ],
  
  // Rating selectors
  rating: [
    '#acrPopover .a-icon-alt',
    'span[data-hook="rating-out-of-text"]',
    'i[data-hook="average-star-rating"] span',
    '.a-icon-alt'
  ],
  
  // Rating count selectors
  ratingCount: [
    '#acrCustomerReviewText',
    'span[data-hook="total-review-count"]',
    '#acrCustomerReviewText .a-size-base',
    '[aria-label*="ratings"]'
  ],
  
  // Product image selectors
  image: [
    '#imgTagWrapperId img',
    '#landingImage',
    '.imageThumb img',
    '#imageBlock img',
    '#main-image-container img',
    'img#ivLargeImage'
  ],
  
  // Feature bullets
  features: [
    '#feature-bullets ul li span',
    '.a-unordered-list .a-list-item',
    '#productDetails_feature_div .a-list-item'
  ],
  
  // ASIN extraction
  asinAttribute: 'data-asin',
  
  // JSON-LD structured data
  jsonLd: 'script[type="application/ld+json"]'
};

// Search Results Page selectors
export const SEARCH_SELECTORS = {
  // Result containers
  resultContainer: [
    '[data-component-type="s-search-result"].s-result-item',
    '.s-result-item[data-asin]',
    '[data-asin].s-result-item'
  ],
  
  // Product title in search results
  title: [
    'h2 a span',
    'h5 a span',
    '.a-size-medium .a-link-normal span',
    '.a-size-base-plus'
  ],
  
  // Product link in search results
  link: [
    'h2 a',
    'h5 a',
    'a.a-link-normal.s-no-outline',
    '.a-link-normal'
  ],
  
  // Product image in search results
  image: [
    'img.s-image',
    'img[data-image-index]',
    '.s-image img',
    'img'
  ],
  
  // Price in search results
  price: [
    '.a-price[data-a-color="price"] .a-offscreen',
    '.a-price .a-offscreen',
    '.a-color-price',
    '.a-price-whole'
  ],
  
  // Rating in search results
  rating: [
    'i.a-icon-star-small span.a-icon-alt',
    'i.a-icon-star span.a-icon-alt',
    '.a-icon-alt'
  ],
  
  // Rating count in search results
  ratingCount: [
    '[aria-label$="ratings"]',
    '.s-link-style .s-underline-text',
    '[aria-label$="rating"]',
    '.a-size-base'
  ],
  
  // Sponsored indicators (to filter out)
  sponsored: [
    '[aria-label="Sponsored"]',
    '[data-component-type="sp-sponsored-result"]',
    '.s-sponsored-label-text',
    '.a-color-secondary:contains("Sponsored")'
  ],
  
  // ASIN attribute
  asinAttribute: 'data-asin'
};

// Mobile-specific selectors (for price fallback)
export const MOBILE_SELECTORS = {
  price: [
    '#corePrice_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price .a-offscreen',
    '#priceblock_dealprice',
    '#priceblock_ourprice',
    'span.a-color-price'
  ],
  
  image: [
    '#main-image-container img',
    'img#ivLargeImage',
    'img'
  ]
};

// Attribute parsing helpers
export const ATTRIBUTE_PARSERS = {
  // For srcset attributes
  srcset: (value) => {
    if (!value) return null;
    return value.split(',')[0]?.trim().split(' ')[0] || null;
  },
  
  // For data-a-dynamic-image attributes
  dynamicImage: (value) => {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return Object.keys(parsed)[0] || null;
    } catch {
      return null;
    }
  },
  
  // Default attribute parser
  default: (value) => value
};