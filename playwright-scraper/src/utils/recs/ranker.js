/**
 * Ranking and scoring utilities for Amazon recommendations
 */

import { tokenize, calculateSimilarity } from './text-utils.js';

/**
 * Score a candidate product against the seed product
 */
export function scoreCandidate(candidate, seed, weights = {}) {
  const {
    titleWeight = 0.35,
    featuresWeight = 0.20,
    ratingWeight = 0.30,
    priceWeight = 0.15
  } = weights;

  let score = 0;

  // Title similarity (35%)
  if (candidate.productName && seed.productName) {
    const titleSimilarity = calculateSimilarity(candidate.productName, seed.productName);
    score += titleSimilarity * titleWeight;
  }

  // Features similarity (20%)
  if (candidate.features && seed.features) {
    const featuresSimilarity = calculateFeatureSimilarity(candidate.features, seed.features);
    score += featuresSimilarity * featuresWeight;
  }

  // Rating score (30%)
  if (candidate.rating && candidate.rating > 0) {
    const ratingScore = candidate.rating / 5; // Normalize to 0-1
    score += ratingScore * ratingWeight;
  }

  // Price proximity (15%)
  if (candidate.price && seed.price && seed.price > 0) {
    const priceProximity = calculatePriceProximity(candidate.price, seed.price);
    score += priceProximity * priceWeight;
  }

  return Math.min(score, 1); // Cap at 1.0
}

/**
 * Calculate feature similarity between two feature arrays
 */
function calculateFeatureSimilarity(features1, features2) {
  if (!features1 || !features2 || features1.length === 0 || features2.length === 0) {
    return 0;
  }

  const set1 = new Set(features1.map(f => f.toLowerCase()));
  const set2 = new Set(features2.map(f => f.toLowerCase()));

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Calculate price proximity score
 */
function calculatePriceProximity(price1, price2) {
  if (!price1 || !price2 || price2 <= 0) return 0;

  const ratio = Math.min(price1, price2) / Math.max(price1, price2);
  
  // Higher score for closer prices
  if (ratio >= 0.9) return 1.0;      // Very close (within 10%)
  if (ratio >= 0.8) return 0.8;      // Close (within 20%)
  if (ratio >= 0.6) return 0.6;      // Reasonable (within 40%)
  if (ratio >= 0.4) return 0.3;      // Somewhat close (within 60%)
  return 0;                          // Too different
}

/**
 * Deduplicate candidates by URL and ASIN
 */
export function deduplicateCandidates(candidates) {
  const seen = new Set();
  const deduped = [];

  for (const candidate of candidates) {
    const key = candidate.productUrl || candidate.url;
    const asin = candidate.asin;
    
    if (!key) continue;

    // Check by URL first
    if (seen.has(key)) continue;
    
    // Check by ASIN if available
    if (asin && [...seen].some(existing => {
      const existingCandidate = candidates.find(c => c.productUrl === existing || c.url === existing);
      return existingCandidate && existingCandidate.asin === asin;
    })) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

/**
 * Sort candidates by score in descending order
 */
export function sortByScore(candidates) {
  return candidates.sort((a, b) => (b._score || 0) - (a._score || 0));
}

/**
 * Rank and filter candidates
 */
export function rankCandidates(candidates, seed, options = {}) {
  const {
    maxResults = 15,
    minScore = 0.1,
    excludeASIN = null
  } = options;

  // Filter out seed product
  let filtered = candidates.filter(candidate => {
    if (excludeASIN && candidate.asin === excludeASIN) return false;
    return true;
  });

  // Score each candidate
  const scored = filtered.map(candidate => ({
    ...candidate,
    _score: scoreCandidate(candidate, seed)
  }));

  // Sort by score
  const sorted = sortByScore(scored);

  // Filter by minimum score
  const qualified = sorted.filter(candidate => candidate._score >= minScore);

  // Take top results
  const topResults = qualified.slice(0, maxResults);

  // Remove score from final results
  return topResults.map(({ _score, ...candidate }) => candidate);
}

/**
 * Group candidates by different criteria
 */
export function groupCandidates(candidates, seed) {
  const groups = {
    topRated: [],
    featureMatch: [],
    budget: [],
    midRange: [],
    premium: []
  };

  for (const candidate of candidates) {
    // Top rated (rating >= 4.0 and ratingCount >= 100)
    if (candidate.rating >= 4.0 && candidate.ratingCount >= 100) {
      groups.topRated.push(candidate);
    }

    // Feature match (has significant feature overlap)
    if (candidate.features && seed.features) {
      const featureSimilarity = calculateFeatureSimilarity(candidate.features, seed.features);
      if (featureSimilarity >= 0.3) {
        groups.featureMatch.push(candidate);
      }
    }

    // Price-based grouping
    if (candidate.price && seed.price) {
      const priceRatio = candidate.price / seed.price;
      
      if (priceRatio <= 0.6) {
        groups.budget.push(candidate);
      } else if (priceRatio <= 1.4) {
        groups.midRange.push(candidate);
      } else {
        groups.premium.push(candidate);
      }
    }
  }

  // Sort each group by score if available
  Object.keys(groups).forEach(key => {
    groups[key] = groups[key].sort((a, b) => (b._score || 0) - (a._score || 0));
  });

  return groups;
}
