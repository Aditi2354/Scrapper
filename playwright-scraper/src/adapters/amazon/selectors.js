// Product Detail Page (PDP) selectors
export const PDP_SELECTORS = {
  title: [
    '#productTitle',
    'h1#title span',
    '#titleSection #title',
    '.product-title'
  ],
  
  brand: [
    '#bylineInfo',
    '#brand',
    '.brand',
    '[data-asin] [data-brand]'
  ],
  
  price: [
    '#corePriceDisplay_desktop_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#apex_desktop .a-price[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#priceblock_dealprice',
    '#priceblock_ourprice',
    '.a-price .a-offscreen'
  ],
  
  rating: [
    '#acrPopover .a-icon-alt',
    'span[data-hook="rating-out-of-text"]',
    'i[data-hook="average-star-rating"] span',
    '.a-icon-star .a-icon-alt'
  ],
  
  ratingCount: [
    '#acrCustomerReviewText',
    'span[data-hook="total-review-count"]',
    '#acrCustomerReviewText .a-size-base',
    '[data-hook="total-review-count"]'
  ],
  
  image: [
    '#imgTagWrapperId img',
    '#landingImage',
    '.imageThumb img',
    '#imageBlock img',
    '#main-image-container img'
  ],
  
  features: [
    '#feature-bullets ul li span',
    '.feature .a-list-item',
    '#productOverview_feature_div .a-list-item',
    '.a-unordered-list .a-list-item'
  ],
  
  description: [
    '#productDescription p',
    '#feature-bullets',
    '.product-description'
  ]
};

// Search results page selectors
export const SEARCH_SELECTORS = {
  resultCards: [
    '[data-component-type="s-search-result"].s-result-item',
    '.s-result-item[data-asin]',
    '[data-asin]'
  ],
  
  title: [
    'h2 a span',
    'h5 a span',
    '.s-size-mini .s-color-base',
    '.a-size-medium .a-color-base'
  ],
  
  link: [
    'h2 a',
    'h5 a',
    'a.a-link-normal.s-no-outline'
  ],
  
  image: [
    'img.s-image',
    'img',
    '.s-image'
  ],
  
  price: [
    '.a-price[data-a-color="price"] .a-offscreen',
    '.a-price .a-offscreen',
    '.a-color-price',
    '.a-price-range .a-offscreen'
  ],
  
  rating: [
    'i.a-icon-star-small span.a-icon-alt',
    'i.a-icon-star span.a-icon-alt',
    '.a-icon-alt'
  ],
  
  ratingCount: [
    '[aria-label$="ratings"]',
    '.s-link-style .s-underline-text',
    '[aria-label$="rating"]',
    '.a-size-base'
  ],
  
  sponsored: [
    '[aria-label="Sponsored"]',
    '[data-component-type="sp-sponsored-result"]',
    '.s-sponsored-result'
  ]
};

// JSON-LD selectors for structured data
export const JSON_LD_SELECTORS = {
  script: 'script[type="application/ld+json"]'
};

// Helper function to get all selectors as a flat array
export function getAllSelectors() {
  return {
    pdp: Object.values(PDP_SELECTORS).flat(),
    search: Object.values(SEARCH_SELECTORS).flat(),
    jsonLd: Object.values(JSON_LD_SELECTORS)
  };
}