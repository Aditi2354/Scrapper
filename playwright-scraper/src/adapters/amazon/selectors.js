// Product Detail Page (PDP) selectors
export const PDP = {
  title: [
    '#productTitle',
    'h1#title span',
    '#titleSection #title'
  ],
  
  brand: [
    '#bylineInfo',
    'a#bylineInfo',
    '.po-brand .po-break-word'
  ],
  
  price: [
    '#corePriceDisplay_desktop_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#apex_desktop .a-price[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '.a-price[data-a-color="price"] .a-offscreen',
    '#priceblock_dealprice',
    '#priceblock_ourprice'
  ],
  
  rating: [
    '#acrPopover .a-icon-alt',
    'span[data-hook="rating-out-of-text"]',
    'i[data-hook="average-star-rating"] span',
    '.a-icon-star span.a-icon-alt'
  ],
  
  ratingCount: [
    '#acrCustomerReviewText',
    'span[data-hook="total-review-count"]',
    '#acrCustomerReviewText .a-size-base'
  ],
  
  features: [
    '#feature-bullets ul li span.a-list-item',
    '.a-unordered-list.a-vertical.a-spacing-mini .a-list-item'
  ],
  
  image: [
    '#imgTagWrapperId img',
    '#landingImage',
    '.imageThumb img',
    '#imageBlock img'
  ],
  
  imageAttrs: ['src', 'data-old-hires', 'data-src', 'srcset', 'data-a-dynamic-image']
};

// Search results page selectors
export const SEARCH = {
  resultCard: [
    '[data-component-type="s-search-result"].s-result-item',
    '.s-result-item[data-asin]'
  ],
  
  sponsored: [
    '[aria-label="Sponsored"]',
    '[data-component-type="sp-sponsored-result"]'
  ],
  
  card: {
    title: [
      'h2 a span',
      'h5 a span',
      '.a-text-normal'
    ],
    
    link: [
      'h2 a',
      'h5 a',
      'a.a-link-normal.s-no-outline'
    ],
    
    image: [
      'img.s-image',
      'img'
    ],
    
    imageAttrs: ['src', 'data-src', 'srcset'],
    
    price: [
      '.a-price[data-a-color="price"] .a-offscreen',
      '.a-price .a-offscreen',
      '.a-color-price'
    ],
    
    rating: [
      'i.a-icon-star-small span.a-icon-alt',
      'i.a-icon-star span.a-icon-alt'
    ],
    
    ratingCount: [
      '[aria-label$="ratings"]',
      '.s-link-style .s-underline-text',
      '[aria-label$="rating"]'
    ]
  }
};

// JSON-LD selectors
export const JSONLD = {
  selector: 'script[type="application/ld+json"]',
  productType: 'Product'
};
