import { pickUA, pickAcceptLanguage, sleep } from '../../utils/recs/antibot.js';
import { cleanText, tokenize, parseRating, parseInlinePrice, extractBrand, extractFeatures } from '../../utils/recs/text-utils.js';
import { rankCandidates } from '../../utils/recs/ranker.js';
import { createPriceGroups } from '../../utils/recs/price-buckets.js';
import { PDP_SELECTORS, SEARCH_SELECTORS, JSON_LD_SELECTORS } from './selectors.js';

export async function getAmazonRecommendations(browser, { url, limit = 15 }) {
  const context = await browser.newContext({
    userAgent: pickUA(),
    extraHTTPHeaders: {
      'Accept-Language': pickAcceptLanguage(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    },
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });
  const page = await context.newPage();
  
  try {
    // Extract TLD from URL
    const tld = extractTLD(url);
    const baseUrl = `https://www.amazon.${tld}`;
    
    // 1. Read seed product
    const seed = await readSeed(page, url);
    if (!seed.productName) {
      throw new Error('Could not extract product information from URL');
    }
    
    // 2. Build search queries
    const queries = buildSearchQueries(seed);
    
    // 3. Collect candidates from search
    const allCandidates = [];
    for (const query of queries) {
      const candidates = await collectFromSearch(page, query, baseUrl, 36);
      allCandidates.push(...candidates);
      await sleep(500, 1000); // Rate limiting
    }
    
    // 4. Merge, dedupe, and exclude seed
    const merged = mergeAndDedupe(allCandidates, seed.asin);
    
    // 5. Score and rank
    const ranked = rankCandidates(merged, seed);
    
    // 6. Enrichment pass for top candidates
    const topCandidates = ranked.slice(0, 15);
    const enriched = await enrichCandidates(page, topCandidates, baseUrl);
    
    // 7. Create price groups
    const priceGroups = createPriceGroups(enriched);
    
    // 8. Format response
    return formatResponse(seed, enriched.slice(0, limit), priceGroups, url);
    
  } finally {
    await context.close();
  }
}

async function readSeed(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(300, 600);
  
  // Extract basic info using DOM selectors
  const title = await pickText(page, PDP_SELECTORS.title);
  const brand = await pickText(page, PDP_SELECTORS.brand) || extractBrand(title);
  const priceText = await pickText(page, PDP_SELECTORS.price);
  const ratingText = await pickText(page, PDP_SELECTORS.rating);
  const ratingCountText = await pickText(page, PDP_SELECTORS.ratingCount);
  const image = await pickAttr(page, PDP_SELECTORS.image, ['src', 'data-src', 'data-old-hires']);
  const features = await extractFeaturesFromPage(page);
  
  let price = parseInlinePrice(priceText);
  let rating = parseRating(ratingText);
  let ratingCount = parseInt(ratingCountText?.replace(/[^\d]/g, '') || '0');
  
  // Try JSON-LD fallback for missing data
  const jsonLd = await extractJSONLD(page);
  if (jsonLd) {
    if (!price && jsonLd.offers?.price) {
      price = parseFloat(jsonLd.offers.price);
    }
    if (!rating && jsonLd.aggregateRating?.ratingValue) {
      rating = parseFloat(jsonLd.aggregateRating.ratingValue);
    }
    if (!ratingCount && jsonLd.aggregateRating?.reviewCount) {
      ratingCount = parseInt(jsonLd.aggregateRating.reviewCount);
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

function buildSearchQueries(seed) {
  const tokens = tokenize(seed.productName, 6);
  const brandQuery = seed.brand ? `${seed.brand} ${tokens.slice(0, 4).join(' ')}` : null;
  const titleQuery = tokens.join(' ');
  
  return [brandQuery, titleQuery].filter(Boolean);
}

async function collectFromSearch(page, query, baseUrl, limit) {
  const searchUrl = `${baseUrl}/s?k=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await sleep(500, 800);
  
  const candidates = [];
  const cards = page.locator(SEARCH_SELECTORS.resultCards.first());
  const count = await cards.count();
  
  for (let i = 0; i < Math.min(count, limit); i++) {
    const card = cards.nth(i);
    
    // Skip sponsored results
    const isSponsored = await card.locator(SEARCH_SELECTORS.sponsored.first()).count() > 0;
    if (isSponsored) continue;
    
    const asin = await card.getAttribute('data-asin');
    if (!asin) continue;
    
    const title = await pickTextFrom(card, SEARCH_SELECTORS.title);
    const link = await pickAttrFrom(card, SEARCH_SELECTORS.link, ['href']);
    const image = await pickAttrFrom(card, SEARCH_SELECTORS.image, ['src', 'data-src']);
    const priceText = await pickTextFrom(card, SEARCH_SELECTORS.price);
    const ratingText = await pickTextFrom(card, SEARCH_SELECTORS.rating);
    const ratingCountText = await pickTextFrom(card, SEARCH_SELECTORS.ratingCount);
    
    if (!title || !link) continue;
    
    candidates.push({
      productName: cleanText(title),
      productUrl: new URL(link, baseUrl).href,
      productImage: image,
      price: parseInlinePrice(priceText),
      rating: parseRating(ratingText),
      ratingCount: parseInt(ratingCountText?.replace(/[^\d]/g, '') || '0'),
      asin
    });
  }
  
  return candidates;
}

async function enrichCandidates(page, candidates, baseUrl) {
  const enriched = [];
  
  for (const candidate of candidates) {
    try {
      await page.goto(candidate.productUrl, { waitUntil: 'domcontentloaded' });
      await sleep(200, 400);
      
      // Try to get missing data
      if (!candidate.price) {
        const priceText = await pickText(page, PDP_SELECTORS.price);
        candidate.price = parseInlinePrice(priceText);
      }
      
      if (!candidate.productImage) {
        candidate.productImage = await pickAttr(page, PDP_SELECTORS.image, ['src', 'data-src']);
      }
      
      if (!candidate.rating) {
        const ratingText = await pickText(page, PDP_SELECTORS.rating);
        candidate.rating = parseRating(ratingText);
      }
      
      if (!candidate.ratingCount) {
        const ratingCountText = await pickText(page, PDP_SELECTORS.ratingCount);
        candidate.ratingCount = parseInt(ratingCountText?.replace(/[^\d]/g, '') || '0');
      }
      
      enriched.push(candidate);
    } catch (error) {
      // If enrichment fails, keep original candidate
      enriched.push(candidate);
    }
  }
  
  return enriched;
}

function mergeAndDedupe(candidates, excludeAsin) {
  const seen = new Set();
  const merged = [];
  
  for (const candidate of candidates) {
    const key = candidate.asin || candidate.productUrl;
    if (key && !seen.has(key) && key !== excludeAsin) {
      seen.add(key);
      merged.push(candidate);
    }
  }
  
  return merged;
}

function formatResponse(seed, candidates, priceGroups, inputUrl) {
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
      topRated: candidates.filter(c => c.rating >= 4.0).slice(0, 5),
      featureMatch: candidates.slice(0, 5), // Top scored items
      budget: priceGroups.budget.slice(0, 5),
      midRange: priceGroups.midRange.slice(0, 5),
      premium: priceGroups.premium.slice(0, 5)
    },
    flat: candidates.map(c => ({
      productName: c.productName,
      productUrl: c.productUrl,
      productImage: c.productImage,
      price: c.price,
      rating: c.rating,
      ratingCount: c.ratingCount,
      asin: c.asin
    }))
  };
}

// Helper functions
async function pickText(page, selectors) {
  for (const selector of selectors) {
    const element = page.locator(selector).first();
    if (await element.count() > 0) {
      const text = await element.textContent();
      if (text) return cleanText(text);
    }
  }
  return null;
}

async function pickTextFrom(locator, selectors) {
  for (const selector of selectors) {
    const element = locator.locator(selector).first();
    if (await element.count() > 0) {
      const text = await element.textContent();
      if (text) return cleanText(text);
    }
  }
  return null;
}

async function pickAttr(page, selectors, attributes) {
  for (const selector of selectors) {
    const element = page.locator(selector).first();
    if (await element.count() > 0) {
      for (const attr of attributes) {
        const value = await element.getAttribute(attr);
        if (value) return value;
      }
    }
  }
  return null;
}

async function pickAttrFrom(locator, selectors, attributes) {
  for (const selector of selectors) {
    const element = locator.locator(selector).first();
    if (await element.count() > 0) {
      for (const attr of attributes) {
        const value = await element.getAttribute(attr);
        if (value) return value;
      }
    }
  }
  return null;
}

async function extractFeaturesFromPage(page) {
  const features = [];
  const elements = page.locator(PDP_SELECTORS.features.first());
  const count = await elements.count();
  
  for (let i = 0; i < Math.min(count, 10); i++) {
    const text = await elements.nth(i).textContent();
    if (text) {
      features.push(cleanText(text));
    }
  }
  
  return features.slice(0, 8);
}

async function extractJSONLD(page) {
  try {
    const scripts = await page.$$eval(JSON_LD_SELECTORS.script, els => 
      els.map(el => el.textContent).filter(Boolean)
    );
    
    for (const script of scripts) {
      try {
        const data = JSON.parse(script);
        const products = Array.isArray(data) ? data : [data];
        for (const product of products) {
          if (product['@type'] === 'Product') {
            return product;
          }
        }
      } catch (e) {
        // Continue to next script
      }
    }
  } catch (e) {
    // Return null if extraction fails
  }
  
  return null;
}

function extractASIN(url) {
  const match = url.match(/(?:dp|gp\/product|aw\/d)\/([A-Z0-9]{10})/i) || 
                url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return match ? match[1] : null;
}

function extractTLD(url) {
  const match = url.match(/amazon\.([a-z]{2,3}(?:\.[a-z]{2})?)/i);
  return match ? match[1] : 'com';
}