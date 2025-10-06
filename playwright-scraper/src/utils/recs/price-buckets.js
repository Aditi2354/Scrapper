/**
 * Calculates price buckets using quantiles (33rd and 66th percentiles)
 * @param {Array} products - Array of products with price property
 * @returns {Object} Price boundaries { budget, mid, premium }
 */
export function calculatePriceBuckets(products) {
  const prices = products
    .map(p => p.price)
    .filter(price => price != null && price > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return { budget: 0, mid: 0, premium: 0 };
  }

  const q33 = Math.floor(prices.length * 0.33);
  const q66 = Math.floor(prices.length * 0.66);

  return {
    budget: prices[Math.max(0, q33 - 1)] || prices[0],
    mid: prices[Math.max(0, q66 - 1)] || prices[Math.floor(prices.length / 2)],
    premium: prices[prices.length - 1] || prices[prices.length - 1]
  };
}

/**
 * Categorizes products into price buckets
 * @param {Array} products - Array of products with price property
 * @param {Object} buckets - Price boundaries { budget, mid, premium }
 * @returns {Object} Categorized products
 */
export function categorizeByPrice(products, buckets) {
  const { budget, mid, premium } = buckets;

  const categories = {
    topRated: [],
    featureMatch: [],
    budget: [],
    midRange: [],
    premium: []
  };

  // Sort by rating and price similarity for special categories
  const sortedByRating = [...products].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const sortedByPrice = [...products].sort((a, b) => {
    const aPrice = a.price || 0;
    const bPrice = b.price || 0;
    return Math.abs(aPrice - budget) - Math.abs(bPrice - budget);
  });

  // Top rated (highest ratings)
  categories.topRated = sortedByRating.slice(0, Math.ceil(products.length * 0.3));

  // Feature match (closest to budget price)
  categories.featureMatch = sortedByPrice.slice(0, Math.ceil(products.length * 0.3));

  // Price buckets
  for (const product of products) {
    const price = product.price || 0;

    if (price <= budget) {
      categories.budget.push(product);
    } else if (price <= mid) {
      categories.midRange.push(product);
    } else {
      categories.premium.push(product);
    }
  }

  return categories;
}

/**
 * Creates the final grouped response structure
 * @param {Array} products - Array of products
 * @param {Object} buckets - Price boundaries
 * @param {number} limit - Total limit for flat array
 * @returns {Object} Grouped products structure
 */
export function createGroupedResponse(products, buckets, limit = 50) {
  const categorized = categorizeByPrice(products, buckets);

  // Flatten and limit for the flat array
  const allProducts = [
    ...categorized.topRated,
    ...categorized.featureMatch,
    ...categorized.budget,
    ...categorized.midRange,
    ...categorized.premium
  ];

  // Remove duplicates and limit
  const seen = new Set();
  const flat = [];

  for (const product of allProducts) {
    const url = product.productUrl || product.url;
    if (url && !seen.has(url)) {
      seen.add(url);
      flat.push(product);
      if (flat.length >= limit) break;
    }
  }

  return {
    topRated: categorized.topRated.slice(0, 10),
    featureMatch: categorized.featureMatch.slice(0, 10),
    budget: categorized.budget.slice(0, 10),
    midRange: categorized.midRange.slice(0, 10),
    premium: categorized.premium.slice(0, 10)
  };
}