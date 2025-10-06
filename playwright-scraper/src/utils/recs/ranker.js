import { tokenize } from './text-utils.js';

const WEIGHTS = {
  titleFeatures: 0.55,
  rating: 0.30,
  priceProximity: 0.15
};

export function scoreCandidate(candidate, seed) {
  const seedTokens = new Set(tokenize(seed.productName || ''));
  const seedFeatures = new Set((seed.features || []).flatMap(f => tokenize(f)));
  const seedPrice = seed.price;
  const seedRating = seed.rating || 0;
  
  const candTokens = tokenize(candidate.productName || candidate.title || '');
  
  // Title/Features similarity (Jaccard)
  const allSeedTokens = new Set([...seedTokens, ...seedFeatures]);
  const candTokenSet = new Set(candTokens);
  const intersection = [...allSeedTokens].filter(t => candTokenSet.has(t)).length;
  const union = allSeedTokens.size + candTokenSet.size - intersection;
  const titleScore = union > 0 ? intersection / union : 0;
  
  // Rating score (normalized 0-1)
  const candRating = candidate.rating || 0;
  const ratingScore = candRating / 5;
  
  // Price proximity score
  let priceScore = 0;
  if (seedPrice && candidate.price) {
    const diff = Math.abs(candidate.price - seedPrice) / seedPrice;
    priceScore = Math.max(0, 1 - diff); // Closer = higher score
  }
  
  const totalScore = 
    titleScore * WEIGHTS.titleFeatures +
    ratingScore * WEIGHTS.rating +
    priceScore * WEIGHTS.priceProximity;
  
  return totalScore;
}

export function dedupe(candidates, seedAsin = null) {
  const seen = new Set();
  const deduped = [];
  
  for (const cand of candidates) {
    const key = cand.asin || cand.productUrl || cand.url;
    if (!key || seen.has(key)) continue;
    if (seedAsin && cand.asin === seedAsin) continue;
    
    seen.add(key);
    deduped.push(cand);
  }
  
  return deduped;
}

export function rankAndScore(candidates, seed) {
  const scored = candidates.map(cand => ({
    ...cand,
    _score: scoreCandidate(cand, seed)
  }));
  
  scored.sort((a, b) => b._score - a._score);
  
  // Remove internal score before returning
  return scored.map(({ _score, ...rest }) => ({ ...rest, score: _score }));
}
