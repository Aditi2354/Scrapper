// src/adapters/amazon/selectors.js

export const PDP_SELECTORS = {
  title: ['#productTitle', 'h1#title span', '#titleSection #title'],
  brand: ['#bylineInfo', '#productOverview_feature_div td.a-span9 span', '#brand', '#bylineInfo_feature_div a'],
  priceStrict: [
    '#corePriceDisplay_desktop_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#apex_desktop .a-price[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price[data-a-color="price"] .a-offscreen',
  ],
  rating: ['#acrPopover .a-icon-alt','span[data-hook="rating-out-of-text"]','i[data-hook="average-star-rating"] span'],
  ratingCount: ['#acrCustomerReviewText','span[data-hook="total-review-count"]','#acrCustomerReviewText .a-size-base'],
  image: ['#imgTagWrapperId img','#landingImage','.imageThumb img','#imageBlock img'],
  features: ['#feature-bullets li', '#feature-bullets ul li', '#productFacts desktop ul li']
};

export const SEARCH_SELECTORS = {
  card: '[data-component-type="s-search-result"].s-result-item, .s-result-item[data-asin]'.trim(),
  title: 'h2 a span, h5 a span',
  href: 'h2 a, h5 a, a.a-link-normal.s-no-outline',
  image: 'img.s-image, img',
  priceCandidates: [
    '.a-price[data-a-color="price"] .a-offscreen',
    '.a-price .a-offscreen',
    '.a-color-price'
  ],
  rating: 'i.a-icon-star-small span.a-icon-alt, i.a-icon-star span.a-icon-alt',
  ratingCount: '[aria-label$="ratings"], .s-link-style .s-underline-text, [aria-label$="rating"]'
};
