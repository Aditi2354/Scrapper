// Ranking and scoring utilities for recommendations
import { tokenize, textSimilarity } from './text-utils.js';

// Scoring weights as per requirements
const WEIGHTS = {
  TITLE_FEATURES: 0.55,
  RATING: 0.30,
  PRICE_PROXIMITY: 0.15
};

export function scoreCandidate(candidate, seedData) {
  let totalScore = 0;
  
  // 1. Title/Features similarity (0.55 weight)
  const seedTokens = tokenize(seedData.productName || seedData.title || '', 8);
  const candidateTokens = tokenize(candidate.productName || candidate.title || '', 8);
  const titleScore = textSimilarity(seedTokens, candidateTokens);
  
  // Bonus for feature matches if available
  let featureScore = 0;
  if (seedData.features && candidate.features) {
    const seedFeatureTokens = seedData.features.join(' ').split(/\s+/).slice(0, 10);
    const candidateFeatureTokens = candidate.features.join(' ').split(/\s+/).slice(0, 10);
    featureScore = textSimilarity(seedFeatureTokens, candidateFeatureTokens) * 0.3;
  }
  
  const titleFeaturesScore = Math.min(1, titleScore + featureScore);
  totalScore += titleFeaturesScore * WEIGHTS.TITLE_FEATURES;
  
  // 2. Rating score (0.30 weight)
  let ratingScore = 0;
  if (candidate.rating && candidate.rating > 0) {
    ratingScore = candidate.rating / 5; // Normalize to 0-1
    
    // Bonus for high review count
    if (candidate.ratingCount) {
      const reviewBonus = Math.min(0.2, candidate.ratingCount / 1000 * 0.1);
      ratingScore += reviewBonus;
    }
  }
  totalScore += Math.min(1, ratingScore) * WEIGHTS.RATING;
  
  // 3. Price proximity (0.15 weight)
  let priceScore = 0;
  if (seedData.price && candidate.price && seedData.price > 0 && candidate.price > 0) {
    const priceDiff = Math.abs(candidate.price - seedData.price) / seedData.price;
    
    // Score based on price proximity
    if (priceDiff <= 0.1) priceScore = 1.0;        // Within 10%
    else if (priceDiff <= 0.2) priceScore = 0.8;   // Within 20%
    else if (priceDiff <= 0.4) priceScore = 0.6;   // Within 40%
    else if (priceDiff <= 0.6) priceScore = 0.4;   // Within 60%
    else if (priceDiff <= 1.0) priceScore = 0.2;   // Within 100%
    else priceScore = 0.1;                          // Beyond 100%
  }
  totalScore += priceScore * WEIGHTS.PRICE_PROXIMITY;
  
  return {
    ...candidate,
    _score: totalScore,
    _titleScore: titleFeaturesScore,
    _ratingScore: ratingScore,
    _priceScore: priceScore
  };
}

export function dedupeResults(candidates, seedAsin = null) {
  const seen = new Set();
  const deduped = [];
  
  for (const candidate of candidates) {
    // Skip if it's the seed product
    if (seedAsin && candidate.asin === seedAsin) continue;
    
    // Create a dedupe key based on ASIN (preferred) or URL
    const dedupeKey = candidate.asin || candidate.productUrl || candidate.url;
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    
    // Additional title-based deduplication for similar products
    const titleKey = (candidate.productName || candidate.title || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50);
    
    if (titleKey && seen.has(titleKey)) continue;
    
    seen.add(dedupeKey);
    if (titleKey) seen.add(titleKey);
    deduped.push(candidate);
  }
  
  return deduped;
}

export function sortByScore(candidates) {
  return [...candidates].sort((a, b) => (b._score || 0) - (a._score || 0));
}

export function rankCandidates(candidates, seedData, options = {}) {
  const { limit = 15, seedAsin = null } = options;
  
  // Score all candidates
  const scored = candidates.map(candidate => scoreCandidate(candidate, seedData));
  
  // Sort by score
  const sorted = sortByScore(scored);
  
  // Dedupe and limit
  const deduped = dedupeResults(sorted, seedAsin);
  
  // Remove scoring metadata and return top results
  return deduped.slice(0, limit).map(({ _score, _titleScore, _ratingScore, _priceScore, ...rest }) => rest);
}