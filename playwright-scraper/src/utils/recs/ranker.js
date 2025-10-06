import { tokenize } from './text-utils.js';

const TITLE_WEIGHT = 0.55;
const RATING_WEIGHT = 0.30;
const PRICE_WEIGHT = 0.15;

export function scoreCandidate(candidate, seed) {
  let score = 0;
  
  // Title similarity (55% weight)
  const titleScore = calculateTitleSimilarity(candidate.title, seed.productName);
  score += titleScore * TITLE_WEIGHT;
  
  // Rating score (30% weight)
  const ratingScore = calculateRatingScore(candidate.rating, seed.rating);
  score += ratingScore * RATING_WEIGHT;
  
  // Price proximity (15% weight)
  const priceScore = calculatePriceScore(candidate.price, seed.price);
  score += priceScore * PRICE_WEIGHT;
  
  return Math.max(0, Math.min(1, score));
}

function calculateTitleSimilarity(candidateTitle, seedTitle) {
  if (!candidateTitle || !seedTitle) return 0;
  
  const candidateTokens = new Set(tokenize(candidateTitle));
  const seedTokens = new Set(tokenize(seedTitle));
  
  if (candidateTokens.size === 0 || seedTokens.size === 0) return 0;
  
  // Jaccard similarity
  const intersection = new Set([...candidateTokens].filter(x => seedTokens.has(x)));
  const union = new Set([...candidateTokens, ...seedTokens]);
  
  return intersection.size / union.size;
}

function calculateRatingScore(candidateRating, seedRating) {
  if (!candidateRating || !seedRating) return 0.5; // Neutral score for missing ratings
  
  const ratingDiff = Math.abs(candidateRating - seedRating);
  const maxDiff = 5.0; // Maximum possible rating difference
  
  // Higher score for ratings closer to seed rating
  return 1 - (ratingDiff / maxDiff);
}

function calculatePriceScore(candidatePrice, seedPrice) {
  if (!candidatePrice || !seedPrice) return 0.5; // Neutral score for missing prices
  
  const priceRatio = Math.min(candidatePrice, seedPrice) / Math.max(candidatePrice, seedPrice);
  
  // Higher score for prices closer to seed price
  // 0.8+ ratio gets high score, 0.5+ gets medium score
  if (priceRatio >= 0.8) return 1.0;
  if (priceRatio >= 0.5) return 0.7;
  if (priceRatio >= 0.3) return 0.4;
  return 0.1;
}

export function dedupeCandidates(candidates) {
  const seen = new Set();
  const deduped = [];
  
  for (const candidate of candidates) {
    const key = candidate.asin || candidate.url || candidate.title;
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(candidate);
    }
  }
  
  return deduped;
}

export function sortByScore(candidates) {
  return candidates.sort((a, b) => (b._score || 0) - (a._score || 0));
}

export function rankCandidates(candidates, seed) {
  // Score all candidates
  const scored = candidates.map(candidate => ({
    ...candidate,
    _score: scoreCandidate(candidate, seed)
  }));
  
  // Deduplicate
  const deduped = dedupeCandidates(scored);
  
  // Sort by score
  return sortByScore(deduped);
}