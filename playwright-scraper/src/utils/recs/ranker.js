import { tokenize, toNumberPrice, parseRating } from './text-utils.js';

// weights: title/features 0.55, rating 0.30, price proximity 0.15
const WEIGHTS = { text: 0.55, rating: 0.30, price: 0.15 };

export function scoreCandidate(seed, cand){
  const seedTokens = tokenize(seed.productName || seed.product_title || seed.product_name || '');
  const candTokens = tokenize(cand.productName || cand.title || '');
  const textScore = jaccard(seedTokens, candTokens);

  const seedRating = parseRating(seed.rating);
  const candRating = parseRating(cand.rating);
  const ratingScore = candRating == null ? 0 : (candRating / 5);

  const seedPrice = toNumberPrice(seed.price);
  const candPrice = toNumberPrice(cand.price);
  let priceScore = 0;
  if (seedPrice != null && candPrice != null && seedPrice > 0){
    const diff = Math.abs(candPrice - seedPrice) / seedPrice; // relative diff
    priceScore = diff <= 0.5 ? (1 - (diff / 0.5)) : 0; // linear drop to 0 at 50%
  }

  const total = WEIGHTS.text * textScore + WEIGHTS.rating * ratingScore + WEIGHTS.price * priceScore;
  return Number.isFinite(total) ? total : 0;
}

export function rankAndDedupe(seed, items, { excludeAsin, limit = 50 } = {}){
  const seen = new Set();
  const scored = [];
  for (const it of items){
    const url = it.productUrl || it.url;
    const asin = it.asin || extractASIN(url || '');
    if (!url || seen.has(url)) continue;
    if (excludeAsin && asin && asin === excludeAsin) continue;
    seen.add(url);
    scored.push({ ...normalize(it), _score: scoreCandidate(seed, it) });
  }
  scored.sort((a,b) => b._score - a._score);
  return scored.slice(0, limit).map(({ _score, ...rest }) => rest);
}

export function extractASIN(u){
  const s = String(u||'');
  const m = s.match(/(?:dp|gp\/product|aw\/d)\/([A-Z0-9]{10})/i) || s.match(/\/([A-Z0-9]{10})(?:[\/?]|$)/i);
  return m ? m[1] : null;
}

function normalize(it){
  return {
    productName: it.productName || it.title || null,
    productUrl: it.productUrl || it.url || null,
    productImage: it.productImage || it.image || null,
    price: toNumberPrice(it.price),
    rating: parseRating(it.rating),
    ratingCount: it.ratingCount != null ? Number(String(it.ratingCount).replace(/[^0-9]/g,'')) : (it.rating_count ?? null),
    asin: it.asin || extractASIN(it.productUrl || it.url || '')
  };
}

function jaccard(aArr, bArr){
  const A = new Set(aArr), B = new Set(bArr);
  const inter = [...A].filter(x => B.has(x)).length;
  const denom = Math.max(1, A.size + B.size - inter);
  return inter / denom;
}
