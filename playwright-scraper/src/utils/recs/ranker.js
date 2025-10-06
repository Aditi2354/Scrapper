import { tokenize, jaccardSimilarity } from './text-utils.js';

/**
 * Scores a candidate product against a seed product
 * @param {Object} seed - The original product { productName, price, rating, features }
 * @param {Object} candidate - The candidate product to score
 * @param {Object} weights - Weight configuration (optional)
 * @returns {number} Score between 0-1
 */
export function scoreCandidate(seed, candidate, weights = {}) {
  const {
    titleWeight = 0.55,
    ratingWeight = 0.30,
    priceProximityWeight = 0.15
  } = weights;

  let score = 0;

  // Title/features similarity (most important)
  const seedTokens = tokenize(seed.productName || '');
  const candidateTokens = tokenize(candidate.productName || candidate.title || '');

  if (seedTokens.length > 0 && candidateTokens.length > 0) {
    const similarity = jaccardSimilarity(seedTokens, candidateTokens);
    score += similarity * titleWeight;
  }

  // Rating score (good ratings boost score)
  if (candidate.rating && candidate.rating > 0) {
    // Normalize rating to 0-1 scale (assuming 5-star system)
    const normalizedRating = Math.min(candidate.rating / 5, 1);
    score += normalizedRating * ratingWeight;
  }

  // Price proximity (closer prices get higher scores)
  if (seed.price && candidate.price && seed.price > 0) {
    const priceDiff = Math.abs(candidate.price - seed.price);
    const proximityRatio = Math.max(0, 1 - (priceDiff / seed.price));

    // Only boost if price is reasonably close (within 100% of seed price)
    if (proximityRatio > 0.5) {
      score += proximityRatio * priceProximityWeight;
    }
  }

  return Math.min(1, score); // Cap at 1.0
}

/**
 * Deduplicates products by URL, keeping the highest scored one
 * @param {Array} products - Array of product objects with _score property
 * @returns {Array} Deduplicated array
 */
export function dedupeProducts(products) {
  const seen = new Map();

  for (const product of products) {
    const url = product.productUrl || product.url;
    if (!url) continue;

    if (!seen.has(url) || (product._score || 0) > (seen.get(url)._score || 0)) {
      seen.set(url, product);
    }
  }

  return Array.from(seen.values());
}

/**
 * Ranks and filters products based on seed similarity
 * @param {Object} seed - The original product
 * @param {Array} candidates - Array of candidate products
 * @param {Object} options - Options { limit, excludeAsins }
 * @returns {Array} Ranked and filtered products
 */
export function rankProducts(seed, candidates, options = {}) {
  const { limit = 50, excludeAsins = [] } = options;

  // Filter out excluded ASINs
  const filtered = candidates.filter(candidate => {
    const asin = candidate.asin;
    return asin && !excludeAsins.includes(asin);
  });

  // Score each candidate
  const scored = filtered.map(candidate => ({
    ...candidate,
    _score: scoreCandidate(seed, candidate)
  }));

  // Sort by score (descending)
  scored.sort((a, b) => (b._score || 0) - (a._score || 0));

  // Return top N, removing score property
  return scored
    .slice(0, limit)
    .map(({ _score, ...product }) => product);
}