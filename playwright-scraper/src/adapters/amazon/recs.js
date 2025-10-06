/**
 * Amazon recommendations provider
 */

import { newContext, extractTLD, buildAmazonBase, sleep } from '../../utils/recs/antibot.js';
import { 
  cleanText, 
  tokenize, 
  parseRating, 
  toNumberPrice, 
  extractBrand, 
  extractFeatures, 
  extractASIN 
} from '../../utils/recs/text-utils.js';
import { rankCandidates, groupCandidates } from '../../utils/recs/ranker.js';
import { categorizeBySeedPrice } from '../../utils/recs/price-buckets.js';
import { 
  PDP_SELECTORS, 
  SEARCH_SELECTORS, 
  JSON_LD_SELECTORS, 
  MOBILE_SELECTORS,
  FEATURE_SELECTORS 
} from './selectors.js';

/**
 * Main Amazon recommendations function
 */
export async function getAmazonRecommendations(browser, { url, limit = 15 }) {
  const tld = extractTLD(url);
  const baseUrl = buildAmazonBase(tld);
  
  const context = await newContext(browser, tld);
  
  try {
    const page = await context.newPage();
    
    // Step 1: Read seed product
    console.log('Reading seed product...');
    const seed = await readSeed(page, url);
    
    if (!seed.productName) {
      throw new Error('Could not extract product name from seed URL');
    }
    
    // Step 2: Build search queries
    const queries = buildSearchQueries(seed);
    console.log('Built queries:', queries);
    
    // Step 3: Collect candidates from search
    console.log('Collecting candidates from search...');
    const allCandidates = [];
    
    for (const query of queries) {
      const candidates = await collectFromSearch(page, query, 36, baseUrl);
      allCandidates.push(...candidates);
      await sleep(500, 1000); // Random delay between searches
    }
    
    // Step 4: Merge and deduplicate
    const merged = deduplicateCandidates(allCandidates);
    console.log(`Collected ${merged.length} unique candidates`);
    
    // Step 5: Score and rank
    console.log('Scoring and ranking candidates...');
    const ranked = rankCandidates(merged, seed, { 
      maxResults: Math.min(limit * 2, 30), // Get more for enrichment
      excludeASIN: seed.asin 
    });
    
    // Step 6: Enrichment pass for top candidates
    console.log('Enriching top candidates...');
    const enriched = await enrichCandidates(page, ranked.slice(0, 15), baseUrl);
    
    // Step 7: Final ranking and grouping
    const finalRanked = rankCandidates(enriched, seed, { 
      maxResults: limit,
      excludeASIN: seed.asin 
    });
    
    const groups = groupCandidates(finalRanked, seed);
    const priceGroups = categorizeBySeedPrice(finalRanked, seed.price);
    
    // Step 8: Build response
    const response = {
      site: 'amazon',
      inputUrl: url,
      seed: {
        productName: seed.productName,
        brand: seed.brand,
        price: seed.price,
        rating: seed.rating,
        ratingCount: seed.ratingCount,
        features: seed.features || [],
        productImage: seed.productImage,
        asin: seed.asin
      },
      groups: {
        topRated: groups.topRated.slice(0, 5),
        featureMatch: groups.featureMatch.slice(0, 5),
        budget: priceGroups.budget.slice(0, 5),
        midRange: priceGroups.midRange.slice(0, 5),
        premium: priceGroups.premium.slice(0, 5)
      },
      flat: finalRanked.map(candidate => ({
        productName: candidate.productName,
        productUrl: candidate.productUrl,
        productImage: candidate.productImage,
        price: candidate.price,
        rating: candidate.rating,
        ratingCount: candidate.ratingCount,
        asin: candidate.asin
      }))
    };
    
    return response;
    
  } finally {
    await context.close();
  }
}

/**
 * Read seed product information from PDP
 */
async function readSeed(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(1000, 2000);
  
  // Extract basic info using selectors
  const title = await pickText(page, PDP_SELECTORS.title);
  const priceText = await pickText(page, PDP_SELECTORS.price);
  const ratingText = await pickText(page, PDP_SELECTORS.rating);
  const ratingCountText = await pickText(page, PDP_SELECTORS.ratingCount);
  const image = await pickAttr(page, PDP_SELECTORS.image, ['src', 'data-src', 'data-old-hires']);
  const brand = await pickText(page, PDP_SELECTORS.brand);
  
  // Try JSON-LD fallback for missing data
  const jsonLd = await extractJSONLD(page);
  
  const productName = cleanText(title);
  const price = toNumberPrice(priceText) || jsonLd?.offers?.price || null;
  const rating = parseRating(ratingText) || jsonLd?.aggregateRating?.ratingValue || null;
  const ratingCount = parseInt(ratingCountText?.replace(/[^\d]/g, '') || '0') || 
                     jsonLd?.aggregateRating?.reviewCount || 
                     jsonLd?.aggregateRating?.ratingCount || null;
  
  // Extract features
  const features = await extractProductFeatures(page);
  
  // Extract ASIN
  const asin = extractASIN(url) || await pickAttr(page, PDP_SELECTORS.asin, ['data-asin']);
  
  return {
    productName,
    brand: brand ? cleanText(brand) : extractBrand(productName),
    price,
    rating,
    ratingCount,
    features,
    productImage: image,
    asin
  };
}

/**
 * Build search queries from seed product
 */
function buildSearchQueries(seed) {
  const queries = [];
  
  if (seed.brand && seed.productName) {
    // Brand + top keywords query
    const brandTokens = tokenize(seed.brand).slice(0, 2);
    const titleTokens = tokenize(seed.productName).slice(0, 4);
    const combined = [...brandTokens, ...titleTokens].join(' ');
    if (combined.trim()) {
      queries.push(combined);
    }
  }
  
  // Top keywords only query
  const titleTokens = tokenize(seed.productName).slice(0, 6);
  if (titleTokens.length > 0) {
    queries.push(titleTokens.join(' '));
  }
  
  return queries.slice(0, 2); // Limit to 2 queries
}

/**
 * Collect candidates from search results
 */
async function collectFromSearch(page, query, limit, baseUrl) {
  const searchUrl = `${baseUrl}/s?k=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await sleep(1000, 2000);
  
  const candidates = [];
  const cards = page.locator(SEARCH_SELECTORS.cards.join(', '));
  const cardCount = await cards.count();
  
  for (let i = 0; i < Math.min(cardCount, limit); i++) {
    const card = cards.nth(i);
    
    // Skip sponsored results
    const isSponsored = await card.locator(SEARCH_SELECTORS.sponsored.join(', ')).count() > 0;
    if (isSponsored) continue;
    
    const asin = await card.getAttribute('data-asin');
    if (!asin) continue;
    
    const title = await pickTextFrom(card, SEARCH_SELECTORS.title);
    const url = await pickAttrFrom(card, SEARCH_SELECTORS.url, ['href']);
    const image = await pickAttrFrom(card, SEARCH_SELECTORS.image, ['src', 'data-src']);
    const priceText = await pickTextFrom(card, SEARCH_SELECTORS.price);
    const ratingText = await pickTextFrom(card, SEARCH_SELECTORS.rating);
    const ratingCountText = await pickTextFrom(card, SEARCH_SELECTORS.ratingCount);
    
    if (!title || !url) continue;
    
    const fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
    
    candidates.push({
      productName: cleanText(title),
      productUrl: fullUrl,
      productImage: image,
      price: toNumberPrice(priceText),
      rating: parseRating(ratingText),
      ratingCount: parseInt(ratingCountText?.replace(/[^\d]/g, '') || '0') || null,
      asin
    });
  }
  
  return candidates;
}

/**
 * Enrich candidates by visiting their PDPs
 */
async function enrichCandidates(page, candidates, baseUrl) {
  const enriched = [];
  
  for (const candidate of candidates) {
    try {
      await page.goto(candidate.productUrl, { waitUntil: 'domcontentloaded' });
      await sleep(500, 1000);
      
      // Try to get missing data
      const enrichedData = {};
      
      if (!candidate.price) {
        const priceText = await pickText(page, PDP_SELECTORS.price) || 
                         await pickText(page, MOBILE_SELECTORS.price);
        enrichedData.price = toNumberPrice(priceText);
      }
      
      if (!candidate.productImage) {
        const image = await pickAttr(page, PDP_SELECTORS.image, ['src', 'data-src']) ||
                     await pickAttr(page, MOBILE_SELECTORS.image, ['src', 'data-src']);
        enrichedData.productImage = image;
      }
      
      if (!candidate.rating || !candidate.ratingCount) {
        const ratingText = await pickText(page, PDP_SELECTORS.rating);
        const ratingCountText = await pickText(page, PDP_SELECTORS.ratingCount);
        
        if (!candidate.rating) {
          enrichedData.rating = parseRating(ratingText);
        }
        if (!candidate.ratingCount) {
          enrichedData.ratingCount = parseInt(ratingCountText?.replace(/[^\d]/g, '') || '0') || null;
        }
      }
      
      // Try JSON-LD fallback
      if (!enrichedData.price || !enrichedData.rating || !enrichedData.ratingCount) {
        const jsonLd = await extractJSONLD(page);
        if (jsonLd) {
          if (!enrichedData.price && jsonLd.offers?.price) {
            enrichedData.price = jsonLd.offers.price;
          }
          if (!enrichedData.rating && jsonLd.aggregateRating?.ratingValue) {
            enrichedData.rating = jsonLd.aggregateRating.ratingValue;
          }
          if (!enrichedData.ratingCount && jsonLd.aggregateRating?.reviewCount) {
            enrichedData.ratingCount = jsonLd.aggregateRating.reviewCount;
          }
        }
      }
      
      enriched.push({
        ...candidate,
        ...enrichedData
      });
      
    } catch (error) {
      console.warn(`Failed to enrich candidate ${candidate.productUrl}:`, error.message);
      enriched.push(candidate); // Keep original if enrichment fails
    }
  }
  
  return enriched;
}

/**
 * Extract product features from PDP
 */
async function extractProductFeatures(page) {
  const features = [];
  
  // Try bullet points
  const bullets = page.locator(FEATURE_SELECTORS.bullets.join(', '));
  const bulletCount = await bullets.count();
  
  for (let i = 0; i < Math.min(bulletCount, 10); i++) {
    const text = await bullets.nth(i).textContent();
    if (text) {
      features.push(...extractFeatures(cleanText(text)));
    }
  }
  
  // Try description
  const descriptions = page.locator(FEATURE_SELECTORS.description.join(', '));
  const descCount = await descriptions.count();
  
  for (let i = 0; i < Math.min(descCount, 3); i++) {
    const text = await descriptions.nth(i).textContent();
    if (text) {
      features.push(...extractFeatures(cleanText(text)));
    }
  }
  
  return [...new Set(features)]; // Remove duplicates
}

/**
 * Extract JSON-LD structured data
 */
async function extractJSONLD(page) {
  try {
    const scripts = await page.$$eval(JSON_LD_SELECTORS.script, els => 
      els.map(el => el.textContent || '')
    );
    
    for (const script of scripts) {
      try {
        const json = JSON.parse(script.trim());
        const arr = Array.isArray(json) ? json : [json];
        
        for (const obj of arr) {
          if (obj['@type'] === 'Product') {
            return obj;
          }
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
  } catch (e) {
    // Ignore errors
  }
  
  return null;
}

/**
 * Deduplicate candidates by URL and ASIN
 */
function deduplicateCandidates(candidates) {
  const seen = new Set();
  const deduped = [];
  
  for (const candidate of candidates) {
    const key = candidate.productUrl || candidate.url;
    const asin = candidate.asin;
    
    if (!key) continue;
    
    if (seen.has(key)) continue;
    
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

// Helper functions
async function pickText(page, selectors) {
  for (const selector of selectors) {
    const el = page.locator(selector).first();
    if (await el.count()) {
      const text = await el.textContent();
      if (text) return cleanText(text);
    }
  }
  return null;
}

async function pickTextFrom(locator, selectors) {
  for (const selector of selectors) {
    const el = locator.locator(selector).first();
    if (await el.count()) {
      const text = await el.textContent();
      if (text) return cleanText(text);
    }
  }
  return null;
}

async function pickAttr(page, selectors, attrs) {
  for (const selector of selectors) {
    const el = page.locator(selector).first();
    if (await el.count()) {
      for (const attr of attrs) {
        const value = await el.getAttribute(attr);
        if (value) return value;
      }
    }
  }
  return null;
}

async function pickAttrFrom(locator, selectors, attrs) {
  for (const selector of selectors) {
    const el = locator.locator(selector).first();
    if (await el.count()) {
      for (const attr of attrs) {
        const value = await el.getAttribute(attr);
        if (value) return value;
      }
    }
  }
  return null;
}
