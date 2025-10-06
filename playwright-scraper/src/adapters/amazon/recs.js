import { chromium } from 'playwright';
import { newContext, sleep } from '../../utils/recs/antibot.js';
import { cleanText, tokenize, parseRating, parseInlinePrice, toNumberPrice } from '../../utils/recs/text-utils.js';
import { rankProducts } from '../../utils/recs/ranker.js';
import { calculatePriceBuckets, createGroupedResponse } from '../../utils/recs/price-buckets.js';
import { PDP_SELECTORS, SRP_SELECTORS, extractASIN, extractTLD } from './selectors.js';

/**
 * Main Amazon recommendations provider
 */
export class AmazonRecommendations {
  constructor() {
    this.browser = null;
    this.context = null;
  }

  /**
   * Initialize browser and context
   */
  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      });
      this.context = await newContext(this.browser);
    }
  }

  /**
   * Close browser and cleanup
   */
  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Get recommendations for Amazon product
   * @param {string} url - Amazon product URL
   * @param {number} limit - Maximum results to return
   * @returns {Promise<Object>} Recommendations object
   */
  async getRecommendations(url, limit = 50) {
    await this.init();

    try {
      // Step 1: Extract seed product data
      console.log('Extracting seed product from:', url);
      const seed = await this.readSeed(url);
      if (!seed) {
        throw new Error('Failed to extract seed product data');
      }

      // Step 2: Build search queries
      const queries = this.buildQueries(seed);
      console.log('Search queries:', queries);

      // Step 3: Collect candidates from search results
      const candidates = [];
      for (const query of queries) {
        const queryResults = await this.collectFromSearch(query, Math.min(36, limit));
        candidates.push(...queryResults);

        // Small delay between queries
        await sleep(300, 600);
      }

      // Step 4: Merge and dedupe
      const uniqueCandidates = this.dedupeCandidates(candidates);
      console.log(`Found ${uniqueCandidates.length} unique candidates`);

      // Step 5: Score and rank
      const ranked = rankProducts(seed, uniqueCandidates, {
        limit: Math.min(100, limit * 2), // Get more for enrichment
        excludeAsins: [seed.asin]
      });

      // Step 6: Enrichment pass for top candidates
      const enriched = await this.enrichCandidates(ranked.slice(0, 15));

      // Step 7: Create price buckets and groups
      const buckets = calculatePriceBuckets(enriched);
      const groups = createGroupedResponse(enriched, buckets, limit);

      // Step 8: Build final response
      return {
        site: 'amazon',
        inputUrl: url,
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
          topRated: groups.topRated.map(this.formatProduct),
          featureMatch: groups.featureMatch.map(this.formatProduct),
          budget: groups.budget.map(this.formatProduct),
          midRange: groups.midRange.map(this.formatProduct),
          premium: groups.premium.map(this.formatProduct)
        },
        flat: groups.flat ? groups.flat.slice(0, limit).map(this.formatProduct) : []
      };

    } catch (error) {
      console.error('Amazon recommendations error:', error);
      throw error;
    }
  }

  /**
   * Extract seed product data from PDP
   */
  async readSeed(url) {
    const page = await this.context.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Extract basic data
      const title = await this.pickText(page, PDP_SELECTORS.title);
      const priceText = await this.pickPrice(page, PDP_SELECTORS.price);
      const ratingText = await this.pickText(page, PDP_SELECTORS.rating);
      const ratingCountText = await this.pickText(page, PDP_SELECTORS.ratingCount);
      const image = await this.pickImage(page, PDP_SELECTORS.image, PDP_SELECTORS.imageAttrs);

      // Extract features
      const features = await this.extractFeatures(page);

      // Extract brand (try multiple methods)
      let brand = await this.extractBrand(page);

      // Fallback to JSON-LD if rating/ratingCount missing
      if (!ratingText || !ratingCountText) {
        const ldData = await this.extractJSONLD(page);
        if (ldData?.aggregateRating) {
          const rating = parseRating(ldData.aggregateRating.ratingValue);
          const ratingCount = parseInt(ldData.aggregateRating.reviewCount || ldData.aggregateRating.ratingCount);

          if (rating && !ratingText) {
            // Convert rating to text format
            ratingText = `${rating} out of 5 stars`;
          }
          if (ratingCount && !ratingCountText) {
            ratingCountText = `${ratingCount} ratings`;
          }
        }
      }

      const asin = extractASIN(url);

      return {
        productName: this.deriveProductName(title),
        brand: brand || this.extractBrandFromTitle(title),
        price: toNumberPrice(priceText),
        rating: parseRating(ratingText),
        ratingCount: parseInt((ratingCountText || '').replace(/[^0-9]/g, '')),
        features: features,
        productImage: image,
        asin: asin
      };

    } finally {
      await page.close();
    }
  }

  /**
   * Build search queries from seed product
   */
  buildQueries(seed) {
    const tokens = tokenize(seed.productName || '');

    // Query 1: Brand + top tokens (if brand available)
    const queries = [];
    if (seed.brand && tokens.length > 0) {
      queries.push(`${seed.brand} ${tokens.slice(0, 4).join(' ')}`);
    }

    // Query 2: Top tokens only
    if (tokens.length > 0) {
      queries.push(tokens.slice(0, 6).join(' '));
    }

    return queries.length > 0 ? queries : [''];
  }

  /**
   * Collect products from search results
   */
  async collectFromSearch(query, limit = 36) {
    if (!query) return [];

    const tld = 'com'; // Default, could be extracted from context
    const searchUrl = `https://www.amazon.${tld}/s?k=${encodeURIComponent(query)}`;

    const page = await this.context.newPage();

    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);

      const cards = page.locator(SRP_SELECTORS.productCards);
      const count = Math.min(await cards.count(), limit);

      const results = [];

      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);

        const title = await this.pickTextFrom(card, SRP_SELECTORS.cardTitle);
        const url = await this.pickAttrFrom(card, SRP_SELECTORS.cardUrl, 'href');
        const image = await this.pickImageFrom(card, SRP_SELECTORS.cardImage, ['src', 'data-src']);
        const priceText = await this.pickPriceFrom(card, SRP_SELECTORS.cardPrice);
        const ratingText = await this.pickTextFrom(card, SRP_SELECTORS.cardRating);
        const ratingCountText = await this.pickTextFrom(card, SRP_SELECTORS.cardRatingCount);
        const asin = await card.getAttribute(SRP_SELECTORS.cardAsin);

        if (title && url) {
          results.push({
            productName: cleanText(title),
            productUrl: new URL(url, `https://www.amazon.${tld}`).href,
            productImage: image,
            price: toNumberPrice(priceText),
            rating: parseRating(ratingText),
            ratingCount: parseInt((ratingCountText || '').replace(/[^0-9]/g, '')),
            asin: asin
          });
        }

        if (results.length >= limit) break;
      }

      return results;

    } finally {
      await page.close();
    }
  }

  /**
   * Enrich top candidates by visiting their PDPs
   */
  async enrichCandidates(candidates) {
    if (candidates.length === 0) return candidates;

    const enriched = [];
    const concurrency = 3;

    // Process in batches to avoid overwhelming the site
    for (let i = 0; i < candidates.length; i += concurrency) {
      const batch = candidates.slice(i, i + concurrency);

      const batchPromises = batch.map(async (candidate) => {
        const enrichedCandidate = { ...candidate };

        // Try to enrich missing data
        if (!candidate.price || !candidate.rating || !candidate.ratingCount) {
          try {
            const enrichedData = await this.quickEnrichFromPDP(candidate.productUrl);
            Object.assign(enrichedCandidate, enrichedData);
          } catch (error) {
            console.warn(`Failed to enrich ${candidate.productUrl}:`, error.message);
          }
        }

        return enrichedCandidate;
      });

      const batchResults = await Promise.all(batchPromises);
      enriched.push(...batchResults);

      // Small delay between batches
      if (i + concurrency < candidates.length) {
        await sleep(500, 1000);
      }
    }

    return enriched;
  }

  /**
   * Quick enrichment from PDP (for missing data only)
   */
  async quickEnrichFromPDP(url) {
    const page = await this.context.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);

      const priceText = await this.pickPrice(page, PDP_SELECTORS.price);
      const ratingText = await this.pickText(page, PDP_SELECTORS.rating);
      const ratingCountText = await this.pickText(page, PDP_SELECTORS.ratingCount);
      const image = await this.pickImage(page, PDP_SELECTORS.image, PDP_SELECTORS.imageAttrs);

      return {
        price: toNumberPrice(priceText),
        rating: parseRating(ratingText),
        ratingCount: parseInt((ratingCountText || '').replace(/[^0-9]/g, '')),
        productImage: image
      };

    } finally {
      await page.close();
    }
  }

  /**
   * Helper methods
   */
  async pickText(page, selectors) {
    for (const selector of selectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.count()) {
          const text = await element.textContent();
          if (text && text.trim()) {
            return cleanText(text);
          }
        }
      } catch {}
    }
    return null;
  }

  async pickTextFrom(locator, selectors) {
    for (const selector of selectors) {
      try {
        const element = locator.locator(selector).first();
        if (await element.count()) {
          const text = await element.textContent();
          if (text && text.trim()) {
            return cleanText(text);
          }
        }
      } catch {}
    }
    return null;
  }

  async pickPrice(page, selectors) {
    for (const selector of selectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.count()) {
          const text = await element.textContent();
          if (text && /[\₹$€£]\s*\d|^\s*\d+\.\d{2}/.test(text)) {
            return cleanText(text);
          }
        }
      } catch {}
    }
    return null;
  }

  async pickPriceFrom(locator, selectors) {
    for (const selector of selectors) {
      try {
        const element = locator.locator(selector).first();
        if (await element.count()) {
          const text = await element.textContent();
          if (text && /[\₹$€£]\s*\d|^\s*\d+\.\d{2}/.test(text)) {
            return cleanText(text);
          }
        }
      } catch {}
    }
    return null;
  }

  async pickImage(page, imageSelectors, attrSelectors) {
    for (const selector of imageSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.count()) {
          for (const attr of attrSelectors) {
            const value = await element.getAttribute(attr);
            if (value) {
              return this.parseImageAttr(attr, value);
            }
          }
        }
      } catch {}
    }
    return null;
  }

  async pickImageFrom(locator, imageSelectors, attrSelectors) {
    for (const selector of imageSelectors) {
      try {
        const element = locator.locator(selector).first();
        if (await element.count()) {
          for (const attr of attrSelectors) {
            const value = await element.getAttribute(attr);
            if (value) {
              return this.parseImageAttr(attr, value);
            }
          }
        }
      } catch {}
    }
    return null;
  }

  async pickAttrFrom(locator, selectors, attribute) {
    for (const selector of selectors) {
      try {
        const element = locator.locator(selector).first();
        if (await element.count()) {
          const value = await element.getAttribute(attribute);
          if (value) return value;
        }
      } catch {}
    }
    return null;
  }

  parseImageAttr(attr, value) {
    if (!value) return null;

    if (attr === 'srcset') {
      const first = String(value).split(',')[0]?.trim().split(' ')[0];
      return first || null;
    }

    if (attr === 'data-a-dynamic-image') {
      try {
        const parsed = JSON.parse(value);
        return Object.keys(parsed)[0] || null;
      } catch {
        return null;
      }
    }

    return value;
  }

  async extractFeatures(page) {
    const features = [];

    for (const selector of PDP_SELECTORS.features) {
      try {
        const elements = await page.locator(selector).allTextContents();
        for (const text of elements) {
          if (text && text.trim().length > 10) {
            features.push(cleanText(text));
          }
        }
      } catch {}
    }

    return features.slice(0, 10);
  }

  async extractBrand(page) {
    for (const selector of PDP_SELECTORS.brand) {
      try {
        const element = page.locator(selector).first();
        if (await element.count()) {
          const text = await element.textContent();
          if (text && text.trim()) {
            return cleanText(text);
          }
        }
      } catch {}
    }
    return null;
  }

  extractBrandFromTitle(title) {
    if (!title) return null;
    const parts = title.split(/[\|,\(\)]/);
    return parts.length > 1 ? cleanText(parts[0]) : null;
  }

  deriveProductName(title) {
    if (!title) return null;
    return cleanText(title.split('|')[0].split('(')[0]);
  }

  async extractJSONLD(page) {
    try {
      const scripts = await page.$$eval('script[type="application/ld+json"]', elements =>
        elements.map(el => el.textContent || '')
      );

      for (const script of scripts) {
        try {
          const json = JSON.parse(script.trim());
          const products = Array.isArray(json) ? json : [json];

          for (const product of products) {
            if (product['@type'] === 'Product') {
              return product;
            }
          }
        } catch {}
      }
    } catch {}
    return null;
  }

  dedupeCandidates(candidates) {
    const seen = new Set();
    return candidates.filter(candidate => {
      const url = candidate.productUrl || candidate.url;
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  formatProduct(product) {
    return {
      productName: product.productName,
      productUrl: product.productUrl,
      productImage: product.productImage,
      price: product.price,
      rating: product.rating,
      ratingCount: product.ratingCount,
      asin: product.asin
    };
  }
}