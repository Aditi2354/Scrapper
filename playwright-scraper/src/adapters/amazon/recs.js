import { PDP, SEARCH, JSONLD } from './selectors.js';
import { cleanText, tokenize, parseRating, toNumberPrice } from '../../utils/recs/text-utils.js';
import { sleep } from '../../utils/recs/antibot.js';
import { rankAndScore, dedupe } from '../../utils/recs/ranker.js';
import { bucketizeByPrice, selectTopRated, selectFeatureMatch } from '../../utils/recs/price-buckets.js';

export async function getAmazonRecommendations(page, inputUrl, limit = 15) {
  try {
    console.log('[Amazon Recs] Starting scrape for:', inputUrl);
    
    // Step 1: Read seed product
    const seed = await readSeed(page, inputUrl);
    console.log('[Amazon Recs] Seed:', seed.productName, '|', seed.price, '|', seed.rating);
    
    // Step 2: Build search queries
    const queries = buildQueries(seed);
    console.log('[Amazon Recs] Queries:', queries);
    
    // Step 3: Collect candidates from search
    const baseDomain = extractBaseDomain(inputUrl);
    let allCandidates = [];
    
    for (const query of queries) {
      await sleep();
      const candidates = await collectFromSearch(page, query, baseDomain, 36);
      allCandidates = allCandidates.concat(candidates);
      console.log(`[Amazon Recs] Collected ${candidates.length} from query: "${query}"`);
    }
    
    // Step 4: Dedupe and exclude seed
    allCandidates = dedupe(allCandidates, seed.asin);
    console.log(`[Amazon Recs] After dedupe: ${allCandidates.length} candidates`);
    
    // Step 5: Rank candidates
    const ranked = rankAndScore(allCandidates, seed);
    
    // Step 6: Enrichment pass for top candidates
    const topCandidates = ranked.slice(0, 15);
    console.log(`[Amazon Recs] Enriching top ${topCandidates.length} candidates...`);
    
    for (let i = 0; i < topCandidates.length; i++) {
      const cand = topCandidates[i];
      if (!cand.price || !cand.rating || !cand.productImage) {
        await sleep();
        try {
          const enriched = await enrichCandidate(page, cand, baseDomain);
          topCandidates[i] = { ...cand, ...enriched };
        } catch (err) {
          console.log(`[Amazon Recs] Enrichment failed for ${cand.productUrl}:`, err.message);
        }
      }
    }
    
    // Step 7: Create groups and flat list
    const groups = createGroups(topCandidates, seed);
    const flat = topCandidates.slice(0, limit).map(cleanupCandidate);
    
    return {
      site: 'amazon',
      inputUrl,
      seed: {
        productName: seed.productName,
        brand: seed.brand,
        price: seed.price,
        rating: seed.rating,
        ratingCount: seed.ratingCount,
        features: seed.features,
        productImage: seed.productImage,
        asin: seed.asin
      },
      groups: {
        topRated: groups.topRated.map(cleanupCandidate),
        featureMatch: groups.featureMatch.map(cleanupCandidate),
        budget: groups.budget.map(cleanupCandidate),
        midRange: groups.midRange.map(cleanupCandidate),
        premium: groups.premium.map(cleanupCandidate)
      },
      flat
    };
    
  } catch (error) {
    console.error('[Amazon Recs] Error:', error.message);
    return {
      error: 'Failed to fetch recommendations',
      detail: error.message
    };
  }
}

// Read seed product data
async function readSeed(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  
  const title = await pickText(page, PDP.title);
  const brand = await pickText(page, PDP.brand);
  let price = await pickPrice(page, PDP.price);
  let rating = await pickRating(page, PDP.rating);
  let ratingCount = await pickRatingCount(page, PDP.ratingCount);
  const features = await pickFeatures(page, PDP.features);
  let image = await pickImage(page, PDP.image, PDP.imageAttrs);
  
  // Try JSON-LD fallback for missing data
  if (!rating || !ratingCount || !price) {
    const ld = await extractJSONLD(page);
    if (ld) {
      if (!rating && ld.aggregateRating?.ratingValue) {
        rating = parseRating(ld.aggregateRating.ratingValue);
      }
      if (!ratingCount && ld.aggregateRating?.reviewCount) {
        ratingCount = parseInt(String(ld.aggregateRating.reviewCount).replace(/\D/g, ''), 10);
      }
      if (!price && ld.offers?.price) {
        price = toNumberPrice(ld.offers.price);
      }
    }
  }
  
  const asin = extractASIN(url);
  
  return {
    productName: cleanText(title),
    brand: cleanText(brand),
    price,
    rating,
    ratingCount,
    features,
    productImage: image,
    asin
  };
}

// Build search queries
function buildQueries(seed) {
  const tokens = tokenize(seed.productName);
  const topTokens = tokens.slice(0, 6);
  
  const queries = [];
  
  // Query 1: brand + top tokens
  if (seed.brand && topTokens.length > 0) {
    queries.push(`${seed.brand} ${topTokens.slice(0, 4).join(' ')}`);
  }
  
  // Query 2: top tokens only
  if (topTokens.length > 0) {
    queries.push(topTokens.slice(0, 6).join(' '));
  }
  
  // Fallback: use full product name
  if (queries.length === 0) {
    queries.push(seed.productName);
  }
  
  return queries;
}

// Collect candidates from search
async function collectFromSearch(page, query, baseDomain, limit = 36) {
  const searchUrl = `${baseDomain}/s?k=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(800);
  
  const candidates = [];
  const cards = page.locator(SEARCH.resultCard.join(', '));
  const count = await cards.count();
  
  for (let i = 0; i < count && candidates.length < limit; i++) {
    const card = cards.nth(i);
    
    // Check if sponsored
    const isSponsored = await card.locator(SEARCH.sponsored.join(', ')).count() > 0;
    if (isSponsored) continue;
    
    const asin = await card.getAttribute('data-asin').catch(() => null);
    if (!asin) continue;
    
    const title = await pickTextFrom(card, SEARCH.card.title);
    const link = await pickAttrFrom(card, SEARCH.card.link, 'href');
    const img = await pickImageFrom(card, SEARCH.card.image, SEARCH.card.imageAttrs);
    const price = await pickPriceFrom(card, SEARCH.card.price);
    const rating = await pickRatingFrom(card, SEARCH.card.rating);
    const ratingCount = await pickRatingCountFrom(card, SEARCH.card.ratingCount);
    
    if (!title || !link) continue;
    
    const fullUrl = new URL(link, baseDomain).href;
    
    candidates.push({
      productName: cleanText(title),
      productUrl: fullUrl,
      productImage: img,
      price,
      rating,
      ratingCount,
      asin
    });
  }
  
  return candidates;
}

// Enrich candidate by visiting PDP
async function enrichCandidate(page, candidate, baseDomain) {
  await page.goto(candidate.productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(600);
  
  const enriched = {};
  
  if (!candidate.price) {
    enriched.price = await pickPrice(page, PDP.price);
  }
  
  if (!candidate.rating) {
    enriched.rating = await pickRating(page, PDP.rating);
  }
  
  if (!candidate.ratingCount) {
    enriched.ratingCount = await pickRatingCount(page, PDP.ratingCount);
  }
  
  if (!candidate.productImage) {
    enriched.productImage = await pickImage(page, PDP.image, PDP.imageAttrs);
  }
  
  // JSON-LD fallback
  if (!enriched.rating || !enriched.ratingCount || !enriched.price) {
    const ld = await extractJSONLD(page);
    if (ld) {
      if (!enriched.rating && ld.aggregateRating?.ratingValue) {
        enriched.rating = parseRating(ld.aggregateRating.ratingValue);
      }
      if (!enriched.ratingCount && ld.aggregateRating?.reviewCount) {
        enriched.ratingCount = parseInt(String(ld.aggregateRating.reviewCount).replace(/\D/g, ''), 10);
      }
      if (!enriched.price && ld.offers?.price) {
        enriched.price = toNumberPrice(ld.offers.price);
      }
    }
  }
  
  return enriched;
}

// Create groups
function createGroups(candidates, seed) {
  const topRated = selectTopRated(candidates, 5);
  const featureMatch = selectFeatureMatch(candidates, seed, 5);
  const { budget, midRange, premium } = bucketizeByPrice(candidates, seed.price);
  
  return {
    topRated: topRated.slice(0, 5),
    featureMatch: featureMatch.slice(0, 5),
    budget: budget.slice(0, 5),
    midRange: midRange.slice(0, 5),
    premium: premium.slice(0, 5)
  };
}

// Helper functions
function cleanupCandidate(cand) {
  const { score, ...rest } = cand;
  return rest;
}

async function pickText(page, selectors) {
  for (const sel of selectors) {
    const text = await page.locator(sel).first().textContent().catch(() => null);
    if (text) return cleanText(text);
  }
  return null;
}

async function pickTextFrom(locator, selectors) {
  for (const sel of selectors) {
    const text = await locator.locator(sel).first().textContent().catch(() => null);
    if (text) return cleanText(text);
  }
  return null;
}

async function pickAttrFrom(locator, selectors, attr) {
  for (const sel of selectors) {
    const val = await locator.locator(sel).first().getAttribute(attr).catch(() => null);
    if (val) return val;
  }
  return null;
}

async function pickPrice(page, selectors) {
  for (const sel of selectors) {
    const text = await page.locator(sel).first().textContent().catch(() => null);
    if (text) {
      const price = toNumberPrice(text);
      if (price) return price;
    }
  }
  return null;
}

async function pickPriceFrom(locator, selectors) {
  for (const sel of selectors) {
    const text = await locator.locator(sel).first().textContent().catch(() => null);
    if (text) {
      const price = toNumberPrice(text);
      if (price) return price;
    }
  }
  return null;
}

async function pickRating(page, selectors) {
  for (const sel of selectors) {
    const text = await page.locator(sel).first().textContent().catch(() => null);
    if (text) {
      const rating = parseRating(text);
      if (rating) return rating;
    }
  }
  return null;
}

async function pickRatingFrom(locator, selectors) {
  for (const sel of selectors) {
    const text = await locator.locator(sel).first().textContent().catch(() => null);
    if (text) {
      const rating = parseRating(text);
      if (rating) return rating;
    }
  }
  return null;
}

async function pickRatingCount(page, selectors) {
  for (const sel of selectors) {
    const text = await page.locator(sel).first().textContent().catch(() => null);
    if (text) {
      const count = parseInt(String(text).replace(/\D/g, ''), 10);
      if (!isNaN(count)) return count;
    }
  }
  return null;
}

async function pickRatingCountFrom(locator, selectors) {
  for (const sel of selectors) {
    const text = await locator.locator(sel).first().textContent().catch(() => null);
    if (text) {
      const count = parseInt(String(text).replace(/\D/g, ''), 10);
      if (!isNaN(count)) return count;
    }
  }
  return null;
}

async function pickFeatures(page, selectors) {
  const features = [];
  for (const sel of selectors) {
    const elements = await page.locator(sel).all();
    for (const el of elements) {
      const text = await el.textContent().catch(() => null);
      if (text) features.push(cleanText(text));
    }
    if (features.length > 0) break;
  }
  return features.slice(0, 10);
}

async function pickImage(page, selectors, attrs) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count() === 0) continue;
    
    for (const attr of attrs) {
      const val = await el.getAttribute(attr).catch(() => null);
      if (val) {
        const parsed = parseImageAttr(attr, val);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

async function pickImageFrom(locator, selectors, attrs) {
  for (const sel of selectors) {
    const el = locator.locator(sel).first();
    if (await el.count() === 0) continue;
    
    for (const attr of attrs) {
      const val = await el.getAttribute(attr).catch(() => null);
      if (val) {
        const parsed = parseImageAttr(attr, val);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

function parseImageAttr(attr, val) {
  if (!val) return null;
  if (attr.includes('srcset')) {
    const first = String(val).split(',')[0]?.trim().split(' ')[0];
    return first || null;
  }
  if (attr === 'data-a-dynamic-image') {
    try {
      return Object.keys(JSON.parse(val))[0] || null;
    } catch {
      return null;
    }
  }
  return val;
}

async function extractJSONLD(page) {
  try {
    const scripts = await page.$$eval(JSONLD.selector, els => 
      els.map(el => el.textContent || '')
    );
    
    for (const script of scripts) {
      try {
        const json = JSON.parse(script.trim());
        const arr = Array.isArray(json) ? json : [json];
        for (const obj of arr) {
          if (obj['@type'] === JSONLD.productType) return obj;
        }
      } catch {}
    }
  } catch {}
  return null;
}

function extractASIN(url) {
  const str = String(url);
  const match = str.match(/(?:dp|gp\/product|aw\/d)\/([A-Z0-9]{10})/i) || 
                str.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return match ? match[1] : null;
}

function extractBaseDomain(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}`;
}
