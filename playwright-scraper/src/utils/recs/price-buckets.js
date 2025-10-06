/**
 * Price bucket categorization utilities
 */

/**
 * Calculate price quantiles for bucketing
 */
export function calculatePriceQuantiles(prices) {
  if (!prices || prices.length === 0) return { q33: 0, q66: 0 };

  const sortedPrices = [...prices].sort((a, b) => a - b);
  const len = sortedPrices.length;

  const q33Index = Math.floor(len * 0.33);
  const q66Index = Math.floor(len * 0.66);

  return {
    q33: sortedPrices[q33Index] || 0,
    q66: sortedPrices[q66Index] || 0
  };
}

/**
 * Categorize products into price buckets
 */
export function categorizeByPrice(products, seedPrice = null) {
  const validPrices = products
    .map(p => p.price)
    .filter(price => price && price > 0);

  if (validPrices.length === 0) {
    return {
      budget: [],
      midRange: [],
      premium: [],
      quantiles: { q33: 0, q66: 0 }
    };
  }

  const quantiles = calculatePriceQuantiles(validPrices);
  const { q33, q66 } = quantiles;

  const buckets = {
    budget: [],
    midRange: [],
    premium: [],
    quantiles
  };

  for (const product of products) {
    if (!product.price || product.price <= 0) continue;

    if (product.price <= q33) {
      buckets.budget.push(product);
    } else if (product.price <= q66) {
      buckets.midRange.push(product);
    } else {
      buckets.premium.push(product);
    }
  }

  return buckets;
}

/**
 * Categorize products relative to seed price
 */
export function categorizeBySeedPrice(products, seedPrice) {
  if (!seedPrice || seedPrice <= 0) {
    return categorizeByPrice(products);
  }

  const buckets = {
    budget: [],
    midRange: [],
    premium: []
  };

  for (const product of products) {
    if (!product.price || product.price <= 0) continue;

    const ratio = product.price / seedPrice;

    if (ratio <= 0.6) {
      buckets.budget.push(product);
    } else if (ratio <= 1.4) {
      buckets.midRange.push(product);
    } else {
      buckets.premium.push(product);
    }
  }

  return buckets;
}

/**
 * Get price range description
 */
export function getPriceRangeDescription(min, max) {
  if (min === max) return `$${min.toFixed(2)}`;
  return `$${min.toFixed(2)} - $${max.toFixed(2)}`;
}

/**
 * Calculate price statistics
 */
export function calculatePriceStats(prices) {
  if (!prices || prices.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0 };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const len = sorted.length;

  return {
    min: sorted[0],
    max: sorted[len - 1],
    avg: prices.reduce((sum, price) => sum + price, 0) / len,
    median: len % 2 === 0 
      ? (sorted[len / 2 - 1] + sorted[len / 2]) / 2
      : sorted[Math.floor(len / 2)]
  };
}
