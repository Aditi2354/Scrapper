// Amazon recommendations provider
import { PDP_SELECTORS, SEARCH_SELECTORS, MOBILE_SELECTORS, ATTRIBUTE_PARSERS } from './selectors.js';
import { cleanText, tokenize, parseRating, toNumberPrice } from '../../utils/recs/text-utils.js';
import { rankCandidates } from '../../utils/recs/ranker.js';
import { createPriceBuckets, createTopRatedBucket, createFeatureMatchBucket } from '../../utils/recs/price-buckets.js';
import { sleep } from '../../utils/recs/antibot.js';

// Extract ASIN from URL
function extractASIN(url) {
  const urlStr = String(url);
  const patterns = [
    /(?:dp|gp\/product|aw\/d)\/([A-Z0-9]{10})/i,
    /\/([A-Z0-9]{10})(?:[/?]|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = urlStr.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Get Amazon base URL from input URL
function getAmazonBaseUrl(inputUrl) {
  const hostname = new URL(inputUrl).hostname;
  const tldMatch = hostname.match(/amazon\.([a-z\.]+)$/i);
  const tld = tldMatch ? tldMatch[1] : 'com';
  return `https://www.amazon.${tld}`;
}

// Generic selector picker
async function pickFromSelectors(pageOrLocator, selectors, getAttribute = null, parser = null) {
  for (const selector of selectors) {
    try {
      const element = pageOrLocator.locator(selector).first();
      if (await element.count() === 0) continue;
      
      let value;
      if (getAttribute) {
        value = await element.getAttribute(getAttribute);
      } else {
        value = await element.textContent();
      }
      
      if (value) {
        value = cleanText(value);
        if (parser) value = parser(value);
        if (value) return value;
      }
    } catch (error) {
      // Continue to next selector
      continue;
    }
  }
  return null;
}

// Extract product data from JSON-LD
async function extractJSONLD(page) {
  try {
    const scripts = await page.$$eval(PDP_SELECTORS.jsonLd, 
      elements => elements.map(el => el.textContent || '')
    );
    
    for (const scriptContent of scripts) {
      try {
        const data = JSON.parse(scriptContent.trim());
        const products = Array.isArray(data) ? data : [data];
        
        for (const item of products) {
          if (item['@type'] === 'Product') {
            return {
              name: item.name,
              brand: item.brand?.name,
              offers: item.offers,
              aggregateRating: item.aggregateRating,
              image: item.image?.[0] || item.image
            };
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore JSON-LD errors
  }
  return null;
}

// Read seed product data from PDP
export async function readSeed(page, url) {
  console.log(`[Amazon] Reading seed from: ${url}`);
  
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(500, 800);
  
  // Wait for page to settle
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    // Continue even if networkidle times out
  }
  
  // Extract basic product data
  const title = await pickFromSelectors(page, PDP_SELECTORS.title);
  const brand = await pickFromSelectors(page, PDP_SELECTORS.brand);
  let price = await pickFromSelectors(page, PDP_SELECTORS.price, null, toNumberPrice);
  let rating = await pickFromSelectors(page, PDP_SELECTORS.rating, null, parseRating);
  let ratingCount = await pickFromSelectors(page, PDP_SELECTORS.ratingCount, null, (text) => {
    const match = text.replace(/[,\.]/g, '').match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  });
  
  // Try to get image
  let image = null;
  for (const selector of PDP_SELECTORS.image) {
    image = await pickFromSelectors(page, [selector], 'src');
    if (!image) image = await pickFromSelectors(page, [selector], 'data-old-hires');
    if (!image) image = await pickFromSelectors(page, [selector], 'data-src');
    if (image) break;
  }
  
  // Handle dynamic image attribute
  if (!image) {
    const dynamicImageData = await pickFromSelectors(page, ['#landingImage'], 'data-a-dynamic-image');
    if (dynamicImageData) {
      image = ATTRIBUTE_PARSERS.dynamicImage(dynamicImageData);
    }
  }
  
  // Extract features
  const features = [];
  try {
    const featureElements = await page.$$(PDP_SELECTORS.features[0]);
    for (const el of featureElements.slice(0, 5)) {
      const text = cleanText(await el.textContent());
      if (text && text.length > 10) {
        features.push(text);
      }
    }
  } catch {
    // Ignore feature extraction errors
  }
  
  // JSON-LD fallback
  const jsonLD = await extractJSONLD(page);
  if (jsonLD) {
    if (!price && jsonLD.offers) {
      const offers = Array.isArray(jsonLD.offers) ? jsonLD.offers[0] : jsonLD.offers;
      price = toNumberPrice(offers.price || offers.priceSpecification?.price);
    }
    if (!rating && jsonLD.aggregateRating) {
      rating = parseRating(jsonLD.aggregateRating.ratingValue);
    }
    if (!ratingCount && jsonLD.aggregateRating) {
      const count = jsonLD.aggregateRating.reviewCount || jsonLD.aggregateRating.ratingCount;
      ratingCount = count ? parseInt(count, 10) : null;
    }
    if (!image && jsonLD.image) {
      image = Array.isArray(jsonLD.image) ? jsonLD.image[0] : jsonLD.image;
    }
  }
  
  // Mobile fallback for price
  if (!price) {
    const asin = extractASIN(url);
    if (asin) {
      const baseUrl = getAmazonBaseUrl(url);
      const mobileUrl = `${baseUrl}/gp/aw/d/${asin}`;
      
      try {
        console.log(`[Amazon] Trying mobile page for price: ${mobileUrl}`);
        await page.goto(mobileUrl, { waitUntil: 'domcontentloaded' });
        await sleep(300, 600);
        
        price = await pickFromSelectors(page, MOBILE_SELECTORS.price, null, toNumberPrice);
        
        if (!image) {
          image = await pickFromSelectors(page, MOBILE_SELECTORS.image, 'src');
        }
        
        // Go back to original page
        await page.goto(url, { waitUntil: 'domcontentloaded' });
      } catch (error) {
        console.warn(`[Amazon] Mobile fallback failed: ${error.message}`);
      }
    }
  }
  
  const asin = extractASIN(url);
  
  return {
    productName: title,
    brand,
    price,
    rating,
    ratingCount,
    features,
    productImage: image,
    asin,
    productUrl: page.url().split('?')[0] // Clean URL
  };
}

// Collect products from search results
export async function collectFromSearch(page, query, limit = 36) {
  const baseUrl = getAmazonBaseUrl(page.url());
  const searchUrl = `${baseUrl}/s?k=${encodeURIComponent(query)}`;
  
  console.log(`[Amazon] Searching: ${searchUrl}`);
  const results = [];
  const maxPages = Math.ceil(limit / 16); // Amazon shows ~16 results per page
  
  for (let pageNum = 1; pageNum <= maxPages && results.length < limit; pageNum++) {
    const url = pageNum === 1 ? searchUrl : `${searchUrl}&page=${pageNum}`;
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await sleep(400, 700);
      
      // Auto-scroll to load lazy content
      await page.evaluate(() => {
        return new Promise(resolve => {
          let scrollCount = 0;
          const scrollInterval = setInterval(() => {
            window.scrollBy(0, 400);
            scrollCount++;
            if (scrollCount >= 5 || window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 100) {
              clearInterval(scrollInterval);
              resolve();
            }
          }, 100);
        });
      });
      
      // Find result containers
      const containers = await page.$$(SEARCH_SELECTORS.resultContainer[0]);
      console.log(`[Amazon] Found ${containers.length} product containers on page ${pageNum}`);
      
      for (const container of containers) {
        if (results.length >= limit) break;
        
        try {
          // Check if sponsored
          const isSponsored = await container.$(SEARCH_SELECTORS.sponsored[0]) !== null;
          if (isSponsored) continue;
          
          // Get ASIN
          const asin = await container.getAttribute(SEARCH_SELECTORS.asinAttribute);
          if (!asin) continue;
          
          // Extract data
          const title = await pickFromSelectors(container, SEARCH_SELECTORS.title);
          const link = await pickFromSelectors(container, SEARCH_SELECTORS.link, 'href');
          
          if (!title || !link) continue;
          
          const image = await pickFromSelectors(container, SEARCH_SELECTORS.image, 'src');
          const price = await pickFromSelectors(container, SEARCH_SELECTORS.price, null, toNumberPrice);
          const rating = await pickFromSelectors(container, SEARCH_SELECTORS.rating, null, parseRating);
          const ratingCount = await pickFromSelectors(container, SEARCH_SELECTORS.ratingCount, null, (text) => {
            const match = text.replace(/[,\.]/g, '').match(/\d+/);
            return match ? parseInt(match[0], 10) : null;
          });
          
          const fullUrl = new URL(link, baseUrl).href;
          
          results.push({
            productName: title,
            productUrl: fullUrl,
            productImage: image,
            price,
            rating,
            ratingCount,
            asin
          });
          
        } catch (error) {
          // Continue with next container
          continue;
        }
      }
      
    } catch (error) {
      console.warn(`[Amazon] Search page ${pageNum} failed: ${error.message}`);
      break;
    }
  }
  
  console.log(`[Amazon] Collected ${results.length} products from search`);
  return results;
}

// Enrich products by visiting their PDPs
export async function enrichProducts(context, products, limit = 15) {
  console.log(`[Amazon] Enriching top ${Math.min(products.length, limit)} products`);
  
  const enriched = [];
  for (let i = 0; i < Math.min(products.length, limit); i++) {
    const product = products[i];
    
    // Skip if already has good data
    if (product.price && product.rating && product.productImage) {
      enriched.push(product);
      continue;
    }
    
    try {
      const page = await context.newPage();
      await page.goto(product.productUrl, { waitUntil: 'domcontentloaded' });
      await sleep(300, 600);
      
      // Try to fill missing data
      const updates = {};
      
      if (!product.price) {
        updates.price = await pickFromSelectors(page, PDP_SELECTORS.price, null, toNumberPrice);
      }
      
      if (!product.rating) {
        updates.rating = await pickFromSelectors(page, PDP_SELECTORS.rating, null, parseRating);
      }
      
      if (!product.ratingCount) {
        updates.ratingCount = await pickFromSelectors(page, PDP_SELECTORS.ratingCount, null, (text) => {
          const match = text.replace(/[,\.]/g, '').match(/\d+/);
          return match ? parseInt(match[0], 10) : null;
        });
      }
      
      if (!product.productImage) {
        updates.productImage = await pickFromSelectors(page, PDP_SELECTORS.image, 'src');
        if (!updates.productImage) {
          const dynamicImageData = await pickFromSelectors(page, ['#landingImage'], 'data-a-dynamic-image');
          if (dynamicImageData) {
            updates.productImage = ATTRIBUTE_PARSERS.dynamicImage(dynamicImageData);
          }
        }
      }
      
      // JSON-LD fallback for missing data
      if (!updates.price || !updates.rating) {
        const jsonLD = await extractJSONLD(page);
        if (jsonLD) {
          if (!updates.price && jsonLD.offers) {
            const offers = Array.isArray(jsonLD.offers) ? jsonLD.offers[0] : jsonLD.offers;
            updates.price = toNumberPrice(offers.price || offers.priceSpecification?.price);
          }
          if (!updates.rating && jsonLD.aggregateRating) {
            updates.rating = parseRating(jsonLD.aggregateRating.ratingValue);
          }
        }
      }
      
      enriched.push({ ...product, ...updates });
      await page.close();
      
    } catch (error) {
      console.warn(`[Amazon] Failed to enrich ${product.productUrl}: ${error.message}`);
      enriched.push(product);
    }
  }
  
  console.log(`[Amazon] Enrichment complete`);
  return enriched;
}

// Main provider function
export async function getRecommendations(context, url, options = {}) {
  const { limit = 15 } = options;
  
  try {
    const page = await context.newPage();
    
    // 1. Read seed product
    const seed = await readSeed(page, url);
    console.log(`[Amazon] Seed product: ${seed.productName}`);
    
    // 2. Build search queries
    const titleTokens = tokenize(seed.productName || '', 6);
    const brandQuery = seed.brand ? 
      `${seed.brand} ${titleTokens.slice(0, 4).join(' ')}` : 
      titleTokens.slice(0, 6).join(' ');
    const genericQuery = titleTokens.slice(0, 6).join(' ');
    
    console.log(`[Amazon] Brand query: "${brandQuery}"`);
    console.log(`[Amazon] Generic query: "${genericQuery}"`);
    
    // 3. Collect from both searches
    const [brandResults, genericResults] = await Promise.all([
      collectFromSearch(page, brandQuery, 36),
      collectFromSearch(page, genericQuery, 36)
    ]);
    
    await page.close();
    
    // 4. Merge and dedupe
    const allResults = [...brandResults, ...genericResults];
    const ranked = rankCandidates(allResults, seed, { limit: limit + 10, seedAsin: seed.asin });
    
    console.log(`[Amazon] Ranked ${ranked.length} candidates`);
    
    // 5. Enrich top candidates
    const enriched = await enrichProducts(context, ranked, limit);
    
    // 6. Create groups
    const priceBuckets = createPriceBuckets(enriched, seed.price, 5);
    const topRated = createTopRatedBucket(enriched, 5);
    const featureMatch = createFeatureMatchBucket(enriched, seed.features, 5);
    
    const groups = {
      topRated,
      featureMatch,
      budget: priceBuckets.budget,
      midRange: priceBuckets.midRange,
      premium: priceBuckets.premium
    };
    
    const flat = enriched.slice(0, limit);
    
    return {
      site: 'amazon',
      inputUrl: url,
      seed,
      groups,
      flat
    };
    
  } catch (error) {
    console.error(`[Amazon] Recommendation error: ${error.message}`);
    return {
      error: 'Failed to get recommendations',
      detail: error.message
    };
  }
}