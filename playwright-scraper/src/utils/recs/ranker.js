// src/utils/recs/ranker.js
import { tokenize } from './text-utils.js';

const WEIGHTS = {
  relevance: 0.55,
  rating: 0.30,
  price: 0.15,
};

export function scoreCandidate(seed, candidate) {
  // Relevance by token overlap of title/features
  const seedTokens = new Set(tokenize([seed.productName, ...(seed.features || [])].filter(Boolean).join(' ')));
  const candTokens = new Set(tokenize([candidate.productName, ...(candidate.features || [])].filter(Boolean).join(' ')));

  const intersection = [...seedTokens].filter(x => candTokens.has(x)).length;
  const union = new Set([...seedTokens, ...candTokens]).size || 1;
  const relevanceScore = intersection / union; // 0..1

  // Rating contribution (normalize to 0..1 assuming 0..5 stars)
  const ratingScore = Math.max(0, Math.min(1, (candidate.rating || 0) / 5));

  // Price proximity contribution
  let priceScore = 0;
  if (isFinite(seed.price) && isFinite(candidate.price) && seed.price > 0) {
    const diff = Math.abs(candidate.price - seed.price) / seed.price; // 0 means identical
    priceScore = Math.max(0, 1 - diff); // decays as prices differ
  }

  const finalScore = WEIGHTS.relevance * relevanceScore + WEIGHTS.rating * ratingScore + WEIGHTS.price * priceScore;
  return finalScore;
}

export function dedupe(items, keySelector) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = keySelector(it);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}
