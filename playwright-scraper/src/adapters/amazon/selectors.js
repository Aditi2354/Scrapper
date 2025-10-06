// Centralized selectors for Amazon PDP and search cards

export const PDP = {
  title: ['#productTitle','h1#title span','#titleSection #title'],
  brand: ['#bylineInfo','a#bylineInfo','tr.po-brand td.a-span9 span','div.po-brand td.a-span9 span'],
  priceStrict: [
    '#corePriceDisplay_desktop_feature_div .a-price[data-a-color="price"] .a-offscreen',
    '#apex_desktop .a-price[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price[data-a-color="price"] .a-offscreen'
  ],
  rating: ['#acrPopover .a-icon-alt','span[data-hook="rating-out-of-text"]','i[data-hook="average-star-rating"] span'],
  ratingCount: ['#acrCustomerReviewText','span[data-hook="total-review-count"]','#acrCustomerReviewText .a-size-base'],
  image: ['#imgTagWrapperId img','#landingImage','.imageThumb img','#imageBlock img'],
  features: ['#feature-bullets li span','div#productOverview_feature_div tr td.a-span9 span', '#productOverview_feature_div td.a-span9 span'],
  ldjson: 'script[type="application/ld+json"]'
};

export const SEARCH = {
  card: '[data-component-type="s-search-result"].s-result-item, .s-result-item[data-asin]',
  sponsored: '[aria-label="Sponsored"], [data-component-type="sp-sponsored-result"]',
  title: 'h2 a span, h5 a span',
  href: 'h2 a, h5 a, a.a-link-normal.s-no-outline',
  img: 'img.s-image, img',
  price: ['.a-price[data-a-color="price"] .a-offscreen', '.a-price .a-offscreen', '.a-color-price'],
  rating: 'i.a-icon-star-small span.a-icon-alt, i.a-icon-star span.a-icon-alt',
  ratingCount: '[aria-label$="ratings"], .s-link-style .s-underline-text, [aria-label$="rating"]'
};
