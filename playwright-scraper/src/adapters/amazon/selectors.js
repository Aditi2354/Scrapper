/**
 * Amazon selectors for product pages and search results
 */

// Product Detail Page (PDP) selectors
export const PDP_SELECTORS = {
  // Product title
  title: [
    '#productTitle',
    'h1#title span',
    '#titleSection #title',
    '.product-title',
    'h1.a-size-large'
  ],

  // Product price
  price: [
    '#corePriceDisplay_desktop_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#apex_desktop .a-price[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#corePrice_desktop .a-price[data-a-color="price"] .a-offscreen',
    '.a-price[data-a-color="price"] .a-offscreen',
    '#priceblock_dealprice',
    '#priceblock_ourprice',
    '.a-color-price'
  ],

  // Product rating
  rating: [
    '#acrPopover .a-icon-alt',
    'span[data-hook="rating-out-of-text"]',
    'i[data-hook="average-star-rating"] span',
    '.a-icon-alt',
    '[data-hook="rating-out-of-text"]'
  ],

  // Rating count
  ratingCount: [
    '#acrCustomerReviewText',
    'span[data-hook="total-review-count"]',
    '#acrCustomerReviewText .a-size-base',
    '[data-hook="total-review-count"]'
  ],

  // Product image
  image: [
    '#imgTagWrapperId img',
    '#landingImage',
    '.imageThumb img',
    '#imageBlock img',
    '#main-image-container img',
    'img#ivLargeImage'
  ],

  // Product features/bullets
  features: [
    '#feature-bullets ul li span',
    '#feature-bullets .a-list-item',
    '.a-unordered-list .a-list-item',
    '#productDescription p',
    '.a-section .a-spacing-small p'
  ],

  // Brand
  brand: [
    '#bylineInfo',
    '.brand',
    '#brand',
    '.a-link-normal[href*="brand"]'
  ],

  // ASIN (from URL or data attributes)
  asin: [
    '[data-asin]',
    '.a-dynamic-image[data-asin]'
  ]
};

// Search results page selectors
export const SEARCH_SELECTORS = {
  // Search result cards
  cards: [
    '[data-component-type="s-search-result"].s-result-item',
    '.s-result-item[data-asin]',
    '.s-search-result'
  ],

  // Product title in search results
  title: [
    'h2 a span',
    'h5 a span',
    '.s-size-mini .s-link-normal span',
    '.a-size-medium .a-color-base'
  ],

  // Product URL in search results
  url: [
    'h2 a',
    'h5 a',
    'a.a-link-normal.s-no-outline',
    '.s-link-normal'
  ],

  // Product image in search results
  image: [
    'img.s-image',
    'img',
    '.s-image'
  ],

  // Product price in search results
  price: [
    '.a-price[data-a-color="price"] .a-offscreen',
    '.a-price .a-offscreen',
    '.a-color-price',
    '.a-price-range .a-offscreen'
  ],

  // Product rating in search results
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

  // Sponsored indicator
  sponsored: [
    '[aria-label="Sponsored"]',
    '[data-component-type="sp-sponsored-result"]',
    '.s-sponsored-label'
  ]
};

// JSON-LD selectors for structured data
export const JSON_LD_SELECTORS = {
  script: 'script[type="application/ld+json"]'
};

// Mobile page selectors (fallback)
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

// Feature extraction selectors
export const FEATURE_SELECTORS = {
  bullets: [
    '#feature-bullets ul li span',
    '#feature-bullets .a-list-item',
    '.a-unordered-list .a-list-item'
  ],
  description: [
    '#productDescription p',
    '.a-section .a-spacing-small p',
    '#aplus_feature_div p'
  ],
  specifications: [
    '#prodDetails .a-size-base',
    '.a-keyvalue .a-size-base',
    '#detailBulletsWrapper_feature_div .a-list-item'
  ]
};
